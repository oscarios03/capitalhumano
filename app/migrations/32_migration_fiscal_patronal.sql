-- ============================================================================
-- Migración 32 — Motor fiscal patronal
-- ============================================================================
-- · Cuotas patronales IMSS completas + ISN estatal + prima de riesgo:
--     - empresas.prima_riesgo_pct     (prima de riesgo de trabajo, declaración
--                                      anual de febrero; default clase I mínima)
--     - empresas.entidad_federativa   (para el ISN y referencias estatales)
--     - empresas.isn_pct              (tasa del Impuesto Sobre Nómina estatal,
--                                      editable; default 3%)
-- · Persistencia del costo patronal y del subsidio en cada recibo:
--     - recibos_nomina.imss_patronal      (cuotas patronales IMSS del período)
--     - recibos_nomina.infonavit_patronal (aportación 5% SBC — antes solo se
--                                          calculaba al vuelo en la UI)
--     - recibos_nomina.isn                (ISN del período, informativo)
--     - recibos_nomina.subsidio_empleo    (subsidio al empleo aplicado)
--     - recibos_nomina.ajuste_anual_isr   (Art. 97 LISR: diferencia del ajuste
--                                          anual aplicada en diciembre;
--                                          positivo = retención adicional,
--                                          negativo = saldo a favor compensado)
-- · Subsidio al empleo 2026 en config_valores (DOF 31/12/2025):
--     cuota fija = 15.02% de la UMA mensual, solo si la base mensual
--     no excede $11,492.66. Sustituye a la tabla progresiva anterior.
--
-- Idempotente: puede correrse múltiples veces sin efectos secundarios.
-- ============================================================================

-- 1. Empresas — configuración patronal ──────────────────────────────────────
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS prima_riesgo_pct   NUMERIC(8,5) DEFAULT 0.54355,
  ADD COLUMN IF NOT EXISTS entidad_federativa TEXT,
  ADD COLUMN IF NOT EXISTS isn_pct            NUMERIC(6,4) DEFAULT 0.03;

-- Blindaje de rangos: la prima de riesgo legal va de 0.5% (mínima) a 15%
-- (máxima, Art. 74 LSS); el ISN estatal real está entre 0% y 5%.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'empresas_prima_riesgo_chk'
  ) THEN
    ALTER TABLE public.empresas
      ADD CONSTRAINT empresas_prima_riesgo_chk
      CHECK (prima_riesgo_pct IS NULL OR (prima_riesgo_pct >= 0.5 AND prima_riesgo_pct <= 15));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'empresas_isn_pct_chk'
  ) THEN
    ALTER TABLE public.empresas
      ADD CONSTRAINT empresas_isn_pct_chk
      CHECK (isn_pct IS NULL OR (isn_pct >= 0 AND isn_pct <= 0.05));
  END IF;
END $$;

-- 2. Recibos — costo patronal, subsidio y ajuste anual ──────────────────────
ALTER TABLE public.recibos_nomina
  ADD COLUMN IF NOT EXISTS imss_patronal      NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS infonavit_patronal NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS isn                NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subsidio_empleo    NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ajuste_anual_isr   NUMERIC(12,2) DEFAULT 0;

-- 3. Subsidio al empleo vigente (decreto DOF 31/12/2025, vigente 2026) ──────
--    · subsidio_pct_uma:        porcentaje de la UMA mensual (UMA diaria × 30.4)
--    · subsidio_limite_mensual: tope de ingresos mensuales para tener derecho
--    ⚠️ ACCIÓN REQUERIDA DEL ADMINISTRADOR: cuando se publique un nuevo
--    decreto, insertar filas nuevas con la vigencia correcta (no sobrescribir).
INSERT INTO public.config_valores (clave, valor, vigencia_desde) VALUES
  ('subsidio_pct_uma',        0.1502,   '2026-02-01'),
  ('subsidio_limite_mensual', 11492.66, '2026-01-01')
ON CONFLICT (clave, vigencia_desde) DO NOTHING;
