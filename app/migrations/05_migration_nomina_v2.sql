-- ============================================================
--  Capital Humano MX — Migración Nómina v2
--  Ejecutar en: Supabase Dashboard → SQL Editor
--  Agrega columnas para comisiones y deducciones especiales
-- ============================================================

ALTER TABLE public.recibos_nomina
  -- Comisiones por ventas
  ADD COLUMN IF NOT EXISTS comisiones_ventas       NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_ventas            NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pct_comision_ventas     NUMERIC(7,4)  DEFAULT 0,
  -- Comisiones por recuperación de cartera
  ADD COLUMN IF NOT EXISTS comisiones_recuperacion NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_recuperado        NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pct_comision_recuper    NUMERIC(7,4)  DEFAULT 0,
  -- Bono por meta
  ADD COLUMN IF NOT EXISTS bono_meta               NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS concepto_bono_meta      TEXT,
  -- Percepciones proporcionales
  ADD COLUMN IF NOT EXISTS prima_vacacional        NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aguinaldo_prop          NUMERIC(12,2) DEFAULT 0,
  -- Fondo de ahorro (Art. 110 fr. IV LFT)
  ADD COLUMN IF NOT EXISTS fondo_ahorro_obrero     NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fondo_ahorro_patronal   NUMERIC(12,2) DEFAULT 0,
  -- Préstamo empresa (Art. 110 fr. I LFT)
  ADD COLUMN IF NOT EXISTS prestamo_empresa        NUMERIC(12,2) DEFAULT 0,
  -- INFONAVIT (Art. 97 Ley del INFONAVIT)
  ADD COLUMN IF NOT EXISTS infonavit_descuento     NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS infonavit_tipo          TEXT,          -- 'factor' | 'cuota_fija' | 'pct'
  ADD COLUMN IF NOT EXISTS infonavit_valor         NUMERIC(8,4)  DEFAULT 0,
  -- Pensión alimenticia (Art. 110 fr. V LFT)
  ADD COLUMN IF NOT EXISTS pension_alimenticia     NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pension_tipo            TEXT;          -- 'pct' | 'fijo'
