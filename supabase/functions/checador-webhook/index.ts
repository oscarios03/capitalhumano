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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
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

  if (!integracion || !integracion.activo) return json({ error: 'API key inválida o inactiva' }, 401);

  const { data: trabajador } = await supabase
    .from('trabajadores')
    .select('id, nombre')
    .eq('empresa_id', integracion.empresa_id)
    .eq('estado', 'activo')
    .eq('codigo_checador', codigo_checador)
    .maybeSingle();

  if (!trabajador) return json({ error: 'codigo_checador no reconocido para esta empresa' }, 404);

  const pTs = ts && !isNaN(Date.parse(ts)) ? ts : new Date().toISOString();

  const { data: resultado, error } = await supabase.rpc('registrar_checada', {
    p_empresa_id:    integracion.empresa_id,
    p_trabajador_id: trabajador.id,
    p_sucursal_id:   null,
    p_ts:            pTs,
    p_origen:        'checador_fisico',
    p_dispositivo:   dispositivo || null,
  });

  if (error) return json({ error: error.message }, 500);

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
