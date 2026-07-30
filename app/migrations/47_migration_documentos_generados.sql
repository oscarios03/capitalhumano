-- ═══════════════════════════════════════════════════════════════════════════
-- 47 — Trazabilidad de documentos generados (P2-4.5)
--
-- Hasta ahora, generar un contrato o cualquier otro PDF no dejaba rastro: si
-- el trabajador después presentaba una versión distinta, o si la empresa
-- necesitaba probar que el documento que exhibe es el mismo que se generó
-- (y firmó) en su momento, no había forma de acreditarlo desde el sistema.
--
-- Esta migración crea un registro append-only de cada documento generado:
-- quién, cuándo, con qué parámetros y con qué huella (SHA-256 del PDF).
--
-- IMPORTANTE — lo que esto NO es: un sello de tiempo NOM-151-SCFI-2016.
-- Esa norma exige que el hash y la marca de tiempo los emita un Prestador de
-- Servicios de Certificación (PSC) acreditado ante la Secretaría de Economía
-- — un tercero de confianza cuyo sello es oponible ante un tercero porque no
-- lo controla quien generó el documento. Este registro lo hace y lo firma la
-- propia aplicación: sirve para detectar alteraciones y para armar un
-- expediente ordenado, pero NO tiene el valor probatorio reforzado de un
-- sello NOM-151. Integrar un PSC (o el propio servicio del SAT) queda
-- pendiente como mejora futura; por eso no se anuncia como "sellado" en la
-- UI ni en el PDF, sólo como "hash" o "huella".
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.documentos_generados (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES public.empresas(id)     ON DELETE CASCADE,
  -- NULL para documentos que no son de un trabajador en particular (p. ej.
  -- el RIT o el protocolo de violencia laboral, que son de toda la empresa).
  trabajador_id   UUID REFERENCES public.trabajadores(id) ON DELETE SET NULL,

  -- Etiqueta libre ('contrato_indeterminado', 'recibo_finiquito', 'rit', ...);
  -- no lleva CHECK de enumeración porque este registro es un log de auditoría,
  -- no una tabla de la que el sistema lea reglas de negocio (a diferencia de
  -- acuses_documentos.documento, migración 44).
  tipo_documento  TEXT NOT NULL,
  folio           TEXT NOT NULL,
  hash_sha256     TEXT NOT NULL,

  -- Parámetros con los que se generó el documento (snapshot), para poder
  -- regenerar uno idéntico y comparar el hash si algún día se cuestiona.
  parametros      JSONB,

  generado_por    UUID REFERENCES auth.users(id),
  generado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT documentos_generados_hash_formato CHECK (hash_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_documentos_generados_empresa
  ON public.documentos_generados(empresa_id, generado_en DESC);
CREATE INDEX IF NOT EXISTS idx_documentos_generados_trabajador
  ON public.documentos_generados(trabajador_id, tipo_documento);
CREATE INDEX IF NOT EXISTS idx_documentos_generados_folio
  ON public.documentos_generados(folio);

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Registro de auditoría: se puede leer e insertar, pero nunca editar ni
-- borrar desde la aplicación. Un hash que se puede modificar después no
-- prueba nada. Si algún día hace falta corregir un registro erróneo, se hace
-- por migración explícita, no por una política de UPDATE/DELETE abierta.
ALTER TABLE public.documentos_generados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documentos_generados_select" ON public.documentos_generados;
CREATE POLICY "documentos_generados_select" ON public.documentos_generados FOR SELECT
  TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id()));

DROP POLICY IF EXISTS "documentos_generados_insert" ON public.documentos_generados;
CREATE POLICY "documentos_generados_insert" ON public.documentos_generados FOR INSERT
  TO authenticated
  WITH CHECK (empresa_id = (SELECT public.mi_empresa_id())
              AND (SELECT public.puede_gestionar()));

COMMENT ON TABLE public.documentos_generados IS
  'Registro append-only de cada PDF generado por la plataforma: folio, hash SHA-256 y parámetros. No es un sello de tiempo NOM-151-SCFI-2016 (eso requiere un PSC acreditado); es una huella de integridad propia de la aplicación.';
COMMENT ON COLUMN public.documentos_generados.hash_sha256 IS
  'SHA-256 en hexadecimal (64 caracteres) del PDF generado, calculado en el navegador con crypto.subtle.digest antes de imprimir el prefijo en el pie del documento.';
