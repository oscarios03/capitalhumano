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

// M-7: el proyecto todavía no tiene dominio de producción propio (2026-07),
// así que se acepta cualquier origen por ahora. En cuanto exista un dominio
// fijo, configurar el secret `ALLOWED_ORIGIN` (Supabase Dashboard → Edge
// Functions → Secrets) con ese dominio exacto (ej. https://app.midominio.mx)
// para restringir esta cabecera.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
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

  // Rate limit (A-4): el PIN es de solo 4 dígitos (9,000 combinaciones) y el
  // kiosco_token está pensado para difundirse (QR/URL en recepción), así que
  // sin este freno cualquiera con el token puede automatizar fuerza bruta
  // remota del PIN. Solo se cuentan intentos FALLIDOS — nunca se bloquean
  // los exitosos, para no frenar horas pico reales con varios trabajadores
  // checando casi al mismo tiempo.
  const VENTANA_SEGUNDOS      = 60;
  const MAX_INTENTOS_FALLIDOS = 8;
  const desde = new Date(Date.now() - VENTANA_SEGUNDOS * 1000).toISOString();
  const { count: fallidosRecientes } = await supabase
    .from('checador_intentos_fallidos')
    .select('id', { count: 'exact', head: true })
    .eq('kiosco_token', kiosco_token)
    .gte('creado_en', desde);

  if ((fallidosRecientes || 0) >= MAX_INTENTOS_FALLIDOS) {
    return json({ error: 'Demasiados intentos fallidos. Espera un minuto e inténtalo de nuevo.' }, 429);
  }

  const columna = credencial_tipo === 'pin' ? 'pin_checador' : 'codigo_checador';
  const { data: trabajador } = await supabase
    .from('trabajadores')
    .select('id, nombre')
    .eq('empresa_id', sucursal.empresa_id)
    .eq('estado', 'activo')
    .eq(columna, credencial_valor)
    .maybeSingle();

  if (!trabajador) {
    await supabase.from('checador_intentos_fallidos').insert({ kiosco_token });
    return json({ error: 'Credencial no reconocida' }, 404);
  }

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
