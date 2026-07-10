/**
 * Capital Humano MX — Pantalla de Kiosco (checado de entrada/salida)
 * Página standalone, sin login. Protegida por el kiosco_token en la URL (?t=).
 * Depende de: config.js (SUPABASE_URL, SUPABASE_ANON_KEY)
 */

let _K = { tab: 'pin', pin: '', token: null, qrScanner: null, busy: false };

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  _K.token = params.get('t');
  setInterval(_tickReloj, 1000);
  _tickReloj();

  if (!_K.token) {
    eid('kiosk-content').innerHTML = `
      <div class="kiosk-result err">
        <div class="kiosk-result-icon">⚠️</div>
        <div class="kiosk-result-name">Enlace inválido</div>
        <div class="kiosk-result-detail">Genera el enlace del kiosco desde el módulo "Reloj Checador" de la app.</div>
      </div>`;
    return;
  }
  _renderIdle();
});

const eid = id => document.getElementById(id);

function _tickReloj() {
  const ahora = new Date();
  eid('kiosk-clock').textContent = ahora.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  eid('kiosk-date').textContent = ahora.toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' });
}

// ═══════════════════════════════════════════════════════
//  IDLE — tabs PIN / QR
// ═══════════════════════════════════════════════════════
function _renderIdle() {
  _pararScannerQr();
  _K.pin = '';
  eid('kiosk-content').innerHTML = `
    <div class="kiosk-tabs">
      <button class="kiosk-tab ${_K.tab==='pin'?'active':''}" onclick="_kioskSwitchTab(event,'pin')">🔢 PIN</button>
      <button class="kiosk-tab ${_K.tab==='qr'?'active':''}" onclick="_kioskSwitchTab(event,'qr')">🪪 Gafete QR</button>
    </div>
    <div id="kiosk-tab-body"></div>
  `;
  _renderTabBody();
}

function _kioskSwitchTab(evt, tab) {
  _K.tab = tab;
  document.querySelectorAll('.kiosk-tab').forEach(b => b.classList.remove('active'));
  evt.target.classList.add('active');
  _renderTabBody();
}

function _renderTabBody() {
  if (_K.tab === 'pin') _renderPinPad();
  else _renderQrScanner();
}

function _renderPinPad() {
  _pararScannerQr();
  const body = eid('kiosk-tab-body');
  body.innerHTML = `
    <div class="kiosk-pin-display">${_K.pin.padEnd(4,'•').split('').map((c,i)=>i<_K.pin.length?'●':'•').join(' ')}</div>
    <div class="kiosk-keypad">
      ${[1,2,3,4,5,6,7,8,9].map(n=>`<button class="kiosk-key" onclick="_kioskDigito(${n})">${n}</button>`).join('')}
      <button class="kiosk-key" onclick="_kioskBorrar()">⌫</button>
      <button class="kiosk-key" onclick="_kioskDigito(0)">0</button>
      <div></div>
    </div>
  `;
}

function _kioskDigito(n) {
  if (_K.busy || _K.pin.length >= 4) return;
  _K.pin += String(n);
  _renderPinPad();
  if (_K.pin.length === 4) _kioskEnviar('pin', _K.pin);
}

function _kioskBorrar() {
  _K.pin = _K.pin.slice(0, -1);
  _renderPinPad();
}

function _renderQrScanner() {
  const body = eid('kiosk-tab-body');
  body.innerHTML = `<div id="kiosk-qr-reader"></div><p style="margin-top:12px;color:var(--text-secondary);">Acerca tu gafete a la cámara</p>`;
  _K.qrScanner = new Html5Qrcode('kiosk-qr-reader');
  _K.qrScanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: 220 },
    (codigo) => { if (!_K.busy) _kioskEnviar('qr', codigo); },
    () => {},
  ).catch(() => {
    body.innerHTML = `<p style="color:var(--red-warn);">No se pudo acceder a la cámara.</p>`;
  });
}

function _pararScannerQr() {
  if (_K.qrScanner) {
    _K.qrScanner.stop().catch(() => {});
    _K.qrScanner = null;
  }
}

// ═══════════════════════════════════════════════════════
//  ENVÍO Y RESULTADO
// ═══════════════════════════════════════════════════════
async function _kioskEnviar(tipo, valor) {
  _K.busy = true;
  _pararScannerQr();
  eid('kiosk-content').innerHTML = `<div class="loading"><div class="spinner"></div></div>`;

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/checador-kiosco`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ kiosco_token: _K.token, credencial_tipo: tipo, credencial_valor: valor }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo registrar el checado');
    _mostrarResultado(true, data);
  } catch (e) {
    _mostrarResultado(false, { error: e.message });
  }
}

function _mostrarResultado(ok, data) {
  const cls = ok ? 'ok' : 'err';
  const icono = ok ? (data.tipo === 'entrada' ? '✅' : '👋') : '❌';
  const titulo = ok ? data.trabajador_nombre : 'No se pudo registrar';
  const detalle = ok
    ? `${data.tipo === 'entrada' ? 'Entrada' : 'Salida'} registrada — ${data.hora}`
    : data.error;
  const festivoHTML = (ok && data.festivo_desc)
    ? `<div class="kiosk-result-detail" style="margin-top:6px;color:var(--gold-primary,#c9a227);">📅 Día festivo oficial: ${data.festivo_desc}</div>`
    : '';

  eid('kiosk-content').innerHTML = `
    <div class="kiosk-result ${cls}">
      <div class="kiosk-result-icon">${icono}</div>
      <div class="kiosk-result-name">${titulo}</div>
      <div class="kiosk-result-detail">${detalle}</div>
      ${festivoHTML}
    </div>
  `;
  setTimeout(() => { _K.busy = false; _renderIdle(); }, 3000);
}
