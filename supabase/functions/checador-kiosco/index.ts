/**
 * Edge Function: checador-kiosco
 * Registra un pulso de entrada/salida desde la pantalla de kiosco (app/kiosco.html).
 * No requiere sesión de usuario — el dispositivo está protegido por el
 * kiosco_token de la sucursal (único, regenerable desde el módulo Checador).
 *
 * Variables disponibles automáticamente en Supabase:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  let body: { kiosco_token?: string; credencial_tipo?: string; credencial_valor?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body JSON inválido' }, 400);
  }

  const { kiosco_token, credencial_tipo, credencial_valor } = body;
  if (!kiosco_token || !credencial_valor || !['pin', 'qr'].includes(credencial_tipo || '')) {
    return json({ error: 'Faltan datos (kiosco_token, credencial_tipo, credencial_valor)' }, 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: sucursal } = await supabase
    .from('sucursales')
    .select('id, empresa_id')
    .eq('kiosco_token', kiosco_token)
    .eq('activa', true)
    .maybeSingle();

  if (!sucursal) return json({ error: 'Kiosco no reconocido' }, 401);

  const columna = credencial_tipo === 'pin' ? 'pin_checador' : 'codigo_checador';
  const { data: trabajador } = await supabase
    .from('trabajadores')
    .select('id, nombre')
    .eq('empresa_id', sucursal.empresa_id)
    .eq('estado', 'activo')
    .eq(columna, credencial_valor)
    .maybeSingle();

  if (!trabajador) return json({ error: 'Credencial no reconocida' }, 404);

  const { data: resultado, error } = await supabase.rpc('registrar_checada', {
    p_empresa_id:    sucursal.empresa_id,
    p_trabajador_id: trabajador.id,
    p_sucursal_id:   sucursal.id,
    p_ts:            new Date().toISOString(),
    p_origen:        'kiosco',
    p_dispositivo:   null,
  });

  if (error) return json({ error: error.message }, 500);
  const fila = Array.isArray(resultado) ? resultado[0] : resultado;

  return json({
    ok: true,
    trabajador_nombre: trabajador.nombre,
    tipo: fila?.tipo,
    hora: fila?.hora,
    festivo_desc: fila?.festivo_desc ?? null,
  });
});
