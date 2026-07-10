-- ============================================================
--  Capital Humano MX — Migración 19: SBC (Art. 27 LSS) y
--  movimientos afiliatorios IMSS (altas/bajas/modificaciones de
--  salario) para exportar a IDSE/SUA.
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--
--  Idempotente: puede ejecutarse múltiples veces sin error.
--
--  NOTA: trabajadores.nss YA existe (00_setup.sql) — no se duplica.
-- ============================================================

-- 1. Columnas nuevas ───────────────────────────────────────────
ALTER TABLE public.trabajadores
  ADD COLUMN IF NOT EXISTS sbc              NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS fecha_ultimo_sbc DATE,
  ADD COLUMN IF NOT EXISTS umf              TEXT;  -- Unidad de Medicina Familiar asignada (opcional)

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS registro_patronal TEXT;

-- 2. Tabla movimientos_imss ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.movimientos_imss (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID REFERENCES public.empresas(id) NOT NULL,
  trabajador_id    UUID REFERENCES public.trabajadores(id) ON DELETE CASCADE NOT NULL,
  tipo             TEXT NOT NULL CHECK (tipo IN ('alta','baja','modificacion_salario','reingreso')),
  fecha_movimiento DATE NOT NULL DEFAULT CURRENT_DATE,
  sbc_anterior     NUMERIC(10,2),
  sbc_nuevo        NUMERIC(10,2),
  causa_baja       TEXT,   -- clave IMSS (ver imss.js: CAUSAS_BAJA_IMSS)
  estatus          TEXT NOT NULL DEFAULT 'pendiente' CHECK (estatus IN ('pendiente','exportado')),
  lote_exportacion UUID,
  exportado_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS movimientos_imss_empresa_idx ON public.movimientos_imss (empresa_id, estatus);

ALTER TABLE public.movimientos_imss ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "movimientos_imss_own" ON public.movimientos_imss;
CREATE POLICY "movimientos_imss_own" ON public.movimientos_imss FOR ALL
  USING  (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()));
