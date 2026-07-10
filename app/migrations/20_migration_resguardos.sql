-- ============================================================
--  Capital Humano MX — Migración 20: Resguardos de herramientas,
--  uniformes y equipo entregados al trabajador.
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--
--  Idempotente: puede ejecutarse múltiples veces sin error.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.resguardos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID REFERENCES public.empresas(id) NOT NULL,
  trabajador_id       UUID REFERENCES public.trabajadores(id) ON DELETE CASCADE NOT NULL,
  articulo            TEXT NOT NULL,
  descripcion         TEXT,
  numero_serie        TEXT,
  cantidad            INT DEFAULT 1,
  valor_estimado      NUMERIC(12,2),
  estado_entrega      TEXT CHECK (estado_entrega IN ('nuevo','buen_estado','usado')),
  fecha_entrega       DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_devolucion    DATE,
  estado_devolucion   TEXT CHECK (estado_devolucion IN ('completo','danado','no_devuelto')),
  notas_devolucion    TEXT,
  documento_url       TEXT,   -- ruta en Storage (bucket 'expedientes') de la carta responsiva firmada
  activo              BOOLEAN GENERATED ALWAYS AS (fecha_devolucion IS NULL) STORED,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resguardos_trabajador_idx ON public.resguardos (trabajador_id, activo);

ALTER TABLE public.resguardos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "resguardos_own" ON public.resguardos;
CREATE POLICY "resguardos_own" ON public.resguardos FOR ALL
  USING  (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()));
