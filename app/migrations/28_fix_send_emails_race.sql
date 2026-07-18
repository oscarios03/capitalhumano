-- ═══════════════════════════════════════════════════════════════════════════
--  Migración 28 — Auditoría de seguridad, severidad Media (Fase 2)
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════════════
--  M-1/M-2 (send-emails):
--
--  PRERREQUISITO DESCUBIERTO EN ESTA SESIÓN: la migración 10
--  (10_migration_email_notifications.sql, cola de emails) nunca se había
--  aplicado en producción — `email_queue` no existía. Se incluye aquí de
--  forma idempotente (CREATE TABLE IF NOT EXISTS, igual que el archivo 10
--  original) porque el RPC de M-2 depende de que la tabla exista. La
--  feature sigue dormida en la práctica: el trigger sólo encola algo si
--  `empresas.notif_email_activo = true`, que por defecto es `false` y hoy
--  ninguna empresa lo tiene activado.
--
--  M-2: reemplaza el patrón SELECT-luego-UPDATE-uno-por-uno del Edge
--  Function `send-emails` (vulnerable a duplicar envíos si dos invocaciones
--  se solapan — cron + invocación manual, o dos crons) por un RPC
--  transaccional `send_emails_claim()` que usa `FOR UPDATE SKIP LOCKED`
--  para "reclamar" filas de forma atómica (marca `procesando_desde`) antes
--  de que el Edge Function haga las llamadas HTTP de envío (que NO deben
--  ocurrir dentro de la transacción SQL, para no mantener locks abiertos
--  mientras se espera una API externa). Reclamos huérfanos (Edge Function
--  se cae a medio proceso) expiran a los 5 minutos y vuelven a ser
--  elegibles.
--
--  M-1 (auth del endpoint): se resuelve en el código de la Edge Function
--  (`supabase/functions/send-emails/index.ts`), no aquí — compara el
--  Authorization Bearer recibido contra SUPABASE_SERVICE_ROLE_KEY.
--
--  Idempotente: seguro de ejecutar más de una vez.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.email_queue (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id   uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  destinatario text NOT NULL,
  asunto       text NOT NULL,
  cuerpo_html  text NOT NULL,
  enviado      boolean DEFAULT false,
  intentos     int DEFAULT 0,
  creado_en    timestamptz DEFAULT now(),
  enviado_en   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_email_queue_pendientes ON public.email_queue(enviado, creado_en)
  WHERE enviado = false;

ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_queue_empresa_own" ON public.email_queue;
CREATE POLICY "email_queue_empresa_own" ON public.email_queue
  USING (
    empresa_id IN (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid())
  );

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS notif_email_activo  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notif_email_destino text;

CREATE OR REPLACE FUNCTION public.encolar_notificacion_alerta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.empresas
    WHERE id = NEW.empresa_id
      AND notif_email_activo = true
      AND notif_email_destino IS NOT NULL
  ) THEN
    IF NEW.prioridad IN ('critica', 'alta') THEN
      INSERT INTO public.email_queue (empresa_id, destinatario, asunto, cuerpo_html)
      SELECT
        NEW.empresa_id,
        e.notif_email_destino,
        '⚠️ Alerta laboral (' || NEW.prioridad || '): ' || NEW.titulo,
        '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">'
          || '<h2 style="color:#e74c3c;">⚠️ ' || NEW.titulo || '</h2>'
          || '<p>' || COALESCE(NEW.descripcion, '') || '</p>'
          || CASE WHEN NEW.articulo_lft IS NOT NULL
               THEN '<p style="color:#666;font-size:.9em;">📖 ' || NEW.articulo_lft || '</p>'
               ELSE '' END
          || CASE WHEN NEW.accion_sugerida IS NOT NULL
               THEN '<p><strong>Acción sugerida:</strong> ' || NEW.accion_sugerida || '</p>'
               ELSE '' END
          || '<hr><p style="color:#999;font-size:.8em;">Capital Humano MX — Sistema de Alertas Laborales</p>'
          || '</div>'
      FROM public.empresas e
      WHERE e.id = NEW.empresa_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.encolar_notificacion_alerta() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_alerta_email ON public.alertas;
CREATE TRIGGER trigger_alerta_email
  AFTER INSERT ON public.alertas
  FOR EACH ROW EXECUTE FUNCTION public.encolar_notificacion_alerta();

-- ── M-2: claim atómico con SKIP LOCKED ───────────────────────────────────
ALTER TABLE public.email_queue ADD COLUMN IF NOT EXISTS procesando_desde timestamptz;

CREATE OR REPLACE FUNCTION public.send_emails_claim(p_max int DEFAULT 20)
RETURNS SETOF public.email_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_ids FROM (
    SELECT id FROM public.email_queue
    WHERE enviado = false
      AND intentos < 3
      AND (procesando_desde IS NULL OR procesando_desde < now() - interval '5 minutes')
    ORDER BY creado_en
    LIMIT p_max
    FOR UPDATE SKIP LOCKED
  ) sub;

  IF v_ids IS NULL THEN RETURN; END IF;

  UPDATE public.email_queue SET procesando_desde = now() WHERE id = ANY(v_ids);

  RETURN QUERY SELECT * FROM public.email_queue WHERE id = ANY(v_ids);
END;
$function$;

REVOKE ALL ON FUNCTION public.send_emails_claim(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_emails_claim(int) TO service_role;
