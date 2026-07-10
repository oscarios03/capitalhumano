/**
 * Agente puente de ejemplo — checador ZKTeco → Capital Humano MX
 *
 * PLANTILLA DE REFERENCIA, no probada contra hardware real en este entorno.
 * Adaptar según el modelo exacto del equipo y su configuración de red.
 *
 * Requiere:  npm install node-zklib node-fetch
 * Variables: CHECADOR_IP, API_KEY, [SUPABASE_URL], [POLL_MS]
 *
 * Cada `codigo_checador` en Capital Humano MX debe coincidir con el "userId"
 * dado de alta en el checador (ver docs/checador-fisico-integracion.md).
 */

const ZKLib = require('node-zklib');
const fetch = require('node-fetch');

const CHECADOR_IP  = process.env.CHECADOR_IP;
const API_KEY      = process.env.API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xqbzxkujooarntawzsoc.supabase.co';
const WEBHOOK_URL  = `${SUPABASE_URL}/functions/v1/checador-webhook`;
const POLL_MS      = parseInt(process.env.POLL_MS || '30000', 10);

if (!CHECADOR_IP || !API_KEY) {
  console.error('Faltan variables de entorno: CHECADOR_IP, API_KEY');
  process.exit(1);
}

let ultimoTimestampEnviado = new Date(0);

async function enviarPulso(codigoChecador, ts) {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify({ codigo_checador: String(codigoChecador), ts: ts.toISOString(), dispositivo: CHECADOR_IP }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    console.warn(`[checador] error para userId=${codigoChecador}:`, data.error);
    return;
  }
  console.log(`[checador] ${data.trabajador_nombre} — ${data.tipo} ${data.hora}`);
}

async function ciclo() {
  const zk = new ZKLib(CHECADOR_IP, 4370, 10000, 4000);
  try {
    await zk.createSocket();
    const { data: registros } = await zk.getAttendances();

    const nuevos = registros
      .filter(r => new Date(r.recordTime) > ultimoTimestampEnviado)
      .sort((a, b) => new Date(a.recordTime) - new Date(b.recordTime));

    for (const r of nuevos) {
      await enviarPulso(r.userSn ?? r.deviceUserId, new Date(r.recordTime));
    }

    if (nuevos.length) {
      ultimoTimestampEnviado = new Date(nuevos[nuevos.length - 1].recordTime);
    }
  } catch (err) {
    console.error('[checador] error de conexión con el equipo:', err.message);
  } finally {
    try { await zk.disconnect(); } catch {}
  }
}

console.log(`Agente de checador iniciado — sondeando ${CHECADOR_IP} cada ${POLL_MS / 1000}s`);
ciclo();
setInterval(ciclo, POLL_MS);
