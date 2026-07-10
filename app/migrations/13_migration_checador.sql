-- ============================================================
--  Capital Humano MX — Reloj Checador (Kiosco + Checadores Físicos)
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--
--  Agrega:
--   - Credenciales de checado en trabajadores (PIN / código QR)
--   - Token de kiosco por sucursal
--   - Log crudo de pulsos (checadas)
--   - Registro de integraciones con checadores físicos (API keys)
--   - Columna asistencia.origen
--   - Función registrar_checada() que alimenta `asistencia`
--    automáticamente desde el kiosco o un checador físico
--
--  Idempotente: puede ejecutarse múltiples veces sin error.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Credenciales de checado en trabajadores ────────────────────
ALTER TABLE public.trabajadores
  ADD COLUMN IF NOT EXISTS pin_checador    CHAR(4),
  ADD COLUMN IF NOT EXISTS codigo_checador TEXT;

DROP INDEX IF EXISTS trabajadores_pin_checador_empresa_uq;
CREATE UNIQUE INDEX trabajadores_pin_checador_empresa_uq
  ON public.trabajadores (empresa_id, pin_checador)
  WHERE pin_checador IS NOT NULL;

DROP INDEX IF EXISTS trabajadores_codigo_checador_empresa_uq;
CREATE UNIQUE INDEX trabajadores_codigo_checador_empresa_uq
  ON public.trabajadores (empresa_id, codigo_checador)
  WHERE codigo_checador IS NOT NULL;

-- 2. Token de kiosco por sucursal ────────────────────────────────
ALTER TABLE public.sucursales
  ADD COLUMN IF NOT EXISTS kiosco_token TEXT UNIQUE;

-- 3. Log crudo de pulsos ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.checadas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID REFERENCES public.empresas(id) NOT NULL,
  sucursal_id   UUID REFERENCES public.sucursales(id),
  trabajador_id UUID REFERENCES public.trabajadores(id) ON DELETE CASCADE NOT NULL,
  tipo          TEXT NOT NULL CHECK (tipo IN ('entrada','salida')),
  ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
  origen        TEXT NOT NULL CHECK (origen IN ('kiosco','checador_fisico')),
  dispositivo   TEXT,
  creado_en     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checadas_trab_fecha_idx
  ON public.checadas (trabajador_id, ts);

ALTER TABLE public.checadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "checadas_own" ON public.checadas;
CREATE POLICY "checadas_own" ON public.checadas FOR ALL
  USING  (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()));

-- 4. Integraciones con checadores físicos (API keys por empresa) ─
CREATE TABLE IF NOT EXISTS public.integraciones_checador (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID REFERENCES public.empresas(id) NOT NULL,
  nombre          TEXT NOT NULL,
  api_key_hash    TEXT NOT NULL,
  api_key_prefix  TEXT NOT NULL,
  activo          BOOLEAN DEFAULT true,
  ultima_conexion TIMESTAMPTZ,
  creado_en       TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS integraciones_checador_hash_uq
  ON public.integraciones_checador (api_key_hash);

ALTER TABLE public.integraciones_checador ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "integraciones_checador_own" ON public.integraciones_checador;
CREATE POLICY "integraciones_checador_own" ON public.integraciones_checador FOR ALL
  USING  (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()));

-- 5. Origen del registro de asistencia ────────────────────────────
ALTER TABLE public.asistencia
  ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE public.asistencia
  DROP CONSTRAINT IF EXISTS asistencia_origen_check;
ALTER TABLE public.asistencia
  ADD CONSTRAINT asistencia_origen_check CHECK (origen IN ('manual','kiosco','checador_fisico'));

-- 6. Función registrar_checada() ──────────────────────────────────
--    Llamada por las Edge Functions checador-kiosco / checador-webhook
--    usando el service role (bypassa RLS por SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.registrar_checada(
  p_empresa_id    UUID,
  p_trabajador_id UUID,
  p_sucursal_id   UUID,
  p_ts            TIMESTAMPTZ,
  p_origen        TEXT,
  p_dispositivo   TEXT DEFAULT NULL
) RETURNS TABLE (tipo TEXT, hora TIME) AS $$
DECLARE
  v_fecha           DATE;
  v_hora_local      TIME;
  v_tipo            TEXT;
  v_hora_inicio     TIME;
  v_tolerancia      INTEGER;
  v_minutos_retardo INTEGER;
  v_asist_tipo      TEXT;
BEGIN
  v_fecha      := (p_ts AT TIME ZONE 'America/Mexico_City')::date;
  v_hora_local := (p_ts AT TIME ZONE 'America/Mexico_City')::time;

  -- ¿Ya hay un pulso de entrada hoy para este trabajador?
  IF EXISTS (
    SELECT 1 FROM public.checadas
    WHERE trabajador_id = p_trabajador_id
      AND (ts AT TIME ZONE 'America/Mexico_City')::date = v_fecha
  ) THEN
    v_tipo := 'salida';
  ELSE
    v_tipo := 'entrada';
  END IF;

  INSERT INTO public.checadas (empresa_id, sucursal_id, trabajador_id, tipo, ts, origen, dispositivo)
  VALUES (p_empresa_id, p_sucursal_id, p_trabajador_id, v_tipo, p_ts, p_origen, p_dispositivo);

  SELECT hora_inicio INTO v_hora_inicio FROM public.trabajadores WHERE id = p_trabajador_id;
  SELECT tolerancia_retardo_min INTO v_tolerancia FROM public.empresas WHERE id = p_empresa_id;
  v_tolerancia := COALESCE(v_tolerancia, 10);

  IF v_tipo = 'entrada' THEN
    v_asist_tipo := 'asistencia';
    v_minutos_retardo := 0;
    IF v_hora_inicio IS NOT NULL AND v_hora_local > (v_hora_inicio + (v_tolerancia || ' minutes')::interval) THEN
      v_asist_tipo := 'retardo';
      v_minutos_retardo := GREATEST(0, EXTRACT(EPOCH FROM (v_hora_local - v_hora_inicio))::integer / 60);
    END IF;

    INSERT INTO public.asistencia (empresa_id, trabajador_id, fecha, tipo, hora_entrada, minutos_retardo, origen)
    VALUES (p_empresa_id, p_trabajador_id, v_fecha, v_asist_tipo, v_hora_local, v_minutos_retardo, p_origen)
    ON CONFLICT (trabajador_id, fecha) DO UPDATE
      SET hora_entrada    = EXCLUDED.hora_entrada,
          tipo             = EXCLUDED.tipo,
          minutos_retardo  = EXCLUDED.minutos_retardo,
          origen           = EXCLUDED.origen;
  ELSE
    UPDATE public.asistencia
      SET hora_salida = v_hora_local,
          origen      = p_origen
      WHERE trabajador_id = p_trabajador_id AND fecha = v_fecha;
  END IF;

  RETURN QUERY SELECT v_tipo, v_hora_local;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
