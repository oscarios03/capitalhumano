-- ============================================================
--  Capital Humano MX — Migración 22: Programación de nómina
--  · Fecha de pago del período (periodos_nomina.fecha_pago)
--  · Día/esquema de pago quincenal y mensual de la empresa
--  · Alerta "toca generar la nómina" aunque el período aún no exista
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--
--  Idempotente: puede ejecutarse múltiples veces sin error.
--
--  NOTA DE DISEÑO:
--  * El salario del trabajador (trabajadores.salario_mensual) representa
--    el monto del PERIODO DE PAGO (mensual/quincenal/semanal). El salario
--    diario se deriva con el divisor del Art. 89 LFT (/30, /15, /7). Esta
--    migración NO toca esa semántica; solo agrega programación de pagos.
--  * fecha_pago es informativa/operativa (Art. 88 LFT: pago en fecha
--    convenida). No altera el cálculo del recibo.
-- ============================================================

-- ── 1. Fecha de pago del período ────────────────────────────────────
ALTER TABLE public.periodos_nomina
  ADD COLUMN IF NOT EXISTS fecha_pago DATE;

-- Backfill: si no hay fecha de pago, usar la fecha fin del período como
-- valor operativo por defecto (día en que normalmente se liquida).
UPDATE public.periodos_nomina
   SET fecha_pago = fecha_fin
 WHERE fecha_pago IS NULL;

-- ── 2. Esquema de pago quincenal y mensual de la empresa ────────────
--  dia_pago_semanal ya existe (migración 06): 0=domingo … 6=sábado.
--  Para quincenal/mensual se guarda el DÍA DEL MES en que se paga.
--  Convención: 0 = "último día del mes" (fin de mes / segunda quincena).
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS dia_pago_quincenal_1 INTEGER DEFAULT 15,  -- 1ª quincena: normalmente el 15
  ADD COLUMN IF NOT EXISTS dia_pago_quincenal_2 INTEGER DEFAULT 0,   -- 2ª quincena: 0 = último día del mes
  ADD COLUMN IF NOT EXISTS dia_pago_mensual     INTEGER DEFAULT 0;   -- mensual: 0 = último día del mes

-- ── 3. Alerta de nómina por generar (aunque el período no exista) ───
--  La alerta 'nomina_por_pagar' de la migración 16 solo avisa cuando
--  YA existe un período abierto próximo a vencer. Este bloque agrega
--  'nomina_por_generar': avisa cuando, según la frecuencia de pago de
--  los trabajadores activos, toca correr una nómina y AÚN NO existe un
--  período que cubra la fecha de hoy.
CREATE OR REPLACE FUNCTION public.generar_alertas_nomina(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public   -- evita inyección por search_path en SECURITY DEFINER
AS $$
DECLARE
  v_tiene_semanal   boolean;
  v_tiene_quincenal boolean;
  v_tiene_mensual   boolean;
BEGIN
  -- Limpiar alertas previas de este tipo (se regeneran frescas)
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

  -- Para cada frecuencia con trabajadores activos, si no hay período que
  -- cubra la fecha de hoy, generar la alerta.
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
$$;

-- Las alertas de nómina solo tienen sentido para usuarios autenticados
-- (el dashboard las regenera tras iniciar sesión). Se retira EXECUTE al rol
-- anónimo para no exponer la función SECURITY DEFINER a la API pública.
REVOKE EXECUTE ON FUNCTION public.generar_alertas_nomina(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.generar_alertas_nomina(uuid) TO authenticated;
