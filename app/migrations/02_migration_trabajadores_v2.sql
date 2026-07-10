-- ============================================================
--  Capital Humano MX — Migración Trabajadores v2
--  Ejecutar en: Supabase Dashboard → SQL Editor
--  Agrega columnas de configuración de nómina por trabajador
-- ============================================================

ALTER TABLE public.trabajadores
  -- Tipo de esquema salarial
  ADD COLUMN IF NOT EXISTS tipo_salario        TEXT    DEFAULT 'fijo',   -- 'fijo' | 'comision' | 'mixto'
  ADD COLUMN IF NOT EXISTS pct_comision        NUMERIC(7,4)  DEFAULT 0,  -- % habitual de comision

  -- Fondo de ahorro (Art. 110 fr. IV LFT)
  ADD COLUMN IF NOT EXISTS fondo_ahorro_activo BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS fondo_ahorro_pct    NUMERIC(7,4)  DEFAULT 0.13,

  -- INFONAVIT (Art. 97 Ley del INFONAVIT)
  ADD COLUMN IF NOT EXISTS infonavit_activo    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS infonavit_tipo      TEXT,                      -- 'factor' | 'cuota_fija' | 'pct'
  ADD COLUMN IF NOT EXISTS infonavit_valor     NUMERIC(8,4)  DEFAULT 0,

  -- Pension alimenticia (Art. 110 fr. V LFT)
  ADD COLUMN IF NOT EXISTS pension_activa      BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pension_tipo        TEXT,                      -- 'pct' | 'fijo'
  ADD COLUMN IF NOT EXISTS pension_valor       NUMERIC(10,2) DEFAULT 0;
