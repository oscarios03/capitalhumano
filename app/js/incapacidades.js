/**
 * Capital Humano MX — Módulo Incapacidades IMSS
 */

// `subsidio` es el porcentaje que paga el IMSS, no lo que recibe el trabajador.
// Cuidado con dos casos que antes estaban al revés:
//   · Riesgo de trabajo: el IMSS paga desde el PRIMER día (Art. 58 fr. I LSS),
//     así que el patrón no repone nada — hacerlo pagaba dos veces lo mismo.
//   · Paternidad: NO es incapacidad y el IMSS no paga nada. Son 5 días
//     laborables con goce a cargo del PATRÓN (Art. 132 fr. XXVII Bis LFT).
const INC_TIPOS = {
  enfermedad_general: { label: 'Enfermedad general',  subsidio: 60,  maxDias: 52*7, aCargoPatron: 'primeros3',
    nota: 'IMSS paga 60% del SBC a partir del 4° día (Art. 96 LSS). Los 3 primeros días no los cubre el IMSS ni los obliga la LFT (la relación queda suspendida, Art. 42 fr. II): se pagan solo si la empresa los otorga como prestación (configurable en Mi Empresa).' },
  maternidad:         { label: 'Maternidad',           subsidio: 100, maxDias: 84,  aCargoPatron: 'no',
    nota: 'IMSS paga 100% del SBC durante 84 días (42 antes + 42 después del parto, Art. 101 LSS). El patrón no paga salario en ese periodo.' },
  paternidad:         { label: 'Paternidad',           subsidio: 0,   maxDias: 5,   aCargoPatron: 'todo',
    nota: 'NO es incapacidad del IMSS: son 5 días laborables de permiso CON GOCE a cargo del patrón (Art. 132 fr. XXVII Bis LFT). No se descuentan del salario.' },
  riesgo_trabajo:     { label: 'Riesgo de trabajo',    subsidio: 100, maxDias: null, aCargoPatron: 'no',
    nota: 'IMSS paga 100% del salario desde el PRIMER día (Art. 58 fr. I LSS). El patrón no cubre los 3 primeros días: eso aplica a enfermedad general, no a riesgo de trabajo.' },
  recaida:            { label: 'Recaída',              subsidio: 60,  maxDias: null, aCargoPatron: 'primeros3',
    nota: 'Mismas reglas que enfermedad general: IMSS 60% desde el 4° día.' },
};

let _INC = { tab: 1, trabajadores: [], incapacidades: [] };
const _sbI = () => window.supabase;

async function renderIncapacidades() {
  const _gen = typeof _navGen !== 'undefined' ? _navGen : 0;
  _INC.tab = 1; // Resetear al entrar al módulo
  try {
    const [trabRes, incRes] = await Promise.all([
      _sbI().from('trabajadores')
        .select('id,nombre,salario_mensual,periodo_salario,estado')
        .eq('empresa_id', CTX.empresa.id)
        .eq('estado', 'activo')
        .order('nombre'),
      _sbI().from('incapacidades')
        .select('*,trabajadores(nombre)')
        .eq('empresa_id', CTX.empresa.id)
        .order('creado_en', { ascending: false }),
    ]);
    _INC.trabajadores  = trabRes.data || [];
    _INC.incapacidades = incRes.data || [];
    if (typeof _navStale === 'function' && _navStale(_gen)) return;
    _renderShellINC();
    _renderINCTab();
  } catch(e) { showError(e); }
}

function _renderShellINC() {
  const main = document.getElementById('main-view');
  main.innerHTML = `
    <div class="view-header animate-in">
      <div>
        <div class="view-title">Incapacidades</div>
        <div class="view-subtitle">Registro y seguimiento de incapacidades</div>
      </div>
    </div>
    <div class="tabs animate-in">
      <button class="tab-btn ${_INC.tab===1?'active':''}" onclick="switchINCTab(1)">Lista</button>
      <button class="tab-btn ${_INC.tab===2?'active':''}" onclick="switchINCTab(2)">+ Nueva incapacidad</button>
    </div>
    <div id="inc-content" class="animate-in"></div>
  `;
}

async function switchINCTab(n) {
  _INC.tab = n;
  document.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', i+1===n));
  _renderINCTab();
}

function _renderINCTab() {
  const c = document.getElementById('inc-content');
  if (!c) return;
  _INC.tab === 1 ? _renderINCLista(c) : _renderINCNueva(c);
}

function _renderINCLista(c) {
  if (!_INC.incapacidades.length) {
    c.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><svg class="ic"><use href="#i-activity"></use></svg></div><div class="empty-state-title">Sin incapacidades registradas</div></div>`;
    return;
  }
  c.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Trabajador</th><th>Tipo</th><th>Folio IMSS</th><th>Inicio</th><th>Fin</th><th>Días</th><th>Subsidio IMSS</th><th></th></tr></thead>
        <tbody>
          ${_INC.incapacidades.map(i => `
            <tr>
              <td><strong>${escapeHtml(i.trabajadores?.nombre) || '—'}</strong></td>
              <td>${INC_TIPOS[i.tipo]?.label || escapeHtml(i.tipo)}</td>
              <td style="color:var(--text-muted);">${escapeHtml(i.folio_imss) || '—'}</td>
              <td>${formatDateShort(i.fecha_inicio)}</td>
              <td>${formatDateShort(i.fecha_fin)}</td>
              <td><strong>${i.dias}</strong></td>
              <td><strong>${i.subsidio_pct}%</strong></td>
              <td><button class="btn-danger btn-sm" onclick="eliminarINC('${i.id}')"><svg class="ic"><use href="#i-trash"></use></svg></button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function _renderINCNueva(c) {
  const hoy = new Date().toISOString().split('T')[0];
  const tiposOpts = Object.entries(INC_TIPOS).map(([v,t]) =>
    `<option value="${v}">${t.label} — ${t.subsidio > 0 ? `IMSS ${t.subsidio}%` : 'a cargo del patrón'}</option>`).join('');
  c.innerHTML = `
    <div class="card animate-in" style="max-width:600px;">
      <div class="card-header"><span class="card-title">+ Nueva incapacidad</span></div>
      <div class="form-grid" style="margin-top:14px;">
        <div class="form-group span-2">
          <label class="form-label" for="inc-trab">Trabajador <span class="req">*</span></label>
          <select id="inc-trab" class="form-select" required aria-required="true">
            <option value="">— Seleccionar —</option>
            ${_INC.trabajadores.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group span-2">
          <label class="form-label" for="inc-tipo">Tipo de incapacidad</label>
          <select id="inc-tipo" class="form-select" onchange="_incOnTipo()">${tiposOpts}</select>
          <div id="inc-nota" style="margin-top:6px;font-size:.8rem;color:var(--text-muted);padding:8px 10px;background:var(--gold-dim);border-radius:var(--radius-sm);border:1px solid var(--gold-border);">${INC_TIPOS.enfermedad_general.nota}</div>
        </div>
        <div class="form-group">
          <label class="form-label" for="inc-ini">Fecha inicio <span class="req">*</span></label>
          <input id="inc-ini" type="date" class="form-input" value="${hoy}" onchange="_incCalcDias()" required aria-required="true" />
        </div>
        <div class="form-group">
          <label class="form-label" for="inc-fin">Fecha fin <span class="req">*</span></label>
          <input id="inc-fin" type="date" class="form-input" value="${hoy}" onchange="_incCalcDias()" required aria-required="true" />
        </div>
        <div class="form-group">
          <label class="form-label" for="inc-dias">Días calculados</label>
          <input id="inc-dias" type="number" class="form-input" min="1" placeholder="Auto" />
        </div>
        <div class="form-group">
          <label class="form-label" for="inc-subsidio">% Subsidio IMSS</label>
          <input id="inc-subsidio" type="number" class="form-input" value="60" min="0" max="100" step="1" />
        </div>
        <div class="form-group span-2">
          <label class="form-label" for="inc-folio">Folio IMSS</label>
          <input id="inc-folio" type="text" class="form-input" placeholder="Número de folio (opcional)" />
        </div>
        <div class="form-group span-2">
          <label class="form-label" for="inc-notas">Notas</label>
          <textarea id="inc-notas" class="form-textarea" rows="2"></textarea>
        </div>
      </div>
      <div id="inc-error" class="error-msg" role="alert" style="display:none;margin-top:10px;"></div>
      <div style="display:flex;justify-content:flex-end;margin-top:16px;">
        <button class="btn-primary" onclick="guardarINC()">Guardar</button>
      </div>
    </div>
  `;
}

function _incOnTipo() {
  const tipo = document.getElementById('inc-tipo')?.value;
  const t = INC_TIPOS[tipo];
  if (!t) return;
  const sub = document.getElementById('inc-subsidio');
  const nota = document.getElementById('inc-nota');
  if (sub) sub.value = t.subsidio;
  if (nota) nota.textContent = t.nota;
}

function _incCalcDias() {
  const ini = document.getElementById('inc-ini')?.value;
  const fin = document.getElementById('inc-fin')?.value;
  if (!ini || !fin) return;
  const d1 = new Date(ini+'T00:00:00'), d2 = new Date(fin+'T00:00:00');
  const dias = Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
  const el = document.getElementById('inc-dias');
  if (el) el.value = dias;
}

async function guardarINC() {
  const trabId   = document.getElementById('inc-trab')?.value;
  const tipo     = document.getElementById('inc-tipo')?.value;
  const ini      = document.getElementById('inc-ini')?.value;
  const fin      = document.getElementById('inc-fin')?.value;
  const dias     = parseInt(document.getElementById('inc-dias')?.value) || 0;
  const subsidio = parseFloat(document.getElementById('inc-subsidio')?.value) || 60;
  const folio    = document.getElementById('inc-folio')?.value.trim();
  const notas    = document.getElementById('inc-notas')?.value.trim();
  const err      = document.getElementById('inc-error');
  err.style.display = 'none';
  if (!trabId || !ini || !fin || !dias) {
    err.textContent = 'Completa trabajador, fechas y días.';
    err.style.display = '';
    return;
  }
  try {
    await _sbI().from('incapacidades').insert({
      empresa_id: CTX.empresa.id,
      trabajador_id: trabId,
      tipo, fecha_inicio: ini, fecha_fin: fin,
      dias, subsidio_pct: subsidio,
      folio_imss: folio || null,
      notas: notas || null,
    });
    _INC.tab = 1;
    await renderIncapacidades();
  } catch(e) { err.textContent = e.message; err.style.display = ''; }
}

async function eliminarINC(id) {
  if (!(await showConfirmacion('¿Eliminar este registro de incapacidad?', { peligro:true, textoOk:'Eliminar' }))) return;
  try {
    await _sbI().from('incapacidades').delete().eq('id', id);
    await renderIncapacidades();
  } catch(e) { alert('Error: ' + e.message); }
}
