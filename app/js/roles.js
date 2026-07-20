/**
 * Capital Humano MX — Roles y permisos (frontend)
 *
 * Cuatro roles (migración 33): admin, gerente, capturista, consulta.
 *
 * IMPORTANTE: igual que en plan.js, estos gates son solo experiencia de
 * usuario. El enforcement REAL vive en las políticas RLS de Postgres: un
 * usuario técnico puede llamar a PostgREST directo con su JWT y ahí es donde
 * se le detiene. Esta capa existe para que la UI no ofrezca botones que van
 * a fallar.
 *
 * Depende de: auth.js (CTX.rol), app.js (CTX, eid, showModal, showToast)
 */

const ROL_NOMBRES = {
  admin:      'Administrador',
  gerente:    'Gerente',
  capturista: 'Capturista',
  consulta:   'Solo consulta',
};

const ROL_DESCRIPCIONES = {
  admin:      'Acceso total: nómina, datos de la empresa y gestión de usuarios.',
  gerente:    'Opera todo (nómina, altas, bajas, actas) y aprueba vacaciones. No toca la configuración de la empresa ni los usuarios.',
  capturista: 'Captura asistencia y registra solicitudes de vacaciones. Puede limitarse a una sola sucursal. Lo demás lo ve, pero no lo edita.',
  consulta:   'Solo lectura de todo. Ideal para tu contador o, en un despacho, para el cliente.',
};

// Rutas que solo ven ciertos roles. Las no listadas las ve cualquiera
// (con escritura gobernada por RLS).
const ROUTE_ROLES = {
  nomina:       ['admin', 'gerente'],
  bajas:        ['admin', 'gerente'],
  imss:         ['admin', 'gerente'],
  ptu:          ['admin', 'gerente'],
  aguinaldo:    ['admin', 'gerente'],
  disciplinario:['admin', 'gerente'],
  empresa:      ['admin'],
  checador:     ['admin'],   // contiene llaves de API de integraciones
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rolActual()      { return CTX?.rol || 'admin'; }
function nombreRolActual(){ return ROL_NOMBRES[rolActual()] || rolActual(); }
function esAdmin()        { return rolActual() === 'admin'; }
function puedeGestionar() { return ['admin', 'gerente'].includes(rolActual()); }
function esSoloConsulta() { return rolActual() === 'consulta'; }

/** ¿El rol actual puede entrar a esta ruta? */
function puedeVerRuta(ruta) {
  const permitidos = ROUTE_ROLES[ruta];
  return !permitidos || permitidos.includes(rolActual());
}

/** ¿El error viene de una política RLS (y no de un bug)? */
function esErrorDePermisos(e) {
  const msg = e?.message || String(e || '');
  return e?.code === '42501'
      || /row-level security|violates row-level security|permission denied|ROL_NO_AUTORIZADO|No puedes cambiar/i.test(msg);
}

/** Mensaje humano para un error de permisos. */
function mensajeErrorPermisos(e) {
  const msg = e?.message || String(e || '');
  const m = msg.match(/ROL_[A-Z_]+:\s*(.+)/);
  if (m) return m[1];
  return `Tu rol (${nombreRolActual()}) no tiene permiso para hacer esto. Pídele a un administrador que lo haga o que te cambie el rol.`;
}

// ─── Gates de UI ─────────────────────────────────────────────────────────────

function aplicarGatesRol() {
  _injectRolCSS();
  if (!CTX?.rol) return;

  // Candado en el menú para las rutas que su rol no alcanza
  document.querySelectorAll('.nav-item[data-route]').forEach(el => {
    const ruta = el.dataset.route;
    if (!puedeVerRuta(ruta) && !el.querySelector('.nav-rol-lock')) {
      el.classList.add('nav-locked');
      el.insertAdjacentHTML('beforeend', '<span class="nav-rol-lock" title="No disponible para tu rol"></span>');
    }
  });

  // Solo consulta: apagar los botones de acción (cosmético)
  if (esSoloConsulta()) document.body.classList.add('rol-consulta');

  // Mostrar el rol junto al usuario en la topbar
  const userEl = document.getElementById('topbar-user');
  if (userEl && !document.getElementById('topbar-rol')) {
    userEl.insertAdjacentHTML('afterend',
      `<span id="topbar-rol" class="topbar-rol" title="${ROL_DESCRIPCIONES[rolActual()] || ''}">${nombreRolActual()}</span>`);
  }
}

/** Vista completa bloqueada por rol (la usa el router de app.js). */
function htmlRutaBloqueadaPorRol(ruta) {
  const permitidos = (ROUTE_ROLES[ruta] || []).map(r => ROL_NOMBRES[r]).join(' o ');
  return `<div class="empty-state" style="padding:60px 20px;text-align:center;">
    <div class="empty-state-icon"><svg class="ic" style="width:38px;height:38px;"><use href="#i-lock"></use></svg></div>
    <h3 style="margin:12px 0 6px;color:var(--text-primary);font-family:var(--font-serif);">Esta sección no está disponible para tu rol</h3>
    <p style="color:var(--text-muted);max-width:440px;margin:0 auto 18px;">
      Tu rol es <b>${nombreRolActual()}</b>. Esta sección la pueden ver los roles <b>${permitidos}</b>.
      Si necesitas entrar, pídele a un administrador de tu empresa que te cambie el rol.
    </p>
  </div>`;
}

function _injectRolCSS() {
  if (document.getElementById('rol-css')) return;
  const style = document.createElement('style');
  style.id = 'rol-css';
  style.textContent = `
  .nav-rol-lock { margin-left:auto; font-size:.68rem; }
  .topbar-rol { font-size:.7rem; font-weight:700; text-transform:uppercase; letter-spacing:.04em;
    background:var(--gold-dim, var(--gold-dim)); color:var(--accent, #c9a34e);
    border:1px solid var(--gold-border, var(--gold-dim)); border-radius:100px;
    padding:2px 9px; margin-right:8px; white-space:nowrap; }
  body.rol-consulta #main-view .btn-primary,
  body.rol-consulta #main-view .btn-danger,
  body.rol-consulta #modal-container .btn-primary,
  body.rol-consulta #modal-container .btn-danger { opacity:.45; pointer-events:none; }
  .rol-badge { font-size:.7rem; font-weight:700; border-radius:100px; padding:2px 9px;
    border:1px solid var(--border); color:var(--text-secondary); white-space:nowrap; }
  .rol-badge-admin      { border-color:var(--gold-dim); color:var(--gold-primary, #c9a34e); }
  .rol-badge-gerente    { border-color:rgba(21,128,61,.4);  color:#5fd08a; }
  .rol-badge-capturista { border-color:rgba(44,111,176,.4);  color:#6ab0e8; }
  .rol-badge-consulta   { border-color:var(--border);        color:var(--text-muted); }`;
  document.head.appendChild(style);
}

function badgeRol(rol) {
  return `<span class="rol-badge rol-badge-${rol}">${ROL_NOMBRES[rol] || rol}</span>`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  PANTALLA: USUARIOS Y PERMISOS  (dentro de Mi Empresa, solo admin)
// ═══════════════════════════════════════════════════════════════════════════

let _USR = { usuarios: [], invitaciones: [], sucursales: [] };

async function renderTabUsuarios() {
  const c = document.getElementById('emp-tab-usuarios');
  if (!c) return;

  if (!esAdmin()) {
    c.innerHTML = `<div class="card"><div class="empty-state" style="padding:40px 20px;">
      <div class="empty-state-icon"><svg class="ic"><use href="#i-lock"></use></svg></div>
      <div class="empty-state-title">Solo un administrador puede gestionar usuarios</div>
    </div></div>`;
    return;
  }

  c.innerHTML = `<div class="loading"><div class="spinner"></div> Cargando usuarios…</div>`;

  try {
    const [usuarios, invitaciones, sucursales] = await Promise.all([
      window.supabase.rpc('listar_usuarios_empresa'),
      window.supabase.from('invitaciones').select('*, sucursales(nombre)')
        .eq('empresa_id', CTX.empresa.id).eq('usada', false)
        .order('creada_en', { ascending: false }),
      db.getSucursales(true),
    ]);
    if (usuarios.error) throw usuarios.error;
    _USR.usuarios     = usuarios.data || [];
    _USR.invitaciones = (invitaciones.data || []).filter(i => new Date(i.expira_en) > new Date());
    _USR.sucursales   = sucursales || [];
  } catch(e) {
    if (/listar_usuarios_empresa|invitaciones/i.test(e.message || '')) {
      c.innerHTML = `<div class="alert alert-warn"><svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg><span>
        Falta aplicar la migración <strong>33_migration_roles.sql</strong> en Supabase.</span></div>`;
      return;
    }
    c.innerHTML = `<div class="alert alert-danger"><svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg><span>${e.message}</span></div>`;
    return;
  }

  c.innerHTML = `
    <div class="card animate-in" style="max-width:820px;margin-bottom:16px;">
      <div class="card-header">
        <span class="card-title">Usuarios de la empresa</span>
        <button class="btn-primary btn-sm" onclick="showModalInvitar()">＋ Invitar usuario</button>
      </div>
      <div class="table-wrap" style="margin-top:12px;">
        <table class="data-table">
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Sucursal</th><th></th></tr></thead>
          <tbody>
            ${_USR.usuarios.map(u => `
              <tr>
                <td><strong>${u.nombre || '—'}</strong>${u.es_yo ? ' <span style="font-size:.72rem;color:var(--text-muted);">(tú)</span>' : ''}</td>
                <td style="font-size:.85rem;color:var(--text-muted);">${u.email}</td>
                <td>${badgeRol(u.rol)}</td>
                <td style="font-size:.85rem;color:var(--text-muted);">${u.sucursal_nombre || (u.rol === 'capturista' ? 'Todas' : '—')}</td>
                <td>
                  <button class="btn-secondary btn-sm" onclick="showModalCambiarRol('${u.id}')"
                    ${u.es_yo ? 'disabled title="No puedes cambiar tu propio rol"' : ''}>Cambiar rol</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="font-size:.78rem;color:var(--text-muted);margin-top:10px;">
        Nadie puede cambiar su propio rol, ni siquiera un administrador — es lo que evita que alguien se auto-promueva.
        Pídele a otro admin que lo haga.
      </div>
    </div>

    <div class="card animate-in" style="max-width:820px;">
      <div class="card-header"><span class="card-title">Invitaciones pendientes</span></div>
      ${!_USR.invitaciones.length
        ? `<div class="empty-state" style="padding:24px;"><div class="empty-state-title" style="font-size:.9rem;">Sin invitaciones pendientes</div></div>`
        : `<div class="table-wrap" style="margin-top:12px;">
            <table class="data-table">
              <thead><tr><th>Correo</th><th>Rol</th><th>Sucursal</th><th>Expira</th><th></th></tr></thead>
              <tbody>
                ${_USR.invitaciones.map(i => `
                  <tr>
                    <td>${i.email}</td>
                    <td>${badgeRol(i.rol)}</td>
                    <td style="font-size:.85rem;color:var(--text-muted);">${i.sucursales?.nombre || '—'}</td>
                    <td style="font-size:.85rem;color:var(--text-muted);">${formatDateShort(i.expira_en)}</td>
                    <td style="display:flex;gap:6px;">
                      <button class="btn-secondary btn-sm" onclick="_copiarLigaInvitacion('${i.email}')">Copiar liga</button>
                      <button class="btn-secondary btn-sm" onclick="_cancelarInvitacion('${i.id}')">Cancelar</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`}
      <div style="font-size:.78rem;color:var(--text-muted);margin-top:10px;">
        La persona entra a la liga, crea su cuenta <strong>con ese mismo correo</strong> y queda dentro de tu empresa
        con el rol que le asignaste. Las invitaciones vencen a los 14 días.
      </div>
    </div>
  `;
}

function showModalInvitar() {
  showModal(`
    <div class="modal animate-in" style="max-width:520px;">
      <div class="modal-header">
        <div class="modal-title">＋ Invitar usuario</div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div style="padding:18px 24px;">
        <div class="form-grid">
          <div class="form-group span-2">
            <label class="form-label">Correo electrónico <span class="req">*</span></label>
            <input id="inv-email" type="email" class="form-input" placeholder="persona@empresa.com" />
            <div class="helper-text">Debe registrarse con este mismo correo para que la invitación se aplique.</div>
          </div>
          <div class="form-group span-2">
            <label class="form-label">Rol <span class="req">*</span></label>
            <select id="inv-rol" class="form-select" onchange="_invOnRol()">
              ${['consulta','capturista','gerente','admin'].map(r =>
                `<option value="${r}" ${r === 'consulta' ? 'selected' : ''}>${ROL_NOMBRES[r]}</option>`).join('')}
            </select>
            <div class="helper-text" id="inv-rol-desc">${ROL_DESCRIPCIONES.consulta}</div>
          </div>
          <div class="form-group span-2" id="inv-sucursal-wrap" style="display:none;">
            <label class="form-label">Limitar a una sucursal</label>
            <select id="inv-sucursal" class="form-select">
              <option value="">Todas las sucursales</option>
              ${_USR.sucursales.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
            </select>
            <div class="helper-text">Solo podrá capturar asistencia de los trabajadores de esa sucursal.</div>
          </div>
        </div>
        <div id="inv-error" class="error-msg" style="display:none;margin-top:10px;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="_crearInvitacion()">Crear invitación</button>
      </div>
    </div>
  `);
}

function _invOnRol() {
  const rol = document.getElementById('inv-rol')?.value;
  const desc = document.getElementById('inv-rol-desc');
  if (desc) desc.textContent = ROL_DESCRIPCIONES[rol] || '';
  const wrap = document.getElementById('inv-sucursal-wrap');
  if (wrap) wrap.style.display = rol === 'capturista' ? '' : 'none';
}

async function _crearInvitacion() {
  const err   = document.getElementById('inv-error');
  const email = document.getElementById('inv-email')?.value.trim().toLowerCase();
  const rol   = document.getElementById('inv-rol')?.value;
  const suc   = document.getElementById('inv-sucursal')?.value || null;
  err.style.display = 'none';

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    err.textContent = 'Captura un correo electrónico válido.'; err.style.display = ''; return;
  }
  if (_USR.usuarios.some(u => u.email.toLowerCase() === email)) {
    err.textContent = 'Ese correo ya es usuario de tu empresa.'; err.style.display = ''; return;
  }

  try {
    const { error } = await window.supabase.from('invitaciones').insert({
      empresa_id:   CTX.empresa.id,
      email, rol,
      sucursal_id:  rol === 'capturista' ? suc : null,
      invitada_por: CTX.user.id,
    });
    if (error) throw error;
    closeModal();
    showToast(`Invitación creada para ${email}. Cópiale la liga de registro.`, 'success', 6000);
    await renderTabUsuarios();
  } catch(e) {
    err.textContent = esErrorDePermisos(e) ? mensajeErrorPermisos(e) : e.message;
    err.style.display = '';
  }
}

function _copiarLigaInvitacion(email) {
  const liga = `${window.location.origin}${window.location.pathname.replace(/app\.html$/, 'index.html')}?invitacion=${encodeURIComponent(email)}`;
  navigator.clipboard?.writeText(liga)
    .then(() => showToast('Liga copiada. Compártela con la persona invitada.', 'success'))
    .catch(() => showToast(liga, 'info', 12000));
}

async function _cancelarInvitacion(id) {
  if (!(await showConfirmacion('¿Cancelar esta invitación?', { peligro:true, textoOk:'Cancelar invitación', textoCancelar:'Volver' }))) return;
  try {
    const { error } = await window.supabase.from('invitaciones').delete().eq('id', id);
    if (error) throw error;
    showToast('Invitación cancelada.', 'info');
    await renderTabUsuarios();
  } catch(e) {
    showToast(esErrorDePermisos(e) ? mensajeErrorPermisos(e) : e.message, 'error');
  }
}

function showModalCambiarRol(usuarioId) {
  const u = _USR.usuarios.find(x => x.id === usuarioId);
  if (!u) return;
  showModal(`
    <div class="modal animate-in" style="max-width:520px;">
      <div class="modal-header">
        <div class="modal-title">Cambiar rol de ${u.nombre || u.email}</div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div style="padding:18px 24px;">
        <div class="form-grid">
          <div class="form-group span-2">
            <label class="form-label">Rol</label>
            <select id="rol-nuevo" class="form-select" onchange="_rolOnCambio()">
              ${['consulta','capturista','gerente','admin'].map(r =>
                `<option value="${r}" ${u.rol === r ? 'selected' : ''}>${ROL_NOMBRES[r]}</option>`).join('')}
            </select>
            <div class="helper-text" id="rol-nuevo-desc">${ROL_DESCRIPCIONES[u.rol] || ''}</div>
          </div>
          <div class="form-group span-2" id="rol-sucursal-wrap" style="display:${u.rol === 'capturista' ? '' : 'none'};">
            <label class="form-label">Limitar a una sucursal</label>
            <select id="rol-sucursal" class="form-select">
              <option value="">Todas las sucursales</option>
              ${_USR.sucursales.map(s => `<option value="${s.id}" ${u.sucursal_id === s.id ? 'selected' : ''}>${s.nombre}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="rol-error" class="error-msg" style="display:none;margin-top:10px;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="_guardarRol('${u.id}')">Guardar</button>
      </div>
    </div>
  `);
}

function _rolOnCambio() {
  const rol = document.getElementById('rol-nuevo')?.value;
  const desc = document.getElementById('rol-nuevo-desc');
  if (desc) desc.textContent = ROL_DESCRIPCIONES[rol] || '';
  const wrap = document.getElementById('rol-sucursal-wrap');
  if (wrap) wrap.style.display = rol === 'capturista' ? '' : 'none';
}

async function _guardarRol(usuarioId) {
  const err = document.getElementById('rol-error');
  const rol = document.getElementById('rol-nuevo')?.value;
  const suc = document.getElementById('rol-sucursal')?.value || null;
  err.style.display = 'none';
  try {
    const { error } = await window.supabase.rpc('admin_set_rol', {
      p_usuario_id: usuarioId,
      p_rol:        rol,
      p_sucursal_id: rol === 'capturista' ? suc : null,
    });
    if (error) throw error;
    closeModal();
    showToast('Rol actualizado.', 'success');
    await renderTabUsuarios();
  } catch(e) {
    err.textContent = esErrorDePermisos(e) ? mensajeErrorPermisos(e) : e.message;
    err.style.display = '';
  }
}
