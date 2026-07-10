-- ============================================================
--  Capital Humano MX — Schema Supabase
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── TABLAS ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.empresas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT NOT NULL,
  rfc           TEXT,
  representante TEXT,
  domicilio     TEXT,
  ciudad        TEXT,
  creado_en     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.perfiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id UUID REFERENCES public.empresas(id),
  nombre     TEXT,
  rol        TEXT DEFAULT 'admin',
  creado_en  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trabajadores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID REFERENCES public.empresas(id) NOT NULL,
  nombre         TEXT NOT NULL,
  rfc            TEXT,
  curp           TEXT,
  nss            TEXT,
  puesto         TEXT,
  departamento   TEXT,
  salario_mensual NUMERIC NOT NULL,
  smg_zone       TEXT DEFAULT 'general',
  fecha_ingreso  DATE NOT NULL,
  tipo_contrato  TEXT DEFAULT 'indefinido',
  estado         TEXT DEFAULT 'activo',
  fecha_baja     DATE,
  tipo_baja      TEXT,
  creado_en      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.asistencia (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID REFERENCES public.empresas(id) NOT NULL,
  trabajador_id UUID REFERENCES public.trabajadores(id) ON DELETE CASCADE NOT NULL,
  fecha         DATE NOT NULL,
  tipo          TEXT NOT NULL CHECK (tipo IN ('falta', 'retardo')),
  justificada   BOOLEAN DEFAULT false,
  minutos_retardo INT,
  observaciones TEXT,
  creado_en     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.actas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID REFERENCES public.empresas(id) NOT NULL,
  trabajador_id   UUID REFERENCES public.trabajadores(id) ON DELETE CASCADE NOT NULL,
  fecha           DATE NOT NULL,
  tipo            TEXT NOT NULL CHECK (tipo IN ('amonestacion', 'formal', 'rescisoria')),
  tipo_falta      TEXT,
  tipo_falta_label TEXT,
  causal          TEXT,
  descripcion     TEXT,
  lugar           TEXT,
  hora_falta      TEXT,
  reincidente     BOOLEAN DEFAULT false,
  testigo1        TEXT,
  testigo1_puesto TEXT,
  testigo2        TEXT,
  testigo2_puesto TEXT,
  aceptacion      TEXT DEFAULT 'acepta',
  creado_en       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contratos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID REFERENCES public.empresas(id) NOT NULL,
  trabajador_id UUID REFERENCES public.trabajadores(id) ON DELETE CASCADE NOT NULL,
  tipo          TEXT DEFAULT 'indefinido',
  fecha_fin     DATE,
  fecha_generacion TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bajas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID REFERENCES public.empresas(id) NOT NULL,
  trabajador_id UUID REFERENCES public.trabajadores(id) ON DELETE CASCADE NOT NULL,
  fecha_baja    DATE NOT NULL,
  tipo_baja     TEXT NOT NULL CHECK (tipo_baja IN ('injustificada', 'justificada', 'renuncia')),
  salario_al_momento NUMERIC,
  dias_pendientes INT DEFAULT 0,
  calculo_json  JSONB,
  creado_en     TIMESTAMPTZ DEFAULT now()
);

-- ── SUCURSALES ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sucursales (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID REFERENCES public.empresas(id) NOT NULL,
  nombre              TEXT NOT NULL,
  clave               TEXT,
  tipo                TEXT DEFAULT 'sucursal' CHECK (tipo IN ('matriz','sucursal')),
  domicilio           TEXT,
  ciudad              TEXT,
  estado              TEXT,
  cp                  TEXT,
  telefono            TEXT,
  responsable_nombre  TEXT,
  responsable_puesto  TEXT,
  activa              BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- FK en trabajadores para asignar sucursal
ALTER TABLE public.trabajadores
  ADD COLUMN IF NOT EXISTS sucursal_id UUID REFERENCES public.sucursales(id);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────

ALTER TABLE public.empresas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trabajadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asistencia   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bajas        ENABLE ROW LEVEL SECURITY;

-- Perfiles: cada usuario ve solo el suyo
CREATE POLICY "perfiles_own" ON public.perfiles FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Empresas: ver e insertar la propia
CREATE POLICY "empresas_select" ON public.empresas FOR SELECT
  USING (id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()));
CREATE POLICY "empresas_insert" ON public.empresas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "empresas_update" ON public.empresas FOR UPDATE
  USING (id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()));

-- Trabajadores, asistencia, actas, contratos, bajas: solo de la propia empresa
CREATE POLICY "trab_own" ON public.trabajadores FOR ALL
  USING (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()));

CREATE POLICY "asist_own" ON public.asistencia FOR ALL
  USING (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()));

CREATE POLICY "actas_own" ON public.actas FOR ALL
  USING (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()));

CREATE POLICY "contratos_own" ON public.contratos FOR ALL
  USING (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()));

CREATE POLICY "bajas_own" ON public.bajas FOR ALL
  USING (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()));

ALTER TABLE public.sucursales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sucursales_own" ON public.sucursales FOR ALL
  USING (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()));

-- ── FUNCIÓN: obtener o crear la matriz de la empresa ─────────

CREATE OR REPLACE FUNCTION public.get_or_create_matriz()
RETURNS UUID AS $$
DECLARE
  v_empresa_id UUID;
  v_matriz_id  UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_id
    FROM public.perfiles WHERE id = auth.uid();

  SELECT id INTO v_matriz_id
    FROM public.sucursales
    WHERE empresa_id = v_empresa_id AND tipo = 'matriz'
    LIMIT 1;

  IF v_matriz_id IS NULL THEN
    INSERT INTO public.sucursales (empresa_id, nombre, tipo)
    SELECT v_empresa_id, e.nombre, 'matriz'
      FROM public.empresas e WHERE e.id = v_empresa_id
    RETURNING id INTO v_matriz_id;
  END IF;

  RETURN v_matriz_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── TRIGGER: crear perfil al registrar usuario ────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.perfiles (id, nombre)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'full_name', ''));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
