/**
 * Capital Humano MX — Módulo de Asistencia
 * 3 tabs: Registro Diario | Incidencias y Alertas | Historial y Reportes
 */

// ═══════════════════════════════════════════════════════════════════════════
//  CONSTANTES
// ═══════════════════════════════════════════════════════════════════════════
const TIPO_ASIST = {
  asistencia:   { label:'Asistencia',          icono:'✅', cls:'asist-ok'       },
  falta:        { label:'Falta injustificada',  icono:'❌', cls:'asist-falta'    },
  falta_justif: { label:'Falta justificada',    icono:'📋', cls:'asist-fjust'    },
  retardo:      { label:'Retardo',              icono:'⏰', cls:'asist-retardo'  },
  retardo_grave:{ label:'Retardo grave',        icono:'⚠️', cls:'asist-rgrave'  },
  incapacidad:  { label:'Incapacidad IMSS',     icono:'🏥', cls:'asist-incap'   },
  vacaciones:   { label:'Vacaciones',           icono:'🌴', cls:'asist-vac'     },
  permiso_goce: { label:'Permiso c/ goce',      icono:'✋', cls:'asist-pgoce'   },
  permiso_sin:  { label:'Permiso s/ goce',      icono:'✋', cls:'asist-psin'    },
  descanso:     { label:'Descanso semanal',     icono:'😴', cls:'asist-desc'    },
  festivo:      { label:'Día festivo oficial',  icono:'🎉', cls:'asist-festivo' },
};

// Días festivos oficiales México 2026
const FESTIVOS_2026 = [
  '2026-01-01','2026-02-02','2026-03-16',
  '2026-05-01','2026-09-16','2026-11-16','2026-12-25',
];

// ¿Es festivo oficial O festivo particular de la empresa?
function _esFestivoDia(iso) {
  return FESTIVOS_2026.includes(iso) ||
    (typeof esFestivoEmpresa === 'function' && esFestivoEmpresa(iso));
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
    ]);
    _A.trabajadores = trabs.data || [];
    _A.sucursales   = sucs.data  || [];
    if (typeof _navStale === 'function' && _navStale(_gen)) return;
    await _renderShell();
    await _cargarYRenderTab();
  } catch(e) {
    if (typeof _navStale === 'function' && _navStale(_gen)) return;
    main.innerHTML = `<div class="alert alert-danger"><span>❌</span><span>${escapeHtml(e.message)}</span></div>`;
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
        <div class="view-title">🗓 Control de Asistencia</div>
        <div class="view-subtitle">${escapeHtml(CTX.empresa.nombre)}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        ${sucursal_opts}
        <input type="date" class="form-input" style="max-width:160px;"
          value="${_A.fecha}" onchange="_A.fecha=this.value;if(_A.tab===1)_cargarYRenderTab();" />
      </div>
    </div>

    <div class="tabs animate-in" style="margin-bottom:16px;">
      <button class="tab-btn ${_A.tab===1?'active':''}" onclick="switchAsistTab(1)">📋 Registro Diario</button>
      <button class="tab-btn ${_A.tab===2?'active':''}" onclick="switchAsistTab(2)">⚠️ Incidencias</button>
      <button class="tab-btn ${_A.tab===3?'active':''}" onclick="switchAsistTab(3)">📊 Historial</button>
    </div>

    <div id="asist-content" class="animate-in"></div>
  `;
}

async function switchAsistTab(tab) {
  _A.tab = tab;
  document.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', i+1===tab));
  await _cargarYRenderTab();
}

async function _cargarYRenderTab() {
  const el = document.getElementById('asist-content');
  if (!el) return;
  el.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
  if (_A.tab === 1) await _tab1();
  else if (_A.tab === 2) await _tab2();
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
            value="${reg?.hora_entrada||''}" placeholder="08:00" />
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
          <button class="btn-secondary btn-sm" onclick="guardarFilaAsistencia('${t.id}')">💾</button>
        </td>
      </tr>`;
  }).join('');

  el.innerHTML = `
    ${trabsSinReg > 0 ? `
    <div class="banner-pendiente animate-in">
      <span class="banner-pendiente-icon">📭</span>
      <div>
        <strong>${trabsSinReg} trabajador${trabsSinReg!==1?'es':''} sin registro</strong>
        en este día laborable.
        <span style="font-size:.8rem;opacity:.8;"> Captura la asistencia y guarda para completar.</span>
      </div>
      <button class="btn-primary btn-sm" onclick="guardarDiaCompleto()" style="margin-left:auto;flex-shrink:0;">
        💾 Guardar todo
      </button>
    </div>` : ''}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
      <div style="font-size:.85rem;color:var(--text-muted);">
        ${esFestivo
          ? (festEmp
              ? `🎉 Día festivo de la empresa${festEmp.descripcion ? ' — ' + escapeHtml(festEmp.descripcion) : ''}`
              : '🎉 Día festivo oficial')
          : `${diaSemana} — ${formatDateShort(_A.fecha)}`}
        — <strong>${trabs.length}</strong> trabajadores
        ${trabsSinReg === 0 && !esFestivo && !esFinSem
          ? `<span style="color:#4caf50;font-weight:700;margin-left:6px;">✅ Registro completo</span>` : ''}
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn-secondary btn-sm" onclick="marcarTodosAsistencia()">✅ Todos asistencia</button>
        <button class="btn-primary btn-sm" onclick="guardarDiaCompleto()">💾 Guardar todo el día</button>
      </div>
    </div>

    ${trabs.length === 0
      ? `<div class="empty-state"><div class="empty-state-icon">👤</div><div class="empty-state-title">Sin trabajadores ${_A.sucursalId?'en esta sucursal':''}</div></div>`
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

function _origenBadge(origen) {
  if (origen === 'kiosco') return '<span title="Registrado por kiosco">📱</span>';
  if (origen === 'checador_fisico') return '<span title="Registrado por checador físico">🔌</span>';
  return '';
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
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
  try {
    const datos = _leerFila(trabId);
    await _upsertAsistencia(datos);
    // Actualizar ultima_fecha_vacaciones si aplica
    if (datos.tipo === 'vacaciones') {
      await window.supabase.from('trabajadores')
        .update({ ultima_fecha_vacaciones: datos.fecha }).eq('id', trabId);
    }
    if (btn) { btn.textContent = '✅'; setTimeout(()=>{ if(btn){btn.textContent='💾';btn.disabled=false;} },1500); }
    await _verificarRiesgoArt47(trabId);
  } catch(e) {
    if (btn) { btn.textContent = '❌'; btn.disabled = false; }
    alert('Error: ' + e.message);
  }
}

async function guardarDiaCompleto() {
  const trabs = _A.trabajadores.filter(t => !_A.sucursalId || t.sucursal_id === _A.sucursalId);
  const msg   = document.getElementById('asist-msg');
  if (msg) { msg.textContent = '⏳ Guardando…'; msg.style.display = ''; msg.className = ''; }

  try {
    const batch = trabs.map(t => _leerFila(t.id));
    // Actualizar vacaciones
    const conVac = batch.filter(d => d.tipo === 'vacaciones');
    for (const d of conVac) {
      await window.supabase.from('trabajadores')
        .update({ ultima_fecha_vacaciones: d.fecha }).eq('id', d.trabajador_id);
    }
    await _upsertAsistencia(batch);
    if (msg) { msg.textContent = `✅ ${batch.length} registros guardados correctamente`; msg.className = 'alert alert-success'; }
    // Verificar riesgos Art. 47
    for (const d of batch.filter(x => x.tipo === 'falta')) {
      await _verificarRiesgoArt47(d.trabajador_id);
    }
  } catch(e) {
    if (msg) { msg.textContent = '❌ Error: ' + e.message; msg.className = 'alert alert-danger'; }
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

// ── Verificar Art. 47 y crear alerta si aplica ───────────────────────────────
async function _verificarRiesgoArt47(trabId) {
  const hace30 = new Date();
  hace30.setDate(hace30.getDate() - 30);
  const { data } = await window.supabase
    .from('asistencia')
    .select('id', { count:'exact', head: false })
    .eq('trabajador_id', trabId)
    .eq('tipo', 'falta')
    .gte('fecha', hace30.toISOString().split('T')[0]);

  const count = data?.length || 0;
  if (count >= 3) {
    // Crear alerta crítica
    const { error: errAlerta } = await window.supabase.from('alertas').upsert({
      empresa_id:      CTX.empresa.id,
      trabajador_id:   trabId,
      tipo:            'tres_faltas',
      titulo:          '3+ faltas injustificadas — Art. 47 Fr. X LFT',
      descripcion:     `El trabajador acumula ${count} faltas injustificadas en los últimos 30 días.`,
      prioridad:       'critica',
      fecha_limite:    new Date().toISOString().split('T')[0],
      articulo_lft:    'Art. 47 Fracc. X LFT',
      accion_sugerida: 'Generar acta rescisoria de inmediato',
      resuelta:        false,
    }, { onConflict: 'empresa_id,trabajador_id,tipo' });
    if (errAlerta) {
      console.error('No se pudo crear la alerta Art. 47 (3+ faltas) para el trabajador', trabId, ':', errAlerta.message);
    }

    // Invalidar caché de alertas
    localStorage.removeItem('alertas_last_gen');
  }
}

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
      <div class="empty-state-icon">✅</div>
      <div class="empty-state-title">Sin trabajadores en riesgo</div>
    </div>` : enRiesgo.map(([trabId, {info, fechas}]) => {
      const pct   = Math.min(100, (fechas.length / 3) * 100);
      const color = fechas.length >= 3 ? 'var(--red-warn)' : fechas.length === 2 ? '#f39c12' : 'var(--gold-primary)';
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
                    🚫 Generar Acta Rescisoria
                  </button>`
                : `<button class="btn-secondary btn-sm" onclick="generarActaDesdeAsistencia('${trabId}','formal','falta',${JSON.stringify(fechas)})">
                    ⚠️ Generar Acta Formal
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
            ${fechas.length>=3?' · <strong style="color:var(--red-warn);">⚠️ Art. 47 Fracc. X LFT — causal de rescisión</strong>':''}
          </div>
        </div>`;
    }).join('');

  const seccionB = conRetardos.length === 0 ? `
    <div class="empty-state" style="padding:16px;">
      <div class="empty-state-icon">✅</div><div class="empty-state-title">Sin retardos acumulados</div>
    </div>` : conRetardos.map(([trabId, {info, registros}]) => `
      <div class="incid-card">
        <div class="incid-header">
          <div><strong>${escapeHtml(info?.nombre||trabId)}</strong> — <span style="color:#f39c12;font-weight:700;">${registros.length} retardos</span> este mes</div>
          <div style="display:flex;gap:6px;">
            <button class="btn-secondary btn-sm" onclick="generarActaDesdeAsistencia('${trabId}','amonestacion','retardo',[])">
              📋 Acta Amonestación
            </button>
            <button class="btn-secondary btn-sm" onclick="navigate('empleado','${trabId}')">Ver expediente</button>
          </div>
        </div>
        <div style="font-size:.78rem;color:var(--text-muted);margin-top:4px;">
          Fechas: ${registros.map(r=>formatDateShort(r.fecha)+(r.minutos_retardo?` (${r.minutos_retardo} min)`:'') ).join(', ')}
        </div>
      </div>`).join('');

  const seccionC = Object.entries(incapPorTrab).length === 0
    ? `<div class="empty-state" style="padding:16px;"><div class="empty-state-icon">✅</div><div class="empty-state-title">Sin incapacidades activas</div></div>`
    : Object.entries(incapPorTrab).map(([id,{info,dias}]) => `
        <div class="incid-card">
          <div class="incid-header">
            <div><strong>${escapeHtml(info?.nombre||id)}</strong> · 🏥 ${dias.length} día${dias.length!==1?'s':''} de incapacidad</div>
            <button class="btn-secondary btn-sm" onclick="navigate('empleado','${id}')">Ver expediente</button>
          </div>
          <div style="font-size:.78rem;color:var(--text-muted);margin-top:4px;">
            Fechas: ${dias.map(formatDateShort).join(', ')}
          </div>
        </div>`).join('');

  const seccionD = Object.entries(sinGocePorTrab).length === 0
    ? `<div class="empty-state" style="padding:16px;"><div class="empty-state-icon">✅</div><div class="empty-state-title">Sin permisos sin goce</div></div>`
    : Object.entries(sinGocePorTrab).map(([id,{info,dias}]) => `
        <div class="incid-card">
          <div class="incid-header">
            <div><strong>${escapeHtml(info?.nombre||id)}</strong> · ✋ ${dias.length} día${dias.length!==1?'s':''} sin goce de sueldo</div>
          </div>
          <div style="font-size:.78rem;color:#f39c12;margin-top:4px;">
            Descuento pendiente en nómina · Fechas: ${dias.map(formatDateShort).join(', ')}
          </div>
        </div>`).join('');

  // ── Render sección E ─────────────────────────────────────────────────────
  const seccionE = diasPendientes.length === 0 ? `
    <div class="empty-state" style="padding:16px;">
      <div class="empty-state-icon">✅</div>
      <div class="empty-state-title">Todos los días del mes tienen registro completo</div>
    </div>` : diasPendientes.map(({ fecha, trabajadores: sinR }) => `
      <div class="incid-card incid-pendiente">
        <div class="incid-header">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.3rem;">📭</span>
            <div>
              <strong>${formatDateShort(fecha)}</strong>
              <span style="font-size:.78rem;color:var(--text-muted);margin-left:6px;">
                — ${['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][new Date(fecha+'T00:00:00').getDay()]}
              </span>
            </div>
            <span class="badge-pendiente">${sinR.length} sin registro</span>
          </div>
          <button class="btn-primary btn-sm" onclick="_irAFechaPendiente('${fecha}')">
            ✏️ Capturar
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
        📭 Días laborables sin registro — Pendiente de captura
        ${diasPendientes.length > 0
          ? `<span style="margin-left:8px;font-size:.78rem;background:var(--gold-primary);color:#000;padding:2px 8px;border-radius:100px;font-weight:800;">${diasPendientes.length} día${diasPendientes.length!==1?'s':''}</span>`
          : ''}
      </div>
      ${seccionE}
    </div>
    <div class="incid-seccion">
      <div class="incid-seccion-titulo">
        🔴 Trabajadores en riesgo — Art. 47 Fracc. X LFT (faltas injustificadas, últimos 30 días)
      </div>
      ${seccionA}
    </div>
    <div class="incid-seccion">
      <div class="incid-seccion-titulo">🟡 Retardos acumulados en el mes</div>
      ${seccionB}
    </div>
    <div class="incid-seccion">
      <div class="incid-seccion-titulo">🏥 Incapacidades activas</div>
      ${seccionC}
    </div>
    <div class="incid-seccion">
      <div class="incid-seccion-titulo">✋ Permisos sin goce — descuento en nómina</div>
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
        <button class="btn-secondary" onclick="_exportarExcelHistorial()">📊 Excel</button>
        <button class="btn-primary" onclick="_exportarPDFHistorial()">📄 PDF Reporte</button>
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
  if (error) { res.innerHTML = `<div class="alert alert-danger"><span>❌</span><span>${escapeHtml(error.message)}</span></div>`; return; }

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
      <div class="card-header"><span class="card-title">📊 Resumen del período (${registros.length} registros)</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:10px;">
        ${Object.entries(TIPO_ASIST).filter(([k])=>stats[k]>0).map(([k,c])=>`
          <div style="text-align:center;padding:10px;background:var(--bg-surface);border-radius:var(--radius-sm);">
            <div style="font-size:1.2rem;">${c.icono}</div>
            <div style="font-family:'Montserrat',sans-serif;font-size:1.4rem;font-weight:900;color:var(--gold-primary);">${stats[k]}</div>
            <div style="font-size:.7rem;color:var(--text-muted);">${c.label}</div>
          </div>`).join('')}
        <div style="text-align:center;padding:10px;background:var(--gold-dim);border:1px solid var(--gold-border);border-radius:var(--radius-sm);">
          <div style="font-size:1.2rem;">📈</div>
          <div style="font-family:'Montserrat',sans-serif;font-size:1.4rem;font-weight:900;color:var(--gold-primary);">${pctAsist}%</div>
          <div style="font-size:.7rem;color:var(--text-muted);">Asistencia</div>
        </div>
      </div>
    </div>

    <!-- Tabla de registros -->
    <div class="card animate-in">
      ${registros.length === 0
        ? `<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-title">Sin registros en el período seleccionado</div></div>`
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
  doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(245,166,35);
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
    headStyles:{ fillColor:[15,20,40], textColor:[245,166,35], fontStyle:'bold', fontSize:7.5 },
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
