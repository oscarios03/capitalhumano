-- ============================================================
--  Capital Humano MX — Migración 16: Alertas de vencimiento de
--  contratos determinados, periodo de prueba (Art. 39-A LFT) y
--  capacitación inicial (Art. 39-B LFT).
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--
--  Idempotente: puede ejecutarse múltiples veces sin error.
--
--  NOTA DE DISEÑO: la migración 07 (generar_alertas) YA genera
--  alertas de tipo 'contrato_vencimiento' y 'periodo_prueba'. Esta
--  migración NO crea una vista paralela (v_alertas_vencimientos):
--  en vez de eso, se reemplaza generar_alertas() agregándole un
--  bloque nuevo para 'capacitacion_inicial', para no tener dos
--  fuentes de verdad distintas para el mismo tipo de alerta.
-- ============================================================

-- 1. Columnas nuevas en trabajadores ──────────────────────────────
ALTER TABLE public.trabajadores
  ADD COLUMN IF NOT EXISTS es_puesto_direccion      BOOLEAN DEFAULT false,  -- Art. 39-A/39-B LFT: habilita topes de 180 días
  ADD COLUMN IF NOT EXISTS capacitacion_inicial_dias INTEGER;                -- Art. 39-B LFT: 90 días (180 si es_puesto_direccion)

-- 2. generar_alertas(): se agrega el bloque de capacitación inicial
--    (mismo cuerpo que la migración 07 + el bloque nuevo al final,
--    antes del cierre de la función).
CREATE OR REPLACE FUNCTION public.generar_alertas(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ano_actual   int := EXTRACT(YEAR FROM CURRENT_DATE);
  v_mes_actual   int := EXTRACT(MONTH FROM CURRENT_DATE);
  v_dia_actual   int := EXTRACT(DAY FROM CURRENT_DATE);
BEGIN

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
$$;
