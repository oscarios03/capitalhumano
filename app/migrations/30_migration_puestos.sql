-- ============================================================
--  Capital Humano MX — Migración: Catálogo de Puestos (plantillas)
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--  Requiere: 00_setup.sql. La 21_migration_planes.sql es OPCIONAL: el trigger
--  de solo-lectura se adjunta solo si su función ya existe (ver paso 4).
--  APLICADA en KAPITAL HUMANO el 2026-07-15 vía MCP (name: puestos_catalogo).
--
--  Un "puesto" es una PLANTILLA reutilizable (funciones, salario
--  sugerido, nivel, etc.), independiente de la persona. Al dar de
--  alta un trabajador se elige un puesto y sus datos se COPIAN al
--  trabajador (copiar-no-vincular): editar la plantilla después NO
--  altera contratos ya generados. puesto_id queda solo como
--  referencia para reportes/organigrama.
-- ============================================================

-- 1. Tabla puestos (catálogo por empresa)
CREATE TABLE IF NOT EXISTS public.puestos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID REFERENCES public.empresas(id) NOT NULL,
  nombre              TEXT NOT NULL,
  departamento        TEXT,
  funciones           TEXT,
  salario_sugerido    NUMERIC,
  periodo_salario     TEXT DEFAULT 'mensual',
  salario_min         NUMERIC,
  salario_max         NUMERIC,
  nivel               TEXT,             -- nivel jerárquico (ej. Operativo, Mando medio)
  reporta_a           TEXT,
  tipo_contrato       TEXT,             -- para autollenar el alta
  es_puesto_direccion BOOLEAN DEFAULT false,
  tipo_salario        TEXT,             -- fijo / comision / mixto
  pct_comision        NUMERIC,
  smg_zone            TEXT,
  activo              BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- 2. Referencia opcional desde el trabajador (el texto sigue en trabajadores.puesto)
ALTER TABLE public.trabajadores
  ADD COLUMN IF NOT EXISTS puesto_id UUID REFERENCES public.puestos(id);

-- 3. RLS: aislamiento por empresa (mismo patrón que sucursales_own)
ALTER TABLE public.puestos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "puestos_own" ON public.puestos;
CREATE POLICY "puestos_own" ON public.puestos FOR ALL
  USING (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()));

-- 4. Enforcement de solo-lectura por plan: reutiliza la función existente
--    public.trg_bloquear_solo_lectura() (definida en 21_migration_planes.sql).
--    Se adjunta SOLO si la función ya existe (la migración 21 puede no estar
--    aplicada aún). Si se aplica 21 después, su propio bucle FOREACH ya incluye
--    'puestos' y adjuntará el trigger en ese momento.
DO $$
BEGIN
  IF to_regprocedure('public.trg_bloquear_solo_lectura()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS zz_solo_lectura ON public.puestos;
    CREATE TRIGGER zz_solo_lectura BEFORE INSERT OR UPDATE OR DELETE
      ON public.puestos FOR EACH ROW EXECUTE FUNCTION public.trg_bloquear_solo_lectura();
  END IF;
END $$;
