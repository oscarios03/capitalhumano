/**
 * Capital Humano MX — Módulo de Asistencia
 * 3 tabs: Registro Diario | Incidencias y Alertas | Historial y Reportes
 */

// ═══════════════════════════════════════════════════════════════════════════
//  CONSTANTES
// ═══════════════════════════════════════════════════════════════════════════
const TIPO_ASIST = {
  asistencia:   { label:'Asistencia',          icono:'', cls:'asist-ok'       },
  falta:        { label:'Falta injustificada',  icono:'', cls:'asist-falta'    },
  falta_justif: { label:'Falta justificada',    icono:'', cls:'asist-fjust'    },
  retardo:      { label:'Retardo',              icono:'', cls:'asist-retardo'  },
  retardo_grave:{ label:'Retardo grave',        icono:'', cls:'asist-rgrave'  },
  incapacidad:  { label:'Incapacidad IMSS',     icono:'', cls:'asist-incap'   },
  vacaciones:   { label:'Vacaciones',           icono:'', cls:'asist-vac'     },
  permiso_goce: { label:'Permiso c/ goce',      icono:'', cls:'asist-pgoce'   },
  permiso_sin:  { label:'Permiso s/ goce',      icono:'', cls:'asist-psin'    },
  descanso:     { label:'Descanso semanal',     icono:'', cls:'asist-desc'    },
  festivo:      { label:'Día festivo oficial',  icono:'', cls:'asist-festivo' },
};

// Respaldo de festivos oficiales SOLO para 2026, por si la migración 15 no
// está aplicada. La fuente de verdad es la tabla `dias_festivos` vía
// esFestivo() (festivos.js), que sirve para cualquier año: con este arreglo
// como única fuente, el módulo dejaría de marcar festivos a partir de 2027.
const FESTIVOS_2026_FALLBACK = [
  '2026-01-01','2026-02-02','2026-03-16',
  '2026-05-01','2026-09-16','2026-11-16','2026-12-25',
];

// ¿Es festivo oficial O festivo particular de la empresa?
function _esFestivoDia(iso) {
  if (typeof esFestivo === 'function' && esFestivo(iso)) return true;
  if (typeof esFestivoEmpresa === 'function' && esFestivoEmpresa(iso)) return true;
  return FESTIVOS_2026_FALLBACK.includes(iso);
}

// Info del festivo de empresa para esa fecha (o null)
function _festivoEmpresaInfo(iso) {
  if (typeof prestacionesEmpresa !== 'function') return null;
  const mmdd = String(iso || '').slice(5);
  return prestacionesEmpresa().festivos.find(f =>
    (f.tipo === 'fecha' && f.valor === iso) ||
    (f.tipo === 'recurrente' && f.valor === mmdd)
  ) || null;
}

// Tipos de registro que admiten captura de horas extra (día trabajado)
const _TIPOS_CON_HE = ['asistencia','retardo','retardo_grave','festivo','descanso'];

// ─── Estado interno del módulo ───────────────────────────────────────────────
let _A = {
  tab:         1,
  fecha:       new Date().toISOString().split('T')[0],
  sucursalId:  '',
  trabajadores:[],
  sucursales:  [],
  registros:   {},   // { trabId: { tipo, hora_entrada, minutos_retardo, observaciones } }
};

// ═══════════════════════════════════════════════════════════════════════════
//  PUNTO DE ENTRADA
// ═══════════════════════════════════════════════════════════════════════════
async function renderAsistenciaModulo() {
  const _gen = typeof _navGen !== 'undefined' ? _navGen : 0;
  const main = document.getElementById('main-view');
  main.innerHTML = `<div class="loading"><div class="spinner"></div> Cargando asistencia…</div>`;
  try {
    const [trabs, sucs] = await Promise.all([
      window.supabase.from('trabajadores').select('*,sucursales(nombre)')
        .eq('empresa_id', CTX.empresa.id).eq('estado','activo').order('nombre'),
      window.supabase.from('sucursales').select('id,nombre')
        .eq('empresa_id', CTX.empresa.id).eq('activa', true).order('nombre'),
      // Festivos: al entrar directo por URL (#asistencia) el dashboard no
      // corrió, así que el caché podría estar vacío y no se marcarían.
      typeof cargarFestivos === 'function'
        ? cargarFestivos().catch(e => console.warn('dias_festivos:', e.message))
        : Promise.resolve(),
    ]);
    _A.trabajadores = trabs.data || [];
    _A.sucursales   = sucs.data  || [];
    if (typeof _navStale === 'function' && _navStale(_gen)) return;
    await _renderShell();
    await _cargarYRenderTab();
  } catch(e) {
    if (typeof _navStale === 'function' && _navStale(_gen)) return;
    main.innerHTML = `<div class="alert alert-danger"><svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg><span>${escapeHtml(e.message)}</span></div>`;
  }
}

// ─── Shell con header + tabs ─────────────────────────────────────────────────
async function _renderShell() {
  const main = document.getElementById('main-view');
  const sucursal_opts = _A.sucursales.length > 1
    ? `<select class="form-select" style="max-width:180px;" onchange="_A.sucursalId=this.value;_cargarYRenderTab()">
        <option value="">Todas las sucursales</option>
        ${_A.sucursales.map(s=>`<option value="${s.id}" ${s.id===_A.sucursalId?'selected':''}>${escapeHtml(s.nombre)}</option>`).join('')}
       </select>` : '';

  main.innerHTML = `
    <div class="view-header animate-in">
      <div>
        <div class="view-title">Asistencia</div>
        <div class="view-subtitle">${escapeHtml(CTX.empresa.nombre)}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        ${sucursal_opts}
        <input type="date" class="form-input" style="max-width:160px;"
          value="${_A.fecha}" onchange="_A.fecha=this.value;if(_A.tab===1)_cargarYRenderTab();" />
      </div>
    </div>

    <div class="tabs animate-in" style="margin-bottom:16px;">
      <button class="tab-btn ${_A.tab===1?'active':''}" data-asist-tab="1" onclick="switchAsistTab(1)">Registro Diario</button>
      <button class="tab-btn ${_A.tab===4?'active':''}" data-asist-tab="4" onclick="switchAsistTab(4)">Vista del mes</button>
      <button class="tab-btn ${_A.tab===2?'active':''}" data-asist-tab="2" onclick="switchAsistTab(2)">Incidencias</button>
      <button class="tab-btn ${_A.tab===3?'active':''}" data-asist-tab="3" onclick="switchAsistTab(3)">Historial</button>
    </div>

    <div id="asist-content" class="animate-in"></div>
  `;
}

async function switchAsistTab(tab) {
  _A.tab = tab;
  // Por data-asist-tab y no por índice: el número de pestaña ya no coincide
  // con su posición desde que "Vista del mes" se insertó en segundo lugar.
  document.querySelectorAll('.tab-btn[data-asist-tab]').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.asistTab) === tab));
  await _cargarYRenderTab();
}

async function _cargarYRenderTab() {
  const el = document.getElementById('asist-content');
  if (!el) return;
  el.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
  if (_A.tab === 1) await _tab1();
  else if (_A.tab === 2) await _tab2();
  else if (_A.tab === 4) await _tabMatriz();
  else await _tab3();
}

// ═══════════════════════════════════════════════════════════════════════════
//  TAB 1 — REGISTRO DIARIO
// ═══════════════════════════════════════════════════════════════════════════
async function _tab1() {
  const el = document.getElementById('asist-content');

  // Cargar registros existentes para esta fecha
  const { data: existentes } = await window.supabase
    .from('asistencia')
    .select('*')
    .eq('empresa_id', CTX.empresa.id)
    .eq('fecha', _A.fecha);

  // Construir mapa de registros
  _A.registros = {};
  (existentes || []).forEach(r => { _A.registros[r.trabajador_id] = r; });

  // Filtrar por sucursal si aplica
  let trabs = _A.trabajadores;
  if (_A.sucursalId) trabs = trabs.filter(t => t.sucursal_id === _A.sucursalId);

  const esFestivo = _esFestivoDia(_A.fecha);
  const festEmp   = _festivoEmpresaInfo(_A.fecha);
  const fechaObj  = new Date(_A.fecha + 'T00:00:00');
  const diaSemana = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][fechaObj.getDay()];
  const esFinSem  = fechaObj.getDay() === 0 || fechaObj.getDay() === 6;

  // Calcular trabajadores sin registro para mostrar banner
  let trabsSinReg = 0;
  if (!esFestivo && !esFinSem) {
    const activos = _A.trabajadores.filter(t => {
      if (_A.sucursalId && t.sucursal_id !== _A.sucursalId) return false;
      if (t.dia_descanso === diaSemana) return false;
      return !_A.registros[t.id];
    });
    trabsSinReg = activos.length;
  }

  const filas = trabs.map(t => {
    const reg = _A.registros[t.id];
    // Tipo default según día
    let tipoDef = reg?.tipo || (esFestivo ? 'festivo' : (t.dia_descanso === diaSemana ? 'descanso' : esFinSem ? 'descanso' : 'asistencia'));
    const cfg   = TIPO_ASIST[tipoDef] || TIPO_ASIST.asistencia;

    const tipoOpts = Object.entries(TIPO_ASIST)
      .map(([v,c]) => `<option value="${v}" ${tipoDef===v?'selected':''}>${c.icono} ${c.label}</option>`)
      .join('');

    const showHora  = ['asistencia','retardo','retardo_grave'].includes(tipoDef);
    const showMin   = ['retardo','retardo_grave'].includes(tipoDef);
    const showHE    = _TIPOS_CON_HE.includes(tipoDef);

    return `
      <tr id="row-${t.id}" class="asist-row ${cfg.cls}" data-trab="${t.id}">
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="perfil-avatar" style="width:32px;height:32px;font-size:.75rem;">${escapeHtml(iniciales(t.nombre))}</div>
            <div>
              <div style="font-weight:700;font-size:.88rem;">${escapeHtml(t.nombre)} ${_origenBadge(reg?.origen)}</div>
              <div style="font-size:.72rem;color:var(--text-muted);">${escapeHtml(t.puesto)||''}</div>
            </div>
          </div>
        </td>
        <td style="min-width:190px;">
          <select class="form-select form-select-sm" id="tipo-${t.id}"
            onchange="onTipoRowChange('${t.id}')">
            ${tipoOpts}
          </select>
        </td>
        <td id="td-hora-${t.id}" ${!showHora?'style="display:none"':''}>
          <input type="time" class="form-input form-input-sm" id="hora-${t.id}"
            value="${(reg?.hora_entrada||'').slice(0,5)}" placeholder="08:00"
            onchange="_onHoraEntradaCapturada('${t.id}')"
            title="${t.hora_inicio ? `Entrada de ${t.nombre.split(' ')[0]}: ${String(t.hora_inicio).slice(0,5)} (tolerancia ${_toleranciaMin()} min)` : 'Este trabajador no tiene horario capturado: el retardo no se detecta solo'}" />
          <div id="hora-aviso-${t.id}" style="display:none;font-size:.68rem;margin-top:2px;"></div>
        </td>
        <td id="td-min-${t.id}" ${!showMin?'style="display:none"':''}>
          <input type="number" class="form-input form-input-sm" id="min-${t.id}"
            value="${reg?.minutos_retardo||0}" min="0" max="480" style="width:70px;" />
        </td>
        <td id="td-he-${t.id}" ${!showHE?'style="display:none"':''}>
          <input type="number" class="form-input form-input-sm" id="he-${t.id}"
            value="${reg?.horas_extra||0}" min="0" max="12" step="0.5" style="width:70px;"
            title="Horas extra laboradas (Art. 67-68 LFT)" />
        </td>
        <td>
          <input type="text" class="form-input form-input-sm" id="obs-${t.id}"
            value="${escapeHtml(reg?.observaciones)||''}" placeholder="Observaciones…" style="min-width:140px;" />
        </td>
        <td>
          <button class="btn-secondary btn-sm" onclick="guardarFilaAsistencia('${t.id}')"></button>
        </td>
      </tr>`;
  }).join('');

  el.innerHTML = `
    ${trabsSinReg > 0 ? `
    <div class="banner-pendiente animate-in">
      <span class="banner-pendiente-icon"></span>
      <div>
        <strong>${trabsSinReg} trabajador${trabsSinReg!==1?'es':''} sin registro</strong>
        en este día laborable.
        <span style="font-size:.8rem;opacity:.8;"> Captura la asistencia y guarda para completar.</span>
      </div>
      <button class="btn-primary btn-sm" onclick="guardarDiaCompleto()" style="margin-left:auto;flex-shrink:0;">
        Guardar todo
      </button>
    </div>` : ''}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
      <div style="font-size:.85rem;color:var(--text-muted);">
        ${esFestivo
          ? (festEmp
              ? `Día festivo de la empresa${festEmp.descripcion ? ' — ' + escapeHtml(festEmp.descripcion) : ''}`
              : 'Día festivo oficial')
          : `${diaSemana} — ${formatDateShort(_A.fecha)}`}
        — <strong>${trabs.length}</strong> trabajadores
        ${trabsSinReg === 0 && !esFestivo && !esFinSem
          ? `<span style="color:#4caf50;font-weight:700;margin-left:6px;">Registro completo</span>` : ''}
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn-secondary btn-sm" onclick="marcarTodosAsistencia()">Todos asistencia</button>
        <button class="btn-primary btn-sm" onclick="guardarDiaCompleto()">Guardar todo el día</button>
      </div>
    </div>

    ${trabs.length === 0
      ? `<div class="empty-state"><div class="empty-state-icon"><svg class="ic"><use href="#i-user"></use></svg></div><div class="empty-state-title">Sin trabajadores ${_A.sucursalId?'en esta sucursal':''}</div></div>`
      : `<div class="table-wrap">
          <table class="data-table asist-table">
            <thead><tr>
              <th scope="col" style="min-width:200px;">Trabajador</th>
              <th scope="col">Tipo de registro</th>
              <th scope="col">Hora entrada</th>
              <th scope="col">Min. retardo</th>
              <th scope="col">Hrs extra</th>
              <th scope="col">Observaciones</th>
              <th scope="col"></th>
            </tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </div>`
    }
    <div id="asist-msg" role="alert" style="display:none;margin-top:10px;"></div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
//  TAB 4 — VISTA DEL MES (matriz trabajadores × días)
// ═══════════════════════════════════════════════════════════════════════════
// El registro diario sirve para capturar, pero no deja ver patrones: quién
// falta siempre los lunes, quién viene acumulando retardos. Esto es una sola
// consulta del mes y todo el mes de un vistazo.

async function _tabMatriz() {
  const el = document.getElementById('asist-content');
  const base = new Date(_A.fecha + 'T00:00:00');
  const anio = base.getFullYear(), mes = base.getMonth();
  const primero = `${anio}-${String(mes+1).padStart(2,'0')}-01`;
  const diasMes = new Date(anio, mes + 1, 0).getDate();
  const ultimo  = `${anio}-${String(mes+1).padStart(2,'0')}-${String(diasMes).padStart(2,'0')}`;

  let trabs = _A.trabajadores;
  if (_A.sucursalId) trabs = trabs.filter(t => t.sucursal_id === _A.sucursalId);

  const { data: registros, error } = await window.supabase
    .from('asistencia')
    .select('trabajador_id, fecha, tipo, minutos_retardo, horas_extra')
    .eq('empresa_id', CTX.empresa.id)
    .gte('fecha', primero).lte('fecha', ultimo);

  if (error) { el.innerHTML = `<div class="alert alert-danger"><svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg><span>${error.message}</span></div>`; return; }

  // Indexar: { trabId: { 'YYYY-MM-DD': registro } }
  const idx = {};
  for (const r of (registros || [])) {
    (idx[r.trabajador_id] = idx[r.trabajador_id] || {})[r.fecha] = r;
  }

  const iso  = d => `${anio}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const DOW  = ['D','L','M','M','J','V','S'];
  const dias = Array.from({ length: diasMes }, (_, i) => {
    const d = i + 1, f = iso(d);
    const dow = new Date(f + 'T00:00:00').getDay();
    return { d, f, dow, festivo: _esFestivoDia(f), finde: dow === 0 || dow === 6 };
  });

  const hoyISO = new Date().toISOString().split('T')[0];

  const cuerpo = trabs.map(t => {
    const reg = idx[t.id] || {};
    const celdas = dias.map(dia => {
      const r   = reg[dia.f];
      const cfg = r ? TIPO_ASIST[r.tipo] : null;
      const bg  = dia.festivo ? 'var(--gold-dim)' : dia.finde ? 'rgba(148,160,172,.08)' : 'transparent';
      const titulo = r
        ? `${t.nombre} — ${formatDateShort(dia.f)}: ${cfg?.label || r.tipo}` +
          (r.minutos_retardo ? ` (${r.minutos_retardo} min)` : '') +
          (r.horas_extra ? ` · ${r.horas_extra} h extra` : '')
        : `${t.nombre} — ${formatDateShort(dia.f)}: sin registro${dia.festivo ? ' (festivo)' : dia.finde ? ' (fin de semana)' : ''}`;
      return `<td class="mtz-celda" style="background:${bg};${dia.f === hoyISO ? 'outline:1.5px solid var(--gold-primary);outline-offset:-1.5px;' : ''}"
                  title="${titulo}" onclick="_matrizIrADia('${dia.f}')">
        ${r ? (cfg?.icono || '•') : '<span style="opacity:.18;">·</span>'}
      </td>`;
    }).join('');

    // Totales de la fila: lo que el patrón realmente vigila
    const vals    = Object.values(reg);
    const faltas  = vals.filter(r => r.tipo === 'falta').length;
    const retardos= vals.filter(r => r.tipo === 'retardo' || r.tipo === 'retardo_grave').length;
    const he      = vals.reduce((s, r) => s + (parseFloat(r.horas_extra) || 0), 0);

    return `<tr>
      <td class="mtz-nombre" title="${t.nombre}">${t.nombre}</td>
      ${celdas}
      <td style="font-weight:700;color:${faltas ? 'var(--red-warn)' : 'var(--text-muted)'};">${faltas || '—'}</td>
      <td style="font-weight:700;color:${retardos ? 'var(--amber-warn)' : 'var(--text-muted)'};">${retardos || '—'}</td>
      <td style="font-weight:700;color:var(--text-muted);">${he ? he.toFixed(1) : '—'}</td>
    </tr>`;
  }).join('');

  const nombreMes = typeof MESES !== 'undefined' ? MESES[mes] : '';
  const totalFaltas = (registros || []).filter(r => r.tipo === 'falta').length;

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <button class="btn-secondary btn-sm" onclick="_matrizMes(-1)" title="Mes anterior">←</button>
        <strong style="text-transform:capitalize;min-width:130px;text-align:center;">${nombreMes} ${anio}</strong>
        <button class="btn-secondary btn-sm" onclick="_matrizMes(1)" title="Mes siguiente">→</button>
      </div>
      <div style="font-size:.82rem;color:var(--text-muted);">
        ${trabs.length} trabajador${trabs.length!==1?'es':''} · ${(registros||[]).length} registro${(registros||[]).length!==1?'s':''}
        ${totalFaltas ? ` · <strong style="color:var(--red-warn);">${totalFaltas} falta${totalFaltas!==1?'s':''}</strong>` : ''}
      </div>
    </div>

    ${!trabs.length
      ? `<div class="empty-state"><div class="empty-state-icon"><svg class="ic"><use href="#i-user"></use></svg></div><div class="empty-state-title">Sin trabajadores${_A.sucursalId?' en esta sucursal':''}</div></div>`
      : `<div class="table-wrap" style="overflow-x:auto;">
          <table class="data-table mtz-tabla">
            <thead>
              <tr>
                <th class="mtz-nombre-h">Trabajador</th>
                ${dias.map(d => `<th class="mtz-dia-h" style="${d.festivo?'color:var(--gold-primary);':d.finde?'opacity:.5;':''}"
                     title="${d.festivo ? 'Día festivo' : ''}">${d.d}<div style="font-size:.6rem;font-weight:400;opacity:.7;">${DOW[d.dow]}</div></th>`).join('')}
                <th title="Faltas injustificadas del mes">F</th>
                <th title="Retardos del mes">R</th>
                <th title="Horas extra del mes">HE</th>
              </tr>
            </thead>
            <tbody>${cuerpo}</tbody>
          </table>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:12px;font-size:.75rem;color:var(--text-muted);">
          ${Object.entries(TIPO_ASIST).map(([k,c]) => `<span>${c.icono} ${c.label}</span>`).join('')}
        </div>
        <div style="font-size:.75rem;color:var(--text-muted);margin-top:8px;">
          Haz clic en cualquier día para capturarlo o corregirlo. Los festivos se sombrean en dorado y los fines de semana en gris.
        </div>`}
  `;
  _injectMatrizCSS();
}

/** Clic en una celda → abre ese día en el Registro Diario, listo para editar. */
function _matrizIrADia(fechaISO) {
  _A.fecha = fechaISO;
  _A.tab = 1;
  _renderShell().then(() => _cargarYRenderTab());
}

function _matrizMes(delta) {
  const d = new Date(_A.fecha + 'T00:00:00');
  d.setDate(1);
  d.setMonth(d.getMonth() + delta);
  _A.fecha = d.toISOString().split('T')[0];
  _renderShell().then(() => _cargarYRenderTab());
}

function _injectMatrizCSS() {
  if (document.getElementById('mtz-css')) return;
  const s = document.createElement('style');
  s.id = 'mtz-css';
  s.textContent = `
  .mtz-tabla { border-collapse:separate; border-spacing:0; }
  .mtz-tabla th, .mtz-tabla td { padding:3px 2px !important; text-align:center; font-size:.78rem; }
  .mtz-dia-h { min-width:22px; font-size:.68rem !important; }
  .mtz-nombre, .mtz-nombre-h {
    position:sticky; left:0; z-index:2; background:var(--bg-card, #1c2634);
    text-align:left !important; min-width:150px; max-width:180px;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    padding-right:8px !important; font-weight:600;
  }
  .mtz-nombre-h { z-index:3; }
  .mtz-celda { cursor:pointer; }
  .mtz-celda:hover { background:var(--gold-dim, var(--gold-dim)) !important; }`;
  document.head.appendChild(s);
}

function _origenBadge(origen) {
  if (origen === 'kiosco') return '<span title="Registrado por kiosco"></span>';
  if (origen === 'checador_fisico') return '<span title="Registrado por checador físico"></span>';
  return '';
}

/** Tolerancia de retardo de la empresa, en minutos (default 10, igual que la BD). */
function _toleranciaMin() {
  const v = parseInt(CTX?.empresa?.tolerancia_retardo_min);
  return Number.isFinite(v) ? v : 10;
}

/**
 * Compara una hora de entrada contra el horario del trabajador.
 * REPLICA EXACTAMENTE la regla de registrar_checada() (migración 15): retardo
 * si la entrada supera hora_inicio + tolerancia, y los minutos se cuentan
 * desde hora_inicio (no desde el fin de la tolerancia). Si las dos vías
 * clasificaran distinto, el mismo trabajador saldría con retardo o sin él
 * según hubiera checado en el kiosco o lo hubieran capturado a mano.
 * @returns {{ esRetardo:boolean, minutos:number }|null} null si no hay con qué comparar
 */
function evaluarRetardo(horaEntrada, horaInicio, toleranciaMin) {
  if (!horaEntrada || !horaInicio) return null;
  const min = hhmm => {
    const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number);
    return (Number.isFinite(h) && Number.isFinite(m)) ? h * 60 + m : null;
  };
  const entrada = min(horaEntrada), inicio = min(horaInicio);
  if (entrada === null || inicio === null) return null;

  const tol = Number.isFinite(toleranciaMin) ? toleranciaMin : 10;
  return entrada > inicio + tol
    ? { esRetardo: true,  minutos: Math.max(0, entrada - inicio) }
    : { esRetardo: false, minutos: 0 };
}

/**
 * Al capturar la hora de entrada a mano, clasifica el registro solo. No pisa
 * una decisión explícita del usuario: si ya marcó falta, incapacidad, etc.,
 * se respeta; solo ajusta entre asistencia ↔ retardo.
 */
function _onHoraEntradaCapturada(trabId) {
  const hora  = document.getElementById(`hora-${trabId}`)?.value;
  const sel   = document.getElementById(`tipo-${trabId}`);
  const aviso = document.getElementById(`hora-aviso-${trabId}`);
  const trab  = _A.trabajadores.find(t => t.id === trabId);
  if (!sel || !trab) return;

  const ocultar = () => { if (aviso) { aviso.style.display = 'none'; aviso.textContent = ''; } };

  if (!hora) { ocultar(); return; }
  if (!trab.hora_inicio) {
    if (aviso) {
      aviso.style.display = '';
      aviso.style.color = 'var(--text-muted)';
      aviso.textContent = 'Sin horario capturado — no se puede detectar el retardo';
    }
    return;
  }
  // Solo se autoclasifica entre asistencia y retardo
  if (!['asistencia','retardo','retardo_grave'].includes(sel.value)) { ocultar(); return; }

  const r = evaluarRetardo(hora, trab.hora_inicio, _toleranciaMin());
  if (!r) { ocultar(); return; }

  if (r.esRetardo) {
    // Si ya lo marcaron como grave, se respeta: solo se actualizan los minutos
    if (sel.value !== 'retardo_grave') sel.value = 'retardo';
    const min = document.getElementById(`min-${trabId}`);
    if (min) min.value = r.minutos;
    if (aviso) {
      aviso.style.display = '';
      aviso.style.color = 'var(--amber-warn)';
      aviso.textContent = `${r.minutos} min tarde (entra ${String(trab.hora_inicio).slice(0,5)})`;
    }
  } else {
    if (sel.value !== 'asistencia') sel.value = 'asistencia';
    const min = document.getElementById(`min-${trabId}`);
    if (min) min.value = 0;
    if (aviso) {
      aviso.style.display = '';
      aviso.style.color = 'var(--green-ok)';
      aviso.textContent = '✓ Dentro de tolerancia';
    }
  }
  onTipoRowChange(trabId);
}

function onTipoRowChange(trabId) {
  const tipo     = document.getElementById(`tipo-${trabId}`)?.value;
  const cfg      = TIPO_ASIST[tipo];
  const tdHora   = document.getElementById(`td-hora-${trabId}`);
  const tdMin    = document.getElementById(`td-min-${trabId}`);
  const row      = document.getElementById(`row-${trabId}`);

  const tdHE = document.getElementById(`td-he-${trabId}`);
  if (tdHora) tdHora.style.display = ['asistencia','retardo','retardo_grave'].includes(tipo) ? '' : 'none';
  if (tdMin)  tdMin.style.display  = ['retardo','retardo_grave'].includes(tipo) ? '' : 'none';
  if (tdHE)   tdHE.style.display   = _TIPOS_CON_HE.includes(tipo) ? '' : 'none';

  // Cambiar color de la fila
  if (row && cfg) {
    Object.values(TIPO_ASIST).forEach(c => row.classList.remove(c.cls));
    row.classList.add(cfg.cls);
  }
}

function _leerFila(trabId) {
  const tipo = document.getElementById(`tipo-${trabId}`)?.value || 'asistencia';
  return {
    trabajador_id:   trabId,
    empresa_id:      CTX.empresa.id,
    fecha:           _A.fecha,
    tipo,
    hora_entrada:    document.getElementById(`hora-${trabId}`)?.value || null,
    minutos_retardo: parseInt(document.getElementById(`min-${trabId}`)?.value) || 0,
    horas_extra:     _TIPOS_CON_HE.includes(tipo)
                       ? Math.min(12, Math.max(0, parseFloat(document.getElementById(`he-${trabId}`)?.value) || 0))
                       : 0,
    observaciones:   document.getElementById(`obs-${trabId}`)?.value.trim() || null,
  };
}

async function guardarFilaAsistencia(trabId) {
  const btn = document.querySelector(`#row-${trabId} button`);
  btnCargando(btn, 'Guardando…');
  try {
    const datos = _leerFila(trabId);
    await _upsertAsistencia(datos);
    // Actualizar ultima_fecha_vacaciones si aplica
    if (datos.tipo === 'vacaciones') {
      await window.supabase.from('trabajadores')
        .update({ ultima_fecha_vacaciones: datos.fecha }).eq('id', trabId);
    }
    if (btn) { btn.textContent = '✓ Listo'; setTimeout(()=>{ if(btn){btn.textContent='Guardar';btn.disabled=false;} },1500); }
    localStorage.removeItem('alertas_last_gen'); // fuerza recalcular alertas (incl. Art. 47) en el próximo dashboard
  } catch(e) {
    btnRestaurar(btn);
    alert('Error: ' + e.message);
  }
}

async function guardarDiaCompleto() {
  const trabs = _A.trabajadores.filter(t => !_A.sucursalId || t.sucursal_id === _A.sucursalId);
  const msg   = document.getElementById('asist-msg');
  if (msg) { msg.textContent = 'Guardando…'; msg.style.display = ''; msg.className = ''; }

  try {
    const batch = trabs.map(t => _leerFila(t.id));
    // Actualizar vacaciones
    const conVac = batch.filter(d => d.tipo === 'vacaciones');
    for (const d of conVac) {
      await window.supabase.from('trabajadores')
        .update({ ultima_fecha_vacaciones: d.fecha }).eq('id', d.trabajador_id);
    }
    await _upsertAsistencia(batch);
    if (msg) { msg.textContent = `${batch.length} registros guardados correctamente`; msg.className = 'alert alert-success'; }
    // Fuerza recalcular alertas (incl. Art. 47 — faltas injustificadas) en el próximo dashboard
    if (batch.some(d => d.tipo === 'falta')) localStorage.removeItem('alertas_last_gen');
  } catch(e) {
    if (msg) { msg.textContent = 'Error: ' + e.message; msg.className = 'alert alert-danger'; }
  }
}

async function marcarTodosAsistencia() {
  const trabs = _A.trabajadores.filter(t => !_A.sucursalId || t.sucursal_id === _A.sucursalId);
  trabs.forEach(t => {
    const sel = document.getElementById(`tipo-${t.id}`);
    if (sel) { sel.value = 'asistencia'; onTipoRowChange(t.id); }
  });
}

async function _upsertAsistencia(datos) {
  const arr = Array.isArray(datos) ? datos : [datos];
  const { error } = await window.supabase
    .from('asistencia')
    .upsert(arr, { onConflict: 'trabajador_id,fecha' });
  if (error) {
    // Tolerancia: si la migración 14 no está aplicada, reintentar sin horas_extra
    if (/horas_extra/i.test(error.message || '')) {
      console.warn('Columna asistencia.horas_extra no existe — aplica la migración 14_migration_prestaciones.sql');
      const sinHE = arr.map(({ horas_extra, ...resto }) => resto);
      const { error: err2 } = await window.supabase
        .from('asistencia')
        .upsert(sinHE, { onConflict: 'trabajador_id,fecha' });
      if (err2) throw err2;
      return;
    }
    throw error;
  }
}

// Nota: la alerta de "3+ faltas injustificadas en 30 días" (Art. 47 Fracc. X
// LFT) ya NO se genera aquí en el cliente — se movió a generar_alertas()
// (migración 38) para que la ventana de 30 días naturales se cuente
// correctamente a partir de la 3ra inasistencia y se recalcule junto con el
// resto de las alertas legales (antes, el DELETE de generar_alertas() borraba
// esta alerta en cada regeneración y solo volvía a crearse al capturar una
// falta nueva). Guardar una falta aquí solo invalida el caché de alertas
// (ver guardarFilaAsistencia/guardarDiaCompleto) para forzar el recálculo.

// ═══════════════════════════════════════════════════════════════════════════
//  TAB 2 — INCIDENCIAS Y ALERTAS
// ═══════════════════════════════════════════════════════════════════════════
async function _tab2() {
  const el = document.getElementById('asist-content');
  const hace30     = new Date(); hace30.setDate(hace30.getDate() - 30);
  const inicioMes  = `${mesActual()}-01`;
  const hoy        = new Date().toISOString().split('T')[0];

  // A. Faltas injustificadas ≥3 en 30 días (Art. 47)
  const { data: faltas30Raw } = await window.supabase
    .from('asistencia')
    .select('trabajador_id, fecha, trabajadores(nombre,puesto)')
    .eq('empresa_id', CTX.empresa.id)
    .eq('tipo', 'falta')
    .gte('fecha', hace30.toISOString().split('T')[0])
    .order('fecha');

  const faltasPorTrab = {};
  (faltas30Raw || []).forEach(r => {
    const id = r.trabajador_id;
    if (!faltasPorTrab[id]) faltasPorTrab[id] = { info: r.trabajadores, fechas: [] };
    faltasPorTrab[id].fechas.push(r.fecha);
  });
  const enRiesgo = Object.entries(faltasPorTrab)
    .filter(([,v]) => v.fechas.length >= 1)
    .sort((a,b) => b[1].fechas.length - a[1].fechas.length);

  // B. Retardos en mes actual ≥3
  const { data: retardosMes } = await window.supabase
    .from('asistencia')
    .select('trabajador_id, fecha, minutos_retardo, trabajadores(nombre,puesto)')
    .eq('empresa_id', CTX.empresa.id)
    .in('tipo', ['retardo','retardo_grave'])
    .gte('fecha', inicioMes);

  const retardosPorTrab = {};
  (retardosMes || []).forEach(r => {
    const id = r.trabajador_id;
    if (!retardosPorTrab[id]) retardosPorTrab[id] = { info: r.trabajadores, registros: [] };
    retardosPorTrab[id].registros.push(r);
  });
  const conRetardos = Object.entries(retardosPorTrab)
    .filter(([,v]) => v.registros.length >= 3)
    .sort((a,b) => b[1].registros.length - a[1].registros.length);

  // C. Incapacidades activas
  const { data: incapacidades } = await window.supabase
    .from('asistencia')
    .select('trabajador_id, fecha, observaciones, trabajadores(nombre,puesto)')
    .eq('empresa_id', CTX.empresa.id)
    .eq('tipo', 'incapacidad')
    .gte('fecha', inicioMes);

  const incapPorTrab = {};
  (incapacidades || []).forEach(r => {
    const id = r.trabajador_id;
    if (!incapPorTrab[id]) incapPorTrab[id] = { info: r.trabajadores, dias: [] };
    incapPorTrab[id].dias.push(r.fecha);
  });

  // D. Permisos sin goce
  const { data: sinGoce } = await window.supabase
    .from('asistencia')
    .select('trabajador_id, fecha, trabajadores(nombre,puesto)')
    .eq('empresa_id', CTX.empresa.id)
    .eq('tipo', 'permiso_sin')
    .gte('fecha', inicioMes);

  const sinGocePorTrab = {};
  (sinGoce || []).forEach(r => {
    const id = r.trabajador_id;
    if (!sinGocePorTrab[id]) sinGocePorTrab[id] = { info: r.trabajadores, dias: [] };
    sinGocePorTrab[id].dias.push(r.fecha);
  });

  // E. Días laborables sin registro (mes actual hasta hoy)
  const { data: todosRegistrosMes } = await window.supabase
    .from('asistencia')
    .select('trabajador_id, fecha')
    .eq('empresa_id', CTX.empresa.id)
    .gte('fecha', inicioMes)
    .lte('fecha', hoy);

  const registrosSet = new Set((todosRegistrosMes || []).map(r => `${r.trabajador_id}|${r.fecha}`));

  // Iterar días laborables del mes hasta hoy
  const diasPendientes = [];
  const dIni = new Date(inicioMes + 'T00:00:00');
  const dFin = new Date(hoy + 'T00:00:00');
  for (let d = new Date(dIni); d <= dFin; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().split('T')[0];
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;          // fin de semana
    if (_esFestivoDia(iso)) continue;              // festivo oficial o de la empresa
    const diaNombre = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][dow];
    const sinReg = _A.trabajadores.filter(t => {
      if (t.dia_descanso === diaNombre) return false;  // es su descanso fijo
      return !registrosSet.has(`${t.id}|${iso}`);
    });
    if (sinReg.length > 0) diasPendientes.push({ fecha: iso, trabajadores: sinReg });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const seccionA = enRiesgo.length === 0 ? `
    <div class="empty-state" style="padding:24px;">
      <div class="empty-state-icon"><svg class="ic"><use href="#i-check-circle"></use></svg></div>
      <div class="empty-state-title">Sin trabajadores en riesgo</div>
    </div>` : enRiesgo.map(([trabId, {info, fechas}]) => {
      const pct   = Math.min(100, (fechas.length / 3) * 100);
      const color = fechas.length >= 3 ? 'var(--red-warn)' : fechas.length === 2 ? 'var(--amber-warn)' : 'var(--gold-primary)';
      return `
        <div class="incid-card ${fechas.length>=3?'incid-critica':'incid-riesgo'}">
          <div class="incid-header">
            <div>
              <strong>${escapeHtml(info?.nombre || trabId)}</strong>
              <span style="font-size:.78rem;color:var(--text-muted);margin-left:6px;">${escapeHtml(info?.puesto)||''}</span>
            </div>
            <div style="display:flex;gap:6px;">
              ${fechas.length >= 3
                ? `<button class="btn-danger btn-sm" onclick="generarActaDesdeAsistencia('${trabId}','rescisoria','falta',${JSON.stringify(fechas)})">
                    Generar Acta Rescisoria
                  </button>`
                : `<button class="btn-secondary btn-sm" onclick="generarActaDesdeAsistencia('${trabId}','formal','falta',${JSON.stringify(fechas)})">
                    Generar Acta Formal
                  </button>`}
              <button class="btn-secondary btn-sm" onclick="navigate('empleado','${trabId}')">Ver expediente</button>
            </div>
          </div>
          <div class="incid-barra-wrap">
            <div class="incid-barra" style="width:${pct}%;background:${color};"></div>
          </div>
          <div style="font-size:.78rem;color:var(--text-muted);margin-top:6px;">
            <strong style="color:${color};">${fechas.length} falta${fechas.length!==1?'s':''}</strong> en 30 días
            · Fechas: ${fechas.map(f=>formatDateShort(f)).join(', ')}
            ${fechas.length>=3?' · <strong style="color:var(--red-warn);">Art. 47 Fracc. X LFT — causal de rescisión</strong>':''}
          </div>
        </div>`;
    }).join('');

  const seccionB = conRetardos.length === 0 ? `
    <div class="empty-state" style="padding:16px;">
      <div class="empty-state-icon"><svg class="ic"><use href="#i-check-circle"></use></svg></div><div class="empty-state-title">Sin retardos acumulados</div>
    </div>` : conRetardos.map(([trabId, {info, registros}]) => `
      <div class="incid-card">
        <div class="incid-header">
          <div><strong>${escapeHtml(info?.nombre||trabId)}</strong> — <span style="color:var(--amber-warn);font-weight:700;">${registros.length} retardos</span> este mes</div>
          <div style="display:flex;gap:6px;">
            <button class="btn-secondary btn-sm" onclick="generarActaDesdeAsistencia('${trabId}','amonestacion','retardo',[])">
              Acta Amonestación
            </button>
            <button class="btn-secondary btn-sm" onclick="navigate('empleado','${trabId}')">Ver expediente</button>
          </div>
        </div>
        <div style="font-size:.78rem;color:var(--text-muted);margin-top:4px;">
          Fechas: ${registros.map(r=>formatDateShort(r.fecha)+(r.minutos_retardo?` (${r.minutos_retardo} min)`:'') ).join(', ')}
        </div>
      </div>`).join('');

  const seccionC = Object.entries(incapPorTrab).length === 0
    ? `<div class="empty-state" style="padding:16px;"><div class="empty-state-icon"><svg class="ic"><use href="#i-check-circle"></use></svg></div><div class="empty-state-title">Sin incapacidades activas</div></div>`
    : Object.entries(incapPorTrab).map(([id,{info,dias}]) => `
        <div class="incid-card">
          <div class="incid-header">
            <div><strong>${escapeHtml(info?.nombre||id)}</strong> · ${dias.length} día${dias.length!==1?'s':''} de incapacidad</div>
            <button class="btn-secondary btn-sm" onclick="navigate('empleado','${id}')">Ver expediente</button>
          </div>
          <div style="font-size:.78rem;color:var(--text-muted);margin-top:4px;">
            Fechas: ${dias.map(formatDateShort).join(', ')}
          </div>
        </div>`).join('');

  const seccionD = Object.entries(sinGocePorTrab).length === 0
    ? `<div class="empty-state" style="padding:16px;"><div class="empty-state-icon"><svg class="ic"><use href="#i-check-circle"></use></svg></div><div class="empty-state-title">Sin permisos sin goce</div></div>`
    : Object.entries(sinGocePorTrab).map(([id,{info,dias}]) => `
        <div class="incid-card">
          <div class="incid-header">
            <div><strong>${escapeHtml(info?.nombre||id)}</strong> · ${dias.length} día${dias.length!==1?'s':''} sin goce de sueldo</div>
          </div>
          <div style="font-size:.78rem;color:var(--amber-warn);margin-top:4px;">
            Descuento pendiente en nómina · Fechas: ${dias.map(formatDateShort).join(', ')}
          </div>
        </div>`).join('');

  // ── Render sección E ─────────────────────────────────────────────────────
  const seccionE = diasPendientes.length === 0 ? `
    <div class="empty-state" style="padding:16px;">
      <div class="empty-state-icon"><svg class="ic"><use href="#i-check-circle"></use></svg></div>
      <div class="empty-state-title">Todos los días del mes tienen registro completo</div>
    </div>` : diasPendientes.map(({ fecha, trabajadores: sinR }) => `
      <div class="incid-card incid-pendiente">
        <div class="incid-header">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.3rem;"></span>
            <div>
              <strong>${formatDateShort(fecha)}</strong>
              <span style="font-size:.78rem;color:var(--text-muted);margin-left:6px;">
                — ${['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][new Date(fecha+'T00:00:00').getDay()]}
              </span>
            </div>
            <span class="badge-pendiente">${sinR.length} sin registro</span>
          </div>
          <button class="btn-primary btn-sm" onclick="_irAFechaPendiente('${fecha}')">
            Capturar
          </button>
        </div>
        <div style="font-size:.78rem;color:var(--text-muted);margin-top:6px;line-height:1.7;">
          ${sinR.slice(0,6).map(t=>`<span class="chip-trab">${escapeHtml(t.nombre)}</span>`).join('')}
          ${sinR.length > 6 ? `<span style="color:var(--text-muted);font-style:italic;"> +${sinR.length-6} más</span>` : ''}
        </div>
      </div>`).join('');

  el.innerHTML = `
    <div class="incid-seccion" style="border:1.5px solid var(--gold-border);background:var(--gold-dim);border-radius:var(--radius);">
      <div class="incid-seccion-titulo" style="color:var(--gold-primary);">
        Días laborables sin registro — Pendiente de captura
        ${diasPendientes.length > 0
          ? `<span style="margin-left:8px;font-size:.78rem;background:var(--gold-primary);color:#000;padding:2px 8px;border-radius:100px;font-weight:700;">${diasPendientes.length} día${diasPendientes.length!==1?'s':''}</span>`
          : ''}
      </div>
      ${seccionE}
    </div>
    <div class="incid-seccion">
      <div class="incid-seccion-titulo">
        ● Trabajadores en riesgo — Art. 47 Fracc. X LFT (faltas injustificadas, últimos 30 días)
      </div>
      ${seccionA}
    </div>
    <div class="incid-seccion">
      <div class="incid-seccion-titulo">● Retardos acumulados en el mes</div>
      ${seccionB}
    </div>
    <div class="incid-seccion">
      <div class="incid-seccion-titulo">Incapacidades activas</div>
      ${seccionC}
    </div>
    <div class="incid-seccion">
      <div class="incid-seccion-titulo">Permisos sin goce — descuento en nómina</div>
      ${seccionD}
    </div>
  `;
}

// ── Ir a fecha pendiente desde Tab 2 ────────────────────────────────────────
function _irAFechaPendiente(fecha) {
  _A.fecha = fecha;
  _A.tab   = 1;
  // Actualizar input de fecha en el header si existe
  const inp = document.querySelector('input[type="date"].form-input');
  if (inp) inp.value = fecha;
  document.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', i===0));
  _cargarYRenderTab();
}

// ── Bridge con módulo Actas ──────────────────────────────────────────────────
function generarActaDesdeAsistencia(trabId, tipoActa, tipoIncid, fechas) {
  // Pre-cargar datos para el modal de actas
  const fechasStr = fechas.length
    ? `\nFechas de faltas registradas: ${fechas.map(f=>formatDateShort(f)).join(', ')}.`
    : '';
  const caulaDescrip = tipoIncid === 'falta'
    ? `El trabajador incurrió en ${fechas.length} falta${fechas.length!==1?'s':''} injustificada${fechas.length!==1?'s':''} en los últimos 30 días, causal de rescisión conforme al Art. 47 Fracc. X de la Ley Federal del Trabajo.${fechasStr}`
    : `El trabajador acumuló retardos reiterados en el mes en curso, lo que contraviene el Reglamento Interior de Trabajo y el Art. 134 LFT.${fechasStr}`;

  window._actaPreload = {
    trabajadorId: trabId,
    tipo:         tipoActa,
    tipoFalta:    tipoIncid === 'falta' ? 'asistencia' : 'impuntualidad',
    descripcion:  caulaDescrip,
  };

  // Cargar la lista de trabajadores activos para el modal y navegar
  db.getTrabajadores({ estado:'activo' }).then(lista => {
    window._trabListActas = lista;
    navigate('disciplinario');
    // Dar tiempo al render y abrir el modal pre-cargado
    setTimeout(() => showModalActaPreloaded(), 400);
  });
}

function showModalActaPreloaded() {
  const pre = window._actaPreload;
  if (!pre) return;
  showModalActa(pre.trabajadorId, pre.tipo, pre.tipoFalta);
  // Pre-llenar descripción
  setTimeout(() => {
    const desc = document.getElementById('ac-descripcion');
    if (desc && pre.descripcion) desc.value = pre.descripcion;
    window._actaPreload = null;
  }, 150);
}

// ═══════════════════════════════════════════════════════════════════════════
//  TAB 3 — HISTORIAL Y REPORTES
// ═══════════════════════════════════════════════════════════════════════════
async function _tab3() {
  const el = document.getElementById('asist-content');
  const hoy    = new Date();
  const defIni = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-01`;
  const defFin = hoy.toISOString().split('T')[0];

  el.innerHTML = `
    <!-- Filtros -->
    <div class="card animate-in" style="margin-bottom:16px;">
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label" for="hist-trab">Trabajador</label>
          <select id="hist-trab" class="form-select">
            <option value="">Todos los trabajadores</option>
            ${_A.trabajadores.map(t=>`<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="hist-tipo">Tipo de registro</label>
          <select id="hist-tipo" class="form-select">
            <option value="">Todos los tipos</option>
            ${Object.entries(TIPO_ASIST).map(([v,c])=>`<option value="${v}">${c.icono} ${c.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="hist-ini">Fecha inicio</label>
          <input type="date" id="hist-ini" class="form-input" value="${defIni}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="hist-fin">Fecha fin</label>
          <input type="date" id="hist-fin" class="form-input" value="${defFin}" />
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
        <button class="btn-secondary" onclick="_buscarHistorial()"><svg class="ic"><use href="#i-search"></use></svg> Buscar</button>
        <button class="btn-secondary" onclick="_exportarExcelHistorial()">Excel</button>
        <button class="btn-primary" onclick="_exportarPDFHistorial()">PDF Reporte</button>
      </div>
    </div>
    <div id="hist-resultados"></div>
  `;

  // Cargar inmediatamente con valores por defecto
  await _buscarHistorial();
}

async function _buscarHistorial() {
  const res  = document.getElementById('hist-resultados');
  if (!res) return;
  res.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;

  const trabId = document.getElementById('hist-trab')?.value;
  const tipo   = document.getElementById('hist-tipo')?.value;
  const ini    = document.getElementById('hist-ini')?.value;
  const fin    = document.getElementById('hist-fin')?.value;

  let q = window.supabase
    .from('asistencia')
    .select('*, trabajadores(nombre,puesto)')
    .eq('empresa_id', CTX.empresa.id)
    .order('fecha', { ascending:false });

  if (trabId) q = q.eq('trabajador_id', trabId);
  if (tipo)   q = q.eq('tipo', tipo);
  if (ini)    q = q.gte('fecha', ini);
  if (fin)    q = q.lte('fecha', fin);

  const { data, error } = await q;
  if (error) { res.innerHTML = `<div class="alert alert-danger"><svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg><span>${escapeHtml(error.message)}</span></div>`; return; }

  const registros = data || [];
  window._historialActual = { registros, ini, fin };

  // Resumen estadístico
  const stats = {};
  Object.keys(TIPO_ASIST).forEach(k => { stats[k] = 0; });
  registros.forEach(r => { if (stats[r.tipo] !== undefined) stats[r.tipo]++; });
  const totalLab  = stats.asistencia + stats.retardo + stats.retardo_grave;
  const totalDias = registros.length;
  const pctAsist  = totalDias > 0 ? ((totalLab / totalDias) * 100).toFixed(1) : '0.0';

  res.innerHTML = `
    <!-- Resumen estadístico -->
    <div class="card animate-in" style="margin-bottom:14px;">
      <div class="card-header"><span class="card-title">Resumen del período (${registros.length} registros)</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:10px;">
        ${Object.entries(TIPO_ASIST).filter(([k])=>stats[k]>0).map(([k,c])=>`
          <div style="text-align:center;padding:10px;background:var(--bg-surface);border-radius:var(--radius-sm);">
            <div style="font-size:1.2rem;">${c.icono}</div>
            <div style="font-size:1.4rem;font-weight:700;color:var(--gold-primary);">${stats[k]}</div>
            <div style="font-size:.7rem;color:var(--text-muted);">${c.label}</div>
          </div>`).join('')}
        <div style="text-align:center;padding:10px;background:var(--gold-dim);border:1px solid var(--gold-border);border-radius:var(--radius-sm);">
          <div style="font-size:1.2rem;"></div>
          <div style="font-size:1.4rem;font-weight:700;color:var(--gold-primary);">${pctAsist}%</div>
          <div style="font-size:.7rem;color:var(--text-muted);">Asistencia</div>
        </div>
      </div>
    </div>

    <!-- Tabla de registros -->
    <div class="card animate-in">
      ${registros.length === 0
        ? `<div class="empty-state"><div class="empty-state-icon"><svg class="ic"><use href="#i-file"></use></svg></div><div class="empty-state-title">Sin registros en el período seleccionado</div></div>`
        : `<div class="table-wrap"><table class="data-table">
            <thead><tr><th scope="col">Fecha</th><th scope="col">Trabajador</th><th scope="col">Tipo</th><th scope="col">Hora entrada</th><th scope="col">Minutos retardo</th><th scope="col">Hrs extra</th><th scope="col">Observaciones</th></tr></thead>
            <tbody>
              ${registros.map(r => {
                const cfg = TIPO_ASIST[r.tipo] || { icono:'?', label:r.tipo, cls:'' };
                return `<tr class="${cfg.cls}">
                  <td>${formatDateShort(r.fecha)}</td>
                  <td><strong>${escapeHtml(r.trabajadores?.nombre)||'—'}</strong><br><span style="font-size:.75rem;color:var(--text-muted);">${escapeHtml(r.trabajadores?.puesto)||''}</span></td>
                  <td><span class="asist-badge ${cfg.cls}">${cfg.icono} ${cfg.label}</span></td>
                  <td>${r.hora_entrada||'—'}</td>
                  <td>${r.minutos_retardo||'—'}</td>
                  <td>${parseFloat(r.horas_extra||0) > 0 ? r.horas_extra : '—'}</td>
                  <td style="font-size:.8rem;color:var(--text-muted);">${escapeHtml(r.observaciones)||'—'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table></div>`
      }
    </div>
  `;
}

async function _exportarExcelHistorial() {
  if (typeof XLSX === 'undefined') {
    alert('La librería de Excel no está cargada. Asegúrate de que SheetJS esté incluido en app.html.');
    return;
  }
  const { registros, ini, fin } = window._historialActual || {};
  if (!registros?.length) { alert('No hay datos para exportar.'); return; }

  const datos = registros.map(r => ({
    'Fecha':            r.fecha,
    'Trabajador':       r.trabajadores?.nombre || '',
    'Puesto':           r.trabajadores?.puesto || '',
    'Tipo':             TIPO_ASIST[r.tipo]?.label || r.tipo,
    'Hora Entrada':     r.hora_entrada || '',
    'Minutos Retardo':  r.minutos_retardo || 0,
    'Horas Extra':      parseFloat(r.horas_extra || 0),
    'Observaciones':    r.observaciones || '',
  }));

  const ws  = XLSX.utils.json_to_sheet(datos);
  const wb  = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');
  XLSX.writeFile(wb, `asistencia-${ini}-a-${fin}.xlsx`);
}

async function _exportarPDFHistorial() {
  const { registros, ini, fin } = window._historialActual || {};
  if (!registros?.length) { alert('No hay datos para exportar.'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'letter' });
  const pw  = doc.internal.pageSize.getWidth();
  const ph  = doc.internal.pageSize.getHeight();
  const ml  = 15, mr = 15;

  // Header
  doc.setFillColor(15,20,40); doc.rect(0,0,pw,24,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(21,128,61);
  doc.text(np(CTX.empresa.nombre), pw/2, 10, {align:'center'});
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(180,185,200);
  doc.text(`Reporte de Asistencia — ${npDate(ini+'T00:00:00')} al ${npDate(fin+'T00:00:00')}`, pw/2, 18, {align:'center'});

  // Tabla
  doc.autoTable({
    startY: 30, margin:{left:ml,right:mr},
    head:[['Fecha','Trabajador','Puesto','Tipo','Hora entrada','Min. retardo','Hrs extra','Observaciones']],
    body: registros.map(r => [
      formatDateShort(r.fecha),
      np(r.trabajadores?.nombre||''),
      np(r.trabajadores?.puesto||''),
      `${TIPO_ASIST[r.tipo]?.icono||''} ${TIPO_ASIST[r.tipo]?.label||r.tipo}`,
      r.hora_entrada||'—',
      r.minutos_retardo||'—',
      parseFloat(r.horas_extra||0) > 0 ? String(r.horas_extra) : '—',
      np(r.observaciones||'—'),
    ]),
    styles:{ fontSize:7.5, cellPadding:2.5 },
    headStyles:{ fillColor:[15,36,56], textColor:[21,128,61], fontStyle:'bold', fontSize:7.5 },
    alternateRowStyles:{ fillColor:[248,248,252] },
    theme:'grid',
  });

  // Footer
  const total = doc.getNumberOfPages();
  for (let i=1;i<=total;i++) {
    doc.setPage(i);
    doc.setFontSize(6.5); doc.setTextColor(160,160,160);
    doc.text(`Capital Humano MX | Reporte Asistencia | Pág. ${i} de ${total}`, pw/2, ph-5, {align:'center'});
  }

  doc.save(`reporte-asistencia-${ini}-${fin}.pdf`);
}
