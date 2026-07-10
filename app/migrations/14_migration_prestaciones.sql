-- ============================================================
--  Capital Humano MX — Migración 14: Prestaciones y disposiciones
--  particulares por empresa + horas extra en asistencia.
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--  Idempotente: puede ejecutarse múltiples veces sin error.
-- ============================================================

-- 1. Configuración de prestaciones a nivel empresa ──────────────
ALTER TABLE public.empresas
  -- Aguinaldo (Art. 87 LFT — mínimo 15 días)
  ADD COLUMN IF NOT EXISTS dias_aguinaldo              NUMERIC(5,2)  DEFAULT 15,
  -- Días de vacaciones ADICIONALES sobre la tabla LFT 2023 (Art. 76)
  ADD COLUMN IF NOT EXISTS dias_vacaciones_extra       NUMERIC(5,2)  DEFAULT 0,
  -- Prima vacacional (Art. 80 LFT — mínimo 25%)
  ADD COLUMN IF NOT EXISTS prima_vacacional_pct        NUMERIC(6,4)  DEFAULT 0.25,
  -- Fondo de ahorro a nivel empresa (Art. 110 fr. IV LFT)
  ADD COLUMN IF NOT EXISTS fondo_ahorro_empresa_activo BOOLEAN       DEFAULT false,
  ADD COLUMN IF NOT EXISTS fondo_ahorro_pct_trabajador NUMERIC(6,4)  DEFAULT 0.13,
  ADD COLUMN IF NOT EXISTS fondo_ahorro_pct_patron     NUMERIC(6,4)  DEFAULT 0.13,
  -- Vales de despensa (Art. 27 fr. XI LISR)
  ADD COLUMN IF NOT EXISTS vales_despensa_activo       BOOLEAN       DEFAULT false,
  ADD COLUMN IF NOT EXISTS vales_despensa_tipo         TEXT          DEFAULT 'monto',
  ADD COLUMN IF NOT EXISTS vales_despensa_valor        NUMERIC(12,4) DEFAULT 0,
  -- Prima dominical (Art. 71 LFT — mínimo 25%)
  ADD COLUMN IF NOT EXISTS prima_dominical_pct         NUMERIC(6,4)  DEFAULT 0.25,
  -- Festivos/descansos adicionales de la empresa
  -- Formato: [{"tipo":"recurrente","valor":"MM-DD","descripcion":"..."},
  --           {"tipo":"fecha","valor":"YYYY-MM-DD","descripcion":"..."}]
  ADD COLUMN IF NOT EXISTS festivos_adicionales        JSONB         DEFAULT '[]'::jsonb,
  -- Factor multiplicador de horas extra (Art. 67-68 LFT — mínimo doble)
  ADD COLUMN IF NOT EXISTS factor_horas_extra          NUMERIC(5,2)  DEFAULT 2.0;

-- 2. Constraints de mínimos de ley (toleran NULL para fallback en JS)
ALTER TABLE public.empresas DROP CONSTRAINT IF EXISTS empresas_dias_aguinaldo_min;
ALTER TABLE public.empresas ADD CONSTRAINT empresas_dias_aguinaldo_min
  CHECK (dias_aguinaldo IS NULL OR dias_aguinaldo >= 15);

ALTER TABLE public.empresas DROP CONSTRAINT IF EXISTS empresas_vac_extra_min;
ALTER TABLE public.empresas ADD CONSTRAINT empresas_vac_extra_min
  CHECK (dias_vacaciones_extra IS NULL OR dias_vacaciones_extra >= 0);

ALTER TABLE public.empresas DROP CONSTRAINT IF EXISTS empresas_prima_vac_min;
ALTER TABLE public.empresas ADD CONSTRAINT empresas_prima_vac_min
  CHECK (prima_vacacional_pct IS NULL OR prima_vacacional_pct >= 0.25);

ALTER TABLE public.empresas DROP CONSTRAINT IF EXISTS empresas_prima_dom_min;
ALTER TABLE public.empresas ADD CONSTRAINT empresas_prima_dom_min
  CHECK (prima_dominical_pct IS NULL OR prima_dominical_pct >= 0.25);

ALTER TABLE public.empresas DROP CONSTRAINT IF EXISTS empresas_factor_he_min;
ALTER TABLE public.empresas ADD CONSTRAINT empresas_factor_he_min
  CHECK (factor_horas_extra IS NULL OR factor_horas_extra >= 2.0);

ALTER TABLE public.empresas DROP CONSTRAINT IF EXISTS empresas_vales_tipo_check;
ALTER TABLE public.empresas ADD CONSTRAINT empresas_vales_tipo_check
  CHECK (vales_despensa_tipo IS NULL OR vales_despensa_tipo IN ('monto','pct'));

ALTER TABLE public.empresas DROP CONSTRAINT IF EXISTS empresas_fondo_pcts_check;
ALTER TABLE public.empresas ADD CONSTRAINT empresas_fondo_pcts_check
  CHECK (
    (fondo_ahorro_pct_trabajador IS NULL OR (fondo_ahorro_pct_trabajador >= 0 AND fondo_ahorro_pct_trabajador <= 0.30))
    AND (fondo_ahorro_pct_patron IS NULL OR (fondo_ahorro_pct_patron >= 0 AND fondo_ahorro_pct_patron <= 0.30))
  );

-- 3. Horas extra en asistencia diaria ────────────────────────────
ALTER TABLE public.asistencia
  ADD COLUMN IF NOT EXISTS horas_extra NUMERIC(4,1) DEFAULT 0;

ALTER TABLE public.asistencia DROP CONSTRAINT IF EXISTS asistencia_horas_extra_check;
ALTER TABLE public.asistencia ADD CONSTRAINT asistencia_horas_extra_check
  CHECK (horas_extra IS NULL OR (horas_extra >= 0 AND horas_extra <= 12));

-- 4. Prima dominical en recibos de nómina (Art. 71 LFT) ──────────
ALTER TABLE public.recibos_nomina
  ADD COLUMN IF NOT EXISTS prima_dominical NUMERIC(12,2) DEFAULT 0;
