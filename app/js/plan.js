/**
 * Capital Humano MX — Planes de suscripción (frontend)
 *
 * Carga CTX.plan vía RPC get_plan_actual (migración 21) y aplica los gates
 * de UI: candados en el menú, vistas bloqueadas, banner de trial/solo lectura
 * y modal comparativo de planes.
 *
 * IMPORTANTE: estos gates son solo experiencia de usuario. El enforcement
 * real vive en Postgres (triggers PLAN_*) y en la edge function agente-ia.
 *
 * Degradación elegante: si el RPC no existe aún (migración 21 sin aplicar),
 * CTX.plan queda en null y todo se comporta como antes (sin restricciones
 * visuales) — el backend tampoco tendría triggers en ese caso.
 */

// Ruta del router (app.js) → llave de features del plan
const ROUTE_FEATURE = {
  contratos:     'contratos',
  nomina:        'nomina',
  asistencia:    'asistencia',
  checador:      'checador',
  imss:          'imss',
  vacaciones:    'vacaciones',
  incapacidades: 'incapacidades',
  aguinaldo:     'aguinaldo',
  ptu:           'ptu',
  organigrama:   'organigrama',
  reportes:      'reportes',
};

const PLAN_NOMBRES = { free: 'Gratis', pyme: 'Pyme', full: 'Full', despacho: 'Despacho', legacy: 'Cliente fundador' };
const PLAN_CONTACTO = 'oscar_ius@outlook.com'; // CTA fase 1 (activación manual); fase 2: Mercado Pago

// ─── Carga y helpers ──────────────────────────────────────────────────────────

async function cargarPlan() {
  const { data, error } = await _sb().rpc('get_plan_actual');
  if (error) {
    console.warn('get_plan_actual no disponible (¿migración 21 sin aplicar?):', error.message);
    CTX.plan = null;
    return;
  }
  CTX.plan = data; // { plan, estado, trial_ends_at, dias_trial_restantes, limites, features }
}

function puedeUsar(feature) {
  if (!CTX?.plan) return true;               // sin info de plan → no restringir (cosmético)
  return CTX.plan.features?.[feature] === true;
}

function esSoloLectura() {
  return CTX?.plan?.estado === 'read_only';
}

/** Límite numérico del recurso ('trabajadores'|'sucursales'|'empresas'). null = ilimitado. */
function limiteDe(recurso) {
  const v = CTX?.plan?.limites?.[recurso];
  return (v === undefined || v === null) ? null : v;
}

function nombrePlanActual() {
  return PLAN_NOMBRES[CTX?.plan?.plan] || CTX?.plan?.plan || '—';
}

/** ¿El error viene de un trigger de plan del backend? */
function esErrorDePlan(e) {
  return /PLAN_(SOLO_LECTURA|LIMITE_\w+|FEATURE_\w+)/.test(e?.message || String(e || ''));
}

/** Mensaje amigable a partir del error del trigger (quita el prefijo PLAN_X:). */
function mensajeErrorPlan(e) {
  const msg = e?.message || String(e || '');
  const m = msg.match(/PLAN_[A-Z_]+:\s*(.+)/);
  return m ? m[1] : 'Esta acción no está incluida en tu plan actual.';
}

// ─── Gates de UI ──────────────────────────────────────────────────────────────

function aplicarGatesUI() {
  _injectPlanCSS();
  if (!CTX?.plan) return;

  // Candados en el menú (se dejan visibles: al hacer clic se muestra la vista
  // bloqueada con CTA — mejor conversión que ocultar)
  document.querySelectorAll('.nav-item[data-route]').forEach(el => {
    const feat = ROUTE_FEATURE[el.dataset.route];
    if (feat && !puedeUsar(feat) && !el.querySelector('.nav-lock')) {
      el.classList.add('nav-locked');
      el.insertAdjacentHTML('beforeend', '<span class="nav-lock">🔒</span>');
    }
  });

  // Agente IA: se oculta si el plan no lo incluye (el gate real es la edge function)
  const navAgente = document.getElementById('nav-agente');
  if (navAgente && !puedeUsar('agente_ia')) navAgente.style.display = 'none';

  // Modo solo lectura: apaga botones de acción (cosmético; los triggers son el candado)
  if (esSoloLectura()) document.body.classList.add('solo-lectura');
}

function renderBannerPlan() {
  if (!CTX?.plan) return;
  const old = document.getElementById('plan-banner');
  if (old) old.remove();

  let html = '';
  if (esSoloLectura()) {
    html = `<div id="plan-banner" class="plan-banner plan-banner-error">
      🔒 Tu cuenta está en <b>modo solo lectura</b> — tu periodo de prueba terminó o tu
      suscripción está inactiva. Tus datos están a salvo.
      <button class="plan-banner-cta" onclick="showModalPlanes('reactivar')">Activar un plan</button>
    </div>`;
  } else if (CTX.plan.estado === 'trialing') {
    if (sessionStorage.getItem('_plan_banner_ok')) return;
    const dias = CTX.plan.dias_trial_restantes;
    html = `<div id="plan-banner" class="plan-banner plan-banner-warn">
      🕐 Periodo de prueba: ${dias === 1 ? 'queda 1 día' : `quedan ${dias} días`}.
      <button class="plan-banner-cta" onclick="showModalPlanes('trial')">Ver planes</button>
      <button class="plan-banner-x" onclick="this.parentNode.remove();sessionStorage.setItem('_plan_banner_ok','1')" title="Ocultar">×</button>
    </div>`;
  }
  if (html) document.body.insertAdjacentHTML('beforeend', html);
}

/** Vista completa bloqueada (la usa el gate central del router en app.js). */
function htmlVistaBloqueada(feature) {
  const planNecesario = feature === 'agente_ia' ? 'Full o Despacho' : 'Pyme o superior';
  return `<div class="empty-state" style="padding:60px 20px;text-align:center;">
    <div class="empty-state-icon" style="font-size:2.6rem;">🔒</div>
    <h3 style="margin:12px 0 6px;color:var(--text-primary);font-family:var(--font-serif);">Función no incluida en tu plan</h3>
    <p style="color:var(--text-muted);max-width:420px;margin:0 auto 18px;">
      Esta sección está disponible en el plan <b>${planNecesario}</b>.
      Tu plan actual es <b>${nombrePlanActual()}</b>.
    </p>
    <button class="plan-cta-btn" onclick="showModalPlanes('${feature}')">Ver planes y precios</button>
  </div>`;
}

// ─── Modal de planes ──────────────────────────────────────────────────────────

async function showModalPlanes(motivo) {
  let wrap = document.getElementById('modal-planes');
  if (wrap) wrap.remove();

  const { data: planes, error } = await _sb()
    .from('planes').select('*').eq('publico', true).order('orden');
  const lista = (error || !planes) ? [] : planes;

  const fmtLim = v => (v === null || v === undefined) ? 'Ilimitados' : v;
  const fmtPrecio = p => (p === null || p === undefined)
    ? '<span style="font-size:.8rem;color:var(--text-muted);">Consultar precio</span>'
    : (Number(p) === 0 ? 'Gratis' : `$${Number(p).toLocaleString('es-MX')} <span style="font-size:.72rem;">MXN/mes</span>`);

  const cards = lista.map(p => {
    const actual = CTX?.plan?.plan === p.codigo;
    const f = p.features || {};
    return `<div class="plan-card${actual ? ' plan-card-actual' : ''}">
      ${actual ? '<div class="plan-card-badge">Tu plan</div>' : ''}
      <div class="plan-card-nombre">${p.nombre}</div>
      <div class="plan-card-precio">${fmtPrecio(p.precio_mensual)}</div>
      <ul class="plan-card-feats">
        <li>👥 Trabajadores: <b>${fmtLim(p.max_trabajadores)}</b></li>
        <li>🏢 Sucursales: <b>${fmtLim(p.max_sucursales)}</b></li>
        <li>🏛️ Empresas: <b>${p.max_empresas}</b></li>
        <li>${f.contratos ? '✅' : '➖'} Contratos</li>
        <li>${f.nomina ? '✅' : '➖'} Nómina (ISR/IMSS)</li>
        <li>${f.asistencia ? '✅' : '➖'} Asistencia y checador</li>
        <li>${f.agente_ia ? '✅' : '➖'} Agente IA</li>
        <li>✅ Actas administrativas y bajas</li>
      </ul>
      ${p.trial_dias ? `<div style="font-size:.75rem;color:var(--text-muted);">Prueba de ${p.trial_dias} días</div>` : ''}
    </div>`;
  }).join('');

  document.body.insertAdjacentHTML('beforeend', `
    <div id="modal-planes" class="plan-modal-overlay" onclick="if(event.target===this)this.remove()">
      <div class="plan-modal">
        <div class="plan-modal-head">
          <h2 style="margin:0;font-family:var(--font-serif);font-size:1.15rem;">Planes de Capital Humano MX</h2>
          <button onclick="document.getElementById('modal-planes').remove()"
            style="background:none;border:none;color:var(--text-muted);font-size:1.4rem;cursor:pointer;">×</button>
        </div>
        <div class="plan-modal-cards">${cards || '<p style="color:var(--text-muted);">No se pudo cargar el catálogo de planes.</p>'}</div>
        <div class="plan-modal-foot">
          Para contratar o cambiar de plan escríbenos a
          <a href="mailto:${PLAN_CONTACTO}?subject=Quiero activar un plan de Capital Humano MX" style="color:var(--accent);">${PLAN_CONTACTO}</a>
          — activamos tu cuenta el mismo día (transferencia/SPEI).
        </div>
      </div>
    </div>`);
}

// ─── CSS inyectado (evita tocar la hoja de estilos global) ────────────────────

function _injectPlanCSS() {
  if (document.getElementById('plan-css')) return;
  const css = `
  .nav-locked { opacity:.62; }
  .nav-lock { margin-left:auto; font-size:.68rem; }
  .plan-banner { position:fixed; top:10px; left:50%; transform:translateX(-50%); z-index:800;
    padding:8px 16px; border-radius:8px; font-size:.82rem; display:flex; align-items:center; gap:10px;
    box-shadow:0 4px 18px rgba(0,0,0,.25); max-width:92vw; }
  .plan-banner-warn  { background:#3a3320; border:1px solid rgba(243,156,18,.55); color:#f5d489; }
  .plan-banner-error { background:#3a2020; border:1px solid rgba(231,76,60,.55);  color:#f2b0a8; }
  .plan-banner-cta { background:var(--accent, #c9a34e); color:#1a2230; border:none; border-radius:6px;
    padding:4px 12px; font-size:.78rem; font-weight:600; cursor:pointer; }
  .plan-banner-x { background:none; border:none; color:inherit; font-size:1.1rem; cursor:pointer; line-height:1; }
  .plan-cta-btn { background:var(--accent, #c9a34e); color:#1a2230; border:none; border-radius:8px;
    padding:9px 22px; font-weight:600; cursor:pointer; font-size:.88rem; }
  body.solo-lectura #main-view .btn-primary,
  body.solo-lectura #main-view .btn-danger,
  body.solo-lectura #modal-container .btn-primary,
  body.solo-lectura #modal-container .btn-danger { opacity:.45; pointer-events:none; }
  .plan-modal-overlay { position:fixed; inset:0; z-index:900; background:rgba(15,25,35,.6);
    backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; padding:18px; }
  .plan-modal { background:var(--bg-card, #1c2634); border:1px solid var(--border, #2c3a4d);
    border-radius:14px; max-width:980px; width:100%; max-height:90vh; overflow-y:auto; padding:20px 24px; }
  .plan-modal-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
  .plan-modal-cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:14px; }
  .plan-card { border:1px solid var(--border, #2c3a4d); border-radius:10px; padding:16px; position:relative; }
  .plan-card-actual { border-color:var(--accent, #c9a34e); }
  .plan-card-badge { position:absolute; top:-9px; right:12px; background:var(--accent, #c9a34e);
    color:#1a2230; font-size:.66rem; font-weight:700; border-radius:10px; padding:2px 9px; }
  .plan-card-nombre { font-family:var(--font-serif, serif); font-weight:600; font-size:1rem; margin-bottom:4px; }
  .plan-card-precio { font-size:1.05rem; font-weight:700; color:var(--accent, #c9a34e); margin-bottom:10px; }
  .plan-card-feats { list-style:none; margin:0 0 10px; padding:0; font-size:.78rem;
    display:flex; flex-direction:column; gap:5px; color:var(--text-secondary, #b8c2cf); }
  .plan-modal-foot { margin-top:16px; font-size:.8rem; color:var(--text-muted, #8494a7);
    border-top:1px solid var(--border, #2c3a4d); padding-top:12px; }`;
  const style = document.createElement('style');
  style.id = 'plan-css';
  style.textContent = css;
  document.head.appendChild(style);
}
