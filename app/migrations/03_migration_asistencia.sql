-- ============================================================
--  Capital Humano MX — Módulo de Asistencia v2
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Expandir el CHECK de tipo en la tabla asistencia existente
ALTER TABLE public.asistencia
  DROP CONSTRAINT IF EXISTS asistencia_tipo_check;

ALTER TABLE public.asistencia
  ADD CONSTRAINT asistencia_tipo_check CHECK (tipo IN (
    'asistencia','falta','falta_justif','retardo','retardo_grave',
    'incapacidad','vacaciones','permiso_goce','permiso_sin','descanso','festivo'
  ));

-- 2. Agregar columnas nuevas a asistencia
ALTER TABLE public.asistencia
  ADD COLUMN IF NOT EXISTS hora_entrada      TIME,
  ADD COLUMN IF NOT EXISTS hora_salida       TIME,
  ADD COLUMN IF NOT EXISTS justificante_url  TEXT,
  ADD COLUMN IF NOT EXISTS registrado_por    UUID;

-- 3. UNIQUE constraint (trabajador+fecha) — requerido para upsert
--    Si falla por duplicados, ejecutar primero:
--    DELETE FROM asistencia a USING asistencia b
--    WHERE a.id > b.id AND a.trabajador_id = b.trabajador_id AND a.fecha = b.fecha;
ALTER TABLE public.asistencia
  DROP CONSTRAINT IF EXISTS asistencia_trab_fecha_unique;
ALTER TABLE public.asistencia
  ADD CONSTRAINT asistencia_trab_fecha_unique
  UNIQUE (trabajador_id, fecha);

-- 4. Tabla de períodos de nómina
CREATE TABLE IF NOT EXISTS public.periodos_nomina (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID REFERENCES public.empresas(id) NOT NULL,
  nombre       TEXT,
  fecha_inicio DATE NOT NULL,
  fecha_fin    DATE NOT NULL,
  tipo         TEXT CHECK (tipo IN ('semanal','quincenal','mensual')),
  cerrado      BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.periodos_nomina ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nomina_own" ON public.periodos_nomina;
CREATE POLICY "nomina_own" ON public.periodos_nomina FOR ALL
  USING  (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()));

-- 5. Configuración de tolerancia en empresa
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS tolerancia_retardo_min INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS dias_laborales TEXT[]
    DEFAULT ARRAY['Lunes','Martes','Miércoles','Jueves','Viernes'];

-- 6. ultima_fecha_vacaciones en trabajadores (si no existe ya)
ALTER TABLE public.trabajadores
  ADD COLUMN IF NOT EXISTS ultima_fecha_vacaciones DATE;
