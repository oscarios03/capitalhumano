-- ============================================================
--  Capital Humano MX — Migración 25: fixes críticos de la auditoría 2026-07-10
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--
--  Idempotente: puede ejecutarse múltiples veces sin error.
--
--  Corrige, en orden, los 5 hallazgos CRÍTICOS de seguridad/confiabilidad
--  encontrados en la auditoría integral (ver memoria del proyecto:
--  auditoria_seguridad_2026-07-10), todos VERIFICADOS EN VIVO contra el
--  proyecto real (xqbzxkujooarntawzsoc) antes de escribir este archivo:
--
--    C-1  perfiles_own permite a cualquier usuario cambiar su propio
--         empresa_id/rol y heredar acceso RLS a otra empresa.
--         CONFIRMADO en vivo: política exacta como en 00_setup.sql.
--    C-2  Bucket de Storage "expedientes" sin ninguna política (RLS
--         habilitado, CERO policies) → hoy el bucket está simplemente
--         CERRADO para authenticated (0 objetos subidos, feature rota),
--         pero la corrección "ingenua" documentada en la migración 12
--         (bucket_id='expedientes' sin filtrar por carpeta) habría abierto
--         el bucket a fuga cross-tenant. Esta migración crea las políticas
--         correctas desde cero.
--    C-3  registrar_checada() es SECURITY DEFINER invocable por anon Y
--         authenticated (confirmado por Supabase Advisor en vivo) — debe
--         ser solo para las Edge Functions (service_role).
--    A-1/M-8  generar_alertas()/generar_alertas_nomina() también
--         ejecutables por anon (confirmado por Advisor, pese a que el
--         comentario de la migración 23 decía lo contrario para la
--         segunda — el REVOKE de ese archivo no llegó a aplicarse en
--         producción). Se revocan de anon y se agrega verificación de
--         pertenencia de empresa para authenticated.
--    B-7  empresas_insert con WITH CHECK(true) — cierre defensivo.
--
--  También aplica los WARN de Supabase Advisor "function_search_path_
--  mutable" a las 4 funciones que los tenían, y agrega 3 constraints de
--  integridad (safety-net) que no existían: alertas, descuentos_aplicados,
--  periodos_nomina. Se verificó contra los datos reales (1 empresa, 3
--  trabajadores) que NINGUNA fila viola estos constraints antes de
--  agregarlos.
--
--  NO incluido aquí (requiere más trabajo, ver Tanda 2/3 del informe):
--  C-4 (XSS importación masiva) y C-5 (idempotencia real de descuentos al
--  recalcular nómina) — C-4 se corrige en el frontend (app.js), C-5 solo
--  queda con su safety-net de constraint aquí; la lógica de
--  generarNominaPeriodo() en nomina.js todavía debe actualizarse para usar
--  upsert en vez de insert.
-- ============================================================


-- ────────────────────────────────────────────────────────────
--  C-1. Bloquear cambio directo de empresa_id/rol en perfiles
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.zz_perfiles_bloquear_cambio_empresa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  -- Bypass: SQL Editor / service_role (sin sesión de usuario), o una
  -- llamada autorizada internamente por setup_empresa()/set_empresa_activa()
  IF auth.uid() IS NULL
     OR current_setting('app.allow_empresa_change', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
    RAISE EXCEPTION 'No puedes cambiar tu empresa directamente. Usa set_empresa_activa().';
  END IF;

  IF NEW.rol IS DISTINCT FROM OLD.rol THEN
    RAISE EXCEPTION 'No puedes cambiar tu rol directamente.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS zz_perfiles_bloquear_cambio ON public.perfiles;
CREATE TRIGGER zz_perfiles_bloquear_cambio
  BEFORE UPDATE ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION public.zz_perfiles_bloquear_cambio_empresa();

-- setup_empresa() sigue necesitando escribir perfiles.empresa_id la primera
-- vez que un usuario crea una empresa: se marca como llamada autorizada.
CREATE OR REPLACE FUNCTION public.setup_empresa(
  p_nombre text,
  p_rfc text DEFAULT NULL::text,
  p_representante text DEFAULT NULL::text,
  p_domicilio text DEFAULT NULL::text,
  p_ciudad text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_empresa_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  INSERT INTO public.empresas (nombre, rfc, representante, domicilio, ciudad)
  VALUES (p_nombre, p_rfc, p_representante, p_domicilio, p_ciudad)
  RETURNING id INTO v_empresa_id;

  PERFORM set_config('app.allow_empresa_change', 'true', true);
  UPDATE public.perfiles
  SET empresa_id = v_empresa_id
  WHERE id = v_user_id;

  RETURN jsonb_build_object('empresa_id', v_empresa_id);
END;
$function$;

-- Nueva función para el switcher de plan "Despacho" (A-6): valida
-- pertenencia contra usuario_empresas antes de cambiar la empresa activa.
CREATE OR REPLACE FUNCTION public.set_empresa_activa(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuario_empresas
    WHERE usuario_id = v_user_id AND empresa_id = p_empresa_id
  ) THEN
    RAISE EXCEPTION 'No tienes acceso a esa empresa';
  END IF;

  PERFORM set_config('app.allow_empresa_change', 'true', true);
  UPDATE public.perfiles
  SET empresa_id = p_empresa_id
  WHERE id = v_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_empresa_activa(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_empresa_activa(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_empresa_activa(uuid) TO authenticated;


-- ────────────────────────────────────────────────────────────
--  C-2. Políticas de Storage para el bucket "expedientes"
--  (hoy no existe ninguna — el bucket está bloqueado por completo)
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "expedientes_select_misma_empresa" ON storage.objects;
CREATE POLICY "expedientes_select_misma_empresa" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'expedientes'
    AND (storage.foldername(name))[1] = (
      SELECT empresa_id::text FROM public.perfiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "expedientes_insert_misma_empresa" ON storage.objects;
CREATE POLICY "expedientes_insert_misma_empresa" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'expedientes'
    AND (storage.foldername(name))[1] = (
      SELECT empresa_id::text FROM public.perfiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "expedientes_delete_misma_empresa" ON storage.objects;
CREATE POLICY "expedientes_delete_misma_empresa" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'expedientes'
    AND (storage.foldername(name))[1] = (
      SELECT empresa_id::text FROM public.perfiles WHERE id = auth.uid()
    )
  );


-- ────────────────────────────────────────────────────────────
--  C-3. registrar_checada(): solo para Edge Functions (service_role)
-- ────────────────────────────────────────────────────────────

ALTER FUNCTION public.registrar_checada(uuid, uuid, uuid, timestamptz, text, text)
  SET search_path = public;

REVOKE ALL ON FUNCTION public.registrar_checada(uuid, uuid, uuid, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_checada(uuid, uuid, uuid, timestamptz, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_checada(uuid, uuid, uuid, timestamptz, text, text) TO service_role;


-- ────────────────────────────────────────────────────────────
--  A-1 / M-8. generar_alertas() y generar_alertas_nomina():
--  revocar de anon + verificar pertenencia de empresa para authenticated
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generar_alertas(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ano_actual   int := EXTRACT(YEAR FROM CURRENT_DATE);
  v_mes_actual   int := EXTRACT(MONTH FROM CURRENT_DATE);
  v_dia_actual   int := EXTRACT(DAY FROM CURRENT_DATE);
BEGIN
  -- Defensa en profundidad: un usuario autenticado solo puede regenerar
  -- las alertas de SU PROPIA empresa (auth.uid() IS NULL = service_role/
  -- SQL Editor, sigue sin restricción).
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND empresa_id = p_empresa_id
  ) THEN
    RAISE EXCEPTION 'No autorizado para esta empresa';
  END IF;

  -- Serializa llamadas concurrentes para esta empresa (se libera al
  -- terminar la transacción). Evita la condición de carrera descrita arriba.
  PERFORM pg_advisory_xact_lock(hashtext(p_empresa_id::text));

  -- Eliminar alertas no resueltas previas para regenerar frescas
  DELETE FROM public.alertas
  WHERE empresa_id = p_empresa_id
    AND resuelta   = false;

  -- ───────────────────────────────────────────────────────────
  -- 1. CONTRATOS POR VENCER (tiempo determinado ≤ 30 días)
  -- ───────────────────────────────────────────────────────────
  INSERT INTO public.alertas
    (empresa_id, trabajador_id, tipo, titulo, descripcion,
     prioridad, fecha_limite, articulo_lft, accion_sugerida)
  SELECT
    p_empresa_id,
    id,
    'contrato_vencimiento',
    'Contrato por vencer: ' || nombre,
    'El contrato de ' || nombre || ' vence el ' ||
      TO_CHAR(fecha_vencimiento_contrato, 'DD/MM/YYYY') ||
      '. Días restantes: ' ||
      (fecha_vencimiento_contrato - CURRENT_DATE)::text,
    CASE
      WHEN fecha_vencimiento_contrato <= CURRENT_DATE + 3  THEN 'critica'
      WHEN fecha_vencimiento_contrato <= CURRENT_DATE + 7  THEN 'alta'
      WHEN fecha_vencimiento_contrato <= CURRENT_DATE + 15 THEN 'alta'
      ELSE 'media'
    END,
    fecha_vencimiento_contrato,
    'Art. 37 LFT',
    'Renovar contrato o convertir a tiempo indeterminado antes del vencimiento'
  FROM public.trabajadores
  WHERE empresa_id               = p_empresa_id
    AND tipo_contrato             = 'determinado'
    AND fecha_vencimiento_contrato IS NOT NULL
    AND fecha_vencimiento_contrato <= CURRENT_DATE + 30
    AND estado                    = 'activo';

  -- ───────────────────────────────────────────────────────────
  -- 2. PERÍODO DE PRUEBA POR VENCER (≤ 10 días)
  -- ───────────────────────────────────────────────────────────
  INSERT INTO public.alertas
    (empresa_id, trabajador_id, tipo, titulo, descripcion,
     prioridad, fecha_limite, articulo_lft, accion_sugerida)
  SELECT
    p_empresa_id,
    id,
    'periodo_prueba',
    'Período de prueba por vencer: ' || nombre,
    'El período de prueba de ' || nombre || ' vence el ' ||
      TO_CHAR(fecha_ingreso + periodo_prueba_dias * INTERVAL '1 day', 'DD/MM/YYYY') ||
      ' (' || ((fecha_ingreso + periodo_prueba_dias * INTERVAL '1 day')::date - CURRENT_DATE)::text ||
      ' días restantes).',
    'alta',
    (fecha_ingreso + periodo_prueba_dias * INTERVAL '1 day')::date,
    'Art. 39-A LFT',
    'Confirmar contratación definitiva o notificar terminación antes del vencimiento'
  FROM public.trabajadores
  WHERE empresa_id        = p_empresa_id
    AND tipo_contrato     IN ('indeterminado','comision')
    AND periodo_prueba_dias IS NOT NULL
    AND (fecha_ingreso + periodo_prueba_dias * INTERVAL '1 day')::date
        BETWEEN CURRENT_DATE AND CURRENT_DATE + 10
    AND estado            = 'activo';

  -- ───────────────────────────────────────────────────────────
  -- 2.b CAPACITACIÓN INICIAL POR VENCER (≤ 10 días) — Art. 39-B LFT
  -- ───────────────────────────────────────────────────────────
  INSERT INTO public.alertas
    (empresa_id, trabajador_id, tipo, titulo, descripcion,
     prioridad, fecha_limite, articulo_lft, accion_sugerida)
  SELECT
    p_empresa_id,
    id,
    'capacitacion_inicial',
    'Capacitación inicial por vencer: ' || nombre,
    'La capacitación inicial de ' || nombre || ' vence el ' ||
      TO_CHAR(fecha_ingreso + capacitacion_inicial_dias * INTERVAL '1 day', 'DD/MM/YYYY') ||
      ' (' || ((fecha_ingreso + capacitacion_inicial_dias * INTERVAL '1 day')::date - CURRENT_DATE)::text ||
      ' días restantes).',
    'alta',
    (fecha_ingreso + capacitacion_inicial_dias * INTERVAL '1 day')::date,
    'Art. 39-B LFT',
    'Confirmar contratación definitiva o notificar terminación antes del vencimiento de la capacitación inicial'
  FROM public.trabajadores
  WHERE empresa_id        = p_empresa_id
    AND capacitacion_inicial_dias IS NOT NULL
    AND (fecha_ingreso + capacitacion_inicial_dias * INTERVAL '1 day')::date
        BETWEEN CURRENT_DATE AND CURRENT_DATE + 10
    AND estado            = 'activo';

  -- ───────────────────────────────────────────────────────────
  -- 3. VACACIONES NO GOZADAS (más de 12 meses sin registrar)
  -- ───────────────────────────────────────────────────────────
  INSERT INTO public.alertas
    (empresa_id, trabajador_id, tipo, titulo, descripcion,
     prioridad, fecha_limite, articulo_lft, accion_sugerida)
  SELECT
    p_empresa_id,
    id,
    'vacaciones_pendientes',
    'Vacaciones pendientes: ' || nombre,
    nombre || ' lleva más de 12 meses sin tomar vacaciones. ' ||
    'Riesgo de demanda laboral por acumulación.',
    'alta',
    CURRENT_DATE + 30,
    'Art. 76 LFT',
    'Programar y registrar las vacaciones o pagar la prima vacacional correspondiente'
  FROM public.trabajadores
  WHERE empresa_id    = p_empresa_id
    AND estado        = 'activo'
    AND fecha_ingreso < CURRENT_DATE - INTERVAL '1 year'
    AND (ultima_fecha_vacaciones IS NULL
      OR ultima_fecha_vacaciones < CURRENT_DATE - INTERVAL '1 year');

  -- ───────────────────────────────────────────────────────────
  -- 4. ANIVERSARIO LABORAL (dentro de los próximos 7 días)
  -- ───────────────────────────────────────────────────────────
  INSERT INTO public.alertas
    (empresa_id, trabajador_id, tipo, titulo, descripcion,
     prioridad, fecha_limite, articulo_lft, accion_sugerida)
  SELECT
    p_empresa_id,
    id,
    'aniversario',
    'Aniversario laboral: ' || nombre,
    nombre || ' cumple ' ||
      EXTRACT(YEAR FROM AGE(CURRENT_DATE, fecha_ingreso))::int::text ||
      ' año(s) en la empresa esta semana.',
    'baja',
    CURRENT_DATE + 7,
    'Art. 76 LFT',
    'Actualizar los días de vacaciones correspondientes al nuevo año de antigüedad'
  FROM public.trabajadores
  WHERE empresa_id = p_empresa_id
    AND estado     = 'activo'
    AND EXTRACT(MONTH FROM fecha_ingreso) = v_mes_actual
    AND EXTRACT(DAY FROM fecha_ingreso)
        BETWEEN v_dia_actual - 0 AND v_dia_actual + 7
    AND fecha_ingreso < CURRENT_DATE;  -- Al menos 1 año cumplido

  -- ───────────────────────────────────────────────────────────
  -- 5. AGUINALDO POR PAGAR (noviembre y diciembre)
  -- ───────────────────────────────────────────────────────────
  INSERT INTO public.alertas
    (empresa_id, trabajador_id, tipo, titulo, descripcion,
     prioridad, fecha_limite, articulo_lft, accion_sugerida)
  SELECT
    p_empresa_id,
    NULL,
    'aguinaldo',
    'Aguinaldo — vence el 20 de diciembre',
    'El aguinaldo debe pagarse antes del 20 de diciembre. ' ||
    'Faltan ' || (MAKE_DATE(v_ano_actual, 12, 20) - CURRENT_DATE)::text || ' días.',
    CASE WHEN CURRENT_DATE >= MAKE_DATE(v_ano_actual, 12, 10) THEN 'critica' ELSE 'alta' END,
    MAKE_DATE(v_ano_actual, 12, 20),
    'Art. 87 LFT',
    'Calcular y pagar aguinaldo proporcional a cada trabajador activo antes del 20 de diciembre'
  WHERE v_mes_actual IN (11, 12)
    AND NOT EXISTS (
      SELECT 1 FROM public.alertas
      WHERE empresa_id = p_empresa_id
        AND tipo       = 'aguinaldo'
        AND resuelta   = true
        AND EXTRACT(YEAR FROM fecha_resolucion) = v_ano_actual
    );

  -- ───────────────────────────────────────────────────────────
  -- 6. PTU POR DISTRIBUIR (marzo, abril, mayo)
  -- ───────────────────────────────────────────────────────────
  INSERT INTO public.alertas
    (empresa_id, trabajador_id, tipo, titulo, descripcion,
     prioridad, fecha_limite, articulo_lft, accion_sugerida)
  SELECT
    p_empresa_id,
    NULL,
    'ptu',
    'PTU — Participación de Utilidades pendiente',
    'El plazo para distribuir la PTU vence el 30 de mayo (personas morales) ' ||
    'o 29 de junio (personas físicas). ' ||
    'Faltan ' || (MAKE_DATE(v_ano_actual, 5, 30) - CURRENT_DATE)::text || ' días.',
    'alta',
    MAKE_DATE(v_ano_actual, 5, 30),
    'Art. 122 LFT',
    'Calcular y distribuir la PTU conforme a la declaración anual del ejercicio anterior'
  WHERE v_mes_actual IN (3, 4, 5)
    AND NOT EXISTS (
      SELECT 1 FROM public.alertas
      WHERE empresa_id = p_empresa_id
        AND tipo       = 'ptu'
        AND resuelta   = true
        AND EXTRACT(YEAR FROM fecha_resolucion) = v_ano_actual
    );

  -- ───────────────────────────────────────────────────────────
  -- 7. PRIMA DE ANTIGÜEDAD A 15 AÑOS (últimos 15 días)
  -- ───────────────────────────────────────────────────────────
  INSERT INTO public.alertas
    (empresa_id, trabajador_id, tipo, titulo, descripcion,
     prioridad, fecha_limite, articulo_lft, accion_sugerida)
  SELECT
    p_empresa_id,
    id,
    'prima_antiguedad_15',
    'Prima de antigüedad activada: ' || nombre,
    nombre || ' acaba de cumplir 15 años en la empresa. ' ||
    'A partir de ahora tiene derecho a prima de antigüedad en caso de renuncia voluntaria.',
    'media',
    CURRENT_DATE + 30,
    'Art. 162 LFT',
    'Registrar el cumplimiento de 15 años y actualizar el expediente laboral del trabajador'
  FROM public.trabajadores
  WHERE empresa_id = p_empresa_id
    AND estado     = 'activo'
    AND AGE(CURRENT_DATE, fecha_ingreso)
        BETWEEN INTERVAL '15 years' AND INTERVAL '15 years 15 days';

  -- ───────────────────────────────────────────────────────────
  -- 8. REVISIÓN SALARIAL ANUAL (sin ajuste en +12 meses)
  -- ───────────────────────────────────────────────────────────
  INSERT INTO public.alertas
    (empresa_id, trabajador_id, tipo, titulo, descripcion,
     prioridad, fecha_limite, articulo_lft, accion_sugerida)
  SELECT
    p_empresa_id,
    id,
    'revision_salarial',
    'Revisión salarial pendiente: ' || nombre,
    nombre || ' no ha tenido ajuste salarial en más de 12 meses.',
    'baja',
    CURRENT_DATE + 60,
    'Art. 87 LFT',
    'Revisar y actualizar el salario conforme a inflación y desempeño del trabajador'
  FROM public.trabajadores
  WHERE empresa_id = p_empresa_id
    AND estado     = 'activo'
    AND (ultima_revision_salarial IS NULL
      OR ultima_revision_salarial < CURRENT_DATE - INTERVAL '1 year')
    AND fecha_ingreso < CURRENT_DATE - INTERVAL '1 year';

  -- ───────────────────────────────────────────────────────────
  -- 9. NÓMINA POR PAGAR (período activo con fecha_fin ≤ 3 días)
  -- ───────────────────────────────────────────────────────────
  INSERT INTO public.alertas
    (empresa_id, trabajador_id, tipo, titulo, descripcion,
     prioridad, fecha_limite, articulo_lft, accion_sugerida)
  SELECT
    p_empresa_id,
    NULL,
    'nomina_por_pagar',
    'Nómina por pagar: ' || nombre,
    'El período "' || nombre || '" vence el ' ||
      TO_CHAR(fecha_fin, 'DD/MM/YYYY') ||
      '. Faltan ' || (fecha_fin - CURRENT_DATE)::text || ' días para el pago.',
    'alta',
    fecha_fin,
    'Art. 88 LFT — Pago en fecha convenida',
    'Revisar y aprobar los recibos del período antes de la fecha de pago'
  FROM public.periodos_nomina
  WHERE empresa_id  = p_empresa_id
    AND cerrado     = false
    AND fecha_fin   BETWEEN CURRENT_DATE AND CURRENT_DATE + 3;

END;
$function$;

REVOKE ALL ON FUNCTION public.generar_alertas(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generar_alertas(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.generar_alertas(uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.generar_alertas_nomina(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tiene_semanal   boolean;
  v_tiene_quincenal boolean;
  v_tiene_mensual   boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND empresa_id = p_empresa_id
  ) THEN
    RAISE EXCEPTION 'No autorizado para esta empresa';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_empresa_id::text));

  DELETE FROM public.alertas
   WHERE empresa_id = p_empresa_id
     AND tipo       = 'nomina_por_generar'
     AND resuelta   = false;

  SELECT
    bool_or(coalesce(periodo_salario,'mensual') = 'semanal'),
    bool_or(coalesce(periodo_salario,'mensual') = 'quincenal'),
    bool_or(coalesce(periodo_salario,'mensual') = 'mensual')
  INTO v_tiene_semanal, v_tiene_quincenal, v_tiene_mensual
  FROM public.trabajadores
  WHERE empresa_id = p_empresa_id AND estado = 'activo';

  IF coalesce(v_tiene_quincenal,false) AND NOT EXISTS (
    SELECT 1 FROM public.periodos_nomina
     WHERE empresa_id = p_empresa_id AND tipo = 'quincenal'
       AND CURRENT_DATE BETWEEN fecha_inicio AND fecha_fin
  ) THEN
    INSERT INTO public.alertas
      (empresa_id, trabajador_id, tipo, titulo, descripcion,
       prioridad, fecha_limite, articulo_lft, accion_sugerida)
    VALUES
      (p_empresa_id, NULL, 'nomina_por_generar',
       'Nómina quincenal por generar',
       'Tienes trabajadores quincenales sin un período de nómina que cubra la fecha actual.',
       'alta', CURRENT_DATE, 'Art. 88 LFT — Pago en fecha convenida',
       'Crea el período quincenal y genera los recibos.');
  END IF;

  IF coalesce(v_tiene_semanal,false) AND NOT EXISTS (
    SELECT 1 FROM public.periodos_nomina
     WHERE empresa_id = p_empresa_id AND tipo = 'semanal'
       AND CURRENT_DATE BETWEEN fecha_inicio AND fecha_fin
  ) THEN
    INSERT INTO public.alertas
      (empresa_id, trabajador_id, tipo, titulo, descripcion,
       prioridad, fecha_limite, articulo_lft, accion_sugerida)
    VALUES
      (p_empresa_id, NULL, 'nomina_por_generar',
       'Nómina semanal por generar',
       'Tienes trabajadores semanales sin un período de nómina que cubra la fecha actual.',
       'alta', CURRENT_DATE, 'Art. 88 LFT — Pago en fecha convenida',
       'Crea el período semanal y genera los recibos.');
  END IF;

  IF coalesce(v_tiene_mensual,false) AND NOT EXISTS (
    SELECT 1 FROM public.periodos_nomina
     WHERE empresa_id = p_empresa_id AND tipo = 'mensual'
       AND CURRENT_DATE BETWEEN fecha_inicio AND fecha_fin
  ) THEN
    INSERT INTO public.alertas
      (empresa_id, trabajador_id, tipo, titulo, descripcion,
       prioridad, fecha_limite, articulo_lft, accion_sugerida)
    VALUES
      (p_empresa_id, NULL, 'nomina_por_generar',
       'Nómina mensual por generar',
       'Tienes trabajadores mensuales sin un período de nómina que cubra la fecha actual.',
       'media', CURRENT_DATE, 'Art. 88 LFT — Pago en fecha convenida',
       'Crea el período mensual y genera los recibos.');
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.generar_alertas_nomina(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generar_alertas_nomina(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.generar_alertas_nomina(uuid) TO authenticated, service_role;


-- ────────────────────────────────────────────────────────────
--  search_path para el resto de funciones SECURITY DEFINER
--  marcadas por el Advisor (function_search_path_mutable)
-- ────────────────────────────────────────────────────────────

ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.get_or_create_matriz() SET search_path = public;


-- ────────────────────────────────────────────────────────────
--  B-7. empresas_insert permitía INSERT arbitrario a cualquier
--  authenticated. setup_empresa() sigue funcionando: sus INSERT
--  corren como el dueño de la función (postgres), que tiene BYPASSRLS.
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "empresas_insert" ON public.empresas;
CREATE POLICY "empresas_insert" ON public.empresas FOR INSERT TO authenticated WITH CHECK (false);


-- ────────────────────────────────────────────────────────────
--  Safety-net de integridad (verificado: 0 filas violarían estos
--  constraints con los datos actuales)
-- ────────────────────────────────────────────────────────────

-- M-10: solo puede haber una alerta ACTIVA del mismo tipo por trabajador
-- (permite historial de alertas resueltas repetidas, ej. "aniversario" anual)
DROP INDEX IF EXISTS public.alertas_activa_unica_idx;
CREATE UNIQUE INDEX alertas_activa_unica_idx
  ON public.alertas (empresa_id, trabajador_id, tipo)
  WHERE resuelta = false AND trabajador_id IS NOT NULL;

-- C-5 (safety-net): un descuento no puede aplicarse dos veces al mismo
-- período. La lógica real de idempotencia en nomina.js queda pendiente.
ALTER TABLE public.descuentos_aplicados
  ADD CONSTRAINT descuentos_aplicados_unico UNIQUE (descuento_id, periodo_id);

-- M-3/M-4: no puede haber dos períodos de nómina con el mismo rango de
-- fechas para la misma empresa/tipo/sucursal (NULL de sucursal = matriz).
DROP INDEX IF EXISTS public.periodos_nomina_unico_idx;
CREATE UNIQUE INDEX periodos_nomina_unico_idx
  ON public.periodos_nomina (
    empresa_id, tipo,
    COALESCE(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid),
    fecha_inicio, fecha_fin
  );

-- ============================================================
--  NO CUBIERTO POR SQL — acción manual pendiente:
--  Dashboard → Authentication → Policies → "Leaked password protection"
--  (Advisor: auth_leaked_password_protection) → activar.
-- ============================================================
