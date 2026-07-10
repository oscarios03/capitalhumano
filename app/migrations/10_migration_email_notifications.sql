-- Migración 10: Cola de notificaciones por email
-- Aplicar en Supabase SQL Editor DESPUÉS de la migración 09

-- ── Cola de emails pendientes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_queue (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id   uuid REFERENCES empresas(id) ON DELETE CASCADE,
  destinatario text NOT NULL,
  asunto       text NOT NULL,
  cuerpo_html  text NOT NULL,
  enviado      boolean DEFAULT false,
  intentos     int DEFAULT 0,
  creado_en    timestamptz DEFAULT now(),
  enviado_en   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_email_queue_pendientes ON email_queue(enviado, creado_en)
  WHERE enviado = false;

ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_queue_empresa_own" ON email_queue
  USING (
    empresa_id IN (
      SELECT empresa_id FROM perfiles WHERE id = auth.uid()
    )
  );

-- ── Columnas de preferencias en empresas ──────────────────────────────────────
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS notif_email_activo  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notif_email_destino text;

-- ── Trigger: encolar email cuando se inserta alerta crítica o alta ────────────
CREATE OR REPLACE FUNCTION encolar_notificacion_alerta()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo si la empresa tiene notificaciones activas
  IF EXISTS (
    SELECT 1 FROM empresas
    WHERE id = NEW.empresa_id
      AND notif_email_activo = true
      AND notif_email_destino IS NOT NULL
  ) THEN
    IF NEW.prioridad IN ('critica', 'alta') THEN
      INSERT INTO email_queue (empresa_id, destinatario, asunto, cuerpo_html)
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
      FROM empresas e
      WHERE e.id = NEW.empresa_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar trigger anterior si existía y recrear
DROP TRIGGER IF EXISTS trigger_alerta_email ON alertas;
CREATE TRIGGER trigger_alerta_email
  AFTER INSERT ON alertas
  FOR EACH ROW EXECUTE FUNCTION encolar_notificacion_alerta();
