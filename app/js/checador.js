/**
 * Capital Humano MX — Módulo Reloj Checador
 * Depende de: app.js (CTX, eid, showModal, closeModal, showToast, db)
 * 2 tabs: Modo Kiosco | Checadores Físicos
 */

let _CHK = { tab: 1 };

// ═══════════════════════════════════════════════════════
//  PUNTO DE ENTRADA
// ═══════════════════════════════════════════════════════
async function renderChecador() {
  const main = eid('main-view');
  main.innerHTML = `
    <div class="view-header animate-in">
      <div>
        <div class="view-title">Reloj Checador</div>
        <div class="view-subtitle">${escapeHtml(CTX.empresa.nombre)}</div>
      </div>
    </div>
    <div class="tabs animate-in" style="margin-bottom:16px;">
      <button class="tab-btn ${_CHK.tab===1?'active':''}" onclick="switchChecadorTab(1)">Modo Kiosco</button>
      <button class="tab-btn ${_CHK.tab===2?'active':''}" onclick="switchChecadorTab(2)">Checadores Físicos</button>
    </div>
    <div id="chk-content" class="animate-in"></div>
  `;
  await _cargarTabChecador();
}

async function switchChecadorTab(tab) {
  _CHK.tab = tab;
  document.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', i+1===tab));
  await _cargarTabChecador();
}

async function _cargarTabChecador() {
  const el = eid('chk-content');
  el.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
  try {
    if (_CHK.tab === 1) await _tabKiosco();
    else await _tabIntegraciones();
  } catch (e) {
    el.innerHTML = _errorChecador(e);
  }
}

// Detecta el caso más común: la migración 13 no se ha aplicado todavía.
function _errorChecador(e) {
  const msg = e?.message || String(e);
  const faltaMigracion = /column .* does not exist|relation .* does not exist|pin_checador|codigo_checador|kiosco_token|integraciones_checador|checadas/i.test(msg);
  if (faltaMigracion) {
    return `
      <div class="alert alert-warn" style="margin-bottom:12px;"><svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg>
        <span><strong>Falta aplicar la migración de base de datos.</strong>
        Ejecuta <code>app/migrations/13_migration_checador.sql</code> en el
        SQL Editor de Supabase y recarga esta página.</span>
      </div>
      <div style="font-size:.75rem;color:var(--text-muted);">Detalle técnico: ${escapeHtml(msg)}</div>`;
  }
  return `<div class="alert alert-danger"><svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg><span>${escapeHtml(msg)}</span></div>`;
}

// ═══════════════════════════════════════════════════════
//  TAB 1 — MODO KIOSCO
// ═══════════════════════════════════════════════════════
async function _tabKiosco() {
  const el = eid('chk-content');
  const sucursales = await db.getSucursales(true);
  const { data: trabajadores, error: errTrab } = await window.supabase
    .from('trabajadores')
    .select('id,nombre,puesto,pin_checador,codigo_checador,sucursal_id')
    .eq('empresa_id', CTX.empresa.id).eq('estado','activo').order('nombre');
  if (errTrab) throw errTrab;

  el.innerHTML = `
    <div class="card" style="margin-bottom:24px;">
      <div class="card-header"><span class="card-title">Pantalla de kiosco por sucursal</span></div>
      <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:16px;">
        Abre el enlace de tu sucursal en una laptop o tablet fija de recepción.
        Cada trabajador checa entrada/salida él mismo con su PIN o su gafete QR.
      </p>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Sucursal</th><th>Enlace de kiosco</th><th></th></tr></thead>
          <tbody>
            ${sucursales.map(s => `
              <tr>
                <td>${escapeHtml(s.nombre)}${s.tipo==='matriz'?' <span class="badge">Matriz</span>':''}</td>
                <td>${s.kiosco_token
                  ? `<code style="font-size:.78rem;">${_urlKiosco(s.kiosco_token)}</code>`
                  : '<span style="color:var(--text-muted);">Sin generar</span>'}</td>
                <td style="white-space:nowrap;">
                  ${s.kiosco_token ? `<button class="btn-secondary btn-sm" onclick="_verQrKiosco('${s.id}','${s.kiosco_token}','${(s.nombre||'').replace(/'/g,"\\'")}')">Ver QR</button>` : ''}
                  <button class="btn-secondary btn-sm" onclick="_generarTokenKiosco('${s.id}')">${s.kiosco_token?'Regenerar':'Generar'}</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Credenciales de checado por trabajador</span></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Trabajador</th><th>Puesto</th><th>PIN</th><th>Código QR</th><th></th></tr></thead>
          <tbody>
            ${trabajadores.map(t => `
              <tr>
                <td>${escapeHtml(t.nombre)}</td>
                <td>${escapeHtml(t.puesto)||'—'}</td>
                <td>${t.pin_checador ? `<code>${t.pin_checador}</code>` : '<span style="color:var(--text-muted);">—</span>'}</td>
                <td>${t.codigo_checador ? 'Asignado' : '<span style="color:var(--text-muted);">—</span>'}</td>
                <td style="white-space:nowrap;">
                  <button class="btn-secondary btn-sm" onclick="_asignarPin('${t.id}')">${t.pin_checador?'PIN':'PIN'}</button>
                  <button class="btn-secondary btn-sm" onclick="_asignarQr('${t.id}','${(t.nombre||'').replace(/'/g,"\\'")}')">${t.codigo_checador?'Reimprimir gafete':'Generar gafete'}</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function _urlKiosco(token) {
  return `${window.location.origin}${window.location.pathname.replace(/app\.html$/,'')}kiosco.html?t=${token}`;
}

function _randomToken(len = 24) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint32Array(len))).map(n => chars[n % chars.length]).join('');
}

async function _generarTokenKiosco(sucursalId) {
  const token = _randomToken();
  await db.updateSucursal(sucursalId, { kiosco_token: token });
  showToast('Enlace de kiosco generado', 'success');
  await _cargarTabChecador();
}

function _verQrKiosco(sucursalId, token, nombreSucursal) {
  const url = _urlKiosco(token);
  showModal(`
    <div class="modal animate-in" style="max-width:380px;text-align:center;">
      <div class="modal-header">
        <div class="modal-title">Kiosco — ${nombreSucursal}</div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div id="qr-kiosco" style="margin:16px auto;width:220px;height:220px;"></div>
      <div style="word-break:break-all;font-size:.78rem;color:var(--text-muted);margin-bottom:16px;">${url}</div>
      <button class="btn-primary" onclick="window.open('${url}','_blank')">Abrir kiosco</button>
    </div>
  `);
  if (window.QRCode) new QRCode(eid('qr-kiosco'), { text: url, width: 220, height: 220 });
}

async function _asignarPin(trabId) {
  const pin = String(Math.floor(1000 + Math.random() * 9000));
  const { error } = await window.supabase.from('trabajadores').update({ pin_checador: pin }).eq('id', trabId);
  if (error) { showToast('No se pudo asignar el PIN (¿duplicado?)', 'error'); return; }
  showToast(`PIN asignado: ${pin}`, 'success');
  await _cargarTabChecador();
}

async function _asignarQr(trabId, nombre) {
  let { data: trab } = await window.supabase.from('trabajadores').select('codigo_checador').eq('id', trabId).single();
  let codigo = trab?.codigo_checador;
  if (!codigo) {
    codigo = _randomToken(16);
    const { error } = await window.supabase.from('trabajadores').update({ codigo_checador: codigo }).eq('id', trabId);
    if (error) { showToast('No se pudo generar el gafete', 'error'); return; }
  }
  showModal(`
    <div class="modal animate-in" style="max-width:340px;text-align:center;">
      <div class="modal-header">
        <div class="modal-title">Gafete — ${nombre}</div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div id="qr-gafete" style="margin:16px auto;width:200px;height:200px;"></div>
      <div style="font-weight:600;margin-bottom:16px;">${nombre}</div>
      <button class="btn-primary" onclick="window.print()">Imprimir</button>
    </div>
  `);
  if (window.QRCode) new QRCode(eid('qr-gafete'), { text: codigo, width: 200, height: 200 });
  await _cargarTabChecador();
}

// ═══════════════════════════════════════════════════════
//  TAB 2 — CHECADORES FÍSICOS (INTEGRACIONES)
// ═══════════════════════════════════════════════════════
async function _tabIntegraciones() {
  const el = eid('chk-content');
  const { data: integraciones, error: errInt } = await window.supabase
    .from('integraciones_checador').select('*')
    .eq('empresa_id', CTX.empresa.id).order('creado_en', { ascending: false });
  if (errInt) throw errInt;

  el.innerHTML = `
    <div class="card" style="margin-bottom:24px;">
      <div class="card-header">
        <span class="card-title">Checadores físicos conectados</span>
        <button class="btn-primary btn-sm" onclick="_crearApiKey()">Generar API key</button>
      </div>
      <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:16px;">
        Conecta tu reloj checador de huella/facial (ZKTeco, Anviz, Hikvision, etc.) mediante un pequeño
        agente que corre en una PC de tu oficina. La guía y un script de ejemplo están en
        <a href="../docs/checador-fisico-integracion.md" target="_blank">docs/checador-fisico-integracion.md</a>.
      </p>
      ${!(integraciones||[]).length ? `<div class="empty-state"><div class="empty-state-icon"><svg class="ic"><use href="#i-clock"></use></svg></div><p>Aún no has generado ninguna API key</p></div>` : `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Nombre</th><th>API Key</th><th>Estado</th><th>Última conexión</th><th></th></tr></thead>
          <tbody>
            ${integraciones.map(i => `
              <tr>
                <td>${escapeHtml(i.nombre)}</td>
                <td><code>${i.api_key_prefix}••••••••</code></td>
                <td>${i.activo ? '<span class="badge badge-activo">Activo</span>' : '<span class="badge badge-baja">Inactivo</span>'}</td>
                <td>${i.ultima_conexion ? new Date(i.ultima_conexion).toLocaleString('es-MX') : 'Nunca'}</td>
                <td><button class="btn-secondary btn-sm" onclick="_toggleIntegracion('${i.id}',${!i.activo})">${i.activo?'Desactivar':'Activar'}</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`}
    </div>
  `;
}

async function _sha256Hex(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function _crearApiKey() {
  const nombre = prompt('Nombre para identificar este checador (ej. "Checador recepción"):');
  if (!nombre) return;
  const rawKey = `chk_live_${_randomToken(32)}`;
  const hash = await _sha256Hex(rawKey);
  const prefix = rawKey.slice(0, 12);

  const { error } = await window.supabase.from('integraciones_checador').insert({
    empresa_id: CTX.empresa.id, nombre, api_key_hash: hash, api_key_prefix: prefix, activo: true,
  });
  if (error) { showToast('No se pudo crear la API key', 'error'); return; }

  showModal(`
    <div class="modal animate-in" style="max-width:460px;">
      <div class="modal-header">
        <div class="modal-title">API Key generada</div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div class="alert alert-warn" style="margin-bottom:14px;"><svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg><span>Guárdala ahora — no volverá a mostrarse completa.</span>
      </div>
      <div style="background:var(--bg-surface);padding:12px;border-radius:8px;word-break:break-all;font-family:monospace;margin-bottom:14px;">
        ${rawKey}
      </div>
      <button class="btn-primary" onclick="navigator.clipboard.writeText('${rawKey}');showToast('Copiada','success')">Copiar</button>
    </div>
  `);
  await _cargarTabChecador();
}

async function _toggleIntegracion(id, activo) {
  await window.supabase.from('integraciones_checador').update({ activo }).eq('id', id);
  await _cargarTabChecador();
}
