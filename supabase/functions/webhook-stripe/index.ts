/**
 * Edge Function: webhook-stripe
 * Procesa webhooks de Stripe (checkout.session.completed) para activar
 * suscripciones y enviar la conversión de pago a la Meta Conversions API
 * (server-side, deduplicada con el pixel del navegador vía event_id).
 *
 * Variables de entorno requeridas (supabase secrets set NOMBRE=valor):
 *   STRIPE_SECRET_KEY      → sk_live_... / sk_test_...
 *   STRIPE_WEBHOOK_SECRET  → whsec_... (firma del endpoint de webhook)
 *   META_PIXEL_ID          → ID numérico del Pixel de Meta
 *   META_CAPI_TOKEN        → token de acceso de la Conversions API
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY → ya disponibles por defecto
 *
 * REGLA DE ORO: el tracking es best-effort. Un fallo de la Conversions API
 * solo se loguea; el webhook SIEMPRE responde 200 a Stripe si la parte de
 * negocio (suscripción + idempotencia) se procesó bien, para evitar
 * reintentos infinitos de Stripe por culpa de Meta.
 *
 * Desplegar:  supabase functions deploy webhook-stripe --no-verify-jwt
 * (sin JWT: Stripe no manda Authorization; la firma HMAC es la seguridad)
 */

import Stripe from 'https://esm.sh/stripe@14?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const META_PIXEL_ID  = Deno.env.get('META_PIXEL_ID') ?? '';
const META_CAPI_TOKEN = Deno.env.get('META_CAPI_TOKEN') ?? '';

/** SHA-256 hex (normalizado a minúsculas/sin espacios, requisito de Meta). */
async function sha256Hex(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto.trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', datos);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Envía el evento Purchase a la Meta Conversions API (server-side).
 * event_id = id del evento de Stripe → Meta deduplica contra el evento
 * del navegador (trackPago) que usa el MISMO id como eventID.
 * Best-effort: nunca lanza; cualquier fallo solo se loguea.
 */
async function enviarPurchaseCAPI(opts: {
  email: string | null;
  valorMXN: number;
  planNombre: string;
  eventId: string;
  clientIp?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    if (!META_PIXEL_ID || !META_CAPI_TOKEN) {
      console.warn('CAPI: META_PIXEL_ID o META_CAPI_TOKEN no configurados; se omite envío');
      return;
    }

    const userData: Record<string, unknown> = {};
    if (opts.email) userData.em = [await sha256Hex(opts.email)];
    if (opts.clientIp) userData.client_ip_address = opts.clientIp;
    if (opts.userAgent) userData.client_user_agent = opts.userAgent;

    const payload = {
      data: [{
        event_name:    'Purchase',
        event_time:    Math.floor(Date.now() / 1000),
        event_id:      opts.eventId,       // deduplicación con el pixel del navegador
        action_source: 'website',
        user_data:     userData,
        custom_data: {
          value:        opts.valorMXN,
          currency:     'MXN',
          content_name: opts.planNombre,
        },
      }],
    };

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${META_PIXEL_ID}/events?access_token=${META_CAPI_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      console.error('CAPI: Meta respondió', res.status, await res.text());
    } else {
      console.log('CAPI: Purchase enviado, event_id =', opts.eventId);
    }
  } catch (e) {
    // Nunca propagar: el webhook debe responder 200 a Stripe de todas formas
    console.error('CAPI: error enviando Purchase (ignorado):', e);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // ── 1. Verificar la firma de Stripe ────────────────────────────────────
  const firma = req.headers.get('stripe-signature');
  if (!firma || !WEBHOOK_SECRET) {
    return new Response('Firma faltante o webhook sin configurar', { status: 400 });
  }

  const cuerpo = await req.text();
  let evento: Stripe.Event;
  try {
    evento = await stripe.webhooks.constructEventAsync(cuerpo, firma, WEBHOOK_SECRET);
  } catch (e) {
    console.error('Firma de Stripe inválida:', e);
    return new Response('Firma inválida', { status: 400 });
  }

  // Solo nos interesa el checkout completado
  if (evento.type !== 'checkout.session.completed') {
    return new Response(JSON.stringify({ received: true, ignored: evento.type }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  const session = evento.data.object as Stripe.Checkout.Session;

  try {
    // ── 2. Idempotencia: registrar el evento; si ya existe, no reprocesar ──
    // Tabla esperada: stripe_eventos(event_id text primary key, tipo text,
    //                 procesado_at timestamptz default now())
    const { error: idemErr } = await supabase
      .from('stripe_eventos')
      .insert({ event_id: evento.id, tipo: evento.type });

    if (idemErr) {
      if (idemErr.code === '23505') {
        // Evento duplicado (reintento de Stripe): ya procesado, responder 200
        console.log('Evento duplicado, ignorado:', evento.id);
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      throw idemErr; // otro error de BD sí debe provocar reintento de Stripe
    }

    // ── 3. Activar/registrar la suscripción ────────────────────────────────
    // TODO: conectar con la lógica de suscripción existente (sistema de
    // planes de la migración 21). Con session.client_reference_id (user_id)
    // o session.customer_email, actualizar el plan de la empresa:
    //   - identificar empresa por el usuario que pagó
    //   - fijar plan según session.metadata.plan ('pyme'|'full'|'despacho')
    //   - fijar estado 'activa' y fecha de renovación
    // Ejemplo:
    //   await supabase.rpc('activar_suscripcion', {
    //     p_user_id: session.client_reference_id,
    //     p_plan: session.metadata?.plan,
    //     p_stripe_customer: session.customer as string,
    //     p_stripe_subscription: session.subscription as string,
    //   });

    // ── 4. Conversión server-side a Meta (best-effort, nunca falla el webhook)
    const email = session.customer_details?.email ?? session.customer_email ?? null;
    const valorMXN = (session.amount_total ?? 0) / 100; // Stripe usa centavos
    const planNombre = session.metadata?.plan ?? 'suscripcion';

    // event_id de deduplicación: usamos el id de la SESIÓN de checkout
    // (cs_...) y no el del evento (evt_...) porque es el único id que el
    // navegador también conoce — Stripe lo expone en el success_url vía
    // {CHECKOUT_SESSION_ID} y trackPago() lo manda como eventID del pixel.
    await enviarPurchaseCAPI({
      email,
      valorMXN,
      planNombre,
      eventId: session.id, // MISMO id que usa trackPago() en el navegador
    });

    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    // Error de negocio/BD: responder 500 para que Stripe reintente
    console.error('webhook-stripe error:', e);
    return new Response('Error interno', { status: 500 });
  }
});
