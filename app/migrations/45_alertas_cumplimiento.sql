-- ═══════════════════════════════════════════════════════════════════════════
-- 45 — Alertas de cumplimiento: RIT, acuses y aviso de privacidad (P2-4)
--
-- Requiere la migración 44 (columnas `empresas.rit_*` y tabla
-- `acuses_documentos`).
--
-- El módulo disciplinario del sistema funda dos causales de amonestación en el
-- "Reglamento Interior de Trabajo". Esas actas sólo se sostienen si el
-- reglamento existe, está depositado y se acredita haberlo entregado:
--
--   Art. 424 fr. II — depositado ante el Centro Federal de Conciliación y
--   Registro Laboral dentro de los OCHO DÍAS siguientes a su firma.
--
--   Art. 425 — "surtirá efectos a partir de la fecha de su depósito". Deberá
--   imprimirse y repartirse entre los trabajadores y fijarse en los lugares
--   más visibles del establecimiento.
--
-- Sin depósito no hay norma que invocar. Sin acuse de entrega no hay forma de
-- acreditar que la persona sancionada la conocía. Ambas cosas se descubren en
-- el juicio, cuando ya no hay remedio; de ahí que se avisen antes.
--
-- Mismo patrón que generar_alertas_rescision (migración 41): función aparte
-- que borra sólo sus propios tipos.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.generar_alertas_cumplimiento(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rit_depositado  boolean;
  v_rit_firma       date;
  v_rit_deposito    date;
  v_activos         int;
  v_actas           int;
BEGIN
  -- Misma compuerta que las demás funciones SECURITY DEFINER: sin ella un
  -- usuario autenticado podría generar alertas de otra empresa.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND empresa_id = p_empresa_id
  ) THEN
    RAISE EXCEPTION 'No autorizado para esta empresa';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_empresa_id::text || ':cumplimiento'));

  DELETE FROM public.alertas
   WHERE empresa_id = p_empresa_id
     AND resuelta   = false
     AND tipo IN ('rit_no_depositado', 'rit_deposito_vencido',
                  'acuse_rit_faltante', 'aviso_privacidad_faltante');

  SELECT e.rit_depositado, e.rit_fecha_firma, e.rit_fecha_deposito
    INTO v_rit_depositado, v_rit_firma, v_rit_deposito
    FROM public.empresas e WHERE e.id = p_empresa_id;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT COUNT(*) INTO v_activos
    FROM public.trabajadores WHERE empresa_id = p_empresa_id AND estado = 'activo';

  IF v_activos = 0 THEN RETURN; END IF;

  SELECT COUNT(*) INTO v_actas
    FROM public.actas a
    JOIN public.trabajadores t ON t.id = a.trabajador_id
   WHERE t.empresa_id = p_empresa_id;

  -- ───────────────────────────────────────────────────────────────────────
  -- 1. RIT NO DEPOSITADO
  --    Sube a crítica si ya se levantaron actas: ésas son precisamente las
  --    que se quedaron sin sustento normativo.
  -- ───────────────────────────────────────────────────────────────────────
  IF NOT COALESCE(v_rit_depositado, false) OR v_rit_deposito IS NULL THEN
    INSERT INTO public.alertas
      (empresa_id, trabajador_id, tipo, titulo, descripcion,
       prioridad, fecha_limite, articulo_lft, accion_sugerida)
    VALUES (
      p_empresa_id, NULL, 'rit_no_depositado',
      'Reglamento Interior de Trabajo no depositado',
      CASE WHEN v_actas > 0
        THEN 'Hay ' || v_actas::text || ' acta(s) levantada(s) y el reglamento no está registrado como depositado. ' ||
             'El artículo 425 de la LFT establece que el reglamento surte efectos a partir de la fecha de su depósito ' ||
             'ante el Centro Federal de Conciliación y Registro Laboral: las actas que invocan el reglamento operan ' ||
             'mientras tanto sin sustento normativo.'
        ELSE 'El reglamento no está registrado como depositado ante el Centro Federal de Conciliación y Registro Laboral. ' ||
             'Mientras no lo esté, no surte efectos (artículo 425 de la LFT) y el módulo disciplinario opera con ' ||
             'sustento limitado: sólo pueden invocarse las obligaciones que la propia Ley impone.'
      END,
      CASE WHEN v_actas > 0 THEN 'critica' ELSE 'alta' END,
      NULL,
      'Arts. 422-425 LFT',
      'Genera el reglamento y el acta de la comisión mixta, deposítalos ante el Centro Federal de Conciliación y Registro Laboral y captura la fecha de depósito en Configuración de la empresa.'
    );
  END IF;

  -- ───────────────────────────────────────────────────────────────────────
  -- 2. PLAZO DE DEPÓSITO VENCIDO — ocho días desde la firma (art. 424 fr. II)
  -- ───────────────────────────────────────────────────────────────────────
  IF v_rit_firma IS NOT NULL AND v_rit_deposito IS NULL
     AND CURRENT_DATE > v_rit_firma + 8 THEN
    INSERT INTO public.alertas
      (empresa_id, trabajador_id, tipo, titulo, descripcion,
       prioridad, fecha_limite, articulo_lft, accion_sugerida)
    VALUES (
      p_empresa_id, NULL, 'rit_deposito_vencido',
      'Plazo para depositar el Reglamento Interior de Trabajo vencido',
      'El reglamento se firmó el ' || TO_CHAR(v_rit_firma, 'DD/MM/YYYY') ||
      '. El artículo 424 fracción II de la LFT concede ocho días siguientes a la firma para depositarlo, ' ||
      'y ese plazo venció el ' || TO_CHAR(v_rit_firma + 8, 'DD/MM/YYYY') || '.',
      'alta',
      v_rit_firma + 8,
      'Art. 424 fr. II LFT',
      'Deposita el reglamento cuanto antes: el retraso no lo invalida, pero hasta el depósito no surte efectos.'
    );
  END IF;

  -- ───────────────────────────────────────────────────────────────────────
  -- 3. ACUSES DE ENTREGA FALTANTES — sólo tiene sentido si ya está depositado
  -- ───────────────────────────────────────────────────────────────────────
  IF COALESCE(v_rit_depositado, false) AND v_rit_deposito IS NOT NULL THEN
    INSERT INTO public.alertas
      (empresa_id, trabajador_id, tipo, titulo, descripcion,
       prioridad, fecha_limite, articulo_lft, accion_sugerida)
    SELECT
      p_empresa_id, NULL, 'acuse_rit_faltante',
      'Acuse del Reglamento Interior de Trabajo pendiente en ' || COUNT(*)::text || ' persona(s)',
      'El artículo 425 de la LFT obliga a imprimir el reglamento y repartirlo entre las personas trabajadoras. ' ||
      'Sin constancia de entrega no se puede sancionar a alguien por incumplir un reglamento que no se acredita ' ||
      'haberle entregado. Faltan: ' || string_agg(nombre, ', ' ORDER BY nombre) || '.',
      'media', NULL, 'Art. 425 LFT',
      'Genera la constancia de entrega desde el perfil de cada persona y registra el acuse firmado.'
    FROM (
      SELECT t.nombre
      FROM public.trabajadores t
      WHERE t.empresa_id = p_empresa_id
        AND t.estado = 'activo'
        AND NOT EXISTS (
          SELECT 1 FROM public.acuses_documentos a
          WHERE a.trabajador_id = t.id AND a.documento = 'rit'
            AND a.fecha_entrega >= v_rit_deposito
        )
      LIMIT 30
    ) AS pendientes
    HAVING COUNT(*) > 0;
  END IF;

  -- ───────────────────────────────────────────────────────────────────────
  -- 4. AVISO DE PRIVACIDAD FALTANTE
  --    La aplicación trata incapacidades (datos de salud) y checador
  --    (posible biométrico). El art. 8 de la LFPDPPP exige consentimiento
  --    expreso y por escrito para datos sensibles, y el art. 16 obliga a
  --    poner el aviso a disposición al momento de recabarlos.
  -- ───────────────────────────────────────────────────────────────────────
  INSERT INTO public.alertas
    (empresa_id, trabajador_id, tipo, titulo, descripcion,
     prioridad, fecha_limite, articulo_lft, accion_sugerida)
  SELECT
    p_empresa_id, NULL, 'aviso_privacidad_faltante',
    'Aviso de privacidad sin acuse en ' || COUNT(*)::text || ' persona(s)',
    'La aplicación trata datos de salud (incapacidades) y, en su caso, biométricos (checador). ' ||
    'El artículo 16 de la LFPDPPP obliga a poner el aviso de privacidad a disposición al momento de recabar ' ||
    'los datos, y el artículo 8 exige consentimiento expreso y por escrito para los datos sensibles. ' ||
    'Faltan: ' || string_agg(nombre, ', ' ORDER BY nombre) || '.',
    'media', NULL, 'Arts. 8 y 16 LFPDPPP',
    'Genera el aviso de privacidad y el consentimiento de datos sensibles, y registra el acuse firmado.'
  FROM (
    SELECT t.nombre
    FROM public.trabajadores t
    WHERE t.empresa_id = p_empresa_id
      AND t.estado = 'activo'
      AND NOT EXISTS (
        SELECT 1 FROM public.acuses_documentos a
        WHERE a.trabajador_id = t.id AND a.documento = 'aviso_privacidad'
      )
    LIMIT 30
  ) AS pendientes
  HAVING COUNT(*) > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.generar_alertas_cumplimiento(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generar_alertas_cumplimiento(uuid) TO authenticated;

COMMENT ON FUNCTION public.generar_alertas_cumplimiento(uuid) IS
  'Alertas de cumplimiento documental: depósito del RIT (arts. 424-425 LFT), acuses de entrega y aviso de privacidad (arts. 8 y 16 LFPDPPP). Debe invocarse DESPUÉS de generar_alertas.';
