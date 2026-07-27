-- ═══════════════════════════════════════════════════════════════════════════
-- 44 — Expediente de cumplimiento: RIT, acuses de entrega y capacitación
--
-- Remedia los hallazgos P2-3 y P2-4 de la auditoría jurídica de formatos.
--
-- Por qué existe esta migración:
--
--  1. RIT. Dos causales de amonestación del sistema se fundan en el
--     "Reglamento Interior de Trabajo" (calculo.js). El art. 425 LFT es
--     tajante: el reglamento "surtirá efectos a partir de la fecha de su
--     depósito". Sin depósito ante el Centro Federal de Conciliación y
--     Registro Laboral (art. 424 fr. II) no hay norma que invocar, y el acta
--     administrativa se queda sin sustento. El sistema necesita SABER si el
--     patrón tiene RIT depositado para poder advertirlo antes de sancionar.
--
--  2. Acuses. El mismo art. 425 obliga a imprimir el reglamento, repartirlo
--     entre los trabajadores y fijarlo en los lugares más visibles. Sin
--     constancia de entrega no se puede sancionar por incumplir algo que
--     nunca se acreditó haber comunicado. Lo mismo aplica al protocolo del
--     art. 132 fr. XXXI LFT y al aviso de privacidad y los consentimientos
--     de la LFPDPPP (arts. 8 y 16).
--
--  3. Capacitación. El art. 153-V LFT define la constancia de competencias
--     como el documento con el que el trabajador acredita haber llevado y
--     aprobado un curso, y el art. 804 fr. V remite a los demás documentos
--     que señalen las leyes. Hoy el Kit de defensa no puede exhibir ninguno
--     porque no hay dónde registrarlos.
--
-- Todas las columnas nuevas son NULLABLE o traen DEFAULT: ningún registro
-- histórico se invalida ni se rellena con datos inventados.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Estado del Reglamento Interior de Trabajo ───────────────────────────
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS rit_depositado      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rit_fecha_firma     DATE,
  ADD COLUMN IF NOT EXISTS rit_fecha_deposito  DATE,
  ADD COLUMN IF NOT EXISTS rit_folio_deposito  TEXT;

COMMENT ON COLUMN public.empresas.rit_depositado IS
  'Art. 425 LFT: el reglamento surte efectos a partir de la fecha de su depósito. Mientras sea false, el módulo disciplinario opera sin sustento reglamentario.';
COMMENT ON COLUMN public.empresas.rit_fecha_firma IS
  'Fecha en que la comisión mixta del art. 424 fr. I firmó el reglamento. El depósito debe hacerse dentro de los ocho días siguientes (art. 424 fr. II).';
COMMENT ON COLUMN public.empresas.rit_fecha_deposito IS
  'Fecha de depósito ante el Centro Federal de Conciliación y Registro Laboral. Desde ella el reglamento es exigible.';

-- El depósito no puede preceder a la firma del reglamento que se deposita.
ALTER TABLE public.empresas DROP CONSTRAINT IF EXISTS empresas_rit_fechas_coherentes;
ALTER TABLE public.empresas ADD CONSTRAINT empresas_rit_fechas_coherentes CHECK (
  rit_fecha_deposito IS NULL OR rit_fecha_firma IS NULL
  OR rit_fecha_deposito >= rit_fecha_firma
);

-- ── 2. Acuses de entrega de políticas y documentos de cumplimiento ─────────
CREATE TABLE IF NOT EXISTS public.acuses_documentos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id)     ON DELETE CASCADE,
  trabajador_id  UUID NOT NULL REFERENCES public.trabajadores(id) ON DELETE CASCADE,

  documento      TEXT NOT NULL,
  -- La versión importa: un acuse del RIT de 2024 no acredita la entrega del
  -- RIT reformado en 2026. Sin versión, el acuse envejece en silencio.
  version        TEXT,
  fecha_entrega  DATE NOT NULL,
  medio          TEXT NOT NULL DEFAULT 'impreso',
  observaciones  TEXT,

  creado_por     UUID REFERENCES auth.users(id),
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT acuses_documento_valido CHECK (
    documento IN ('rit', 'protocolo_violencia', 'aviso_privacidad',
                  'consentimiento_sensibles', 'consentimiento_monitoreo',
                  'politica_nom035', 'anexo_teletrabajo', 'otro')
  ),
  CONSTRAINT acuses_medio_valido CHECK (
    medio IN ('impreso', 'electronico', 'ambos')
  )
);

CREATE INDEX IF NOT EXISTS idx_acuses_empresa    ON public.acuses_documentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_acuses_trabajador ON public.acuses_documentos(trabajador_id, documento);

-- ── 3. Constancias de capacitación (art. 153-V LFT) ────────────────────────
CREATE TABLE IF NOT EXISTS public.capacitaciones (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES public.empresas(id)     ON DELETE CASCADE,
  trabajador_id     UUID NOT NULL REFERENCES public.trabajadores(id) ON DELETE CASCADE,

  nombre_curso      TEXT NOT NULL,
  tipo              TEXT NOT NULL DEFAULT 'capacitacion',
  area_tematica     TEXT,
  horas             NUMERIC(6,2),
  fecha_inicio      DATE NOT NULL,
  fecha_fin         DATE,

  instructor_nombre TEXT,
  -- Registro del agente capacitador ante la STPS (art. 153-G LFT). Sin él, la
  -- constancia vale poco frente a una inspección.
  instructor_registro_stps TEXT,

  -- El art. 153-V condiciona la constancia a haber llevado Y APROBADO el curso.
  aprobado          BOOLEAN NOT NULL DEFAULT true,

  creado_por        UUID REFERENCES auth.users(id),
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT capacitaciones_tipo_valido CHECK (
    tipo IN ('capacitacion', 'adiestramiento', 'seguridad_higiene', 'nom035')
  ),
  CONSTRAINT capacitaciones_fechas_coherentes CHECK (
    fecha_fin IS NULL OR fecha_fin >= fecha_inicio
  )
);

CREATE INDEX IF NOT EXISTS idx_capacitaciones_empresa    ON public.capacitaciones(empresa_id);
CREATE INDEX IF NOT EXISTS idx_capacitaciones_trabajador ON public.capacitaciones(trabajador_id, fecha_inicio DESC);

-- ── 4. RLS por empresa y por rol ───────────────────────────────────────────
-- Mismo patrón que `rescisiones` (migración 40) y `actas`: lectura para
-- cualquier miembro de la empresa; escritura sólo para quien puede gestionar.
-- Un acuse de entrega es prueba de descargo: no debe poder fabricarlo ni
-- borrarlo un rol de consulta.
ALTER TABLE public.acuses_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capacitaciones    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acuses_select" ON public.acuses_documentos;
CREATE POLICY "acuses_select" ON public.acuses_documentos FOR SELECT
  TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id()));

DROP POLICY IF EXISTS "acuses_insert" ON public.acuses_documentos;
CREATE POLICY "acuses_insert" ON public.acuses_documentos FOR INSERT
  TO authenticated
  WITH CHECK (empresa_id = (SELECT public.mi_empresa_id())
              AND (SELECT public.puede_gestionar()));

DROP POLICY IF EXISTS "acuses_update" ON public.acuses_documentos;
CREATE POLICY "acuses_update" ON public.acuses_documentos FOR UPDATE
  TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id())
         AND (SELECT public.puede_gestionar()))
  WITH CHECK (empresa_id = (SELECT public.mi_empresa_id())
              AND (SELECT public.puede_gestionar()));

DROP POLICY IF EXISTS "acuses_delete" ON public.acuses_documentos;
CREATE POLICY "acuses_delete" ON public.acuses_documentos FOR DELETE
  TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id())
         AND (SELECT public.puede_gestionar()));

DROP POLICY IF EXISTS "capacitaciones_select" ON public.capacitaciones;
CREATE POLICY "capacitaciones_select" ON public.capacitaciones FOR SELECT
  TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id()));

DROP POLICY IF EXISTS "capacitaciones_insert" ON public.capacitaciones;
CREATE POLICY "capacitaciones_insert" ON public.capacitaciones FOR INSERT
  TO authenticated
  WITH CHECK (empresa_id = (SELECT public.mi_empresa_id())
              AND (SELECT public.puede_gestionar()));

DROP POLICY IF EXISTS "capacitaciones_update" ON public.capacitaciones;
CREATE POLICY "capacitaciones_update" ON public.capacitaciones FOR UPDATE
  TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id())
         AND (SELECT public.puede_gestionar()))
  WITH CHECK (empresa_id = (SELECT public.mi_empresa_id())
              AND (SELECT public.puede_gestionar()));

DROP POLICY IF EXISTS "capacitaciones_delete" ON public.capacitaciones;
CREATE POLICY "capacitaciones_delete" ON public.capacitaciones FOR DELETE
  TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id())
         AND (SELECT public.puede_gestionar()));

COMMENT ON TABLE public.acuses_documentos IS
  'Acuses de entrega de RIT, protocolo del art. 132 fr. XXXI LFT, aviso de privacidad y consentimientos LFPDPPP. Sin acuse no se puede sancionar por incumplir el documento (art. 425 LFT).';
COMMENT ON TABLE public.capacitaciones IS
  'Cursos impartidos y constancias de competencias del art. 153-V LFT. Alimenta la carpeta de capacitación del expediente del art. 804 LFT.';
