/**
 * Capital Humano MX — Módulo Vacaciones y Permisos
 * Art. 76 LFT reform 2023: 12 días año 1, escalonado hasta 32 días
 */

let _VAC = { tab: 1, trabajadores: [], solicitudes: [] };
const _sbV = () => window.supabase;

// Mapeo tipo de solicitud (vacaciones) → tipo de registro de asistencia
const VAC_TIPO_TO_ASIST = { vacacion: 'vacaciones', permiso_goce: 'permiso_goce', permiso_sin: 'permiso_sin' };

async function renderVacaciones() {
  const _gen = typeof _navGen !== 'undefined' ? _navGen : 0;
  _VAC.tab = 1; // Resetear al entrar al módulo
  try {
    const main = document.getElementById('main-view');
    const [trabRes, solRes] = await Promise.all([
      _sbV().from('trabajadores')
        .select('id,nombre,fecha_ingreso,salario_mensual,periodo_salario,estado,dias_semana')
        .eq('empresa_id', CTX.empresa.id)
        .eq('estado', 'activo')
        .order('nombre'),
      _sbV().from('vacaciones')
        .select('*,trabajadores(nombre,telefono)')
        .eq('empresa_id', CTX.empresa.id)
        .order('creado_en', { ascending: false }),
    ]);
    _VAC.trabajadores = trabRes.data || [];
    _VAC.solicitudes  = solRes.data || [];
    if (typeof _navStale === 'function' && _navStale(_gen)) return;
    _renderShellVAC();
    _renderVACTab();
  } catch(e) { showError(e); }
}

function _renderShellVAC() {
  const main = document.getElementById('main-view');
  main.innerHTML = `
    <div class="view-header animate-in">
      <div>
        <div class="view-title">Vacaciones</div>
        <div class="view-subtitle">Art. 76 LFT 2023 — mínimo 12 días primer año</div>
      </div>
    </div>
    <div class="tabs animate-in">
      <button class="tab-btn ${_VAC.tab===1?'active':''}" onclick="switchVACTab(1)">Solicitudes</button>
      <button class="tab-btn ${_VAC.tab===2?'active':''}" onclick="switchVACTab(2)">+ Nueva solicitud</button>
      <button class="tab-btn ${_VAC.tab===3?'active':''}" onclick="switchVACTab(3)">Saldos</button>
    </div>
    <div id="vac-content" class="animate-in"></div>
  `;
}

async function switchVACTab(n) {
  _VAC.tab = n;
  document.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', i+1===n));
  _renderVACTab();
}

function _renderVACTab() {
  const c = document.getElementById('vac-content');
  if (!c) return;
  if (_VAC.tab === 1) _renderVACSolicitudes(c);
  else if (_VAC.tab === 2) _renderVACNueva(c);
  else _renderVACSaldos(c);
}

/** Aprobar/rechazar/eliminar es de gerente o admin (RLS lo impone; esto solo
 *  evita mostrar botones que van a fallar). Sin roles.js cargado, no restringe. */
function _vacPuedeAprobar() {
  return typeof puedeGestionar !== 'function' || puedeGestionar();
}

function _renderVACSolicitudes(c) {
  const TIPO_LABEL = { vacacion:'Vacaciones', permiso_goce:'Permiso c/goce', permiso_sin:'Permiso s/goce' };
  const ESTADO_BADGE = {
    pendiente: '<span style="background:rgba(217,138,43,.15);color:var(--amber-warn);border:1px solid rgba(217,138,43,.3);border-radius:100px;padding:2px 10px;font-size:.75rem;font-weight:700;">Pendiente</span>',
    aprobada:  '<span style="background:rgba(39,174,96,.15);color:var(--green-ok);border:1px solid rgba(39,174,96,.3);border-radius:100px;padding:2px 10px;font-size:.75rem;font-weight:700;">Aprobada</span>',
    rechazada: '<span style="background:rgba(192,57,43,.15);color:var(--red-warn);border:1px solid rgba(192,57,43,.3);border-radius:100px;padding:2px 10px;font-size:.75rem;font-weight:700;">Rechazada</span>',
  };
  if (!_VAC.solicitudes.length) {
    c.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><svg class="ic"><use href="#i-sun"></use></svg></div><div class="empty-state-title">Sin solicitudes registradas</div><p style="margin-top:8px;font-size:.82rem;color:var(--text-muted)">Usa la pestaña "Nueva solicitud" para registrar una</p></div>`;
    return;
  }
  c.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Trabajador</th><th>Tipo</th><th>Inicio</th><th>Fin</th><th>Días</th><th>Prima vac.</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>
          ${_VAC.solicitudes.map(s => `
            <tr>
              <td><strong>${escapeHtml(s.trabajadores?.nombre) || '—'}</strong></td>
              <td>${TIPO_LABEL[s.tipo] || s.tipo}</td>
              <td>${formatDateShort(s.fecha_inicio)}</td>
              <td>${formatDateShort(s.fecha_fin)}</td>
              <td><strong>${s.dias}</strong></td>
              <td>${s.prima_vacacional > 0 ? fmt(s.prima_vacacional) : '—'}</td>
              <td>${ESTADO_BADGE[s.estado] || s.estado}</td>
              <td>
                <div class="actions">
                  ${s.estado === 'pendiente' && _vacPuedeAprobar() ? `
                    <button class="btn-sm" style="background:rgba(39,174,96,.12);color:var(--green-ok);border:1px solid rgba(39,174,96,.3);" onclick="aprobarVAC('${s.id}')">Aprobar</button>
                    <button class="btn-sm" style="background:rgba(192,57,43,.12);color:var(--red-warn);border:1px solid rgba(192,57,43,.3);" onclick="rechazarVAC('${s.id}')">Rechazar</button>
                  ` : s.estado === 'pendiente' ? `
                    <span style="font-size:.75rem;color:var(--text-muted);" title="Solo un gerente o administrador puede aprobar">Pendiente de aprobación</span>
                  ` : ''}
                  ${s.estado === 'aprobada' && s.tipo === 'vacacion' ? `<button class="btn-secondary btn-sm" onclick="generarConstanciaVacaciones('${s.id}')" title="Constancia de vacaciones (Art. 81 LFT)">Constancia</button>` : ''}
                  ${s.estado === 'aprobada' ? htmlBotonWhatsApp(s.trabajadores?.telefono,
                      `Hola ${s.trabajadores?.nombre||''}, tus ${TIPO_LABEL[s.tipo]||'días'} del ${formatDateShort(s.fecha_inicio)} al ${formatDateShort(s.fecha_fin)} (${s.dias} día${s.dias!==1?'s':''}) fueron aprobados. ¡Que los disfrutes!`,
                      { ocultarSiFalta: true }) : ''}
                  ${_vacPuedeAprobar() ? `<button class="btn-danger btn-sm" onclick="eliminarVAC('${s.id}')"><svg class="ic"><use href="#i-trash"></use></svg></button>` : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function _renderVACNueva(c) {
  const hoy = isoLocal(new Date());
  c.innerHTML = `
    <div class="card animate-in" style="max-width:600px;">
      <div class="card-header"><span class="card-title">+ Nueva solicitud</span></div>
      <div class="form-grid" style="margin-top:14px;">
        <div class="form-group span-2">
          <label class="form-label" for="vac-trab">Trabajador <span class="req">*</span></label>
          <select id="vac-trab" class="form-select" onchange="_vacCalcSaldo()" required aria-required="true">
            <option value="">— Seleccionar —</option>
            ${_VAC.trabajadores.map(t => `<option value="${t.id}" data-ingreso="${t.fecha_ingreso}" data-salario="${t.salario_mensual}" data-periodo="${t.periodo_salario||'mensual'}">${escapeHtml(t.nombre)}</option>`).join('')}
          </select>
          <div id="vac-saldo-info" style="margin-top:6px;font-size:.82rem;color:var(--text-muted);"></div>
        </div>
        <div class="form-group span-2">
          <label class="form-label" for="vac-tipo">Tipo</label>
          <select id="vac-tipo" class="form-select" onchange="_vacCalcDias()">
            <option value="vacacion">Vacaciones</option>
            <option value="permiso_goce">Permiso con goce de sueldo</option>
            <option value="permiso_sin">Permiso sin goce de sueldo</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="vac-ini">Fecha inicio <span class="req">*</span></label>
          <input id="vac-ini" type="date" class="form-input" value="${hoy}" onchange="_vacCalcDias()" required aria-required="true" />
        </div>
        <div class="form-group">
          <label class="form-label" for="vac-fin">Fecha fin <span class="req">*</span></label>
          <input id="vac-fin" type="date" class="form-input" value="${hoy}" onchange="_vacCalcDias()" required aria-required="true" />
        </div>
        <div class="form-group span-2" id="vac-resumen-wrap"></div>
        <div class="form-group span-2">
          <label class="form-label" for="vac-notas">Notas</label>
          <textarea id="vac-notas" class="form-textarea" rows="2" placeholder="Observaciones opcionales"></textarea>
        </div>
      </div>
      <div id="vac-error" class="error-msg" role="alert" style="display:none;margin-top:10px;"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
        <button class="btn-primary" onclick="guardarVAC()">Guardar solicitud</button>
      </div>
    </div>
  `;
}

/**
 * Saldo de vacaciones del CICLO en curso de un trabajador.
 *
 * Dos criterios que estaban mal y que aquí quedan unificados con el resto del
 * sistema (calcularFactorIntegracion, propVacDays, la constancia del Art. 81):
 *
 *  · Los días que corresponden son los del año de servicio EN CURSO
 *    (cumplidos + 1), no los del último aniversario ya cumplido. Quien lleva
 *    2 años cumplidos está en su 3er año y le tocan 16 días, no 14.
 *  · Los días gozados se cuentan sobre el año ANIVERSARIO, no sobre el año
 *    calendario: el derecho del Art. 76 LFT nace en cada aniversario de
 *    ingreso, así que mezclar ambos dejaba saldos que no cuadraban en enero.
 */
function _saldoVacaciones(trabajadorId, fechaIngreso, solicitudes, hoy = new Date()) {
  const ingreso = new Date(String(fechaIngreso).slice(0, 10) + 'T00:00:00');
  if (isNaN(ingreso)) return null;

  const cumplidos = fullYears(ingreso, hoy);
  const ganados   = vacDaysForYear(cumplidos + 1, prestacionesEmpresa().vacDiasExtra);

  // Ciclo vigente: [ingreso + cumplidos años, ingreso + cumplidos+1 años - 1 día]
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const cicloIni = new Date(ingreso); cicloIni.setFullYear(ingreso.getFullYear() + cumplidos);
  const cicloFin = new Date(ingreso); cicloFin.setFullYear(ingreso.getFullYear() + cumplidos + 1); cicloFin.setDate(cicloFin.getDate() - 1);
  const desde = iso(cicloIni), hasta = iso(cicloFin);

  const usados = (solicitudes || [])
    .filter(s => s.trabajador_id === trabajadorId && s.estado === 'aprobada' && s.tipo === 'vacacion'
              && String(s.fecha_inicio).slice(0,10) >= desde && String(s.fecha_inicio).slice(0,10) <= hasta)
    .reduce((a, s) => a + (s.dias || 0), 0);

  return { cumplidos, anioEnCurso: cumplidos + 1, ganados, usados, saldo: ganados - usados, desde, hasta };
}

function _vacCalcSaldo() {
  const sel = document.getElementById('vac-trab');
  const opt = sel?.options[sel.selectedIndex];
  const info = document.getElementById('vac-saldo-info');
  if (!opt?.value || !info) return;
  const s = _saldoVacaciones(opt.value, opt.dataset.ingreso, _VAC.solicitudes);
  if (!s) { info.innerHTML = ''; return; }
  info.innerHTML = `Antigüedad: <strong>${s.cumplidos} año${s.cumplidos!==1?'s':''}</strong> `
    + `(cursa el ${s.anioEnCurso}º) · Días del ciclo ${formatDateShort(s.desde)} – ${formatDateShort(s.hasta)}: `
    + `<strong>${s.ganados}</strong> · Usados: <strong>${s.usados}</strong> · `
    + `<strong style="color:${s.saldo<0?'var(--red-warn)':'var(--green-ok)'}">Saldo: ${s.saldo} días</strong>`;
}

function _vacCalcDias() {
  const ini = document.getElementById('vac-ini')?.value;
  const fin = document.getElementById('vac-fin')?.value;
  const tipo = document.getElementById('vac-tipo')?.value;
  const wrap = document.getElementById('vac-resumen-wrap');
  if (!ini || !fin || !wrap) return;
  const d1 = new Date(ini + 'T00:00:00');
  const d2 = new Date(fin + 'T00:00:00');
  if (d2 < d1) { wrap.innerHTML = ''; return; }
  // Días laborables SEGÚN EL HORARIO del trabajador, no un lunes-viernes fijo:
  // a quien descansa martes se le consumían días de vacaciones en su descanso.
  const _trabSel = _VAC.trabajadores.find(x => x.id === document.getElementById('vac-trab')?.value);
  const diasHab = contarDiasLaborables(d1, d2, _trabSel);

  let prima = 0;
  const primaPct = prestacionesEmpresa().primaVacPct;
  if (tipo === 'vacacion') {
    const sel = document.getElementById('vac-trab');
    const opt = sel?.options[sel.selectedIndex];
    if (opt?.value) {
      const sd = calcSalarioDiario(parseFloat(opt.dataset.salario)||0, opt.dataset.periodo||'mensual');
      prima = sd * diasHab * primaPct;
    }
  }
  wrap.innerHTML = `
    <div style="background:var(--gold-dim);border:1px solid var(--gold-border);border-radius:var(--radius-md);padding:12px 16px;font-size:.88rem;">
      <strong>Días hábiles: ${diasHab}</strong>
      ${prima > 0 ? ` &nbsp;·&nbsp; Prima vacacional (${(primaPct*100).toFixed(0)}%): <strong style="color:var(--green-ok)">${fmt(prima)}</strong>` : ''}
    </div>
  `;
}

async function guardarVAC() {
  const trabId = document.getElementById('vac-trab')?.value;
  const tipo   = document.getElementById('vac-tipo')?.value;
  const ini    = document.getElementById('vac-ini')?.value;
  const fin    = document.getElementById('vac-fin')?.value;
  const notas  = document.getElementById('vac-notas')?.value.trim();
  const err    = document.getElementById('vac-error');
  err.style.display = 'none';
  if (!trabId || !ini || !fin) { err.textContent = 'Selecciona trabajador, fecha inicio y fecha fin.'; err.style.display=''; return; }
  const d1 = new Date(ini+'T00:00:00'), d2 = new Date(fin+'T00:00:00');
  if (d2 < d1) { err.textContent = 'La fecha fin debe ser igual o mayor a la fecha inicio.'; err.style.display=''; return; }
  const dias = contarDiasLaborables(d1, d2, _VAC.trabajadores.find(x => x.id === trabId));
  let prima = 0;
  if (tipo === 'vacacion') {
    const sel = document.getElementById('vac-trab');
    const opt = sel?.options[sel.selectedIndex];
    if (opt?.value) {
      const sd = calcSalarioDiario(parseFloat(opt.dataset.salario)||0, opt.dataset.periodo||'mensual');
      prima = sd * dias * prestacionesEmpresa().primaVacPct;
    }
  }
  try {
    await _sbV().from('vacaciones').insert({
      empresa_id: CTX.empresa.id,
      trabajador_id: trabId,
      tipo, fecha_inicio: ini, fecha_fin: fin,
      dias, prima_vacacional: prima,
      estado: 'pendiente', notas: notas || null,
    });
    _VAC.tab = 1;
    await renderVacaciones();
  } catch(e) { err.textContent = e.message; err.style.display=''; }
}

async function aprobarVAC(id) {
  if (!(await showConfirmacion('¿Aprobar esta solicitud?'))) return;
  const s = _VAC.solicitudes.find(x => x.id === id);
  if (!s) return;
  try {
    // supabase-js no lanza: hay que revisar .error explícitamente. Si no, un
    // rechazo de RLS (p. ej. un capturista intentando aprobar) pasaría
    // desapercibido y el botón no haría nada sin explicar por qué.
    const { error } = await _sbV().from('vacaciones')
      .update({ estado: 'aprobada', aprobado_por: CTX.perfil?.nombre || CTX.user?.email })
      .eq('id', id);
    if (error) throw error;
    await _sbV().from('trabajadores').update({ ultima_vacacion: s.fecha_fin, ultima_fecha_vacaciones: s.fecha_fin }).eq('id', s.trabajador_id);
    await _sincronizarAsistenciaVAC(s);
    await renderVacaciones();
  } catch(e) {
    _errorVAC(e, 'aprobar');
  }
}

/** Muestra el error de una acción de vacaciones, distinguiendo falta de permisos. */
function _errorVAC(e, accion) {
  if (typeof esErrorDePermisos === 'function' && esErrorDePermisos(e)) {
    showToast(`No puedes ${accion} solicitudes: ${mensajeErrorPermisos(e)}`, 'error', 7000);
  } else {
    showToast('Error al ' + accion + ': ' + (e.message || e), 'error');
  }
}

// Genera un registro de asistencia por cada día del rango de la solicitud aprobada,
// para que la nómina cuente esos días como pagados (Art. 76-80 LFT).
async function _sincronizarAsistenciaVAC(s) {
  const tipoAsist = VAC_TIPO_TO_ASIST[s.tipo];
  if (!tipoAsist) return;
  const rows = [];
  const _laborables = diasLaborablesDe(_VAC.trabajadores.find(x => x.id === s.trabajador_id));
  const cur = new Date(s.fecha_inicio + 'T00:00:00');
  const fin = new Date(s.fecha_fin + 'T00:00:00');
  while (cur <= fin) {
    // Solo días LABORABLES del trabajador: mismo criterio con que se cuenta y
    // aprueba la solicitud (_vacCalcDias/guardarVAC). Si se marcaran también
    // sus días de descanso, el upsert (onConflict trabajador_id,fecha)
    // sobrescribiría el descanso semanal — en un permiso SIN goce eso
    // descontaría días de más y vulneraría el 7º día pagado (Arts. 69-73 LFT).
    if (_laborables.has(cur.getDay())) {
      rows.push({
        trabajador_id: s.trabajador_id,
        empresa_id:    s.empresa_id,
        fecha:         isoLocal(cur),
        tipo:          tipoAsist,
        observaciones: 'Generado automáticamente al aprobar solicitud de vacaciones/permiso',
      });
    }
    cur.setDate(cur.getDate() + 1);
  }
  if (rows.length) await _upsertAsistencia(rows);
}

// Elimina los registros de asistencia generados por una solicitud aprobada (ver _sincronizarAsistenciaVAC).
// Solo borra filas cuyo tipo coincide con el de la solicitud, para no afectar correcciones manuales posteriores.
async function _limpiarAsistenciaVAC(s) {
  const tipoAsist = VAC_TIPO_TO_ASIST[s.tipo];
  if (!tipoAsist) return;
  await _sbV().from('asistencia')
    .delete()
    .eq('trabajador_id', s.trabajador_id)
    .eq('tipo', tipoAsist)
    .gte('fecha', s.fecha_inicio)
    .lte('fecha', s.fecha_fin);
}

async function rechazarVAC(id) {
  if (!(await showConfirmacion('¿Rechazar esta solicitud?', { peligro:true, textoOk:'Rechazar' }))) return;
  try {
    const { error } = await _sbV().from('vacaciones').update({ estado: 'rechazada' }).eq('id', id);
    if (error) throw error;
    await renderVacaciones();
  } catch(e) { _errorVAC(e, 'rechazar'); }
}

/**
 * Constancia de vacaciones (Art. 81 LFT): antigüedad, días que corresponden
 * según la tabla legal, días ya gozados en el ciclo vigente y saldo.
 * El "ciclo vigente" es el año de aniversario (ingreso + N años) al que
 * pertenece la fecha de inicio de esta solicitud — no el año calendario.
 */
async function generarConstanciaVacaciones(solicitudId) {
  const s = _VAC.solicitudes.find(x => x.id === solicitudId);
  if (!s) return;
  if (s.estado !== 'aprobada') { alert('Solo se puede generar la constancia de una solicitud aprobada.'); return; }
  try {
    const trab = await db.getTrabajador(s.trabajador_id);
    const prest = prestacionesEmpresa();

    const ingreso  = new Date(trab.fecha_ingreso + 'T00:00:00');
    const inicioSol = new Date(s.fecha_inicio + 'T00:00:00');
    // Años completos cumplidos justo antes/al momento de esta solicitud →
    // mismo criterio que calcularFactorIntegracion() para "año en curso".
    const ciclosCumplidos = fullYears(ingreso, inicioSol);
    const antiguedadAnios = ciclosCumplidos + 1;

    const vigenciaIni = new Date(ingreso); vigenciaIni.setFullYear(ingreso.getFullYear() + ciclosCumplidos);
    const vigenciaFin = new Date(ingreso); vigenciaFin.setFullYear(ingreso.getFullYear() + ciclosCumplidos + 1); vigenciaFin.setDate(vigenciaFin.getDate() - 1);
    const iso = isoLocal;

    const diasCorresponden = vacDaysForYear(antiguedadAnios, prest.vacDiasExtra);

    const { data: solsVigencia, error } = await _sbV().from('vacaciones')
      .select('dias')
      .eq('trabajador_id', trab.id)
      .eq('tipo', 'vacacion')
      .eq('estado', 'aprobada')
      .gte('fecha_inicio', iso(vigenciaIni))
      .lte('fecha_inicio', iso(vigenciaFin));
    if (error) throw error;
    const diasGozados = (solsVigencia || []).reduce((acc, x) => acc + (parseInt(x.dias) || 0), 0);
    const saldo = Math.max(0, diasCorresponden - diasGozados);

    generateConstanciaVacacionesPDF(CTX.empresa, trab, {
      solicitud: s, antiguedadAnios, diasCorresponden, diasGozados, saldo,
      vigenciaIni: iso(vigenciaIni), vigenciaFin: iso(vigenciaFin),
    });
  } catch(e) { alert('No se pudo generar la constancia: ' + e.message); }
}

async function eliminarVAC(id) {
  if (!(await showConfirmacion('¿Eliminar esta solicitud permanentemente?', { peligro:true, textoOk:'Eliminar' }))) return;
  try {
    const s = _VAC.solicitudes.find(x => x.id === id);
    await _sbV().from('vacaciones').delete().eq('id', id);
    if (s?.estado === 'aprobada') await _limpiarAsistenciaVAC(s);
    await renderVacaciones();
  } catch(e) { alert('Error: ' + e.message); }
}

function _renderVACSaldos(c) {
  const vacExtra = prestacionesEmpresa().vacDiasExtra;
  const rows = _VAC.trabajadores
    .map(t => ({ ...t, s: _saldoVacaciones(t.id, t.fecha_ingreso, _VAC.solicitudes) }))
    .filter(r => r.s);

  c.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Trabajador</th><th>Ingreso</th><th>Antigüedad</th><th>Ciclo vigente</th><th>Días del ciclo</th><th>Días usados</th><th>Saldo</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${escapeHtml(r.nombre)}</strong></td>
              <td>${formatDateShort(r.fecha_ingreso)}</td>
              <td>${r.s.cumplidos} año${r.s.cumplidos!==1?'s':''} <span style="color:var(--text-muted);font-size:.78rem;">(cursa el ${r.s.anioEnCurso}º)</span></td>
              <td style="font-size:.8rem;color:var(--text-muted);">${formatDateShort(r.s.desde)} – ${formatDateShort(r.s.hasta)}</td>
              <td>${r.s.ganados}</td>
              <td>${r.s.usados}</td>
              <td><strong style="color:${r.s.saldo<0?'var(--red-warn)':r.s.saldo===0?'var(--text-muted)':'var(--green-ok)'}">${r.s.saldo}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:10px;font-size:.78rem;color:var(--text-muted);">
      * Días del Art. 76 LFT que corresponden al año de servicio <strong>en curso</strong>${vacExtra > 0 ? ' + ' + vacExtra + ' día(s) adicionales otorgados por la empresa' : ''}.
      El derecho nace en cada aniversario de ingreso, por eso el ciclo y los días usados se miden por aniversario y no por año calendario.
    </div>
  `;
}
