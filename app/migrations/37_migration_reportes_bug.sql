-- ============================================================================
-- Migración 37 — Reportes de bug / mejora (fase beta) + panel del desarrollador
-- ============================================================================
-- Canal para que los usuarios beta reporten fallas/mejoras desde cualquier
-- página, y un panel cross-empresa para que el desarrollador (tú) los gestione.
--
-- Novedad clave: los 4 roles de la migración 33 son SIEMPRE por empresa (cada
-- empresa tiene su admin). Aquí se agrega una compuerta NUEVA, `es_desarrollador()`,
-- que se salta el aislamiento multiempresa SOLO para las cuentas listadas en
-- `desarrolladores`, para que puedas ver los reportes de todas las empresas.
--
-- El candado REAL vive en RLS. El gating de la UI (reportes_bug.js con DEV_EMAIL)
-- es solo experiencia de usuario.
--
-- Disponibilidad: NO se agrega `reportes_bug` a los triggers de plan
-- (`zz_solo_lectura` / `trg_requiere_feature` de la migración 21), a propósito:
-- hasta un usuario en `free`/trial vencido (read-only) debe poder reportar.
--
-- Idempotente: puede correrse múltiples veces.
-- ============================================================================


-- ── 1. Identidad de desarrollador ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.desarrolladores (
  user_id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Semilla del dueño por correo (idempotente). Para sumar más desarrolladores,
-- basta con otro INSERT similar.
INSERT INTO public.desarrolladores (user_id)
SELECT id FROM auth.users WHERE lower(email) = 'oscar_ius@outlook.com'
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.desarrolladores ENABLE ROW LEVEL SECURITY;

-- Solo un desarrollador puede leer la lista (evita filtrar quién es dev). Sin
-- políticas de escritura: el alta se hace por SQL (service_role / SQL Editor).
DROP POLICY IF EXISTS desarrolladores_select ON public.desarrolladores;
CREATE POLICY desarrolladores_select ON public.desarrolladores FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- SECURITY DEFINER a propósito: lee `desarrolladores` saltándose RLS. STABLE
-- permite a Postgres evaluarla una sola vez por consulta al envolverla en
-- (SELECT ...). Mismo patrón que es_admin()/mi_empresa_id() de la migración 33.
CREATE OR REPLACE FUNCTION public.es_desarrollador()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.desarrolladores WHERE user_id = auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.es_desarrollador() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.es_desarrollador() TO authenticated;


-- ── 2. Tabla de reportes ─────────────────────────────────────────────────────
-- Solo columnas seguras para que las lea el propio usuario (RLS es por fila, no
-- por columna). Las notas internas del dev viven aparte (sección 3).

CREATE TABLE IF NOT EXISTS public.reportes_bug (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  creado_por       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Snapshots por si el usuario se elimina (mismo criterio que subido_por/invitada_por)
  reportero_email  TEXT,
  reportero_nombre TEXT,
  reportero_rol    TEXT,

  tipo         TEXT NOT NULL DEFAULT 'bug'
               CHECK (tipo IN ('bug','mejora','duda')),
  impacto      TEXT NOT NULL DEFAULT 'menor'
               CHECK (impacto IN ('bloquea','molesto','menor')),
  descripcion  TEXT NOT NULL CHECK (char_length(btrim(descripcion)) >= 10),
  observaciones TEXT,

  -- Contexto técnico capturado en silencio por el frontend
  ruta         TEXT,   -- route del hash (ej. 'nomina')
  pagina_label TEXT,   -- nombre humano de la sección
  url          TEXT,   -- location.href
  navegador    TEXT,   -- navigator.userAgent
  viewport     TEXT,   -- "1440x900"
  app_version  TEXT,
  plan_codigo  TEXT,
  captura_path TEXT,   -- path dentro del bucket 'reportes' (opcional)

  -- Triage (lo edita solo el dev; el usuario los VE en "Mis reportes")
  estado     TEXT NOT NULL DEFAULT 'nuevo'
             CHECK (estado IN ('nuevo','en_revision','resuelto','descartado')),
  prioridad  TEXT NOT NULL DEFAULT 'media'
             CHECK (prioridad IN ('alta','media','baja')),
  leido      BOOLEAN NOT NULL DEFAULT false,

  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reportes_bug_empresa ON public.reportes_bug (empresa_id);
CREATE INDEX IF NOT EXISTS idx_reportes_bug_estado  ON public.reportes_bug (estado);
CREATE INDEX IF NOT EXISTS idx_reportes_bug_creado  ON public.reportes_bug (creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_reportes_bug_autor   ON public.reportes_bug (creado_por);

-- Mantener actualizado_en al día
CREATE OR REPLACE FUNCTION public.reportes_bug_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_reportes_bug_touch ON public.reportes_bug;
CREATE TRIGGER trg_reportes_bug_touch
  BEFORE UPDATE ON public.reportes_bug
  FOR EACH ROW EXECUTE FUNCTION public.reportes_bug_touch();

ALTER TABLE public.reportes_bug ENABLE ROW LEVEL SECURITY;

-- SELECT: el usuario ve los de su empresa; el desarrollador ve TODOS.
DROP POLICY IF EXISTS reportes_bug_select ON public.reportes_bug;
CREATE POLICY reportes_bug_select ON public.reportes_bug FOR SELECT TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id()) OR (SELECT public.es_desarrollador()));

-- INSERT: cualquier usuario autenticado, en su propia empresa y a su nombre.
-- (Sin gate de rol ni de plan: todos deben poder reportar.)
DROP POLICY IF EXISTS reportes_bug_insert ON public.reportes_bug;
CREATE POLICY reportes_bug_insert ON public.reportes_bug FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT public.mi_empresa_id()) AND creado_por = auth.uid());

-- UPDATE / DELETE: solo el desarrollador (triage).
DROP POLICY IF EXISTS reportes_bug_update ON public.reportes_bug;
CREATE POLICY reportes_bug_update ON public.reportes_bug FOR UPDATE TO authenticated
  USING      ((SELECT public.es_desarrollador()))
  WITH CHECK ((SELECT public.es_desarrollador()));

DROP POLICY IF EXISTS reportes_bug_delete ON public.reportes_bug;
CREATE POLICY reportes_bug_delete ON public.reportes_bug FOR DELETE TO authenticated
  USING ((SELECT public.es_desarrollador()));


-- ── 3. Notas internas del desarrollador (aisladas del usuario) ───────────────
-- Van en tabla aparte porque RLS no puede ocultar columnas: si vivieran en
-- reportes_bug, un usuario técnico las leería vía PostgREST al ver su reporte.

CREATE TABLE IF NOT EXISTS public.reporte_bug_notas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id UUID NOT NULL REFERENCES public.reportes_bug(id) ON DELETE CASCADE,
  autor      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nota       TEXT NOT NULL,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reporte_bug_notas_reporte ON public.reporte_bug_notas (reporte_id);

ALTER TABLE public.reporte_bug_notas ENABLE ROW LEVEL SECURITY;

-- Las cuatro operaciones: solo el desarrollador.
DROP POLICY IF EXISTS reporte_bug_notas_select ON public.reporte_bug_notas;
CREATE POLICY reporte_bug_notas_select ON public.reporte_bug_notas FOR SELECT TO authenticated
  USING ((SELECT public.es_desarrollador()));

DROP POLICY IF EXISTS reporte_bug_notas_insert ON public.reporte_bug_notas;
CREATE POLICY reporte_bug_notas_insert ON public.reporte_bug_notas FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.es_desarrollador()) AND autor = auth.uid());

DROP POLICY IF EXISTS reporte_bug_notas_delete ON public.reporte_bug_notas;
CREATE POLICY reporte_bug_notas_delete ON public.reporte_bug_notas FOR DELETE TO authenticated
  USING ((SELECT public.es_desarrollador()));


-- ── 4. Storage: capturas de pantalla (bucket 'reportes') ─────────────────────
-- ============================================================================
--  CREAR EL BUCKET EN EL DASHBOARD DE SUPABASE (una sola vez):
--    1. Storage → New bucket
--    2. Nombre:            reportes
--    3. Public bucket:     NO (privado)
--    4. Allowed MIME types: image/png, image/jpeg, image/webp
--    5. Max file size:      5 MB (5242880 bytes)
--
--  Las políticas de acceso NO se ponen en el Dashboard: se crean aquí abajo
--  (sobre storage.objects), namespacing por carpeta = empresa_id. Ruta de
--  subida que usa el frontend: {empresa_id}/{reporte_id}.{ext}
-- ============================================================================

-- Blindaje de configuración por si el bucket ya existe (mismo criterio que la
-- migración 29 con 'expedientes'): fija MIME y tamaño de forma idempotente.
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp'],
       file_size_limit    = 5242880
 WHERE id = 'reportes';

DROP POLICY IF EXISTS "reportes_insert_misma_empresa" ON storage.objects;
CREATE POLICY "reportes_insert_misma_empresa" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'reportes'
    AND (storage.foldername(name))[1] = (
      SELECT empresa_id::text FROM public.perfiles WHERE id = auth.uid()
    )
  );

-- SELECT: la propia empresa (ve su captura en "Mis reportes") o el desarrollador
-- (ve las de todas las empresas en el panel).
DROP POLICY IF EXISTS "reportes_select_empresa_o_dev" ON storage.objects;
CREATE POLICY "reportes_select_empresa_o_dev" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'reportes'
    AND (
      (storage.foldername(name))[1] = (
        SELECT empresa_id::text FROM public.perfiles WHERE id = auth.uid()
      )
      OR (SELECT public.es_desarrollador())
    )
  );

DROP POLICY IF EXISTS "reportes_delete_empresa_o_dev" ON storage.objects;
CREATE POLICY "reportes_delete_empresa_o_dev" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'reportes'
    AND (
      (storage.foldername(name))[1] = (
        SELECT empresa_id::text FROM public.perfiles WHERE id = auth.uid()
      )
      OR (SELECT public.es_desarrollador())
    )
  );


-- ── 5. Correo-resumen diario para el desarrollador ───────────────────────────
-- Reutiliza el pipeline existente: encola en email_queue (empresa_id NULL) y la
-- edge function send-emails lo entrega. Un correo por cada desarrollador.

CREATE OR REPLACE FUNCTION public.encolar_resumen_reportes()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_desde  TIMESTAMPTZ := now() - interval '1 day';
  v_total  INTEGER;
  v_filas  TEXT;
  v_html   TEXT;
  v_asunto TEXT;
  v_dest   TEXT;
  v_encolados INTEGER := 0;
BEGIN
  SELECT count(*) INTO v_total
    FROM public.reportes_bug
   WHERE creado_en >= v_desde;

  IF v_total = 0 THEN
    RETURN 0;   -- sin reportes nuevos: no molestar
  END IF;

  -- Filas de la tabla del correo (los más recientes primero)
  SELECT string_agg(fila, '')
    INTO v_filas
    FROM (
      SELECT
        '<tr>'
        || '<td style="padding:6px 10px;border-bottom:1px solid #eee;">' || r.tipo || ' · ' || r.impacto || '</td>'
        || '<td style="padding:6px 10px;border-bottom:1px solid #eee;">' || COALESCE(e.nombre, '—') || '</td>'
        || '<td style="padding:6px 10px;border-bottom:1px solid #eee;">' || COALESCE(r.pagina_label, r.ruta, '—') || '</td>'
        || '<td style="padding:6px 10px;border-bottom:1px solid #eee;">' || left(replace(r.descripcion, E'\n', ' '), 120) || '</td>'
        || '</tr>' AS fila
        FROM public.reportes_bug r
        LEFT JOIN public.empresas e ON e.id = r.empresa_id
       WHERE r.creado_en >= v_desde
       ORDER BY r.creado_en DESC
    ) t;

  v_asunto := 'Capital Humano — ' || v_total || ' reporte(s) nuevo(s) en las últimas 24 h';
  v_html :=
    '<h2 style="font-family:Georgia,serif;color:#0f2438;">Reportes nuevos (24 h): ' || v_total || '</h2>'
    || '<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;width:100%;">'
    || '<thead><tr style="text-align:left;background:#f4f6f8;">'
    || '<th style="padding:6px 10px;">Tipo · Impacto</th><th style="padding:6px 10px;">Empresa</th>'
    || '<th style="padding:6px 10px;">Página</th><th style="padding:6px 10px;">Descripción</th>'
    || '</tr></thead><tbody>' || COALESCE(v_filas, '') || '</tbody></table>'
    || '<p style="font-family:Arial,sans-serif;font-size:12px;color:#667;">Entra a la app → Soporte / Reportes para gestionarlos.</p>';

  -- Un correo por desarrollador con correo válido
  FOR v_dest IN
    SELECT u.email
      FROM public.desarrolladores d
      JOIN auth.users u ON u.id = d.user_id
     WHERE u.email IS NOT NULL
  LOOP
    INSERT INTO public.email_queue (empresa_id, destinatario, asunto, cuerpo_html)
    VALUES (NULL, v_dest, v_asunto, v_html);
    v_encolados := v_encolados + 1;
  END LOOP;

  RETURN v_encolados;
END; $$;

REVOKE EXECUTE ON FUNCTION public.encolar_resumen_reportes() FROM PUBLIC, anon, authenticated;
-- Solo service_role / pg_cron / SQL Editor la ejecutan.

-- ============================================================================
--  PROGRAMAR EL RESUMEN DIARIO (correr una vez en el SQL Editor):
--
--    SELECT cron.schedule(
--      'resumen-reportes-bug',
--      '0 15 * * *',                       -- 15:00 UTC ≈ 09:00 CDMX
--      $$SELECT public.encolar_resumen_reportes()$$
--    );
--
--  (Requiere la extensión pg_cron, ya usada por send-emails. El envío real lo
--   hace la edge function send-emails en su corrida siguiente.)
-- ============================================================================
