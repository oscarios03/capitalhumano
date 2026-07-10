-- ============================================================
--  Capital Humano MX — Migración 24: reparar la migración 15 incompleta
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--
--  Idempotente: puede ejecutarse múltiples veces sin error.
--
--  DIAGNÓSTICO (jul 2026). La migración 15 se aplicó SOLO PARCIALMENTE en
--  producción: quedó creada su parte 5 (la función registrar_checada() con
--  festivo_desc) pero NO sus partes 1-4. Estado encontrado en la BD:
--
--      config_valores            → NO existe
--      dias_festivos             → NO existe
--      asistencia.trabajo_festivo→ NO existe
--      asistencia.trabajo_domingo→ NO existe
--      recibos_nomina.prima_festivo → NO existe
--      registrar_checada(...)    → SÍ existe (versión de la migración 15)
--
--  CONSECUENCIA — BUG EN PRODUCCIÓN: registrar_checada() consulta
--  public.dias_festivos y escribe en asistencia.trabajo_festivo/
--  trabajo_domingo. Como esos objetos no existen, la función FALLA en
--  tiempo de ejecución (los cuerpos plpgsql no se validan al crearse, solo
--  al ejecutarse). El checador/kiosco no puede registrar ninguna checada:
--  la tabla `checadas` tiene 0 filas.
--
--  Esta migración crea únicamente las partes 1-4 que faltan. NO recrea
--  registrar_checada(), que ya está en su versión correcta; en cuanto
--  existan sus dependencias, empezará a funcionar.
--
--  EFECTO SECUNDARIO ESPERADO: al crear config_valores con la UMA real
--  (117.31, vigente feb-2026), _umaVigente() dejará de usar el respaldo
--  hardcodeado de 113.14. Eso cambia (para bien) el umbral de exención de
--  3 UMA y el tope de 25 UMA del IMSS, y las exenciones de previsión social.
-- ============================================================

-- ── 1. Tabla config_valores ─────────────────────────────────────────
--    Fuente única de UMA / salarios mínimos. config.js y calculo.js solo
--    los usan como fallback si esta tabla no está disponible.
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
-- Sin política de INSERT/UPDATE/DELETE para "authenticated": solo el
-- service_role escribe (bypassa RLS por diseño de Supabase). El admin
-- actualiza estos valores desde el SQL Editor cuando cambie la UMA
-- (cada febrero) o el salario mínimo (cada enero).

-- Seed — valores vigentes verificados a julio 2026 (INEGI / CONASAMI).
-- Insertar una fila NUEVA con la vigencia_desde correcta (no sobreescribir)
-- conserva el historial.
INSERT INTO public.config_valores (clave, valor, vigencia_desde) VALUES
  ('uma_diaria',             117.31, '2026-02-01'),  -- INEGI, vigente feb-2026 a ene-2027
  ('salario_minimo_general', 315.04, '2026-01-01'),  -- CONASAMI, Zona General
  ('salario_minimo_frontera',440.87, '2026-01-01')   -- CONASAMI, Zona Libre Frontera Norte
ON CONFLICT (clave, vigencia_desde) DO NOTHING;

-- ── 2. Tabla dias_festivos ──────────────────────────────────────────
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
-- No hay política de UPDATE/DELETE para empresa_id IS NULL (oficiales):
-- ningún usuario "authenticated" puede editarlos ni borrarlos, solo service_role.

-- Seed de festivos oficiales Art. 74 LFT — 2026 y 2027.
-- (No se incluye el 1° de octubre por transmisión del Poder Ejecutivo
-- Federal: ese descanso aplica cada 6 años y el próximo es en 2030.)
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
-- Solo migra entradas tipo 'fecha' (fecha exacta); las 'recurrente' (MM-DD)
-- se dejan para captura manual, ya que dias_festivos usa fecha absoluta.
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

-- ── 3. Flags de "día festivo/domingo trabajado" en asistencia ───────
--    Los escribe registrar_checada(); sin ellos la función falla.
ALTER TABLE public.asistencia
  ADD COLUMN IF NOT EXISTS trabajo_festivo BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS trabajo_domingo BOOLEAN DEFAULT false;

-- ── 4. Prima por día festivo trabajado (Art. 75 LFT) en el recibo ───
--    nomina.js ya la calcula (calcularPagoFestivo) pero no podía
--    persistirla: el upsert reintentaba sin esta columna.
ALTER TABLE public.recibos_nomina
  ADD COLUMN IF NOT EXISTS prima_festivo NUMERIC(12,2) DEFAULT 0;

-- ── 5. registrar_checada(): NO se toca. ─────────────────────────────
--    Ya está en su versión correcta (migración 15). En cuanto existan
--    dias_festivos y las columnas de asistencia, dejará de fallar.
