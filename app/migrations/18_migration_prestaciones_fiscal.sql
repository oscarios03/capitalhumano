-- ============================================================
--  Capital Humano MX — Migración 18: Prestaciones de previsión
--  social adicionales (premios de puntualidad/asistencia, ayuda de
--  transporte, otras) con desglose fiscal SBC/ISR.
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--
--  Idempotente: puede ejecutarse múltiples veces sin error.
--
--  NOTA DE DISEÑO: vales de despensa (trabajadores.vales_despensa) y
--  fondo de ahorro (trabajadores.fondo_ahorro_*, empresas.fondo_ahorro_*)
--  YA existen y se pagan (migraciones 02/14). Esta migración NO los
--  duplica en una tabla nueva — solo agrega los tipos de prestación
--  que hoy no existen (premios, ayuda de transporte, otras). El
--  desglose fiscal (desglosarPrestacion() en calculo.js) se aplica a
--  TODAS las prestaciones, incluidas vales/fondo de ahorro, leyendo
--  su almacenamiento actual.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.prestaciones_trabajador (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           UUID REFERENCES public.empresas(id) NOT NULL,
  trabajador_id        UUID REFERENCES public.trabajadores(id) ON DELETE CASCADE NOT NULL,
  tipo                 TEXT NOT NULL CHECK (tipo IN ('premio_puntualidad','premio_asistencia','ayuda_transporte','otro')),
  modalidad            TEXT NOT NULL CHECK (modalidad IN ('monto_fijo_periodo','porcentaje_salario')),
  valor                NUMERIC NOT NULL,
  aportacion_trabajador NUMERIC DEFAULT 0,   -- no aplica a estos tipos; se conserva por consistencia con el prompt
  activo               BOOLEAN DEFAULT true,
  fecha_inicio         DATE DEFAULT CURRENT_DATE,
  created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prestaciones_trabajador_trab_idx ON public.prestaciones_trabajador (trabajador_id, activo);

ALTER TABLE public.prestaciones_trabajador ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prestaciones_trabajador_own" ON public.prestaciones_trabajador;
CREATE POLICY "prestaciones_trabajador_own" ON public.prestaciones_trabajador FOR ALL
  USING  (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()));

-- Columnas de desglose fiscal en el recibo (exento/gravado por prestaciones)
ALTER TABLE public.recibos_nomina
  ADD COLUMN IF NOT EXISTS prestaciones_exento  NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prestaciones_gravado  NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prestaciones_detalle  JSONB DEFAULT '[]';
