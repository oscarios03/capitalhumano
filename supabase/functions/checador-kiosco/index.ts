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

/** SHA-256 hex. La credencial tecleada NUNCA se guarda en claro. */
async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
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

  // Validación de tipo, formato y longitud (Fase 3 de la auditoría). Este es un
  // endpoint público: nada de lo que llegue en el body puede darse por bueno.
  // Los valores se acotan ANTES de tocar la base para no permitir que alguien
  // mande cadenas enormes y convierta cada intento fallido en una fila gigante.
  if (typeof kiosco_token !== 'string' || !/^[A-Za-z0-9]{16,64}$/.test(kiosco_token)) {
    return json({ error: 'Kiosco no reconocido' }, 401);
  }
  if (typeof credencial_valor !== 'string') {
    return json({ error: 'Credencial inválida' }, 400);
  }
  const formatoOk = credencial_tipo === 'pin'
    ? /^[0-9]{4,8}$/.test(credencial_valor)        // PIN numérico
    : /^[A-Za-z0-9._-]{8,128}$/.test(credencial_valor); // código de gafete QR
  if (!formatoOk) {
    return json({ error: 'Credencial no reconocida' }, 404);
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

  // ── Rate limit (A-4, revisado en la auditoría 2026-07) ───────────────────
  // El PIN es de 4 dígitos (9,000 combinaciones) y el kiosco_token está
  // pensado para difundirse (QR pegado en recepción), así que sin freno
  // cualquiera con el token puede automatizar fuerza bruta remota.
  //
  // El freno anterior contaba SOLO por kiosco_token: 8 fallos en 60 s
  // bloqueaban a TODA la sucursal. Eso convertía el candado en un botón de
  // denegación de servicio — cualquiera que viera el QR podía dejar sin
  // checar a la plantilla entera — y además un cambio de turno con varios
  // trabajadores equivocándose lo disparaba sin que hubiera ataque.
  //
  // Ahora el freno principal es por CREDENCIAL (un PIN bloqueado no afecta a
  // los demás trabajadores), con un tope por IP contra el barrido
  // automatizado y un tope por sucursal muy holgado como última red.
  // Solo se cuentan intentos FALLIDOS; los exitosos nunca bloquean.
  const credencialHash = await sha256Hex(`${kiosco_token}:${credencial_valor}`);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || req.headers.get('cf-connecting-ip') || 'desconocida';

  const MAX_POR_CREDENCIAL = 5;    // en 15 min — acota el adivinar UN PIN
  const MAX_POR_IP         = 30;   // en 15 min — acota el barrido de muchos
  const MAX_POR_SUCURSAL   = 100;  // en 15 min — solo ante abuso masivo
  const desde15 = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const [porCredencial, porIp, porSucursal] = await Promise.all([
    supabase.from('checador_intentos_fallidos').select('id', { count: 'exact', head: true })
      .eq('kiosco_token', kiosco_token).eq('credencial_hash', credencialHash).gte('creado_en', desde15),
    supabase.from('checador_intentos_fallidos').select('id', { count: 'exact', head: true })
      .eq('ip', ip).gte('creado_en', desde15),
    supabase.from('checador_intentos_fallidos').select('id', { count: 'exact', head: true })
      .eq('kiosco_token', kiosco_token).gte('creado_en', desde15),
  ]);

  if ((porCredencial.count || 0) >= MAX_POR_CREDENCIAL
      || (porIp.count || 0) >= MAX_POR_IP
      || (porSucursal.count || 0) >= MAX_POR_SUCURSAL) {
    // Mensaje idéntico en los tres casos: decirle al atacante CUÁL límite
    // alcanzó le dice cómo evadirlo.
    return json({ error: 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo, o acude con Recursos Humanos.' }, 429);
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
    // Se guarda el HASH, nunca la credencial tecleada: esta tabla es un
    // registro de intentos fallidos, no un almacén de PINes.
    await supabase.from('checador_intentos_fallidos')
      .insert({ kiosco_token, credencial_hash: credencialHash, ip });
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

  // No devolver `error.message` crudo: este endpoint es PÚBLICO (sin sesión) y
  // el mensaje de Postgres filtra nombres de tablas, columnas y constraints a
  // cualquiera que tenga el enlace del kiosco. El detalle va al log.
  if (error) {
    console.error('checador-kiosco: registrar_checada falló:', error.code, error.message);
    return json({ error: 'No se pudo registrar el checado. Avisa a Recursos Humanos.' }, 500);
  }
  const fila = Array.isArray(resultado) ? resultado[0] : resultado;

  return json({
    ok: true,
    trabajador_nombre: trabajador.nombre,
    tipo: fila?.tipo,
    hora: fila?.hora,
    festivo_desc: fila?.festivo_desc ?? null,
  });
});
