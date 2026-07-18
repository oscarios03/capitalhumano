/**
 * Capital Humano MX — Movimientos afiliatorios IMSS y export IDSE/SUA
 * Depende de: calculo.js (calcularSBC/calcularFactorIntegracion), festivos.js
 * (getConfigValor/_umaVigente), SheetJS (XLSX, cargado en app.html)
 */

// Claves de causa de baja IMSS (catálogo de "Movimientos Afiliatorios").
// ⚠️ Verificar contra la guía oficial de IDSE vigente antes de usar en producción —
// estas claves son las de uso más común pero el catálogo puede variar.
const CAUSAS_BAJA_IMSS = {
  '01': 'Terminación de la relación o contrato de trabajo',
  '02': 'Separación voluntaria del trabajador',
  '03': 'Abandono de empleo',
  '04': 'Clausura o cierre definitivo de la empresa',
  '05': 'Defunción del trabajador',
  '06': 'Ausentismo',
  '07': 'Cambio de patrón (por fusión/venta)',
  '08': 'Otra causa',
};

function _causaBajaDesdeTipo(tipoBaja) {
  return tipoBaja === 'renuncia' ? '02' : '01';
}

/** Inserta un registro en movimientos_imss (pendiente de exportar). */
async function registrarMovimientoIMSS(empresaId, trabajadorId, tipo, { sbcAnterior = null, sbcNuevo = null, causaBaja = null, fecha = null } = {}) {
  const { error } = await window.supabase.from('movimientos_imss').insert({
    empresa_id: empresaId,
    trabajador_id: trabajadorId,
    tipo,
    fecha_movimiento: fecha || new Date().toISOString().split('T')[0],
    sbc_anterior: sbcAnterior,
    sbc_nuevo: sbcNuevo,
    causa_baja: causaBaja,
  });
  if (error) console.warn('No se pudo registrar movimiento IMSS (¿falta la migración 19?):', error.message);
}

/** Recalcula el SBC desde la ficha del trabajador y refresca la vista. */
async function _recalcularSBCYRefrescar(trabajadorId) {
  try {
    await recalcularSBC(trabajadorId);
    if (typeof renderPerfilEmpleado === 'function') await renderPerfilEmpleado(trabajadorId);
  } catch (e) {
    alert('No se pudo recalcular el SBC: ' + e.message);
  }
}

/** Recalcula y guarda el SBC vigente de un trabajador. */
async function recalcularSBC(trabajadorId) {
  const trab = await db.getTrabajador(trabajadorId);
  const sbcAnterior = parseFloat(trab.sbc || 0) || null;
  const sbcNuevo = calcularSBC(trab);
  await window.supabase.from('trabajadores').update({ sbc: sbcNuevo, fecha_ultimo_sbc: new Date().toISOString().split('T')[0] }).eq('id', trabajadorId);
  if (sbcAnterior !== sbcNuevo) {
    await registrarMovimientoIMSS(CTX.empresa.id, trabajadorId, 'modificacion_salario', { sbcAnterior, sbcNuevo });
  }
  return sbcNuevo;
}

// ═══════════════════════════════════════════════════════════════════════════
//  BANDEJA DE MOVIMIENTOS
// ═══════════════════════════════════════════════════════════════════════════
let _imssTab = 'movimientos';

async function renderIMSS() {
  const main = eid('main-view');
  main.innerHTML = `
    <div class="view-header animate-in">
      <div><div class="view-title">🏛 IMSS / Movimientos</div><div class="view-subtitle">Avisos afiliatorios para importar en IDSE, o capturar en SUA</div></div>
    </div>
    <div class="tabs animate-in" style="margin-bottom:16px;">
      <button class="tab-btn ${_imssTab==='movimientos'?'active':''}" data-imss-tab="movimientos" onclick="switchIMSSTab('movimientos')">📋 Movimientos</button>
      <button class="tab-btn ${_imssTab==='variabilidad'?'active':''}" data-imss-tab="variabilidad" onclick="switchIMSSTab('variabilidad')">📈 Variabilidad bimestral</button>
    </div>
    <div id="imss-tab-body" class="animate-in"><div class="loading"><div class="spinner"></div></div></div>
  `;
  await _renderIMSSTabBody();
}

async function switchIMSSTab(tab) {
  _imssTab = tab;
  document.querySelectorAll('.tab-btn[data-imss-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.imssTab === tab));
  const body = eid('imss-tab-body');
  if (body) body.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
  await _renderIMSSTabBody();
}

async function _renderIMSSTabBody() {
  return _imssTab === 'variabilidad' ? _tabVariabilidadIMSS() : _tabMovimientosIMSS();
}

async function _tabMovimientosIMSS() {
  const main = eid('imss-tab-body');

  const { data: movimientos, error } = await window.supabase
    .from('movimientos_imss')
    .select('*, trabajadores(nombre, nss, curp, rfc)')
    .eq('empresa_id', CTX.empresa.id)
    .order('created_at', { ascending: false });

  if (error) {
    main.innerHTML = `<div class="alert alert-danger">Error al cargar movimientos: ${error.message}
      ${/relation|schema cache/i.test(error.message||'') ? '<br>Aplica la migración 19_migration_sbc_movimientos.sql.' : ''}</div>`;
    return;
  }

  const pendientes = (movimientos || []).filter(m => m.estatus === 'pendiente');
  const exportados  = (movimientos || []).filter(m => m.estatus === 'exportado');
  const lotes = [...new Set(exportados.map(m => m.lote_exportacion))];

  const TIPO_LABEL = { alta:'🟢 Alta', baja:'🔴 Baja', modificacion_salario:'💵 Modificación salario', reingreso:'🔁 Reingreso' };

  main.innerHTML = `
    <div class="card animate-in" style="margin-bottom:16px;">
      <div class="card-header" style="margin-bottom:10px;">
        <span class="card-title">📋 Movimientos pendientes (${pendientes.length})</span>
        <button class="btn-primary btn-sm" ${!pendientes.length?'disabled':''} onclick="_exportarLoteIMSS()">📤 Exportar lote para IDSE</button>
      </div>
      <div class="alert alert-info" style="margin-bottom:14px;">
        <span>ℹ️</span><span>Los avisos de alta o modificación de salario deben presentarse dentro de los 5 días hábiles siguientes (Art. 15 fr. I LSS).</span>
      </div>
      ${pendientes.length === 0
        ? `<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-title">Sin movimientos pendientes</div></div>`
        : `<div class="table-wrap"><table class="data-table">
            <thead><tr><th><input type="checkbox" onchange="document.querySelectorAll('.mov-check').forEach(c=>c.checked=this.checked)" /></th><th>Trabajador</th><th>Tipo</th><th>Fecha</th><th>SBC</th><th>Antigüedad</th></tr></thead>
            <tbody>${pendientes.map(m => {
              const dias = Math.floor((Date.now() - new Date(m.created_at).getTime()) / 86400000);
              return `<tr${dias > 3 ? ' style="background:rgba(231,76,60,.08);"' : ''}>
                <td><input type="checkbox" class="mov-check" value="${m.id}" /></td>
                <td>${m.trabajadores?.nombre || '—'}</td>
                <td>${TIPO_LABEL[m.tipo] || m.tipo}${m.tipo==='baja' && m.causa_baja ? `<br><span style="font-size:.72rem;color:var(--text-muted);">${CAUSAS_BAJA_IMSS[m.causa_baja]||m.causa_baja}</span>`:''}</td>
                <td>${formatDateShort(m.fecha_movimiento)}</td>
                <td>${m.sbc_nuevo != null ? fmt(m.sbc_nuevo) : '—'}${m.sbc_anterior != null ? ` <span style="font-size:.72rem;color:var(--text-muted);">(antes ${fmt(m.sbc_anterior)})</span>` : ''}</td>
                <td>${dias > 3 ? `<span style="color:var(--red-warn);font-weight:700;">⚠️ ${dias} días</span>` : `${dias} día${dias!==1?'s':''}`}</td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>`
      }
    </div>

    <div class="card animate-in">
      <div class="card-header"><span class="card-title">📦 Lotes exportados</span></div>
      ${lotes.length === 0
        ? `<div class="empty-state" style="padding:20px;"><div class="empty-state-title">Sin lotes exportados todavía</div></div>`
        : `<div class="table-wrap"><table class="data-table">
            <thead><tr><th>Lote</th><th>Movimientos</th><th>Fecha</th><th></th></tr></thead>
            <tbody>${lotes.map(lote => {
              const items = exportados.filter(m => m.lote_exportacion === lote);
              return `<tr>
                <td style="font-family:monospace;font-size:.78rem;">${lote.slice(0,8)}…</td>
                <td>${items.length}</td>
                <td>${formatDateShort(items[0]?.exportado_at)}</td>
                <td><button class="btn-secondary btn-sm" onclick="_redescargarLoteIMSS('${lote}')">⬇ Volver a descargar</button></td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>`
      }
    </div>
  `;
}

function _fixedWidth(str, len, padChar = ' ', alignRight = false) {
  const s = String(str == null ? '' : str).toUpperCase().slice(0, len);
  return alignRight ? s.padStart(len, padChar) : s.padEnd(len, padChar);
}

function _fechaDDMMAAAA(fechaISO) {
  const d = new Date(String(fechaISO).slice(0,10) + 'T00:00:00');
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  return `${dd}${mm}${d.getFullYear()}`;
}

/**
 * Genera una línea de ancho fijo con el layout ILUSTRATIVO de importación de
 * movimientos afiliatorios de IDSE.
 * ⚠️ IMPORTANTE: verificar las posiciones exactas contra la "Guía técnica de
 * importación de movimientos" vigente de IDSE antes de usar en producción —
 * el layout real puede diferir por versión/tipo de movimiento.
 *
 * Posiciones (100 caracteres por línea):
 *   1-2    Tipo de movimiento   (01 alta, 02 baja, 07 modif. salario, 08 reingreso)
 *   3-13   Registro patronal    (11)
 *   14-24  NSS                  (11)
 *   25-42  CURP                 (18)
 *   43-82  Nombre (formato "APELLIDO PATERNO APELLIDO MATERNO/NOMBRE") (40)
 *   83-90  SBC — 6 enteros + 2 decimales, sin punto, ceros a la izquierda (8)
 *   91-98  Fecha del movimiento DDMMAAAA (8)
 *   99-100 Causa de baja (2, '00' si no aplica)
 */
function _lineaIDSE(m, registroPatronal) {
  const TIPO_COD = { alta:'01', baja:'02', modificacion_salario:'07', reingreso:'08' };
  const t = m.trabajadores || {};
  const sbcCentavos = Math.round((m.sbc_nuevo || m.sbc_anterior || 0) * 100);
  return [
    _fixedWidth(TIPO_COD[m.tipo] || '01', 2),
    _fixedWidth(registroPatronal, 11),
    _fixedWidth(t.nss, 11),
    _fixedWidth(t.curp, 18),
    _fixedWidth(t.nombre, 40),
    _fixedWidth(sbcCentavos, 8, '0', true),
    _fechaDDMMAAAA(m.fecha_movimiento),
    _fixedWidth(m.causa_baja || '00', 2),
  ].join('');
}

async function _exportarLoteIMSS() {
  const seleccion = [...document.querySelectorAll('.mov-check:checked')].map(c => c.value);
  if (!seleccion.length) { alert('Selecciona al menos un movimiento.'); return; }

  const { data: movimientos, error } = await window.supabase
    .from('movimientos_imss')
    .select('*, trabajadores(nombre, nss, curp, rfc)')
    .in('id', seleccion);
  if (error) { alert('Error: ' + error.message); return; }

  const registroPatronal = CTX.empresa.registro_patronal || '';
  if (!registroPatronal) {
    alert('Captura el registro patronal de la empresa en "Mi Empresa" antes de exportar.');
    return;
  }

  const loteId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;

  // 1. Archivo .txt ancho fijo (IDSE)
  const lineas = movimientos.map(m => _lineaIDSE(m, registroPatronal)).join('\r\n');
  const blobTxt = new Blob([lineas], { type: 'text/plain' });
  const urlTxt = URL.createObjectURL(blobTxt);
  const aTxt = document.createElement('a');
  aTxt.href = urlTxt; aTxt.download = `movimientos-idse-${loteId.slice(0,8)}.txt`;
  aTxt.click(); URL.revokeObjectURL(urlTxt);

  // 2. Excel espejo (columnas legibles) para validar o capturar en SUA
  if (typeof XLSX !== 'undefined') {
    const datos = movimientos.map(m => ({
      Tipo: m.tipo, 'Registro Patronal': registroPatronal, NSS: m.trabajadores?.nss || '',
      CURP: m.trabajadores?.curp || '', RFC: m.trabajadores?.rfc || '', Nombre: m.trabajadores?.nombre || '',
      SBC: m.sbc_nuevo || m.sbc_anterior || '', Fecha: m.fecha_movimiento,
      'Causa de baja': m.causa_baja ? `${m.causa_baja} - ${CAUSAS_BAJA_IMSS[m.causa_baja]||''}` : '',
    }));
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimientos IMSS');
    XLSX.writeFile(wb, `movimientos-imss-${loteId.slice(0,8)}.xlsx`);
  }

  // 3. Marcar como exportados
  await window.supabase.from('movimientos_imss')
    .update({ estatus: 'exportado', lote_exportacion: loteId, exportado_at: new Date().toISOString() })
    .in('id', seleccion);

  await renderIMSS();
}

async function _redescargarLoteIMSS(loteId) {
  const { data: movimientos, error } = await window.supabase
    .from('movimientos_imss')
    .select('*, trabajadores(nombre, nss, curp, rfc)')
    .eq('lote_exportacion', loteId);
  if (error) { alert('Error: ' + error.message); return; }

  const registroPatronal = CTX.empresa.registro_patronal || '';
  const lineas = movimientos.map(m => _lineaIDSE(m, registroPatronal)).join('\r\n');
  const blob = new Blob([lineas], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `movimientos-idse-${loteId.slice(0,8)}.txt`;
  a.click(); URL.revokeObjectURL(url);
}

/**
 * Genera (si no existe ya una sin resolver) una alerta informativa cuando
 * hay movimientos IMSS pendientes con más de 3 días de antigüedad
 * (Art. 15 fr. I LSS: 5 días hábiles para presentar el aviso).
 */
async function verificarMovimientosIMSSVencidos(empresaId) {
  const { data: pendientes } = await window.supabase
    .from('movimientos_imss')
    .select('id, created_at')
    .eq('empresa_id', empresaId)
    .eq('estatus', 'pendiente');

  const vencidos = (pendientes || []).filter(m => (Date.now() - new Date(m.created_at).getTime()) > 3 * 86400000);
  if (!vencidos.length) return;

  const { data: yaExiste } = await window.supabase
    .from('alertas')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('tipo', 'movimiento_imss_vencido')
    .eq('resuelta', false)
    .limit(1);
  if (yaExiste && yaExiste.length) return;

  const { error: errAlerta } = await window.supabase.from('alertas').insert({
    empresa_id: empresaId,
    tipo: 'movimiento_imss_vencido',
    titulo: `${vencidos.length} movimiento(s) IMSS pendientes de exportar`,
    descripcion: 'Hay avisos de alta/modificación de salario con más de 3 días sin exportarse a IDSE. El plazo legal es de 5 días hábiles (Art. 15 fr. I LSS).',
    prioridad: 'alta',
    articulo_lft: 'Art. 15 fr. I LSS',
    accion_sugerida: 'Ir al módulo IMSS / Movimientos y exportar el lote pendiente.',
  });
  if (errAlerta) console.warn('No se pudo generar la alerta de movimientos IMSS:', errAlerta.message);
}

// ═══════════════════════════════════════════════════════════════════════════
//  VARIABILIDAD BIMESTRAL DEL SBC (Art. 30 fr. II-III LSS)
// ═══════════════════════════════════════════════════════════════════════════
// Los trabajadores con salario mixto (parte fija + parte variable: comisiones,
// primas, bonos) recalculan su SBC cada bimestre: la parte variable es el
// promedio diario de las percepciones variables del bimestre inmediato anterior
// (suma de variables ÷ días de salario devengado). El nuevo SBC rige el bimestre
// siguiente y el aviso se presenta dentro de sus primeros 5 días hábiles.

const _BIM_NOMBRES = ['Ene–Feb', 'Mar–Abr', 'May–Jun', 'Jul–Ago', 'Sep–Oct', 'Nov–Dic'];

function _rangoBimestre(anio, bim) {
  const mesIni = (bim - 1) * 2;               // 0, 2, 4, 6, 8, 10
  const ini = new Date(anio, mesIni, 1);
  const fin = new Date(anio, mesIni + 2, 0);  // último día del 2º mes del bimestre
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {
    anio, bim, ini: iso(ini), fin: iso(fin),
    dias: Math.round((fin - ini) / 86400000) + 1,
    label: `${_BIM_NOMBRES[bim - 1]} ${anio}`,
  };
}

function _bimestreDe(fecha) {
  const esDate = fecha && typeof fecha.getFullYear === 'function';
  const d = esDate ? fecha : new Date(String(fecha).slice(0, 10) + 'T00:00:00');
  return _rangoBimestre(d.getFullYear(), Math.floor(d.getMonth() / 2) + 1);
}

function _bimestreAnterior(hoy) {
  const actual = _bimestreDe(hoy || new Date());
  let a = actual.anio, b = actual.bim - 1;
  if (b < 1) { b = 6; a -= 1; }
  return _rangoBimestre(a, b);
}

// Percepciones variables que integran al SBC (Art. 27 LSS): comisiones, primas
// dominical/festiva y bonos variables. Las horas extra integran sólo en la parte
// que excede los límites del Art. 66 LFT (9 h/sem); como eso depende del detalle
// semanal se reportan aparte y NO se integran automáticamente aquí — verificar.
function _percVariablesIntegraSBC(r) {
  return parseFloat((
      parseFloat(r.comisiones_ventas || 0)
    + parseFloat(r.comisiones_recuperacion || 0)
    + parseFloat(r.bono_meta || 0)
    + parseFloat(r.prima_dominical || 0)
    + parseFloat(r.prima_festivo || 0)
    + parseFloat(r.bonos || 0)
  ).toFixed(2));
}

// Calcula el nuevo SBC de un trabajador con salario mixto a partir de sus
// recibos del bimestre. Reutiliza calcularSBC(): parte fija = salario diario ×
// factor de integración; parte variable = promedio diario del bimestre.
function _calcularSBCVariable(trab, recibos) {
  const variableTotal  = recibos.reduce((s, r) => s + _percVariablesIntegraSBC(r), 0);
  const diasDevengados = recibos.reduce((s, r) => s + (parseFloat(r.dias_laborados) || 0), 0);
  const heTotal        = recibos.reduce((s, r) => s + (parseFloat(r.monto_horas_extra) || 0), 0);
  const variableDiario = diasDevengados > 0 ? variableTotal / diasDevengados : 0;
  const sbcFijo        = calcularSBC(trab, 0);
  const sbcNuevo       = calcularSBC(trab, variableDiario);
  const sbcAnterior    = parseFloat(trab.sbc) || sbcFijo;
  return {
    variableTotal:  parseFloat(variableTotal.toFixed(2)),
    diasDevengados,
    variableDiario: parseFloat(variableDiario.toFixed(4)),
    heTotal:        parseFloat(heTotal.toFixed(2)),
    sbcFijo, sbcNuevo, sbcAnterior,
    cambia: Math.abs(sbcNuevo - sbcAnterior) >= 0.01,
  };
}

async function _tabVariabilidadIMSS() {
  const body = eid('imss-tab-body');
  const bim = _bimestreAnterior(new Date());

  // Periodos de nómina cuyo inicio cae en el bimestre anterior → sus recibos.
  const { data: periodos, error: errP } = await window.supabase
    .from('periodos_nomina')
    .select('id')
    .eq('empresa_id', CTX.empresa.id)
    .gte('fecha_inicio', bim.ini)
    .lte('fecha_inicio', bim.fin);
  if (errP) { body.innerHTML = `<div class="alert alert-danger">Error al cargar periodos: ${errP.message}</div>`; return; }

  const periodoIds = (periodos || []).map(p => p.id);
  const recibosPorTrab = {};
  if (periodoIds.length) {
    const { data: recibos, error: errR } = await window.supabase
      .from('recibos_nomina').select('*').in('periodo_id', periodoIds);
    if (errR) { body.innerHTML = `<div class="alert alert-danger">Error al cargar recibos: ${errR.message}</div>`; return; }
    (recibos || []).forEach(r => { (recibosPorTrab[r.trabajador_id] ||= []).push(r); });
  }

  const trabajadores = await db.getTrabajadores({ estado: 'activo' });
  const filas = trabajadores
    .map(t => ({ t, c: _calcularSBCVariable(t, recibosPorTrab[t.id] || []) }))
    .filter(x => x.c.variableTotal > 0)
    .sort((a, b) => b.c.variableTotal - a.c.variableTotal);
  const conCambio = filas.filter(x => x.c.cambia);

  body.innerHTML = `
    <div class="alert alert-info" style="margin-bottom:14px;">
      <span>ℹ️</span><span>Bimestre medido: <strong>${bim.label}</strong>. La parte variable del SBC es el promedio diario de comisiones, primas y bonos de ese bimestre (Art. 30 fr. III LSS). El nuevo SBC rige el bimestre en curso; presenta las modificaciones en IDSE dentro de sus primeros 5 días hábiles.</span>
    </div>

    <div class="card animate-in">
      <div class="card-header" style="margin-bottom:10px;">
        <span class="card-title">📈 Recálculo de SBC — ${bim.label} (${conCambio.length} con cambio)</span>
        <button class="btn-primary btn-sm" ${!conCambio.length ? 'disabled' : ''} onclick="_generarMovimientosVariabilidad()">💵 Generar modificaciones de salario</button>
      </div>
      ${filas.length === 0
        ? `<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-title">Sin percepciones variables en ${bim.label}</div><div class="empty-state-subtitle">Ningún trabajador tuvo comisiones, primas ni bonos que modifiquen el SBC.</div></div>`
        : `<div class="table-wrap"><table class="data-table">
            <thead><tr>
              <th><input type="checkbox" onchange="document.querySelectorAll('.var-check:not(:disabled)').forEach(c=>c.checked=this.checked)" /></th>
              <th>Trabajador</th><th>Variables del bimestre</th><th>Días</th><th>Var. diario</th>
              <th>SBC actual</th><th>SBC nuevo</th><th>Δ</th>
            </tr></thead>
            <tbody>${filas.map(({ t, c }) => {
              const delta = c.sbcNuevo - c.sbcAnterior;
              const val = `${t.id}|${c.sbcNuevo}|${c.sbcAnterior}`;
              return `<tr${c.cambia ? '' : ' style="opacity:.55;"'}>
                <td><input type="checkbox" class="var-check" value="${val}" ${c.cambia ? '' : 'disabled'} /></td>
                <td>${t.nombre}${c.heTotal > 0 ? `<br><span style="font-size:.7rem;color:var(--text-muted);">+ ${fmt(c.heTotal)} horas extra (verificar integración Art. 66 LFT)</span>` : ''}</td>
                <td>${fmt(c.variableTotal)}</td>
                <td>${c.diasDevengados}</td>
                <td>${fmt(c.variableDiario)}</td>
                <td>${fmt(c.sbcAnterior)}</td>
                <td><strong>${fmt(c.sbcNuevo)}</strong></td>
                <td>${c.cambia
                    ? `<span style="color:${delta >= 0 ? 'var(--green-ok)' : 'var(--red-warn)'};font-weight:700;">${delta >= 0 ? '▲' : '▼'} ${fmt(Math.abs(delta))}</span>`
                    : '<span style="color:var(--text-muted);">sin cambio</span>'}</td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>
          <div style="font-size:.74rem;color:var(--text-muted);margin-top:10px;">
            SBC nuevo = salario diario × factor de integración + (variables del bimestre ÷ días devengados), topado a 25 UMA (Art. 28 LSS). Las horas extra se muestran aparte porque sólo integran en la parte que excede los límites del Art. 66 LFT.
          </div>`
      }
    </div>
  `;
}

async function _generarMovimientosVariabilidad() {
  const seleccion = [...document.querySelectorAll('.var-check:checked')].map(c => c.value);
  if (!seleccion.length) { alert('Selecciona al menos un trabajador con cambio de SBC.'); return; }

  // El nuevo SBC rige a partir del bimestre en curso (el aviso se presenta en sus
  // primeros días, tras cerrar el bimestre medido).
  const fechaMov = _bimestreDe(new Date()).ini;

  let ok = 0;
  for (const item of seleccion) {
    const [trabId, sbcNuevoStr, sbcAntStr] = item.split('|');
    const sbcNuevo = parseFloat(sbcNuevoStr), sbcAnterior = parseFloat(sbcAntStr);
    const { error: errU } = await window.supabase.from('trabajadores')
      .update({ sbc: sbcNuevo, fecha_ultimo_sbc: fechaMov })
      .eq('id', trabId);
    if (errU) { console.warn('No se pudo actualizar SBC de', trabId, errU.message); continue; }
    await registrarMovimientoIMSS(CTX.empresa.id, trabId, 'modificacion_salario', { sbcAnterior, sbcNuevo, fecha: fechaMov });
    ok++;
  }

  alert(`${ok} movimiento(s) de modificación de salario generados.\nRevisa la pestaña "Movimientos" para exportarlos a IDSE.`);
  _imssTab = 'movimientos';
  await renderIMSS();
}

/**
 * Alerta en los primeros 5 días de un mes impar (inicio de bimestre) si hubo
 * percepciones variables en el bimestre anterior y aún no se han presentado
 * modificaciones de salario en el bimestre en curso (Art. 30 fr. III LSS).
 */
async function verificarVariabilidadBimestralPendiente(empresaId) {
  const hoy = new Date();
  const mes = hoy.getMonth() + 1;                       // 1..12
  if (mes % 2 === 0 || hoy.getDate() > 5) return;       // sólo primeros 5 días de mes impar

  const bim = _bimestreAnterior(hoy);
  const { data: periodos } = await window.supabase
    .from('periodos_nomina').select('id')
    .eq('empresa_id', empresaId)
    .gte('fecha_inicio', bim.ini).lte('fecha_inicio', bim.fin);
  const periodoIds = (periodos || []).map(p => p.id);
  if (!periodoIds.length) return;

  const { data: recibos } = await window.supabase
    .from('recibos_nomina').select('*').in('periodo_id', periodoIds);
  if (!(recibos || []).some(r => _percVariablesIntegraSBC(r) > 0)) return;

  // ¿Ya hay modificaciones de salario presentadas en el bimestre en curso?
  const bimActual = _bimestreDe(hoy);
  const { data: mods } = await window.supabase
    .from('movimientos_imss').select('id')
    .eq('empresa_id', empresaId).eq('tipo', 'modificacion_salario')
    .gte('fecha_movimiento', bimActual.ini).limit(1);
  if (mods && mods.length) return;

  const { data: yaExiste } = await window.supabase
    .from('alertas').select('id')
    .eq('empresa_id', empresaId).eq('tipo', 'variabilidad_sbc_pendiente')
    .eq('resuelta', false).limit(1);
  if (yaExiste && yaExiste.length) return;

  const { error } = await window.supabase.from('alertas').insert({
    empresa_id: empresaId,
    tipo: 'variabilidad_sbc_pendiente',
    titulo: 'Recalcular SBC variable del bimestre',
    descripcion: `Hubo percepciones variables en ${bim.label}. Recalcula el SBC de los trabajadores con salario mixto y presenta las modificaciones dentro de los primeros días hábiles del bimestre (Art. 30 fr. III LSS).`,
    prioridad: 'alta',
    articulo_lft: 'Art. 30 fr. III LSS',
    accion_sugerida: 'Ir a IMSS / Variabilidad bimestral y generar los movimientos.',
  });
  if (error) console.warn('No se pudo generar la alerta de variabilidad SBC:', error.message);
}
