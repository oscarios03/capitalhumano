/**
 * Capital Humano MX — Módulo Organigrama
 * Vista tarjetas por departamento + árbol jerárquico (si hay reporta_a)
 */

let _ORG = { vista: 'cards', sucursalFiltro: '', trabajadores: [], sucursales: [] };
const _sbORG = () => window.supabase;

function _deptColor(dept) {
  let h = 0;
  for (let i = 0; i < (dept||'').length; i++) h = (h * 37 + dept.charCodeAt(i)) % 360;
  return `hsl(${h}, 55%, 38%)`;
}

async function renderOrganigrama() {
  const _gen = typeof _navGen !== 'undefined' ? _navGen : 0;
  try {
    const main = document.getElementById('main-view');
    main.innerHTML = `<div class="loading"><div class="spinner"></div> Cargando…</div>`;

    const [trabRes, sucRes] = await Promise.all([
      _sbORG().from('trabajadores')
        .select('id,nombre,puesto,departamento,sucursal_id,reporta_a,estado')
        .eq('empresa_id', CTX.empresa.id)
        .eq('estado', 'activo')
        .order('nombre'),
      _sbORG().from('sucursales')
        .select('id,nombre')
        .eq('empresa_id', CTX.empresa.id),
    ]);
    _ORG.trabajadores = trabRes.data || [];
    _ORG.sucursales   = sucRes.data || [];
    if (typeof _navStale === 'function' && _navStale(_gen)) return;
    _renderOrgHTML();
  } catch(e) { showError(e); }
}

function _renderOrgHTML() {
  const main = document.getElementById('main-view');
  const hayArbol = _ORG.trabajadores.some(t => t.reporta_a);
  const suc = _ORG.sucursales;

  main.innerHTML = `
    <div class="view-header animate-in">
      <div>
        <div class="view-title">Organigrama</div>
        <div class="view-subtitle">${_ORG.trabajadores.length} trabajadores activos</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        ${suc.length > 0 ? `
          <select class="form-select" style="max-width:180px;" onchange="_ORG.sucursalFiltro=this.value;_renderOrgVista()">
            <option value="">Todas las sucursales</option>
            <option value="matriz">Matriz</option>
            ${suc.map(s => `<option value="${s.id}">${escapeHtml(s.nombre)}</option>`).join('')}
          </select>
        ` : ''}
        <button class="btn-secondary btn-sm" onclick="_switchOrgVista('cards')" id="org-btn-cards">Tarjetas</button>
        ${hayArbol ? `<button class="btn-secondary btn-sm" onclick="_switchOrgVista('tree')" id="org-btn-tree">Árbol</button>` : ''}
      </div>
    </div>
    <div id="org-vista" class="animate-in"></div>
  `;
  _renderOrgVista();
}

function _switchOrgVista(v) {
  _ORG.vista = v;
  document.getElementById('org-btn-cards')?.classList.toggle('active', v==='cards');
  document.getElementById('org-btn-tree')?.classList.toggle('active', v==='tree');
  _renderOrgVista();
}

function _renderOrgVista() {
  const c = document.getElementById('org-vista');
  if (!c) return;
  const filtrados = _ORG.sucursalFiltro
    ? _ORG.trabajadores.filter(t => {
        if (_ORG.sucursalFiltro === 'matriz') return !t.sucursal_id;
        return t.sucursal_id === _ORG.sucursalFiltro;
      })
    : _ORG.trabajadores;

  if (!filtrados.length) {
    c.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><svg class="ic"><use href="#i-network"></use></svg></div><div class="empty-state-title">Sin trabajadores</div></div>`;
    return;
  }

  if (_ORG.vista === 'tree') {
    _renderOrgTree(c, filtrados);
  } else {
    _renderOrgCards(c, filtrados);
  }
}

function _renderOrgCards(c, trabajadores) {
  const grupos = {};
  for (const t of trabajadores) {
    const dept = t.departamento || 'Sin departamento';
    if (!grupos[dept]) grupos[dept] = [];
    grupos[dept].push(t);
  }
  const deptos = Object.keys(grupos).sort();

  c.innerHTML = deptos.map(dept => {
    const color = _deptColor(dept);
    const trabs = grupos[dept];
    return `
      <div class="card animate-in" style="margin-bottom:16px;overflow:hidden;">
        <div style="background:${color};padding:12px 16px;margin:-20px -20px 16px;display:flex;align-items:center;justify-content:space-between;">
          <span style="color:#fff;font-weight:700;font-size:.95rem;text-shadow:0 1px 3px rgba(0,0,0,.2);">${escapeHtml(dept)}</span>
          <span style="background:rgba(255,255,255,.2);color:#fff;border-radius:100px;padding:2px 10px;font-size:.78rem;font-weight:700;">${trabs.length} trabajador${trabs.length!==1?'es':''}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">
          ${trabs.map(t => {
            const ini = (t.nombre||'?').split(' ').slice(0,2).map(p=>p[0]).join('').toUpperCase();
            return `
              <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg-secondary);border-radius:var(--radius-md);cursor:pointer;transition:background .15s;" onclick="navigate('empleado','${t.id}')" role="button" tabindex="0">
                <div style="width:38px;height:38px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:.88rem;flex-shrink:0;">${ini}</div>
                <div style="overflow:hidden;">
                  <div style="font-weight:700;font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(t.nombre)}">${escapeHtml(t.nombre)}</div>
                  <div style="font-size:.75rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(t.puesto) || ''}">${escapeHtml(t.puesto) || '—'}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function _renderOrgTree(c, trabajadores) {
  const hayArbol = trabajadores.some(t => t.reporta_a);
  if (!hayArbol) {
    c.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><svg class="ic"><use href="#i-network"></use></svg></div>
        <div class="empty-state-title">Sin jerarquía configurada</div>
        <p style="margin-top:8px;font-size:.82rem;color:var(--text-muted);">Configura el campo "Reporta a" en el expediente de cada trabajador para ver el árbol jerárquico.</p>
      </div>`;
    return;
  }

  // Construir árbol
  const byId = {};
  for (const t of trabajadores) byId[t.id] = { ...t, hijos: [] };
  const raices = [];
  for (const t of trabajadores) {
    if (t.reporta_a && byId[t.reporta_a]) byId[t.reporta_a].hijos.push(byId[t.id]);
    else raices.push(byId[t.id]);
  }

  const NODE_W = 160, NODE_H = 52, H_GAP = 24, V_GAP = 70;

  function calcPos(node, x, y) {
    node._x = x; node._y = y;
    if (!node.hijos.length) return NODE_W;
    let cx = x;
    let totalW = 0;
    for (const h of node.hijos) {
      const w = calcPos(h, cx, y + NODE_H + V_GAP);
      cx += w + H_GAP;
      totalW += w + H_GAP;
    }
    totalW -= H_GAP;
    node._x = x + totalW / 2 - NODE_W / 2;
    return Math.max(NODE_W, totalW);
  }

  let cx = 10;
  for (const r of raices) { calcPos(r, cx, 10); cx += NODE_W + H_GAP * 2; }

  function flatten(node, arr = []) {
    arr.push(node);
    for (const h of node.hijos) flatten(h, arr);
    return arr;
  }
  const all = raices.flatMap(r => flatten(r));
  const maxX = Math.max(...all.map(n => n._x + NODE_W)) + 20;
  const maxY = Math.max(...all.map(n => n._y + NODE_H)) + 20;

  function renderNode(n) {
    const color = _deptColor(n.departamento || '');
    const lineas = n.hijos.map(h =>
      `<line x1="${n._x + NODE_W/2}" y1="${n._y + NODE_H}" x2="${h._x + NODE_W/2}" y2="${h._y}" stroke="var(--border)" stroke-width="2"/>`
    ).join('');
    return `
      ${lineas}
      <g onclick="navigate('empleado','${n.id}')" style="cursor:pointer;" role="button" tabindex="0" aria-label="Ver perfil de ${escapeHtml(n.nombre||'')}">
        <rect x="${n._x}" y="${n._y}" width="${NODE_W}" height="${NODE_H}" rx="8" ry="8" fill="var(--bg-secondary)" stroke="${color}" stroke-width="2"/>
        <text x="${n._x + NODE_W/2}" y="${n._y + 20}" text-anchor="middle" fill="var(--text-primary)" font-size="12" font-weight="700">${escapeHtml((n.nombre||'').split(' ').slice(0,2).join(' '))}</text>
        <text x="${n._x + NODE_W/2}" y="${n._y + 36}" text-anchor="middle" fill="var(--text-muted)" font-size="10">${escapeHtml((n.puesto||'').substring(0,22))}</text>
      </g>
    `;
  }

  c.innerHTML = `
    <div style="overflow-x:auto;">
      <svg width="${maxX}" height="${maxY}" xmlns="http://www.w3.org/2000/svg" style="display:block;">
        ${all.map(renderNode).join('')}
      </svg>
    </div>
  `;
}
