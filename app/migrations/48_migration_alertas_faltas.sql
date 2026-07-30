-- ============================================================================
-- Migración 38 — Alerta de faltas injustificadas dentro de las Alertas Legales
-- ============================================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--
-- Contexto: el panel de control mostraba una tabla cruda de "Incidencias
-- recientes de asistencia" (últimos 10 registros de toda la empresa). Se quitó
-- del dashboard (queda solo dentro de Trabajadores) y, en su lugar, el aviso
-- de riesgo legal por faltas debe vivir ÚNICAMENTE dentro de las Alertas
-- Legales, y solo cuando exista causal real: 3 o más faltas injustificadas
-- dentro de un periodo de 30 días naturales (Art. 47 Fracc. X LFT), con el
-- aviso vigente durante los 30 días naturales contados a partir de la 3ra
-- inasistencia (fecha en que se conoce la causa) — pasado ese plazo el
-- derecho del patrón a rescindir sin responsabilidad prescribe (Art. 517
-- Fracc. I LFT) y el aviso debe dejar de mostrarse.
--
-- NOTA DE DISEÑO: ya existía una alerta tipo 'tres_faltas', pero se generaba
-- en el CLIENTE (asistencia.js:_verificarRiesgoArt47), solo al capturar una
-- falta nueva, contando "últimos 30 días desde HOY" (no desde la 3ra falta) y
-- con fecha_limite = hoy (sin ventana real). Además, el DELETE de
-- generar_alertas() borra TODAS las alertas no resueltas en cada
-- regeneración —incluida 'tres_faltas'— así que esa alerta desaparecía cada
-- vez que el dashboard recalculaba alertas y solo reaparecía si se
-- capturaba otra falta. Esta migración reemplaza esa fuente: se agrega el
-- bloque 10 a generar_alertas() (mismo cuerpo que la migración 25 + el
-- bloque nuevo), reutilizando el mismo tipo 'tres_faltas' para no romper el
-- índice único parcial `alertas_activa_unica_idx` (empresa_id, trabajador_id,
-- tipo) ni el mapeo de icono/ruta en alertas.js. app/js/asistencia.js ya no
-- escribe esta alerta — solo invalida el caché (`alertas_last_gen`) al
-- guardar una falta, para forzar el recálculo vía esta función.
--
-- Idempotente (CREATE OR REPLACE FUNCTION).
-- ============================================================================

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

  -- ───────────────────────────────────────────────────────────
  -- 10. FALTAS INJUSTIFICADAS — 3 o más en un periodo de 30 días
  --     naturales (Art. 47 Fracc. X LFT). El aviso solo se genera
  --     mientras el derecho del patrón a rescindir sin
  --     responsabilidad siga vigente: 30 días naturales contados a
  --     partir de la 3ra inasistencia, fecha en que se conoce la
  --     causa (Art. 517 Fracc. I LFT — prescripción del derecho).
  --     tipo='falta' es, desde la migración 36, la falta INJUSTIFICADA
  --     (la justificada usa su propio tipo 'falta_justif').
  -- ───────────────────────────────────────────────────────────
  WITH faltas_ordenadas AS (
    SELECT
      a.trabajador_id,
      a.fecha,
      a.fecha - LAG(a.fecha, 2) OVER (PARTITION BY a.trabajador_id ORDER BY a.fecha) AS dias_desde_1ra
    FROM public.asistencia a
    JOIN public.trabajadores t ON t.id = a.trabajador_id
    WHERE t.empresa_id = p_empresa_id
      AND t.estado     = 'activo'
      AND a.tipo       = 'falta'
  ),
  ultima_causal AS (
    SELECT trabajador_id, MAX(fecha) AS fecha_tercera
    FROM faltas_ordenadas
    WHERE dias_desde_1ra IS NOT NULL AND dias_desde_1ra <= 30
    GROUP BY trabajador_id
  )
  INSERT INTO public.alertas
    (empresa_id, trabajador_id, tipo, titulo, descripcion,
     prioridad, fecha_limite, articulo_lft, accion_sugerida)
  SELECT
    p_empresa_id,
    u.trabajador_id,
    'tres_faltas',
    'Faltas injustificadas: ' || t.nombre,
    t.nombre || ' acumuló 3 o más faltas injustificadas en un periodo de 30 días naturales ' ||
      '(última el ' || TO_CHAR(u.fecha_tercera, 'DD/MM/YYYY') || '). El derecho del patrón a ' ||
      'rescindir la relación sin responsabilidad prescribe el ' ||
      TO_CHAR(u.fecha_tercera + 30, 'DD/MM/YYYY') || '.',
    CASE
      WHEN (u.fecha_tercera + 30) <= CURRENT_DATE + 5  THEN 'critica'
      WHEN (u.fecha_tercera + 30) <= CURRENT_DATE + 15 THEN 'alta'
      ELSE 'media'
    END,
    u.fecha_tercera + 30,
    'Art. 47 Fracc. X LFT',
    'Levantar acta administrativa rescisoria antes de que prescriba el derecho (Art. 517 Fracc. I LFT)'
  FROM ultima_causal u
  JOIN public.trabajadores t ON t.id = u.trabajador_id
  WHERE (u.fecha_tercera + 30) >= CURRENT_DATE;

END;
$function$;

REVOKE ALL ON FUNCTION public.generar_alertas(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generar_alertas(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.generar_alertas(uuid) TO authenticated, service_role;
