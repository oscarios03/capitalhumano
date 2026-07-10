-- ============================================================
--  Capital Humano MX — Módulo de Nómina
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Columnas adicionales en trabajadores
ALTER TABLE public.trabajadores
  ADD COLUMN IF NOT EXISTS vales_despensa      NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bono_fijo           NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cuenta_bancaria     TEXT,
  ADD COLUMN IF NOT EXISTS clabe_interbancaria TEXT;

-- 2. Asegurar columna sucursal_id en periodos_nomina (por si existe de antes)
ALTER TABLE public.periodos_nomina
  ADD COLUMN IF NOT EXISTS sucursal_id UUID REFERENCES public.sucursales(id),
  ADD COLUMN IF NOT EXISTS total_percepciones NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_neto         NUMERIC(12,2) DEFAULT 0;

-- 3. Crear periodos_nomina si no existe (por si no se ejecutó migration_asistencia)
CREATE TABLE IF NOT EXISTS public.periodos_nomina (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID REFERENCES public.empresas(id) NOT NULL,
  sucursal_id  UUID REFERENCES public.sucursales(id),
  nombre       TEXT,
  fecha_inicio DATE NOT NULL,
  fecha_fin    DATE NOT NULL,
  tipo         TEXT CHECK (tipo IN ('semanal','quincenal','mensual')),
  cerrado      BOOLEAN DEFAULT false,
  total_percepciones NUMERIC(12,2) DEFAULT 0,
  total_neto         NUMERIC(12,2) DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Red de seguridad: la migración 03 (asistencia) ya crea una versión mínima de
-- periodos_nomina, por lo que el CREATE TABLE IF NOT EXISTS de arriba puede
-- quedar como no-op en una instalación limpia y dejar fuera estas columnas.
-- Este ALTER idempotente garantiza que existan sin importar el orden.
ALTER TABLE public.periodos_nomina
  ADD COLUMN IF NOT EXISTS sucursal_id        UUID REFERENCES public.sucursales(id),
  ADD COLUMN IF NOT EXISTS total_percepciones NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_neto         NUMERIC(12,2) DEFAULT 0;

-- RLS periodos_nomina
ALTER TABLE public.periodos_nomina ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nomina_own" ON public.periodos_nomina;
CREATE POLICY "nomina_own" ON public.periodos_nomina FOR ALL
  USING  (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()));

-- 4. Tabla recibos_nomina
CREATE TABLE IF NOT EXISTS public.recibos_nomina (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID REFERENCES public.empresas(id) NOT NULL,
  trabajador_id       UUID REFERENCES public.trabajadores(id) NOT NULL,
  periodo_id          UUID REFERENCES public.periodos_nomina(id) NOT NULL,
  -- PERCEPCIONES
  salario_base        NUMERIC(12,2) DEFAULT 0,
  dias_laborados      INTEGER DEFAULT 0,
  horas_extra         NUMERIC(6,2)  DEFAULT 0,
  monto_horas_extra   NUMERIC(12,2) DEFAULT 0,
  vales_despensa      NUMERIC(12,2) DEFAULT 0,
  bonos               NUMERIC(12,2) DEFAULT 0,
  otros_ingresos      NUMERIC(12,2) DEFAULT 0,
  total_percepciones  NUMERIC(12,2) DEFAULT 0,
  -- DEDUCCIONES
  dias_falta          INTEGER DEFAULT 0,
  monto_faltas        NUMERIC(12,2) DEFAULT 0,
  dias_permiso_sin    INTEGER DEFAULT 0,
  monto_permiso_sin   NUMERIC(12,2) DEFAULT 0,
  cuota_imss          NUMERIC(12,2) DEFAULT 0,
  isr_retenido        NUMERIC(12,2) DEFAULT 0,
  infonavit           NUMERIC(12,2) DEFAULT 0,
  otras_deducciones   NUMERIC(12,2) DEFAULT 0,
  total_deducciones   NUMERIC(12,2) DEFAULT 0,
  -- NETO
  neto_pagar          NUMERIC(12,2) DEFAULT 0,
  -- ACUMULADOS AÑO
  acum_percepciones   NUMERIC(12,2) DEFAULT 0,
  acum_isr            NUMERIC(12,2) DEFAULT 0,
  -- CONTROL
  folio               TEXT UNIQUE,
  estado              TEXT DEFAULT 'borrador'
    CHECK (estado IN ('borrador','aprobado','pagado')),
  fecha_pago          DATE,
  forma_pago          TEXT,
  cuenta_bancaria     TEXT,
  notas               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (trabajador_id, periodo_id)
);

-- RLS recibos_nomina
ALTER TABLE public.recibos_nomina ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recibos_nomina_own" ON public.recibos_nomina;
CREATE POLICY "recibos_nomina_own" ON public.recibos_nomina FOR ALL
  USING  (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()));
