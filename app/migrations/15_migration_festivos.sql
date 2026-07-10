-- ============================================================
--  Capital Humano MX — Migración 15: Días festivos oficiales
--  (Art. 74 LFT) + tabla de configuración editable (UMA / SMG)
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--
--  Idempotente: puede ejecutarse múltiples veces sin error.
--
--  NOTA DE DISEÑO: la empresa YA tenía un mecanismo de "festivos
--  adicionales" como JSONB en empresas.festivos_adicionales
--  (migración 14). Esa columna NO se elimina (nada destructivo),
--  pero a partir de esta migración el calendario completo
--  (oficiales + propios de cada empresa) vive de forma relacional
--  en `dias_festivos`, que es lo que consultan festivos.js,
--  el checador y la nómina. Los registros que ya existieran en
--  festivos_adicionales se copian una sola vez a `dias_festivos`
--  para no perder configuración previa.
-- ============================================================

-- 1. Tabla config_valores ────────────────────────────────────────
--    Fuente única de UMA / salarios mínimos. NO hardcodear estos
--    valores en JavaScript: config.js/calculo.js los usan solo
--    como fallback si esta tabla no está disponible.
CREATE TABLE IF NOT EXISTS public.config_valores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clave          TEXT NOT NULL,
  valor          NUMERIC NOT NULL,
  vigencia_desde DATE NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (clave, vigencia_desde)
);

ALTER TABLE public.config_valores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "config_valores_select" ON public.config_valores;
CREATE POLICY "config_valores_select" ON public.config_valores FOR SELECT
  TO authenticated USING (true);
-- Sin política de INSERT/UPDATE/DELETE para "authenticated": solo
-- service_role puede escribir (service_role bypassa RLS por diseño
-- de Supabase). El admin del despacho actualiza estos valores desde
-- el SQL Editor cuando cambie la UMA (cada febrero) o el salario
-- mínimo (cada enero).

-- Seed — valores vigentes verificados a julio 2026 (INEGI / CONASAMI).
-- ⚠️ ACCIÓN REQUERIDA DEL ADMINISTRADOR: revisar y actualizar estos
-- valores cada vez que INEGI publique la nueva UMA (~10 de enero,
-- vigente 1 de febrero) o CONASAMI el nuevo salario mínimo (vigente
-- 1 de enero). Insertar una fila NUEVA con la vigencia_desde correcta
-- en vez de sobreescribir la anterior conserva el historial.
INSERT INTO public.config_valores (clave, valor, vigencia_desde) VALUES
  ('uma_diaria',             117.31, '2026-02-01'),  -- INEGI, vigente feb-2026 a ene-2027
  ('salario_minimo_general', 315.04, '2026-01-01'),  -- CONASAMI, Zona General
  ('salario_minimo_frontera',440.87, '2026-01-01')   -- CONASAMI, Zona Libre Frontera Norte
ON CONFLICT (clave, vigencia_desde) DO NOTHING;

-- 2. Tabla dias_festivos ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dias_festivos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID REFERENCES public.empresas(id),  -- NULL = oficial (Art. 74 LFT)
  fecha        DATE NOT NULL,
  descripcion  TEXT NOT NULL,
  oficial      BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (empresa_id, fecha)
);

CREATE INDEX IF NOT EXISTS dias_festivos_fecha_idx ON public.dias_festivos (fecha);

ALTER TABLE public.dias_festivos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dias_festivos_oficiales_select" ON public.dias_festivos;
CREATE POLICY "dias_festivos_oficiales_select" ON public.dias_festivos FOR SELECT
  TO authenticated USING (
    empresa_id IS NULL
    OR empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "dias_festivos_propios_insert" ON public.dias_festivos;
CREATE POLICY "dias_festivos_propios_insert" ON public.dias_festivos FOR INSERT
  TO authenticated WITH CHECK (
    empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "dias_festivos_propios_delete" ON public.dias_festivos;
CREATE POLICY "dias_festivos_propios_delete" ON public.dias_festivos FOR DELETE
  TO authenticated USING (
    empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid())
  );
-- Nota: no hay política de UPDATE/DELETE para empresa_id IS NULL
-- (oficiales) — ningún usuario "authenticated" puede editarlos ni
-- borrarlos, solo service_role.

-- Seed de festivos oficiales Art. 74 LFT — 2026 y 2027.
-- Fechas de "lunes correspondiente" calculadas para cada año
-- (no se incluye el 1° de octubre por transmisión del Poder
-- Ejecutivo Federal: ese descanso solo aplica cada 6 años y el
-- próximo es en 2030, fuera del rango de este seed).
INSERT INTO public.dias_festivos (empresa_id, fecha, descripcion, oficial) VALUES
  (NULL, '2026-01-01', '1° de enero (Art. 74 fr. I LFT)',                                  true),
  (NULL, '2026-02-02', 'Primer lunes de febrero, en conmemoración del 5 de febrero (Art. 74 fr. II LFT)', true),
  (NULL, '2026-03-16', 'Tercer lunes de marzo, en conmemoración del 21 de marzo (Art. 74 fr. III LFT)',   true),
  (NULL, '2026-05-01', '1° de mayo, Día del Trabajo (Art. 74 fr. IV LFT)',                  true),
  (NULL, '2026-09-16', '16 de septiembre (Art. 74 fr. V LFT)',                              true),
  (NULL, '2026-11-16', 'Tercer lunes de noviembre, en conmemoración del 20 de noviembre (Art. 74 fr. VI LFT)', true),
  (NULL, '2026-12-25', '25 de diciembre (Art. 74 fr. VIII LFT)',                            true),

  (NULL, '2027-01-01', '1° de enero (Art. 74 fr. I LFT)',                                  true),
  (NULL, '2027-02-01', 'Primer lunes de febrero, en conmemoración del 5 de febrero (Art. 74 fr. II LFT)', true),
  (NULL, '2027-03-15', 'Tercer lunes de marzo, en conmemoración del 21 de marzo (Art. 74 fr. III LFT)',   true),
  (NULL, '2027-05-01', '1° de mayo, Día del Trabajo (Art. 74 fr. IV LFT)',                  true),
  (NULL, '2027-09-16', '16 de septiembre (Art. 74 fr. V LFT)',                              true),
  (NULL, '2027-11-15', 'Tercer lunes de noviembre, en conmemoración del 20 de noviembre (Art. 74 fr. VI LFT)', true),
  (NULL, '2027-12-25', '25 de diciembre (Art. 74 fr. VIII LFT)',                            true)
ON CONFLICT (empresa_id, fecha) DO NOTHING;

-- Migración de datos: llevar los festivos propios ya configurados en
-- empresas.festivos_adicionales (JSONB) a filas de dias_festivos.
-- Solo migra entradas tipo 'fecha' (fecha exacta); las 'recurrente'
-- (MM-DD, se repiten cada año) se dejan para que el admin las capture
-- manualmente en la nueva UI para el año que corresponda, ya que
-- dias_festivos usa fecha absoluta, no patrón recurrente.
INSERT INTO public.dias_festivos (empresa_id, fecha, descripcion, oficial)
SELECT
  e.id,
  (f->>'valor')::date,
  COALESCE(f->>'descripcion', 'Festivo adicional de la empresa'),
  false
FROM public.empresas e,
     jsonb_array_elements(COALESCE(e.festivos_adicionales, '[]'::jsonb)) AS f
WHERE f->>'tipo' = 'fecha'
  AND (f->>'valor') ~ '^\d{4}-\d{2}-\d{2}$'
ON CONFLICT (empresa_id, fecha) DO NOTHING;

-- 3. Flags de "día festivo/domingo trabajado" en asistencia ───────
ALTER TABLE public.asistencia
  ADD COLUMN IF NOT EXISTS trabajo_festivo BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS trabajo_domingo BOOLEAN DEFAULT false;

-- 4. Nueva columna en recibos_nomina para la prima festiva (Art. 75)
ALTER TABLE public.recibos_nomina
  ADD COLUMN IF NOT EXISTS prima_festivo NUMERIC(12,2) DEFAULT 0;

-- 5. registrar_checada(): además de registrar la checada, marca
--    trabajo_festivo/trabajo_domingo consultando dias_festivos y el
--    día de la semana. Sustituye la función creada en la migración 13.
--    Cambia el tipo de retorno (agrega festivo_desc), así que Postgres
--    exige DROP explícito antes del CREATE (no basta CREATE OR REPLACE
--    cuando cambian los OUT params / la tabla de retorno).
DROP FUNCTION IF EXISTS public.registrar_checada(uuid, uuid, uuid, timestamptz, text, text);

CREATE OR REPLACE FUNCTION public.registrar_checada(
  p_empresa_id    UUID,
  p_trabajador_id UUID,
  p_sucursal_id   UUID,
  p_ts            TIMESTAMPTZ,
  p_origen        TEXT,
  p_dispositivo   TEXT DEFAULT NULL
) RETURNS TABLE (tipo TEXT, hora TIME, festivo_desc TEXT) AS $$
DECLARE
  v_fecha           DATE;
  v_hora_local      TIME;
  v_tipo            TEXT;
  v_hora_inicio     TIME;
  v_tolerancia      INTEGER;
  v_minutos_retardo INTEGER;
  v_asist_tipo      TEXT;
  v_es_domingo      BOOLEAN;
  v_festivo_desc    TEXT;
BEGIN
  v_fecha      := (p_ts AT TIME ZONE 'America/Mexico_City')::date;
  v_hora_local := (p_ts AT TIME ZONE 'America/Mexico_City')::time;
  v_es_domingo := EXTRACT(DOW FROM v_fecha) = 0;

  SELECT descripcion INTO v_festivo_desc
    FROM public.dias_festivos
    WHERE fecha = v_fecha
      AND (empresa_id IS NULL OR empresa_id = p_empresa_id)
    ORDER BY empresa_id NULLS FIRST
    LIMIT 1;

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

    INSERT INTO public.asistencia
      (empresa_id, trabajador_id, fecha, tipo, hora_entrada, minutos_retardo, origen, trabajo_festivo, trabajo_domingo)
    VALUES
      (p_empresa_id, p_trabajador_id, v_fecha, v_asist_tipo, v_hora_local, v_minutos_retardo, p_origen,
       v_festivo_desc IS NOT NULL, v_es_domingo)
    ON CONFLICT (trabajador_id, fecha) DO UPDATE
      SET hora_entrada    = EXCLUDED.hora_entrada,
          tipo             = EXCLUDED.tipo,
          minutos_retardo  = EXCLUDED.minutos_retardo,
          origen           = EXCLUDED.origen,
          trabajo_festivo  = EXCLUDED.trabajo_festivo,
          trabajo_domingo  = EXCLUDED.trabajo_domingo;
  ELSE
    UPDATE public.asistencia
      SET hora_salida = v_hora_local,
          origen      = p_origen
      WHERE trabajador_id = p_trabajador_id AND fecha = v_fecha;
  END IF;

  RETURN QUERY SELECT v_tipo, v_hora_local, v_festivo_desc;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
