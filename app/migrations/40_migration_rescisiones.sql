-- ═══════════════════════════════════════════════════════════════════════════
-- 40 — Rescisiones del art. 47 LFT y sus plazos fatales
--
-- Remedia los hallazgos P0-1 y P0-2 de la auditoría jurídica de formatos.
--
-- Hasta ahora el sistema no guardaba ninguno de los datos que el art. 47 exige
-- para que una rescisión se sostenga: la fracción invocada, la descripción
-- circunstanciada de los hechos, la fecha en que el patrón tuvo conocimiento de
-- la causa, ni el rastro de la entrega del aviso. Sin esos datos no hay forma
-- de vigilar los dos plazos que más rescisiones tumban:
--
--   · Art. 517 fr. I — un mes para ejercer la acción de rescisión, contado
--     desde el día siguiente a aquel en que se tuvo conocimiento de la causa.
--   · Art. 47 — cinco días hábiles para hacer del conocimiento del Tribunal la
--     negativa del trabajador a recibir el aviso.
--
-- NOTA DE NUMERACIÓN: las migraciones 38 y 39 pertenecen a otras ramas y ya
-- estaban aplicadas en producción al momento de aplicar ésta. Verificado el
-- 26/07/2026 contra los objetos que crean, no sólo contra el log de migraciones.
--
-- APLICADA en producción (proyecto KAPITAL HUMANO) el 26/07/2026.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Tabla de rescisiones ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rescisiones (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                  UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  trabajador_id               UUID NOT NULL REFERENCES public.trabajadores(id) ON DELETE CASCADE,

  -- Inicia el mes del art. 517 fr. I (día siguiente al conocimiento)
  fecha_conocimiento_causa    DATE NOT NULL,
  -- Inicia los cinco días hábiles del art. 47
  fecha_rescision             DATE,

  fraccion_art47              TEXT NOT NULL,
  descripcion_circunstanciada TEXT NOT NULL,
  evidencia                   TEXT,

  -- Domicilio que se proporcionará al Tribunal si hay negativa (art. 47)
  domicilio_trabajador        TEXT,

  -- Testigos: sin domicilio no se les puede citar cuando llegue el juicio
  testigo1_nombre             TEXT,
  testigo1_ine                TEXT,
  testigo1_domicilio          TEXT,
  testigo2_nombre             TEXT,
  testigo2_ine                TEXT,
  testigo2_domicilio          TEXT,

  -- Rastro de la entrega
  aviso_entregado             BOOLEAN NOT NULL DEFAULT false,
  aviso_rechazado             BOOLEAN NOT NULL DEFAULT false,
  acta_negativa_generada      BOOLEAN NOT NULL DEFAULT false,
  aviso_tribunal_presentado   BOOLEAN NOT NULL DEFAULT false,
  fecha_presentacion_tribunal DATE,

  manifestacion_trabajador    TEXT,
  hora_inicio                 TEXT,
  hora_cierre                 TEXT,
  lugar_exacto                TEXT,

  creado_por                  UUID REFERENCES auth.users(id),
  creado_en                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en              TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- La fracción debe existir realmente en el art. 47. El catálogo del sistema
  -- citaba fracciones inexistentes (p. ej. "XI Bis"), que es justo lo que un
  -- abogado del trabajador busca para tumbar la rescisión.
  CONSTRAINT rescisiones_fraccion_valida CHECK (
    fraccion_art47 IN ('I','II','III','IV','V','VI','VII','VIII','IX','X',
                       'XI','XII','XIII','XIV','XIV Bis','XV')
  ),
  -- No se puede rescindir antes de conocer la causa
  CONSTRAINT rescisiones_fechas_coherentes CHECK (
    fecha_rescision IS NULL OR fecha_rescision >= fecha_conocimiento_causa
  ),
  -- Sólo se avisa al Tribunal cuando hubo negativa a recibir
  CONSTRAINT rescisiones_tribunal_requiere_negativa CHECK (
    NOT aviso_tribunal_presentado OR aviso_rechazado
  )
);

CREATE INDEX IF NOT EXISTS idx_rescisiones_empresa     ON public.rescisiones(empresa_id);
CREATE INDEX IF NOT EXISTS idx_rescisiones_trabajador  ON public.rescisiones(trabajador_id);
-- Índice parcial: sólo las que siguen corriendo contra un plazo
CREATE INDEX IF NOT EXISTS idx_rescisiones_pendientes  ON public.rescisiones(empresa_id, fecha_rescision)
  WHERE aviso_rechazado AND NOT aviso_tribunal_presentado;

-- ── 2. RLS por empresa y por rol ───────────────────────────────────────────
-- Mismo patrón que `bajas`, `actas` y `propuestas_baja` (migración 33):
-- lectura para cualquier miembro de la empresa; escritura sólo para quien
-- puede gestionar (admin o gerente). Una rescisión es el documento que decide
-- si un despido se sostiene: no debe poder registrarla ni alterarla un rol
-- de consulta.
ALTER TABLE public.rescisiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rescisiones_select" ON public.rescisiones;
CREATE POLICY "rescisiones_select" ON public.rescisiones FOR SELECT
  TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id()));

DROP POLICY IF EXISTS "rescisiones_insert" ON public.rescisiones;
CREATE POLICY "rescisiones_insert" ON public.rescisiones FOR INSERT
  TO authenticated
  WITH CHECK (empresa_id = (SELECT public.mi_empresa_id())
              AND (SELECT public.puede_gestionar()));

DROP POLICY IF EXISTS "rescisiones_update" ON public.rescisiones;
CREATE POLICY "rescisiones_update" ON public.rescisiones FOR UPDATE
  TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id())
         AND (SELECT public.puede_gestionar()))
  WITH CHECK (empresa_id = (SELECT public.mi_empresa_id())
              AND (SELECT public.puede_gestionar()));

DROP POLICY IF EXISTS "rescisiones_delete" ON public.rescisiones;
CREATE POLICY "rescisiones_delete" ON public.rescisiones FOR DELETE
  TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id())
         AND (SELECT public.puede_gestionar()));

-- ── 3. actualizado_en ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rescisiones_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$;

-- Postgres concede EXECUTE a PUBLIC por defecto en las funciones nuevas; una
-- función de trigger no debe poder invocarse directamente desde el cliente
-- (mismo endurecimiento que la migración 39b).
REVOKE ALL ON FUNCTION public.rescisiones_touch() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rescisiones_touch() FROM anon;
REVOKE ALL ON FUNCTION public.rescisiones_touch() FROM authenticated;

DROP TRIGGER IF EXISTS trg_rescisiones_touch ON public.rescisiones;
CREATE TRIGGER trg_rescisiones_touch
  BEFORE UPDATE ON public.rescisiones
  FOR EACH ROW EXECUTE FUNCTION public.rescisiones_touch();

COMMENT ON TABLE public.rescisiones IS
  'Rescisiones del art. 47 LFT. Sostiene el aviso, el acta de negativa, el aviso al Tribunal y la vigilancia de los plazos de los arts. 517 fr. I y 47.';
COMMENT ON COLUMN public.rescisiones.fecha_conocimiento_causa IS
  'Fecha en que el patrón tuvo conocimiento de la causa. El mes del art. 517 fr. I corre desde el día SIGUIENTE.';
COMMENT ON COLUMN public.rescisiones.fecha_rescision IS
  'Fecha de la rescisión. Desde ella corren los cinco días hábiles del art. 47 para avisar al Tribunal.';
