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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
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

  // Reenviar el body sin modificar hacia Anthropic
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Body JSON inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  const responseData = await anthropicRes.json();
  return new Response(JSON.stringify(responseData), {
    status: anthropicRes.status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
});
