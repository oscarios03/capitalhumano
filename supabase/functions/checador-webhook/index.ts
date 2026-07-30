/**
 * Edge Function: checador-webhook
 * Endpoint genérico para que un agente local (corriendo junto a un reloj
 * checador físico — huella, facial, etc.) reporte pulsos de asistencia.
 * Documentado en docs/checador-fisico-integracion.md.
 *
 * Autenticación: header `x-api-key` con la API key generada desde
 * el módulo Checador → "Checadores Físicos". Nunca se guarda en claro,
 * solo su hash SHA-256 (integraciones_checador.api_key_hash).
 *
 * Body: { "codigo_checador": "<código asignado al trabajador>",
 *         "ts"?: "<ISO 8601, default: ahora>",
 *         "dispositivo"?: "<nombre/serie del equipo>" }
 *
 * Variables disponibles automáticamente en Supabase:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// M-7: el proyecto todavía no tiene dominio de producción propio (2026-07),
// así que se acepta cualquier origen por ahora. En cuanto exista un dominio
// fijo, configurar el secret `ALLOWED_ORIGIN` (Supabase Dashboard → Edge
// Functions → Secrets) con ese dominio exacto (ej. https://app.midominio.mx)
// para restringir esta cabecera. Nota: este endpoint también lo llaman
// agentes locales fuera del navegador (no sujetos a CORS), así que esta
// cabecera solo protege el caso de invocación desde un navegador.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) return json({ error: 'Falta header x-api-key' }, 401);

  let body: { codigo_checador?: string; ts?: string; dispositivo?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body JSON inválido' }, 400);
  }

  const { codigo_checador, ts, dispositivo } = body;
  if (!codigo_checador) return json({ error: 'Falta codigo_checador' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const apiKeyHash = await sha256Hex(apiKey);
  const { data: integracion } = await supabase
    .from('integraciones_checador')
    .select('id, empresa_id, activo')
    .eq('api_key_hash', apiKeyHash)
    .maybeSingle();

  if (!integracion || !integracion.activo) {
    // B-3: la key ya tiene suficiente entropía para no requerir bloqueo,
    // pero se deja rastro para detectar fuerza bruta / abuso por IP.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || req.headers.get('cf-connecting-ip') || 'unknown';
    console.warn(`[checador-webhook] intento con x-api-key inválida — ip=${ip} hash_prefix=${apiKeyHash.slice(0, 8)} ts=${new Date().toISOString()}`);
    return json({ error: 'API key inválida o inactiva' }, 401);
  }

  const { data: trabajador } = await supabase
    .from('trabajadores')
    .select('id, nombre')
    .eq('empresa_id', integracion.empresa_id)
    .eq('estado', 'activo')
    .eq('codigo_checador', codigo_checador)
    .maybeSingle();

  if (!trabajador) return json({ error: 'codigo_checador no reconocido para esta empresa' }, 404);

  // M-11: el ts lo declara el dispositivo remoto — sin acotar su rango, una
  // key comprometida podría fabricar asistencia con fecha pasada/futura
  // arbitraria (backdating). Se tolera solo una ventana razonable respecto
  // al reloj del servidor para absorber latencia de red/clock drift normal.
  const MAX_SKEW_MS = 5 * 60 * 1000; // 5 minutos
  let pTs: string;
  if (ts) {
    const parsedTs = Date.parse(ts);
    if (isNaN(parsedTs)) return json({ error: 'ts inválido' }, 400);
    if (Math.abs(Date.now() - parsedTs) > MAX_SKEW_MS) {
      return json({ error: 'ts fuera de rango permitido (máx. 5 minutos de diferencia con el servidor). Verifica la hora del dispositivo.' }, 400);
    }
    pTs = new Date(parsedTs).toISOString();
  } else {
    pTs = new Date().toISOString();
  }

  const { data: resultado, error } = await supabase.rpc('registrar_checada', {
    p_empresa_id:    integracion.empresa_id,
    p_trabajador_id: trabajador.id,
    p_sucursal_id:   null,
    p_ts:            pTs,
    p_origen:        'checador_fisico',
    p_dispositivo:   dispositivo || null,
  });

  // Mismo criterio que checador-kiosco: mensaje genérico al cliente (aquí un
  // agente local de un tercero), detalle completo solo en el log del servidor.
  if (error) {
    console.error('checador-webhook: registrar_checada falló:', error.code, error.message);
    return json({ error: 'No se pudo registrar el checado.' }, 500);
  }

  await supabase
    .from('integraciones_checador')
    .update({ ultima_conexion: new Date().toISOString() })
    .eq('id', integracion.id);

  const fila = Array.isArray(resultado) ? resultado[0] : resultado;

  return json({
    ok: true,
    trabajador_nombre: trabajador.nombre,
    tipo: fila?.tipo,
    hora: fila?.hora,
    festivo_desc: fila?.festivo_desc ?? null,
  });
});
