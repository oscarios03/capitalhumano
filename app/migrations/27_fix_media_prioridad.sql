-- ═══════════════════════════════════════════════════════════════════════════
--  Migración 27 — Auditoría de seguridad, severidad Media (Fase 1)
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════════════
--  M-5: agrega columna `updated_at` + trigger de mantenimiento a las tablas
--  donde el frontend implementa optimistic locking para evitar "lost updates"
--  en datos que mueven dinero o estado legal: trabajadores (estado activo/
--  baja, salario), recibos_nomina (edición manual de recibo), asistencia
--  (registro de incidencias que alimenta nómina y alertas Art. 47).
--
--  NOTA DE DISEÑO: no se agrega optimistic locking al UPSERT de asistencia
--  (`_upsertAsistencia` en asistencia.js, onConflict trabajador_id+fecha)
--  porque un UPSERT no admite una cláusula WHERE adicional para comparar
--  updated_at — el propio onConflict ya acota el blast radius a una sola
--  fila (trabajador+fecha). La columna/trigger igual se agrega aquí para
--  trazabilidad futura (auditoría, "última edición").
--
--  Idempotente: seguro de ejecutar más de una vez.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.trabajadores   ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.recibos_nomina ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.asistencia     ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.zz_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS zz_trabajadores_updated_at ON public.trabajadores;
CREATE TRIGGER zz_trabajadores_updated_at
  BEFORE UPDATE ON public.trabajadores
  FOR EACH ROW EXECUTE FUNCTION public.zz_set_updated_at();

DROP TRIGGER IF EXISTS zz_recibos_nomina_updated_at ON public.recibos_nomina;
CREATE TRIGGER zz_recibos_nomina_updated_at
  BEFORE UPDATE ON public.recibos_nomina
  FOR EACH ROW EXECUTE FUNCTION public.zz_set_updated_at();

DROP TRIGGER IF EXISTS zz_asistencia_updated_at ON public.asistencia;
CREATE TRIGGER zz_asistencia_updated_at
  BEFORE UPDATE ON public.asistencia
  FOR EACH ROW EXECUTE FUNCTION public.zz_set_updated_at();
