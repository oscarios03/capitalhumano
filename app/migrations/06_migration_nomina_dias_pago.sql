-- ============================================================
--  Capital Humano MX — Migración: Días de pago semanal
--  Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- día de la semana en que la empresa paga su nómina semanal
-- 0=domingo, 1=lunes, 2=martes, 3=miércoles, 4=jueves, 5=viernes, 6=sábado
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS dia_pago_semanal INTEGER DEFAULT 5;  -- viernes por defecto
