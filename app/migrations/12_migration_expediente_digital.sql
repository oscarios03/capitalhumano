-- ============================================================
--  Capital Humano MX — Migración Expediente Digital
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Tipo ENUM para tipo de documento
DO $$ BEGIN
  CREATE TYPE tipo_documento_enum AS ENUM (
    'contrato', 'identificacion', 'acta', 'justificante', 'otro'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tabla principal de documentos por trabajador
CREATE TABLE IF NOT EXISTS public.documentos_trabajador (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  trabajador_id  UUID NOT NULL REFERENCES public.trabajadores(id) ON DELETE CASCADE,
  nombre_archivo TEXT NOT NULL,
  tipo_documento tipo_documento_enum NOT NULL DEFAULT 'otro',
  descripcion    TEXT,
  storage_path   TEXT NOT NULL,
  subido_por     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_docs_trab_trabajador ON public.documentos_trabajador (trabajador_id);
CREATE INDEX IF NOT EXISTS idx_docs_trab_empresa    ON public.documentos_trabajador (empresa_id);

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.documentos_trabajador ENABLE ROW LEVEL SECURITY;

-- Solo usuarios cuya empresa coincida con el documento
CREATE POLICY "docs_select_misma_empresa" ON public.documentos_trabajador
  FOR SELECT
  USING (
    empresa_id = (
      SELECT empresa_id FROM public.perfiles WHERE id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "docs_insert_misma_empresa" ON public.documentos_trabajador
  FOR INSERT
  WITH CHECK (
    empresa_id = (
      SELECT empresa_id FROM public.perfiles WHERE id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "docs_delete_misma_empresa" ON public.documentos_trabajador
  FOR DELETE
  USING (
    empresa_id = (
      SELECT empresa_id FROM public.perfiles WHERE id = auth.uid() LIMIT 1
    )
  );

-- ============================================================
--  INSTRUCCIONES PARA CREAR EL BUCKET EN SUPABASE DASHBOARD
--
--  1. Ve a Storage → New bucket
--  2. Nombre del bucket:  expedientes
--  3. Public bucket:      NO (privado)
--  4. Allowed MIME types: application/pdf, image/jpeg, image/png
--  5. Max file size:      10 MB (10485760 bytes)
--
--  Después de crear el bucket, agrega las siguientes Storage
--  Policies (Storage → expedientes → Policies):
--
--  POLICY 1 — SELECT (descargar):
--    Nombre:   "Usuarios autenticados pueden descargar"
--    Allowed operation: SELECT
--    Target roles: authenticated
--    USING: bucket_id = 'expedientes'
--
--  POLICY 2 — INSERT (subir):
--    Nombre:   "Usuarios autenticados pueden subir"
--    Allowed operation: INSERT
--    Target roles: authenticated
--    WITH CHECK: bucket_id = 'expedientes'
--
--  POLICY 3 — DELETE (eliminar):
--    Nombre:   "Usuarios autenticados pueden eliminar"
--    Allowed operation: DELETE
--    Target roles: authenticated
--    USING: bucket_id = 'expedientes'
-- ============================================================
