/**
 * Edge Function: agente-ia
 * Proxy seguro hacia la API de Anthropic. La API key nunca sale al frontend.
 *
 * Variables de entorno requeridas (supabase secrets set ...):
 *   ANTHROPIC_API_KEY  → sk-ant-...
 *
 * Variables disponibles automáticamente en Supabase:
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// M-7: el proyecto todavía no tiene dominio de producción propio (2026-07),
// así que se acepta cualquier origen por ahora. En cuanto exista un dominio
// fijo, configurar el secret `ALLOWED_ORIGIN` (Supabase Dashboard → Edge
// Functions → Secrets) con ese dominio exacto (ej. https://app.midominio.mx)
// para restringir esta cabecera.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  // Solo POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // Verificar JWT de Supabase
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'No autorizado — falta token de sesión' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Token inválido o expirado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // Gate de plan: el Agente IA solo está incluido en Full/Despacho.
  // Requiere la migración 21 (get_plan_actual) aplicada antes del deploy.
  const { data: planInfo, error: planError } = await supabase.rpc('get_plan_actual');
  if (planError || planInfo?.features?.agente_ia !== true
      || !['active', 'trialing'].includes(planInfo?.estado)) {
    return new Response(JSON.stringify({
      error: 'PLAN_FEATURE_AGENTE_IA',
      message: 'El Agente IA está disponible en los planes Full y Despacho.',
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // Leer API key desde entorno (nunca expuesta al cliente)
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY no configurada en el servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // Leer y VALIDAR el body del cliente. NUNCA reenviar model/max_tokens tal
  // cual: cualquier usuario con JWT válido (de cualquier tenant con el
  // feature habilitado) podría invocar este endpoint directamente —no solo
  // desde agente.js— y usarlo como proxy genérico contra la cuenta de
  // Anthropic compartida, inflando costo o cambiando el modelo. system y
  // messages sí vienen del cliente (contienen el caso/plantilla concretos),
  // pero se acotan en tamaño para no permitir payloads absurdamente grandes.
  let clientBody: { system?: unknown; messages?: unknown };
  try {
    clientBody = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Body JSON inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const MODEL_PERMITIDO   = 'claude-opus-4-5';
  const MAX_TOKENS_TOPE   = 8000;
  const SYSTEM_MAX_CHARS  = 6000;
  const MESSAGE_MAX_CHARS = 20000;
  const MAX_MENSAJES      = 4;

  if (typeof clientBody.system !== 'string' || !clientBody.system.trim()
      || clientBody.system.length > SYSTEM_MAX_CHARS) {
    return new Response(JSON.stringify({ error: 'system inválido o demasiado largo' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  if (!Array.isArray(clientBody.messages) || clientBody.messages.length === 0
      || clientBody.messages.length > MAX_MENSAJES) {
    return new Response(JSON.stringify({ error: 'messages inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
  for (const m of clientBody.messages as Array<{ content?: unknown }>) {
    if (typeof m.content !== 'string' || m.content.length > MESSAGE_MAX_CHARS) {
      return new Response(JSON.stringify({ error: 'Contenido de mensaje inválido o demasiado largo' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }
  }

  // model y max_tokens se FIJAN aquí — nunca vienen del cliente.
  const anthropicBody = {
    model: MODEL_PERMITIDO,
    max_tokens: MAX_TOKENS_TOPE,
    system: clientBody.system,
    messages: clientBody.messages,
  };

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(anthropicBody),
  });

  const responseData = await anthropicRes.json();
  return new Response(JSON.stringify(responseData), {
    status: anthropicRes.status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
});
