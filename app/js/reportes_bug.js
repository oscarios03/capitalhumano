/**
 * Capital Humano MX — Reportes de bug / mejora (fase beta)
 *
 * Dos caras del mismo feature:
 *   1. Botón flotante en toda la app para que el usuario reporte una falla,
 *      mejora o duda desde la página exacta donde ocurre (con captura opcional
 *      y contexto técnico capturado en silencio) + "Mis reportes" para ver el
 *      estado de lo que envió.
 *   2. Panel del desarrollador (ruta `soporte`, solo tu cuenta) para triage:
 *      filtrar, priorizar, cambiar estado, anotar notas internas y exportar.
 *
 * Backend: migración 37 (tablas reportes_bug / reporte_bug_notas, helper RLS
 * es_desarrollador, bucket Storage `reportes`). El candado real es RLS; el
 * gating de UI de aquí (DEV_EMAIL) es solo experiencia de usuario.
 *
 * Depende de: config.js (DEV_EMAIL, APP_VERSION), auth.js (CTX), app.js
 * (showModal/closeModal, showToast, showConfirmacion, btnCargando/btnRestaurar,
 * escapeHtml, navigate, eid).
 */

// ─── Catálogos (sin emojis, tema 1C) ─────────────────────────────────────────
const RB_TIPOS = {
  bug:    'Algo falla / Error',
  mejora: 'Sugerencia o mejora',
  duda:   'Duda o pregunta',
};
const RB_IMPACTOS = {
  bloquea: 'Me impide trabajar',
  molesto: 'Molesto, pero puedo seguir',
  menor:   'Menor / cosmético',
};
const RB_ESTADOS = {
  nuevo:       'Nuevo',
  en_revision: 'En revisión',
  resuelto:    'Resuelto',
  descartado:  'Descartado',
};
const RB_PRIORIDADES = { alta: 'Alta', media: 'Media', baja: 'Baja' };

// Nombre humano de cada ruta del router (para saber en qué página se reportó)
const RB_PAGINA_LABELS = {
  dashboard:'Panel de Control', empleados:'Trabajadores', empleado:'Ficha de trabajador',
  contratos:'Contratos', asistencia:'Asistencia', checador:'Reloj Checador', nomina:'Nómina',
  disciplinario:'Actas Administrativas', bajas:'Bajas', imss:'IMSS / Movimientos',
  empresa:'Mi Empresa', vacaciones:'Vacaciones', incapacidades:'Incapacidades',
  aguinaldo:'Aguinaldo', ptu:'PTU', organigrama:'Organigrama', reportes:'Reportes',
  manual:'Manual de Uso', soporte:'Panel de reportes',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function esDesarrollador() {
  return !!(CTX?.user?.email && DEV_EMAIL &&
            CTX.user.email.toLowerCase() === String(DEV_EMAIL).toLowerCase());
}

function _rbRutaActual() {
  const hash = (window.location.hash || '').replace('#', '');
  return (hash.split('/')[0]) || 'dashboard';
}
function _rbPaginaLabel(ruta) {
  return RB_PAGINA_LABELS[ruta] || ruta || '—';
}
function _rbUUID() {
  try { return crypto.randomUUID(); }
  catch { return 'r-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10); }
}
function _rbFecha(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('es-MX', { dateStyle:'medium', timeStyle:'short' }); }
  catch { return iso; }
}

function _rbBadge(cls, texto) {
  return `<span class="rb-badge ${cls}">${escapeHtml(texto)}</span>`;
}
function rbBadgeTipo(t)    { return _rbBadge('rb-tipo-' + t,   RB_TIPOS[t] || t); }
function rbBadgeImpacto(i) { return _rbBadge('rb-imp-' + i,   RB_IMPACTOS[i] || i); }
function rbBadgeEstado(e)  { return _rbBadge('rb-est-' + e,   RB_ESTADOS[e] || e); }
function rbBadgePrioridad(p){ return _rbBadge('rb-pri-' + p,  RB_PRIORIDADES[p] || p); }

// ─── Capa de datos ───────────────────────────────────────────────────────────
const RB_BUCKET = 'reportes';
const RB = {
  async crear(payload) {
    const { data, error } = await window.supabase
      .from('reportes_bug').insert(payload).select().single();
    if (error) throw error;
    return data;
  },
  async misReportes() {
    const { data, error } = await window.supabase
      .from('reportes_bug').select('*')
      .eq('creado_por', CTX.user.id)
      .order('creado_en', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async listarTodos() {
    const { data, error } = await window.supabase
      .from('reportes_bug').select('*, empresas(nombre)')
      .order('creado_en', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async actualizar(id, campos) {
    const { error } = await window.supabase
      .from('reportes_bug').update(campos).eq('id', id);
    if (error) throw error;
  },
  async eliminar(id) {
    const { error } = await window.supabase.from('reportes_bug').delete().eq('id', id);
    if (error) throw error;
  },
  async notas(reporteId) {
    const { data, error } = await window.supabase
      .from('reporte_bug_notas').select('*')
      .eq('reporte_id', reporteId).order('creado_en', { ascending: true });
    if (error) throw error;
    return data || [];
  },
  async agregarNota(reporteId, nota) {
    const { error } = await window.supabase.from('reporte_bug_notas')
      .insert({ reporte_id: reporteId, autor: CTX.user.id, nota });
    if (error) throw error;
  },
  async subirCaptura(archivo) {
    const ext  = (archivo.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${CTX.empresa.id}/${_rbUUID()}.${ext || 'png'}`;
    const { error } = await window.supabase.storage.from(RB_BUCKET)
      .upload(path, archivo, { cacheControl: '3600', upsert: false });
    if (error) throw error;
    return path;
  },
  async removerCaptura(path) {
    try { await window.supabase.storage.from(RB_BUCKET).remove([path]); } catch {}
  },
  async urlCaptura(path) {
    const { data, error } = await window.supabase.storage.from(RB_BUCKET)
      .createSignedUrl(path, 3600);
    if (error) throw error;
    return data?.signedUrl || null;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
//  INICIALIZACIÓN — botón flotante + (si eres dev) ítem de menú del panel
// ═══════════════════════════════════════════════════════════════════════════
function initReporteBug() {
  if (!CTX?.user || !CTX?.empresa) return;   // sin sesión completa, nada que hacer
  _rbInyectarCSS();

  // Botón flotante (una sola vez)
  if (!document.getElementById('rb-fab')) {
    const btn = document.createElement('button');
    btn.id = 'rb-fab';
    btn.className = 'rb-fab';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Reportar un problema o sugerencia');
    btn.setAttribute('title', 'Reportar un problema o sugerencia');
    btn.innerHTML =
      `<svg class="ic"><use href="#i-bug"></use></svg><span class="rb-fab-text">Reportar</span>`;
    btn.addEventListener('click', abrirModalReporte);
    document.body.appendChild(btn);
  }

  // Ítem de menú del panel: solo para el desarrollador (no se hardcodea en el
  // HTML para que no parpadee en cuentas normales).
  if (esDesarrollador() && !document.getElementById('rb-nav-soporte')) {
    const sidebar = document.getElementById('app-sidebar');
    if (sidebar) {
      const label = document.createElement('span');
      label.className = 'nav-section-label';
      label.textContent = 'Desarrollo';
      const item = document.createElement('div');
      item.id = 'rb-nav-soporte';
      item.className = 'nav-item';
      item.dataset.route = 'soporte';
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.setAttribute('onclick', "navigate('soporte')");
      item.style.position = 'relative';
      item.innerHTML =
        `<svg class="ic"><use href="#i-bug"></use></svg> Reportes (beta)` +
        `<span id="rb-nav-badge" style="display:none;position:absolute;top:6px;right:10px;` +
        `background:var(--red-warn,#c0392b);color:#fff;font-size:.6rem;font-weight:700;` +
        `min-width:16px;height:16px;line-height:16px;text-align:center;padding:0 4px;border-radius:100px;"></span>`;
      sidebar.appendChild(label);
      sidebar.appendChild(item);
      _rbActualizarBadgeNav();
    }
  }
}

// Contador de "no leídos" en el ítem de menú del dev
async function _rbActualizarBadgeNav() {
  if (!esDesarrollador()) return;
  try {
    const { count } = await window.supabase
      .from('reportes_bug').select('id', { count: 'exact', head: true })
      .eq('leido', false);
    const badge = document.getElementById('rb-nav-badge');
    if (badge) {
      if (count && count > 0) { badge.textContent = count > 99 ? '99+' : String(count); badge.style.display = ''; }
      else badge.style.display = 'none';
    }
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════
//  USUARIO — modal de reporte
// ═══════════════════════════════════════════════════════════════════════════
function abrirModalReporte() {
  const ruta  = _rbRutaActual();
  const label = _rbPaginaLabel(ruta);
  showModal(`
    <div class="modal animate-in" style="max-width:560px;">
      <div class="modal-header">
        <div class="modal-title" style="display:flex;align-items:center;gap:10px;">
          <svg class="ic" style="color:var(--accent);"><use href="#i-bug"></use></svg>
          Reportar un problema o sugerencia
        </div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div style="padding:18px 24px;">
        <div class="alert alert-info" style="display:flex;gap:10px;align-items:flex-start;margin-bottom:16px;">
          <svg class="ic" style="flex-shrink:0;"><use href="#i-info"></use></svg>
          <span style="font-size:.82rem;">Estás en <strong>${escapeHtml(label)}</strong>. Tu reporte llega directo al equipo de desarrollo con el contexto de esta pantalla. ¡Gracias por ayudarnos a mejorar la beta!</span>
        </div>
        <div class="form-grid">
          <div class="form-group span-2">
            <label class="form-label">¿Qué tipo de reporte es?</label>
            <select id="rb-tipo" class="form-select">
              ${Object.entries(RB_TIPOS).map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}
            </select>
          </div>
          <div class="form-group span-2">
            <label class="form-label">¿Qué tanto te afecta?</label>
            <select id="rb-impacto" class="form-select">
              ${Object.entries(RB_IMPACTOS).map(([v,l]) => `<option value="${v}" ${v==='menor'?'selected':''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="form-group span-2">
            <label class="form-label">¿Qué pasó? <span class="req">*</span></label>
            <textarea id="rb-descripcion" class="form-input" rows="3"
              placeholder="Describe la falla o la mejora. Si esperabas otro resultado, cuéntanos cuál."></textarea>
            <div class="helper-text">Al menos 10 caracteres.</div>
          </div>
          <div class="form-group span-2">
            <label class="form-label">Observaciones adicionales</label>
            <textarea id="rb-observaciones" class="form-input" rows="2"
              placeholder="Pasos para reproducirlo, hora aproximada, o cualquier detalle extra (opcional)."></textarea>
          </div>
          <div class="form-group span-2">
            <label class="form-label">Adjuntar captura de pantalla</label>
            <input id="rb-captura" type="file" class="form-input" accept="image/png,image/jpeg,image/webp" />
            <div class="helper-text">Opcional. Imagen (PNG/JPG/WEBP), máximo 5 MB.</div>
          </div>
        </div>
        <div id="rb-error" class="error-msg" style="display:none;margin-top:10px;"></div>
      </div>
      <div class="modal-footer" style="justify-content:space-between;">
        <button class="btn-secondary btn-sm" onclick="renderMisReportes()" type="button">Ver mis reportes</button>
        <div style="display:flex;gap:8px;">
          <button class="btn-secondary" onclick="closeModal()" type="button">Cancelar</button>
          <button class="btn-primary" id="rb-enviar" onclick="enviarReporte(this)" type="button">Enviar reporte</button>
        </div>
      </div>
    </div>
  `);
}

async function enviarReporte(btn) {
  const err  = document.getElementById('rb-error');
  if (err) err.style.display = 'none';

  const descripcion = (document.getElementById('rb-descripcion')?.value || '').trim();
  if (descripcion.length < 10) {
    if (err) { err.textContent = 'Cuéntanos un poco más (al menos 10 caracteres).'; err.style.display = ''; }
    return;
  }
  const archivo = document.getElementById('rb-captura')?.files?.[0] || null;
  if (archivo && archivo.size > 5 * 1024 * 1024) {
    if (err) { err.textContent = 'La imagen supera los 5 MB. Usa una más ligera.'; err.style.display = ''; }
    return;
  }

  btnCargando(btn, 'Enviando…');
  let capturaPath = null;
  try {
    if (archivo) capturaPath = await RB.subirCaptura(archivo);

    const ruta = _rbRutaActual();
    await RB.crear({
      empresa_id:       CTX.empresa.id,
      creado_por:       CTX.user.id,
      reportero_email:  CTX.user.email || null,
      reportero_nombre: CTX.perfil?.nombre || null,
      reportero_rol:    CTX.rol || null,
      tipo:        document.getElementById('rb-tipo')?.value || 'bug',
      impacto:     document.getElementById('rb-impacto')?.value || 'menor',
      descripcion,
      observaciones: (document.getElementById('rb-observaciones')?.value || '').trim() || null,
      ruta,
      pagina_label: _rbPaginaLabel(ruta),
      url:          window.location.href,
      navegador:    navigator.userAgent,
      viewport:     `${window.innerWidth}x${window.innerHeight}`,
      app_version:  (typeof APP_VERSION !== 'undefined' ? APP_VERSION : null),
      plan_codigo:  CTX.plan?.plan || null,
      captura_path: capturaPath,
    });

    closeModal();
    showToast('¡Gracias! Tu reporte se envió al equipo de desarrollo.', 'success', 5000);
  } catch (e) {
    if (capturaPath) await RB.removerCaptura(capturaPath);  // no dejar el archivo huérfano
    btnRestaurar(btn);
    if (err) { err.textContent = 'No se pudo enviar: ' + (e.message || e); err.style.display = ''; }
  }
}

// ─── "Mis reportes" (solo lectura para el usuario) ───────────────────────────
async function renderMisReportes() {
  showModal(`
    <div class="modal animate-in" style="max-width:640px;">
      <div class="modal-header">
        <div class="modal-title">Mis reportes</div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div id="rb-mis-body" style="padding:18px 24px;min-height:120px;">
        <div class="loading"><div class="spinner"></div> Cargando…</div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="abrirModalReporte()" type="button">Nuevo reporte</button>
        <button class="btn-primary" onclick="closeModal()" type="button">Cerrar</button>
      </div>
    </div>
  `);
  const body = document.getElementById('rb-mis-body');
  try {
    const lista = await RB.misReportes();
    if (!lista.length) {
      body.innerHTML = `<div class="empty-state" style="padding:30px 10px;">
        <div class="empty-state-icon"><svg class="ic"><use href="#i-bug"></use></svg></div>
        <div class="empty-state-title">Aún no has enviado reportes</div>
        <p style="color:var(--text-muted);font-size:.85rem;">Cuando reportes una falla o mejora, aquí verás su estado.</p>
      </div>`;
      return;
    }
    body.innerHTML = lista.map(r => `
      <div class="card" style="margin-bottom:10px;padding:12px 14px;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;">
          <div style="display:flex;gap:6px;flex-wrap:wrap;">${rbBadgeTipo(r.tipo)} ${rbBadgeEstado(r.estado)}</div>
          <span style="font-size:.75rem;color:var(--text-muted);">${_rbFecha(r.creado_en)}</span>
        </div>
        <div style="font-size:.88rem;color:var(--text-primary);margin-top:8px;white-space:pre-wrap;">${escapeHtml(r.descripcion)}</div>
        <div style="font-size:.75rem;color:var(--text-muted);margin-top:6px;">Página: ${escapeHtml(r.pagina_label || r.ruta || '—')}</div>
      </div>`).join('');
  } catch (e) {
    body.innerHTML = `<div class="alert alert-danger"><svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg><span>${escapeHtml(e.message || String(e))}</span></div>`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  DESARROLLADOR — panel de triage (ruta `soporte`)
// ═══════════════════════════════════════════════════════════════════════════
let _RBP = { reportes: [], filtros: { estado:'', tipo:'', impacto:'', empresa:'', q:'' } };

async function renderPanelReportes() {
  const main = document.getElementById('main-view');
  if (!esDesarrollador()) {
    main.innerHTML = `<div class="empty-state" style="padding:60px 20px;text-align:center;">
      <div class="empty-state-icon"><svg class="ic"><use href="#i-lock"></use></svg></div>
      <h3 style="margin:12px 0 6px;color:var(--text-primary);font-family:var(--font-serif);">Sección no disponible</h3>
    </div>`;
    return;
  }
  main.innerHTML = `<div class="loading"><div class="spinner"></div> Cargando reportes…</div>`;
  try {
    _RBP.reportes = await RB.listarTodos();
  } catch (e) {
    main.innerHTML = `<div class="alert alert-danger" style="margin:20px;"><svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg><span>
      ${/relation .*reportes_bug|does not exist|schema cache/i.test(e.message||'')
        ? 'Falta aplicar la migración <strong>37_migration_reportes_bug.sql</strong> en Supabase.'
        : escapeHtml(e.message || String(e))}</span></div>`;
    return;
  }
  _rbPintarPanel();
  _rbActualizarBadgeNav();
}

function _rbFiltrar() {
  const f = _RBP.filtros;
  const q = (f.q || '').toLowerCase();
  return _RBP.reportes.filter(r =>
    (!f.estado   || r.estado === f.estado) &&
    (!f.tipo     || r.tipo === f.tipo) &&
    (!f.impacto  || r.impacto === f.impacto) &&
    (!f.empresa  || r.empresa_id === f.empresa) &&
    (!q || (r.descripcion || '').toLowerCase().includes(q)
         || (r.empresas?.nombre || '').toLowerCase().includes(q)
         || (r.pagina_label || '').toLowerCase().includes(q))
  );
}

function _rbPintarPanel() {
  const main = document.getElementById('main-view');
  const todos = _RBP.reportes;
  const noLeidos = todos.filter(r => !r.leido).length;
  const nuevos   = todos.filter(r => r.estado === 'nuevo').length;

  // Empresas presentes (para el filtro)
  const empresas = [];
  const vistos = new Set();
  todos.forEach(r => { if (r.empresa_id && !vistos.has(r.empresa_id)) { vistos.add(r.empresa_id); empresas.push({ id:r.empresa_id, nombre:r.empresas?.nombre || r.empresa_id }); } });

  // Página con más reportes
  const porPagina = {};
  todos.forEach(r => { const k = r.pagina_label || r.ruta || '—'; porPagina[k] = (porPagina[k]||0)+1; });
  const topPagina = Object.entries(porPagina).sort((a,b)=>b[1]-a[1])[0];

  const filas = _rbFiltrar();
  const f = _RBP.filtros;

  main.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div>
        <h1 class="page-title" style="display:flex;align-items:center;gap:10px;">
          <svg class="ic" style="color:var(--accent);"><use href="#i-bug"></use></svg> Reportes de la beta
        </h1>
        <p class="page-subtitle">Reportes de bugs, mejoras y dudas de todas las empresas.</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn-secondary btn-sm" onclick="renderPanelReportes()"><svg class="ic" style="width:15px;height:15px;vertical-align:-2px;"><use href="#i-activity"></use></svg> Actualizar</button>
        <button class="btn-secondary btn-sm" onclick="exportarReportesCSV()"><svg class="ic" style="width:15px;height:15px;vertical-align:-2px;"><use href="#i-download"></use></svg> Exportar</button>
      </div>
    </div>

    <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0;">
      ${_rbStatCard('Total', todos.length)}
      ${_rbStatCard('Sin leer', noLeidos)}
      ${_rbStatCard('Nuevos', nuevos)}
      ${_rbStatCard('Página top', topPagina ? `${escapeHtml(topPagina[0])} (${topPagina[1]})` : '—', true)}
    </div>

    <div class="card" style="margin-bottom:14px;">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
        <div class="form-group" style="min-width:150px;flex:1;">
          <label class="form-label">Buscar</label>
          <input class="form-input" type="search" value="${escapeHtml(f.q)}" placeholder="Texto, empresa o página…" oninput="_rbSetFiltro('q', this.value)">
        </div>
        <div class="form-group" style="min-width:130px;">
          <label class="form-label">Estado</label>
          <select class="form-select" onchange="_rbSetFiltro('estado', this.value)">
            <option value="">Todos</option>
            ${Object.entries(RB_ESTADOS).map(([v,l])=>`<option value="${v}" ${f.estado===v?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="min-width:130px;">
          <label class="form-label">Tipo</label>
          <select class="form-select" onchange="_rbSetFiltro('tipo', this.value)">
            <option value="">Todos</option>
            ${Object.entries(RB_TIPOS).map(([v,l])=>`<option value="${v}" ${f.tipo===v?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="min-width:130px;">
          <label class="form-label">Impacto</label>
          <select class="form-select" onchange="_rbSetFiltro('impacto', this.value)">
            <option value="">Todos</option>
            ${Object.entries(RB_IMPACTOS).map(([v,l])=>`<option value="${v}" ${f.impacto===v?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="min-width:150px;">
          <label class="form-label">Empresa</label>
          <select class="form-select" onchange="_rbSetFiltro('empresa', this.value)">
            <option value="">Todas</option>
            ${empresas.map(e=>`<option value="${e.id}" ${f.empresa===e.id?'selected':''}>${escapeHtml(e.nombre)}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th></th><th>Fecha</th><th>Empresa</th><th>Tipo</th><th>Impacto</th>
            <th>Página</th><th>Estado</th><th>Descripción</th><th></th>
          </tr></thead>
          <tbody>
            ${!filas.length
              ? `<tr><td colspan="9"><div class="empty-state" style="padding:30px;"><div class="empty-state-title">Sin reportes con estos filtros</div></div></td></tr>`
              : filas.map(r => `
                <tr style="${r.leido ? '' : 'font-weight:600;'}cursor:pointer;" onclick="verDetalleReporte('${r.id}')">
                  <td>${r.leido ? '' : '<span title="Sin leer" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--red-warn,#c0392b);"></span>'}</td>
                  <td style="font-size:.8rem;color:var(--text-muted);white-space:nowrap;">${_rbFecha(r.creado_en)}</td>
                  <td style="font-size:.85rem;">${escapeHtml(r.empresas?.nombre || '—')}</td>
                  <td>${rbBadgeTipo(r.tipo)}</td>
                  <td>${rbBadgeImpacto(r.impacto)}</td>
                  <td style="font-size:.85rem;">${escapeHtml(r.pagina_label || r.ruta || '—')}</td>
                  <td>${rbBadgeEstado(r.estado)}</td>
                  <td style="font-size:.83rem;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml((r.descripcion||'').slice(0,90))}</td>
                  <td><button class="btn-secondary btn-sm" onclick="event.stopPropagation();verDetalleReporte('${r.id}')">Ver</button></td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function _rbStatCard(label, valor, chico) {
  return `<div class="card" style="padding:14px 16px;">
    <div style="font-size:.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(label)}</div>
    <div style="font-family:var(--font-serif);font-weight:600;color:var(--text-primary);font-size:${chico?'.95rem':'1.5rem'};margin-top:4px;">${chico?valor:escapeHtml(String(valor))}</div>
  </div>`;
}

function _rbSetFiltro(campo, valor) {
  _RBP.filtros[campo] = valor;
  _rbPintarPanel();
}

async function verDetalleReporte(id) {
  const r = _RBP.reportes.find(x => x.id === id);
  if (!r) return;

  showModal(`
    <div class="modal animate-in" style="max-width:680px;">
      <div class="modal-header">
        <div class="modal-title" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          ${rbBadgeTipo(r.tipo)} ${rbBadgeImpacto(r.impacto)}
        </div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div style="padding:18px 24px;max-height:70vh;overflow-y:auto;">
        <div style="font-size:.92rem;color:var(--text-primary);white-space:pre-wrap;line-height:1.6;">${escapeHtml(r.descripcion)}</div>
        ${r.observaciones ? `<div style="margin-top:12px;padding:10px 12px;background:var(--bg-subtle,#f6f7f9);border-radius:8px;font-size:.85rem;white-space:pre-wrap;"><strong>Observaciones:</strong> ${escapeHtml(r.observaciones)}</div>` : ''}

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin-top:16px;font-size:.8rem;color:var(--text-muted);">
          <div><strong>Empresa:</strong> ${escapeHtml(r.empresas?.nombre || '—')}</div>
          <div><strong>Reportó:</strong> ${escapeHtml(r.reportero_nombre || r.reportero_email || '—')} ${r.reportero_rol ? '('+escapeHtml(r.reportero_rol)+')' : ''}</div>
          <div><strong>Correo:</strong> ${escapeHtml(r.reportero_email || '—')}</div>
          <div><strong>Página:</strong> ${escapeHtml(r.pagina_label || r.ruta || '—')}</div>
          <div><strong>Fecha:</strong> ${_rbFecha(r.creado_en)}</div>
          <div><strong>Plan:</strong> ${escapeHtml(r.plan_codigo || '—')}</div>
          <div><strong>Versión:</strong> ${escapeHtml(r.app_version || '—')}</div>
          <div><strong>Viewport:</strong> ${escapeHtml(r.viewport || '—')}</div>
          <div class="span-2" style="grid-column:1/-1;word-break:break-all;"><strong>URL:</strong> ${escapeHtml(r.url || '—')}</div>
          <div class="span-2" style="grid-column:1/-1;word-break:break-word;"><strong>Navegador:</strong> ${escapeHtml(r.navegador || '—')}</div>
        </div>

        ${r.captura_path ? `<div style="margin-top:14px;"><button class="btn-secondary btn-sm" onclick="verCapturaReporte('${escapeHtml(r.captura_path)}', this)"><svg class="ic" style="width:15px;height:15px;vertical-align:-2px;"><use href="#i-eye"></use></svg> Ver captura</button></div>` : ''}

        <hr style="border:none;border-top:1px solid var(--border);margin:18px 0;">

        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
          <div class="form-group" style="min-width:150px;">
            <label class="form-label">Estado</label>
            <select class="form-select" onchange="cambiarCampoReporte('${r.id}','estado',this.value)">
              ${Object.entries(RB_ESTADOS).map(([v,l])=>`<option value="${v}" ${r.estado===v?'selected':''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="min-width:150px;">
            <label class="form-label">Prioridad</label>
            <select class="form-select" onchange="cambiarCampoReporte('${r.id}','prioridad',this.value)">
              ${Object.entries(RB_PRIORIDADES).map(([v,l])=>`<option value="${v}" ${r.prioridad===v?'selected':''}>${l}</option>`).join('')}
            </select>
          </div>
          <button class="btn-danger btn-sm" onclick="eliminarReporte('${r.id}')" style="margin-left:auto;"><svg class="ic" style="width:15px;height:15px;vertical-align:-2px;"><use href="#i-trash"></use></svg> Eliminar</button>
        </div>

        <div style="margin-top:18px;">
          <label class="form-label">Notas internas (privadas)</label>
          <div id="rb-notas-lista" style="margin:8px 0;"><div class="loading" style="padding:8px;"><div class="spinner"></div></div></div>
          <div style="display:flex;gap:8px;">
            <input id="rb-nota-nueva" class="form-input" placeholder="Agregar una nota interna…" style="flex:1;">
            <button class="btn-secondary" onclick="agregarNotaReporte('${r.id}', this)" type="button">Agregar</button>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-primary" onclick="closeModal()" type="button">Cerrar</button>
      </div>
    </div>
  `);

  // Marcar como leído al abrir (si aún no lo estaba)
  if (!r.leido) {
    try { await RB.actualizar(r.id, { leido: true }); r.leido = true; _rbActualizarBadgeNav(); } catch {}
  }
  _rbCargarNotas(r.id);
}

async function _rbCargarNotas(reporteId) {
  const cont = document.getElementById('rb-notas-lista');
  if (!cont) return;
  try {
    const notas = await RB.notas(reporteId);
    cont.innerHTML = notas.length
      ? notas.map(n => `<div style="padding:8px 10px;background:var(--bg-subtle,#f6f7f9);border-radius:6px;margin-bottom:6px;font-size:.83rem;white-space:pre-wrap;">${escapeHtml(n.nota)}<div style="font-size:.7rem;color:var(--text-muted);margin-top:4px;">${_rbFecha(n.creado_en)}</div></div>`).join('')
      : `<div style="font-size:.8rem;color:var(--text-muted);">Sin notas todavía.</div>`;
  } catch (e) {
    cont.innerHTML = `<div style="font-size:.8rem;color:var(--red-warn);">${escapeHtml(e.message || String(e))}</div>`;
  }
}

async function agregarNotaReporte(reporteId, btn) {
  const input = document.getElementById('rb-nota-nueva');
  const nota = (input?.value || '').trim();
  if (!nota) return;
  btnCargando(btn, 'Guardando…');
  try {
    await RB.agregarNota(reporteId, nota);
    if (input) input.value = '';
    btnRestaurar(btn);
    _rbCargarNotas(reporteId);
  } catch (e) {
    btnRestaurar(btn);
    showToast('No se pudo guardar la nota: ' + (e.message || e), 'error');
  }
}

async function cambiarCampoReporte(id, campo, valor) {
  try {
    await RB.actualizar(id, { [campo]: valor });
    const r = _RBP.reportes.find(x => x.id === id);
    if (r) r[campo] = valor;
    showToast('Actualizado.', 'success', 2000);
  } catch (e) {
    showToast('No se pudo actualizar: ' + (e.message || e), 'error');
  }
}

async function verCapturaReporte(path, btn) {
  btnCargando(btn, 'Abriendo…');
  try {
    const url = await RB.urlCaptura(path);
    btnRestaurar(btn);
    if (url) window.open(url, '_blank', 'noopener');
    else showToast('No se pudo generar el enlace de la captura.', 'error');
  } catch (e) {
    btnRestaurar(btn);
    showToast('No se pudo abrir la captura: ' + (e.message || e), 'error');
  }
}

async function eliminarReporte(id) {
  if (!(await showConfirmacion('¿Eliminar este reporte de forma permanente?', { peligro:true, textoOk:'Eliminar', textoCancelar:'Cancelar' }))) return;
  try {
    await RB.eliminar(id);
    _RBP.reportes = _RBP.reportes.filter(x => x.id !== id);
    closeModal();
    showToast('Reporte eliminado.', 'info');
    _rbPintarPanel();
    _rbActualizarBadgeNav();
  } catch (e) {
    showToast('No se pudo eliminar: ' + (e.message || e), 'error');
  }
}

function exportarReportesCSV() {
  const filas = _rbFiltrar();
  if (!filas.length) { showToast('No hay reportes que exportar.', 'warn'); return; }
  if (typeof XLSX === 'undefined') { showToast('La librería de exportación no está disponible.', 'error'); return; }
  const datos = filas.map(r => ({
    Fecha: _rbFecha(r.creado_en),
    Empresa: r.empresas?.nombre || '',
    Tipo: RB_TIPOS[r.tipo] || r.tipo,
    Impacto: RB_IMPACTOS[r.impacto] || r.impacto,
    Estado: RB_ESTADOS[r.estado] || r.estado,
    Prioridad: RB_PRIORIDADES[r.prioridad] || r.prioridad,
    Página: r.pagina_label || r.ruta || '',
    Descripción: r.descripcion || '',
    Observaciones: r.observaciones || '',
    Reportó: r.reportero_nombre || r.reportero_email || '',
    Correo: r.reportero_email || '',
    Rol: r.reportero_rol || '',
    Plan: r.plan_codigo || '',
    Versión: r.app_version || '',
    Navegador: r.navegador || '',
    URL: r.url || '',
  }));
  const ws = XLSX.utils.json_to_sheet(datos);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reportes');
  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `reportes-beta-${fecha}.xlsx`);
}

// ─── CSS (inyectado una sola vez) ─────────────────────────────────────────────
function _rbInyectarCSS() {
  if (document.getElementById('rb-css')) return;
  const s = document.createElement('style');
  s.id = 'rb-css';
  s.textContent = `
  .rb-fab { position:fixed; z-index:9997; right:22px; bottom:22px; display:inline-flex; align-items:center;
    gap:8px; background:var(--accent); color:#fff; border:none; border-radius:100px; padding:11px 17px;
    font-family:var(--font-sans, sans-serif); font-size:.85rem; font-weight:600; cursor:pointer;
    box-shadow:0 10px 26px -8px rgba(21,128,61,.55); transition:transform .15s ease, box-shadow .15s ease; }
  .rb-fab:hover { transform:translateY(-2px); box-shadow:0 14px 30px -8px rgba(21,128,61,.65); }
  .rb-fab:focus-visible { outline:2px solid #fff; outline-offset:2px; }
  .rb-fab .ic { width:18px; height:18px; }
  @media (max-width:640px){ .rb-fab .rb-fab-text{ display:none; } .rb-fab{ padding:13px; right:16px; bottom:16px; } }
  @media print { .rb-fab { display:none !important; } }

  .rb-badge { display:inline-block; font-size:.7rem; font-weight:700; border-radius:100px; padding:2px 9px;
    border:1px solid var(--border); color:var(--text-secondary); white-space:nowrap; }
  .rb-tipo-bug      { border-color:rgba(192,57,43,.4);  color:#c0392b; }
  .rb-tipo-mejora   { border-color:rgba(21,128,61,.4);  color:#15803d; }
  .rb-tipo-duda     { border-color:rgba(44,111,176,.4); color:#2c6fb0; }
  .rb-imp-bloquea   { border-color:rgba(192,57,43,.4);  color:#c0392b; }
  .rb-imp-molesto   { border-color:rgba(217,138,43,.45);color:#a9752a; }
  .rb-imp-menor     { border-color:var(--border);       color:var(--text-muted); }
  .rb-est-nuevo     { border-color:rgba(44,111,176,.4); color:#2c6fb0; }
  .rb-est-en_revision{border-color:rgba(217,138,43,.45);color:#a9752a; }
  .rb-est-resuelto  { border-color:rgba(21,128,61,.4);  color:#15803d; }
  .rb-est-descartado{ border-color:var(--border);       color:var(--text-muted); }
  .rb-pri-alta      { border-color:rgba(192,57,43,.4);  color:#c0392b; }
  .rb-pri-media     { border-color:rgba(217,138,43,.45);color:#a9752a; }
  .rb-pri-baja      { border-color:var(--border);       color:var(--text-muted); }`;
  document.head.appendChild(s);
}
