-- ============================================================
--  Capital Humano MX — Migración Nuevas Funciones
--  Ejecutar en: Supabase Dashboard → SQL Editor
--  Agrega: vacaciones, incapacidades, PTU, multiempresa, organigrama
-- ============================================================

-- ── Vacaciones y Permisos ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vacaciones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  trabajador_id UUID NOT NULL REFERENCES public.trabajadores(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL DEFAULT 'vacacion', -- vacacion | permiso_goce | permiso_sin
  fecha_inicio  DATE NOT NULL,
  fecha_fin     DATE NOT NULL,
  dias          INTEGER NOT NULL,
  estado        TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | aprobada | rechazada
  prima_vacacional NUMERIC(12,2) DEFAULT 0,
  aprobado_por  TEXT,
  notas         TEXT,
  creado_en     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.trabajadores
  ADD COLUMN IF NOT EXISTS ultima_vacacion DATE;

-- ── Incapacidades IMSS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.incapacidades (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  trabajador_id UUID NOT NULL REFERENCES public.trabajadores(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL DEFAULT 'enfermedad_general',
  folio_imss    TEXT,
  fecha_inicio  DATE NOT NULL,
  fecha_fin     DATE NOT NULL,
  dias          INTEGER NOT NULL,
  subsidio_pct  NUMERIC(5,2) DEFAULT 60,
  notas         TEXT,
  creado_en     TIMESTAMPTZ DEFAULT now()
);

-- ── PTU ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ptu_ejercicios (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  ejercicio           INTEGER NOT NULL,
  utilidad_repartible NUMERIC(14,2) NOT NULL DEFAULT 0,
  factor_dias         NUMERIC(14,6),
  factor_salario      NUMERIC(14,6),
  estado              TEXT DEFAULT 'borrador', -- borrador | calculado | pagado
  creado_en           TIMESTAMPTZ DEFAULT now(),
  UNIQUE(empresa_id, ejercicio)
);

CREATE TABLE IF NOT EXISTS public.ptu_detalle (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ptu_ejercicio_id UUID NOT NULL REFERENCES public.ptu_ejercicios(id) ON DELETE CASCADE,
  trabajador_id    UUID NOT NULL REFERENCES public.trabajadores(id) ON DELETE CASCADE,
  dias_trabajados  INTEGER DEFAULT 0,
  salario_promedio NUMERIC(12,2) DEFAULT 0,
  parte_dias       NUMERIC(12,2) DEFAULT 0,
  parte_salario    NUMERIC(12,2) DEFAULT 0,
  total_ptu        NUMERIC(12,2) DEFAULT 0
);

-- ── Multiempresa ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.usuario_empresas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id  UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  rol         TEXT DEFAULT 'admin',
  creado_en   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(usuario_id, empresa_id)
);

-- ── Organigrama ───────────────────────────────────────────
ALTER TABLE public.trabajadores
  ADD COLUMN IF NOT EXISTS reporta_a UUID REFERENCES public.trabajadores(id);

-- ── RLS ───────────────────────────────────────────────────
ALTER TABLE public.vacaciones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incapacidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ptu_ejercicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ptu_detalle   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_empresas ENABLE ROW LEVEL SECURITY;

-- Política compartida: acceso solo a registros de la empresa del usuario
DO $$ BEGIN
  CREATE POLICY vacaciones_empresa ON public.vacaciones
    USING (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY incapacidades_empresa ON public.incapacidades
    USING (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY ptu_ejercicios_empresa ON public.ptu_ejercicios
    USING (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY ptu_detalle_empresa ON public.ptu_detalle
    USING (ptu_ejercicio_id IN (
      SELECT id FROM public.ptu_ejercicios
      WHERE empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid())
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY usuario_empresas_own ON public.usuario_empresas
    USING (usuario_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
