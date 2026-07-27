-- ═══════════════════════════════════════════════════════════════════════════
-- 46 — Teletrabajo (P2-5)
--
-- Requiere las migraciones 44 y 45.
--
-- El art. 330-A LFT sujeta al Capítulo XII Bis a las relaciones que se
-- desarrollan MÁS DEL CUARENTA POR CIENTO del tiempo en el domicilio de la
-- persona trabajadora o en el que ésta elija. No es teletrabajo el que se
-- realiza de forma ocasional o esporádica.
--
-- El sistema no registraba nada de esto, así que no podía saber a quién le
-- aplica el capítulo ni avisar de las obligaciones especiales del art. 330-E
-- (proporcionar y mantener el equipo, pagar telecomunicaciones y la parte
-- proporcional de electricidad, llevar registro de insumos, respetar el
-- derecho a la desconexión).
--
-- Columnas NULLABLE / con DEFAULT: ningún trabajador existente cambia.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.trabajadores
  ADD COLUMN IF NOT EXISTS es_teletrabajo     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pct_tiempo_remoto  NUMERIC(5,2);

COMMENT ON COLUMN public.trabajadores.es_teletrabajo IS
  'Marca la modalidad de teletrabajo del Cap. XII Bis LFT. Sólo aplica si se presta más del 40% del tiempo fuera del centro de trabajo (art. 330-A).';
COMMENT ON COLUMN public.trabajadores.pct_tiempo_remoto IS
  'Porcentaje del tiempo que se presta en el domicilio de la persona trabajadora. Por encima de 40 aplica el Cap. XII Bis (art. 330-A).';

ALTER TABLE public.trabajadores DROP CONSTRAINT IF EXISTS trabajadores_pct_remoto_valido;
ALTER TABLE public.trabajadores ADD CONSTRAINT trabajadores_pct_remoto_valido CHECK (
  pct_tiempo_remoto IS NULL OR (pct_tiempo_remoto >= 0 AND pct_tiempo_remoto <= 100)
);

-- ── Alerta: teletrabajo sin anexo firmado ──────────────────────────────────
-- Se reemplaza la función de la migración 45 para agregar el tipo nuevo. El
-- resto del cuerpo es idéntico.
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
                  'acuse_rit_faltante', 'aviso_privacidad_faltante',
                  'teletrabajo_sin_anexo');

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

  -- ───────────────────────────────────────────────────────────────────────
  -- TELETRABAJO SIN ANEXO
  --   Art. 330-A: aplica el Capítulo XII Bis cuando se presta MÁS DEL 40%
  --   del tiempo en el domicilio de la persona trabajadora.
  --   Art. 330-B: las condiciones se hacen constar POR ESCRITO en el
  --   contrato, y cada parte conserva un ejemplar.
  -- ───────────────────────────────────────────────────────────────────────
  INSERT INTO public.alertas
    (empresa_id, trabajador_id, tipo, titulo, descripcion,
     prioridad, fecha_limite, articulo_lft, accion_sugerida)
  SELECT
    p_empresa_id, NULL, 'teletrabajo_sin_anexo',
    'Teletrabajo sin anexo firmado en ' || COUNT(*)::text || ' persona(s)',
    'El artículo 330-A de la LFT sujeta al Capítulo XII Bis a quienes prestan más del cuarenta por ciento ' ||
    'del tiempo en su domicilio, y el 330-B exige hacer constar las condiciones por escrito. Sin el anexo no ' ||
    'están documentados el inventario de equipo, el pago de telecomunicaciones y la parte proporcional de ' ||
    'electricidad, los mecanismos de contacto y supervisión ni el derecho a la desconexión. Faltan: ' ||
    string_agg(nombre, ', ' ORDER BY nombre) || '.',
    'alta', NULL, 'Arts. 330-A y 330-B LFT',
    'Genera el anexo de teletrabajo desde la pestaña Cumplimiento del perfil y registra el acuse firmado.'
  FROM (
    SELECT t.nombre
    FROM public.trabajadores t
    WHERE t.empresa_id = p_empresa_id
      AND t.estado = 'activo'
      AND (t.es_teletrabajo OR COALESCE(t.pct_tiempo_remoto, 0) > 40)
      AND NOT EXISTS (
        SELECT 1 FROM public.acuses_documentos a
        WHERE a.trabajador_id = t.id AND a.documento = 'anexo_teletrabajo'
      )
    LIMIT 30
  ) AS pendientes
  HAVING COUNT(*) > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.generar_alertas_cumplimiento(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generar_alertas_cumplimiento(uuid) TO authenticated;
