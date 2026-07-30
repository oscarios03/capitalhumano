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
  //
  // OJO (auditoría 2026-07): al día de hoy la migración 21 NO está aplicada en
  // producción, así que `get_plan_actual` no existe y este gate rechaza el 100%
  // de las peticiones. Es el comportamiento correcto para un gate de feature de
  // pago (fallar cerrado, nunca abierto), pero significa que la función está
  // efectivamente apagada hasta aplicar la 21. Se distingue en el log para que
  // el síntoma sea diagnosticable sin revelárselo al cliente en la respuesta.
  const { data: planInfo, error: planError } = await supabase.rpc('get_plan_actual');
  if (planError) {
    console.error('agente-ia: no se pudo resolver el plan (¿migración 21 sin aplicar?):', planError.code, planError.message);
  }
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
  let clientBody: { system?: unknown; messages?: unknown; tipo_doc?: unknown };
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

  // Rate limiting (auditoría 2026-07, Fase 4): este es el endpoint más caro de
  // la plataforma y hasta ahora no tenía ningún freno. El gate de plan de
  // arriba solo verifica QUÉ plan tiene el usuario, no CUÁNTAS veces llama —
  // cualquier cuenta con el feature podía invocarlo en bucle contra la cuenta
  // de Anthropic compartida.
  //
  // `agente_ia_consumir_cuota` (migración 39) verifica los 4 límites (usuario/
  // empresa × hora/día) y registra el consumo en la MISMA transacción, con
  // advisory lock por usuario, así que ráfagas concurrentes no se cuelan.
  // Se llama con el JWT del usuario (rol `authenticated`), no con service_role.
  const { data: cuotaFilas, error: cuotaError } = await supabase.rpc(
    'agente_ia_consumir_cuota',
    { p_tipo_doc: typeof clientBody.tipo_doc === 'string' ? clientBody.tipo_doc.slice(0, 60) : null },
  );

  if (cuotaError) {
    // Fallar CERRADO: si no se puede contabilizar el consumo, no se gasta
    // presupuesto de API. El detalle queda en el log del servidor, nunca en la
    // respuesta al cliente.
    console.error('agente-ia: error consultando cuota:', cuotaError.code, cuotaError.message);
    return new Response(JSON.stringify({
      error: 'CUOTA_NO_DISPONIBLE',
      message: 'No se pudo verificar tu cuota de uso del Agente IA. Intenta de nuevo en unos minutos.',
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const cuota = Array.isArray(cuotaFilas) ? cuotaFilas[0] : cuotaFilas;
  if (!cuota?.permitido) {
    const porEmpresa = String(cuota?.motivo ?? '').includes('empresa');
    return new Response(JSON.stringify({
      error: 'RATE_LIMIT_AGENTE_IA',
      message: porEmpresa
        ? 'Tu empresa alcanzó el límite de generaciones del Agente IA. Inténtalo más tarde.'
        : 'Alcanzaste tu límite de generaciones del Agente IA. Inténtalo más tarde.',
    }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '3600', ...CORS_HEADERS },
    });
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

  // No reenviar al cliente el cuerpo de error del proveedor: puede incluir
  // detalle de la cuenta, tipos de error internos y trazas. Solo el caso de
  // éxito se devuelve tal cual (lo necesita agente.js para parsear el JSON
  // del documento).
  if (!anthropicRes.ok) {
    console.error('agente-ia: Anthropic respondió', anthropicRes.status, JSON.stringify(responseData).slice(0, 500));
    return new Response(JSON.stringify({
      error: 'PROVEEDOR_IA',
      message: 'El Agente IA no pudo generar el documento en este momento. Intenta de nuevo en unos minutos.',
    }), {
      status: anthropicRes.status >= 500 ? 502 : 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  return new Response(JSON.stringify(responseData), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
});
