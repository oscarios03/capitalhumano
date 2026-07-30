-- ============================================================================
-- Migración 38 — Baja documentada como renuncia + propuesta de finiquito
-- ============================================================================
-- Hasta ahora `bajas.tipo_baja` hacía tres trabajos a la vez: era la causa
-- real, decidía el cálculo (liquidación vs finiquito) y decidía qué documentos
-- se imprimían. Esta migración separa los tres ejes:
--
--   · `tipo_baja`        → SIGUE SIENDO LA CAUSA REAL. No se toca su CHECK.
--                          La leen `_causaBajaDesdeTipo()` (imss.js), la copia
--                          en `trabajadores.tipo_baja` (db.darDeBaja) y el
--                          reporte de rotación (reportes.js). Cambiar su
--                          semántica rompería los tres.
--   · `documentado_como` → qué se imprime. 'renuncia' permite emitir carta de
--                          renuncia aunque la causa real sea un despido.
--   · `gratificacion_*`  → lo que se pactó por encima del mínimo de ley.
--
-- Además se agrega `propuestas_baja`: el borrador de negociación de un
-- trabajador TODAVÍA ACTIVO (escenarios de 15/30/45/60/75/90 días o monto
-- manual), para poder negociar hoy y cerrar la baja días después sin
-- recapturar nada.
--
-- Idempotente: puede correrse múltiples veces.
-- ============================================================================


-- ── 1. Columnas nuevas en `bajas` ────────────────────────────────────────────

ALTER TABLE public.bajas
  ADD COLUMN IF NOT EXISTS documentado_como         TEXT    NOT NULL DEFAULT 'causa_real',
  ADD COLUMN IF NOT EXISTS incluye_prima_antiguedad BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gratificacion_dias       NUMERIC,
  ADD COLUMN IF NOT EXISTS gratificacion_base       TEXT,
  ADD COLUMN IF NOT EXISTS gratificacion_modo       TEXT,
  ADD COLUMN IF NOT EXISTS gratificacion_monto      NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS propuesta_json           JSONB;

COMMENT ON COLUMN public.bajas.tipo_baja IS
  'CAUSA REAL de la baja (registro interno). Lo que se imprime lo decide documentado_como.';
COMMENT ON COLUMN public.bajas.documentado_como IS
  'causa_real = el documento coincide con la causa; renuncia = se emitió carta de renuncia.';
COMMENT ON COLUMN public.bajas.gratificacion_base IS
  'sdi = días × salario diario integrado; diario = días × salario diario (Art. 89 LFT).';
COMMENT ON COLUMN public.bajas.gratificacion_modo IS
  'suma = la gratificación se agrega al finiquito; incluye = los días son el paquete total.';

-- Los CHECK se agregan aparte (ADD COLUMN IF NOT EXISTS no permite condicionar
-- la restricción, y re-agregarla en una segunda corrida fallaría).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bajas_documentado_como_chk') THEN
    ALTER TABLE public.bajas ADD CONSTRAINT bajas_documentado_como_chk
      CHECK (documentado_como IN ('causa_real','renuncia'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bajas_gratificacion_base_chk') THEN
    ALTER TABLE public.bajas ADD CONSTRAINT bajas_gratificacion_base_chk
      CHECK (gratificacion_base IS NULL OR gratificacion_base IN ('sdi','diario'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bajas_gratificacion_modo_chk') THEN
    ALTER TABLE public.bajas ADD CONSTRAINT bajas_gratificacion_modo_chk
      CHECK (gratificacion_modo IS NULL OR gratificacion_modo IN ('suma','incluye'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bajas_gratificacion_monto_chk') THEN
    ALTER TABLE public.bajas ADD CONSTRAINT bajas_gratificacion_monto_chk
      CHECK (gratificacion_monto >= 0);
  END IF;
END $$;


-- ── 2. Propuestas de baja (borrador de negociación) ──────────────────────────
-- Vive aparte de `bajas` a propósito: `bajas` es el hecho consumado e
-- irreversible; esto es un borrador sobre un trabajador todavía activo, que
-- puede editarse, descartarse o nunca aplicarse.

CREATE TABLE IF NOT EXISTS public.propuestas_baja (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  trabajador_id UUID NOT NULL REFERENCES public.trabajadores(id) ON DELETE CASCADE,
  creado_por    UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  estado        TEXT NOT NULL DEFAULT 'borrador'
                CHECK (estado IN ('borrador','aplicada','descartada')),

  -- Mismos valores que bajas.tipo_baja: la causa REAL que se negocia.
  causa_real      TEXT NOT NULL
                  CHECK (causa_real IN ('injustificada','justificada','renuncia')),
  documentar_como TEXT NOT NULL DEFAULT 'causa_real'
                  CHECK (documentar_como IN ('causa_real','renuncia')),

  fecha_baja_estimada DATE,
  salario_al_momento  NUMERIC,
  periodo_salario     TEXT,

  params_json     JSONB,   -- todos los inputs del formulario (para retomar el borrador)
  escenarios_json JSONB,   -- escenarios calculados + liquidación de referencia

  dias_elegidos  NUMERIC,
  monto_acordado NUMERIC,
  notas          TEXT,

  -- Se llena al consumar la baja, para poder auditar qué se propuso vs qué se pagó.
  baja_id        UUID REFERENCES public.bajas(id) ON DELETE SET NULL,

  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_propuestas_baja_empresa    ON public.propuestas_baja (empresa_id);
CREATE INDEX IF NOT EXISTS idx_propuestas_baja_trabajador ON public.propuestas_baja (trabajador_id);

-- Un solo borrador vivo por trabajador: el flujo lo busca por trabajador_id y
-- debe encontrar uno o ninguno. Las propuestas aplicadas/descartadas se
-- conservan como histórico y no compiten por el índice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_propuestas_baja_borrador
  ON public.propuestas_baja (trabajador_id) WHERE estado = 'borrador';

CREATE OR REPLACE FUNCTION public.propuestas_baja_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_propuestas_baja_touch ON public.propuestas_baja;
CREATE TRIGGER trg_propuestas_baja_touch
  BEFORE UPDATE ON public.propuestas_baja
  FOR EACH ROW EXECUTE FUNCTION public.propuestas_baja_touch();

ALTER TABLE public.propuestas_baja ENABLE ROW LEVEL SECURITY;

-- Mismo criterio que la sección 7 de la migración 33 (políticas estándar por
-- tabla): lectura para cualquier rol de la empresa, escritura solo admin y
-- gerente. Se escriben explícitas en vez de meterse al loop de la 33 para que
-- esta migración sea autocontenida.

DROP POLICY IF EXISTS propuestas_baja_select ON public.propuestas_baja;
CREATE POLICY propuestas_baja_select ON public.propuestas_baja FOR SELECT TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id()));

DROP POLICY IF EXISTS propuestas_baja_insert ON public.propuestas_baja;
CREATE POLICY propuestas_baja_insert ON public.propuestas_baja FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT public.mi_empresa_id())
              AND (SELECT public.puede_gestionar()));

DROP POLICY IF EXISTS propuestas_baja_update ON public.propuestas_baja;
CREATE POLICY propuestas_baja_update ON public.propuestas_baja FOR UPDATE TO authenticated
  USING      (empresa_id = (SELECT public.mi_empresa_id())
              AND (SELECT public.puede_gestionar()))
  WITH CHECK (empresa_id = (SELECT public.mi_empresa_id())
              AND (SELECT public.puede_gestionar()));

DROP POLICY IF EXISTS propuestas_baja_delete ON public.propuestas_baja;
CREATE POLICY propuestas_baja_delete ON public.propuestas_baja FOR DELETE TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id())
         AND (SELECT public.puede_gestionar()));


-- ── 3. Compuerta de plan (migración 21) ──────────────────────────────────────
-- `bajas` ya está en la lista de tablas con `zz_solo_lectura`; la propuesta es
-- una escritura del mismo flujo, así que debe seguir la misma regla: un plan
-- vencido o en solo-lectura no negocia bajas. Condicionado a que la migración
-- 21 esté aplicada.

DO $$
BEGIN
  IF to_regprocedure('public.trg_bloquear_solo_lectura()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS zz_solo_lectura ON public.propuestas_baja;
    CREATE TRIGGER zz_solo_lectura BEFORE INSERT OR UPDATE OR DELETE
      ON public.propuestas_baja FOR EACH ROW
      EXECUTE FUNCTION public.trg_bloquear_solo_lectura();
  END IF;
END $$;

-- No se agrega feature nueva a `planes.features`: el módulo de bajas está
-- disponible en todos los planes (incluido free/trial) y la propuesta es parte
-- del mismo módulo. La restricción real es de ROL: la ruta `bajas` es
-- admin|gerente en ROUTE_ROLES (roles.js).
