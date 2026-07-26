/**
 * Edge Function: send-emails
 * Lee la tabla email_queue y envía los pendientes al proveedor configurado.
 *
 * Variables de entorno requeridas en Supabase Dashboard → Edge Functions → Secrets:
 *   EMAIL_PROVIDER   → "resend" | "sendgrid"
 *   EMAIL_API_KEY    → API Key del proveedor
 *   FROM_EMAIL       → ej. "alertas@tudominio.com"
 *   SUPABASE_URL     → URL del proyecto (ya disponible por defecto)
 *   SUPABASE_SERVICE_ROLE_KEY → clave de servicio (ya disponible por defecto)
 *
 * Invocar manualmente:
 *   supabase functions invoke send-emails
 *
 * Programar con pg_cron (ejecutar en SQL Editor, cada 15 minutos):
 *   SELECT cron.schedule('send-emails', '0,15,30,45 * * * *',
 *     $$SELECT net.http_post(
 *       url := current_setting('app.supabase_url') || '/functions/v1/send-emails',
 *       headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
 *     )$$
 *   );
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const PROVIDER   = Deno.env.get('EMAIL_PROVIDER') || 'resend';
const API_KEY    = Deno.env.get('EMAIL_API_KEY')  || '';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL')     || 'alertas@capitalhunano.mx';
const MAX_BATCH  = 20;

async function enviarEmail(destinatario: string, asunto: string, html: string): Promise<boolean> {
  if (PROVIDER === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [destinatario], subject: asunto, html }),
    });
    return res.ok;
  }

  if (PROVIDER === 'sendgrid') {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: destinatario }] }],
        from: { email: FROM_EMAIL },
        subject: asunto,
        content: [{ type: 'text/html', value: html }],
      }),
    });
    return res.status === 202;
  }

  console.warn(`EMAIL_PROVIDER desconocido: ${PROVIDER}`);
  return false;
}

const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(async (req: Request) => {
  // M-1: `verify_jwt` (default true en esta función) sólo valida que el JWT
  // esté firmado por este proyecto — CUALQUIER usuario autenticado de la app
  // podría invocar este endpoint directamente, no sólo el cron. Este
  // endpoint sólo debe correr con la service_role key (cron / invocación
  // manual de administrador), así que se exige explícitamente.
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!SERVICE_ROLE_KEY || token !== SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  }

  // M-2: `send_emails_claim` reclama las filas de forma atómica dentro de
  // una transacción SQL con `FOR UPDATE SKIP LOCKED`, antes de hacer
  // llamadas HTTP externas — evita que dos invocaciones solapadas
  // (cron + manual, o dos crons) envíen el mismo correo dos veces.
  const { data: pendientes, error } = await supabase
    .rpc('send_emails_claim', { p_max: MAX_BATCH });

  if (error) {
    console.error('send-emails: send_emails_claim falló:', error.code, error.message);
    return new Response(JSON.stringify({ error: 'No se pudo reclamar la cola de correos' }), { status: 500 });
  }
  if (!pendientes?.length) return new Response(JSON.stringify({ enviados: 0 }));

  let enviados = 0;
  for (const email of pendientes) {
    const ok = await enviarEmail(email.destinatario, email.asunto, email.cuerpo_html);
    await supabase.from('email_queue').update(
      ok
        ? { enviado: true, enviado_en: new Date().toISOString(), procesando_desde: null }
        : { intentos: email.intentos + 1, procesando_desde: null }
    ).eq('id', email.id);
    if (ok) enviados++;
  }

  return new Response(JSON.stringify({ enviados, total: pendientes.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
