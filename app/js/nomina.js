/**
 * Capital Humano MX — Módulo de Nómina
 * Motor de cálculo ISR/IMSS 2026 + 3 tabs + PDF + SPEI + ZIP
 */

function _labelPrestacion(tipo) {
  return { premio_puntualidad:'Premio de puntualidad', premio_asistencia:'Premio de asistencia',
    ayuda_transporte:'Ayuda de transporte', otro:'Otra prestación' }[tipo] || tipo;
}

// ═══════════════════════════════════════════════════════════════════════════
//  TABLAS ISR 2026 — Art. 96 LISR / Anexo 8 RMF (DOF 28/12/2025)
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ ACCIÓN REQUERIDA DEL ADMINISTRADOR: el SAT publica el Anexo 8 de la RMF
// cada fin de año. Las tarifas se actualizan cuando la inflación acumulada
// desde la última actualización rebasa el 10% (Art. 152 LISR, último párrafo).
// Para 2026 la inflación acumulada nov-2022 → nov-2025 fue de 13.21%, así que
// los límites y cuotas fijas SÍ cambiaron respecto a 2023-2025 (los
// porcentajes no). Al publicarse la tarifa del siguiente ejercicio, sustituir
// estas tres tablas (mensual y anual; semanal/quincenal se derivan solas).
const ISR_MENSUAL_2026 = [
  { limInf:       0.01, limSup:     844.59, cuota:       0.00, pct: 0.0192 },
  { limInf:     844.60, limSup:    7168.51, cuota:      16.22, pct: 0.0640 },
  { limInf:    7168.52, limSup:   12598.02, cuota:     420.95, pct: 0.1088 },
  { limInf:   12598.03, limSup:   14644.64, cuota:    1011.68, pct: 0.1600 },
  { limInf:   14644.65, limSup:   17533.64, cuota:    1339.14, pct: 0.1792 },
  { limInf:   17533.65, limSup:   35362.83, cuota:    1856.84, pct: 0.2136 },
  { limInf:   35362.84, limSup:   55736.68, cuota:    5665.16, pct: 0.2352 },
  { limInf:   55736.69, limSup:  106410.50, cuota:   10457.09, pct: 0.3000 },
  { limInf:  106410.51, limSup:  141880.66, cuota:   25659.23, pct: 0.3200 },
  { limInf:  141880.67, limSup:  425641.99, cuota:   37009.69, pct: 0.3400 },
  { limInf:  425642.00, limSup: Infinity,   cuota:  133488.54, pct: 0.3500 },
];

// Tarifa ANUAL (Art. 152 LISR) — la usa el ajuste anual del Art. 97
// (ajuste_anual.js). No se deriva de la mensual: el SAT la publica aparte.
const ISR_ANUAL_2026 = [
  { limInf:        0.01, limSup:    10135.11, cuota:       0.00, pct: 0.0192 },
  { limInf:    10135.12, limSup:    86022.11, cuota:     194.59, pct: 0.0640 },
  { limInf:    86022.12, limSup:   151176.19, cuota:    5051.37, pct: 0.1088 },
  { limInf:   151176.20, limSup:   175735.66, cuota:   12140.13, pct: 0.1600 },
  { limInf:   175735.67, limSup:   210403.69, cuota:   16069.64, pct: 0.1792 },
  { limInf:   210403.70, limSup:   424353.97, cuota:   22282.14, pct: 0.2136 },
  { limInf:   424353.98, limSup:   668840.14, cuota:   67981.92, pct: 0.2352 },
  { limInf:   668840.15, limSup:  1276925.98, cuota:  125485.07, pct: 0.3000 },
  { limInf:  1276925.99, limSup:  1702567.97, cuota:  307910.81, pct: 0.3200 },
  { limInf:  1702567.98, limSup:  5107703.92, cuota:  444116.23, pct: 0.3400 },
  { limInf:  5107703.93, limSup: Infinity,    cuota: 1601862.46, pct: 0.3500 },
];

/**
 * Tarifas por periodicidad (Anexo 8 RMF). El SAT las construye desde la
 * mensual: tarifa diaria = mensual / 30.4; semanal = diaria × 7;
 * quincenal = diaria × 15. Derivarlas aquí con esos factores reproduce la
 * construcción oficial (los límites publicados pueden variar ±$0.01 por el
 * orden de redondeo). Así cada periodicidad retiene con SU tarifa, en vez
 * de aproximar mensualizando.
 */
function _escalarTarifaISR(tabla, factor) {
  return tabla.map((b, i) => ({
    limInf: i === 0 ? 0.01 : parseFloat((b.limInf * factor).toFixed(2)),
    limSup: b.limSup === Infinity ? Infinity : parseFloat((b.limSup * factor).toFixed(2)),
    cuota:  parseFloat((b.cuota * factor).toFixed(2)),
    pct:    b.pct,
  }));
}
const ISR_SEMANAL_2026   = _escalarTarifaISR(ISR_MENSUAL_2026,  7 / 30.4);
const ISR_QUINCENAL_2026 = _escalarTarifaISR(ISR_MENSUAL_2026, 15 / 30.4);

/**
 * Subsidio al empleo vigente (decreto DOF 31/12/2025, aplicable 2026):
 * cuota FIJA = % de la UMA mensual (UMA diaria × 30.4), únicamente si la
 * base mensualizada no excede el límite de ingresos. Ya no es entregable en
 * efectivo: solo acredita hasta el monto del ISR. Sustituye a la tabla
 * progresiva del régimen anterior.
 * @param {number} basePeriodo  Base gravable del período
 * @param {number} factorMes    Factor para mensualizar (30.4/7, 30.4/15, 1)
 */
function _subsidioEmpleoPeriodo(basePeriodo, factorMes) {
  const uma = typeof _umaVigente === 'function' ? _umaVigente() : 117.31;
  const pct = typeof getConfigValor === 'function' ? getConfigValor('subsidio_pct_uma', 0.1502) : 0.1502;
  const lim = typeof getConfigValor === 'function' ? getConfigValor('subsidio_limite_mensual', 11492.66) : 11492.66;
  if (basePeriodo * factorMes > lim) return 0;
  return parseFloat(((uma * 30.4 * pct) / factorMes).toFixed(2));
}

/**
 * Calcula ISR retenido y subsidio al empleo para un salario y período,
 * aplicando la tarifa de la periodicidad correspondiente.
 * `subsidio` es el efectivamente ACREDITADO (topado al ISR del período).
 */
function calcISR(salarioPeriodo, periodo) {
  const tabla = periodo === 'quincenal' ? ISR_QUINCENAL_2026
              : periodo === 'semanal'   ? ISR_SEMANAL_2026
              : ISR_MENSUAL_2026;
  const factorMes = periodo === 'quincenal' ? 30.4 / 15
                  : periodo === 'semanal'   ? 30.4 / 7
                  : 1;
  const base = salarioPeriodo;
  if (base <= 0) return { isr: 0, subsidio: 0, isrNeto: 0 };

  const bracket  = tabla.find(b => base >= b.limInf && base <= b.limSup) || tabla[tabla.length - 1];
  const isrBruto = bracket.cuota + (base - bracket.limInf) * bracket.pct;
  const subsidio = Math.min(isrBruto, _subsidioEmpleoPeriodo(base, factorMes));
  const isrNeto  = Math.max(0, isrBruto - subsidio);

  return {
    isr:      parseFloat(isrBruto.toFixed(2)),
    subsidio: parseFloat(subsidio.toFixed(2)),
    isrNeto:  parseFloat(isrNeto.toFixed(2)),
  };
}

/** ISR mensual bruto (tarifa Art. 96 LISR), sin subsidio. Auxiliar del Art. 174 RLISR. */
function _isrMensualBruto(baseMensual) {
  if (!(baseMensual > 0)) return 0;
  const b = ISR_MENSUAL_2026.find(x => baseMensual >= x.limInf && baseMensual <= x.limSup)
            || ISR_MENSUAL_2026[ISR_MENSUAL_2026.length - 1];
  return b.cuota + (baseMensual - b.limInf) * b.pct;
}

/**
 * ISR de percepciones extraordinarias (aguinaldo, PTU, prima vacacional)
 * por el procedimiento OPCIONAL del Art. 174 RLISR — el estándar en la
 * práctica porque suaviza la retención:
 *   I.   Promedio mensual = gravado / 365 × 30.4
 *   II.  ISR de (salario mensual ordinario + promedio)
 *   III. ISR del salario mensual ordinario
 *   IV.  Tasa = (II − III) / promedio; ISR = gravado × tasa
 * @param {number} montoGravado             Percepción GRAVADA (ya sin exención)
 * @param {number} salarioMensualOrdinario  Salario mensual ordinario del trabajador
 */
function calcISRArt174(montoGravado, salarioMensualOrdinario) {
  if (!(montoGravado > 0)) return { isr: 0, tasa: 0 };
  const promMensual = montoGravado / 365 * 30.4;
  const dif  = Math.max(0, _isrMensualBruto((salarioMensualOrdinario || 0) + promMensual)
                         - _isrMensualBruto(salarioMensualOrdinario || 0));
  const tasa = promMensual > 0 ? dif / promMensual : 0;
  return { isr: parseFloat((montoGravado * tasa).toFixed(2)), tasa };
}

// ═══════════════════════════════════════════════════════════════════════════
//  ESTADO DEL MÓDULO
// ═══════════════════════════════════════════════════════════════════════════
let _N = {
  tab:              1,
  periodoActualId:  null,
  periodos:         [],
  recibos:          [],
  trabajadores:     [],
  sucursales:       [],
  histTrabId:       '',
};

const _sbN = () => window.supabase;

// ═══════════════════════════════════════════════════════════════════════════
//  PUNTO DE ENTRADA
// ═══════════════════════════════════════════════════════════════════════════
async function renderNominaModulo() {
  // Resetear estado al entrar al módulo para evitar tabs/períodos stale
  _N.tab             = 1;
  _N.periodoActualId = null;
  _N.recibos         = [];

  const main = document.getElementById('main-view');
  main.innerHTML = `<div class="loading"><div class="spinner"></div> Cargando nómina…</div>`;
  try {
    const [trabs, sucs, periodos] = await Promise.all([
      _sbN().from('trabajadores').select('*').eq('empresa_id', CTX.empresa.id).eq('estado','activo').order('nombre'),
      _sbN().from('sucursales').select('id,nombre').eq('empresa_id', CTX.empresa.id).eq('activa', true).order('nombre'),
      _sbN().from('periodos_nomina').select('*').eq('empresa_id', CTX.empresa.id).order('fecha_inicio', { ascending:false }),
    ]);
    _N.trabajadores = trabs.data  || [];
    _N.sucursales   = sucs.data   || [];
    _N.periodos     = periodos.data || [];

    _renderShellNomina();
    await _cargarTabNomina();
  } catch(e) {
    main.innerHTML = `<div class="alert alert-danger"><span>❌</span><span>${e.message}</span></div>`;
  }
}

function _renderShellNomina() {
  const main = document.getElementById('main-view');
  main.innerHTML = `
    <div class="view-header animate-in">
      <div>
        <div class="view-title">💰 Nómina</div>
        <div class="view-subtitle">${CTX.empresa.nombre}</div>
      </div>
    </div>
    <div class="tabs animate-in" style="margin-bottom:16px;">
      <button class="tab-btn ${_N.tab===1?'active':''}" onclick="switchNominaTab(1)">📅 Períodos</button>
      <button class="tab-btn ${_N.tab===2?'active':''}" onclick="switchNominaTab(2)"
        ${!_N.periodoActualId?'disabled':''}>📋 Detalle del Período</button>
      <button class="tab-btn ${_N.tab===3?'active':''}" onclick="switchNominaTab(3)">👤 Historial por Trabajador</button>
      <button class="tab-btn ${_N.tab===4?'active':''}" onclick="switchNominaTab(4)" title="Ajuste anual de ISR (Art. 97 LISR)">🧾 Ajuste anual ISR</button>
    </div>
    <div id="nomina-content" class="animate-in"></div>
  `;
}

async function switchNominaTab(tab) {
  _N.tab = tab;
  document.querySelectorAll('.tab-btn').forEach((b,i) => {
    b.classList.toggle('active', i+1 === tab);
  });
  await _cargarTabNomina();
}

async function _cargarTabNomina() {
  const el = document.getElementById('nomina-content');
  if (!el) return;
  el.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
  if (_N.tab === 1) await _tabPeriodos();
  else if (_N.tab === 2) await _tabDetalle();
  else if (_N.tab === 4 && typeof renderAjusteAnual === 'function') await renderAjusteAnual(el);
  else await _tabHistorial();
}

// ═══════════════════════════════════════════════════════════════════════════
//  TAB 1 — PERÍODOS
// ═══════════════════════════════════════════════════════════════════════════
async function _tabPeriodos() {
  const el = document.getElementById('nomina-content');

  // Obtener recuento de recibos por período
  const { data: counts } = await _sbN()
    .from('recibos_nomina')
    .select('periodo_id, neto_pagar')
    .eq('empresa_id', CTX.empresa.id);

  const cntMap = {};
  (counts || []).forEach(r => {
    if (!cntMap[r.periodo_id]) cntMap[r.periodo_id] = { n:0, total:0 };
    cntMap[r.periodo_id].n++;
    cntMap[r.periodo_id].total += parseFloat(r.neto_pagar || 0);
  });

  const badgeTipo = { semanal:'Semanal', quincenal:'Quincenal', mensual:'Mensual' };
  const estadoCls = { borrador:'', aprobado:'badge-formal', pagado:'badge-activo' };

  el.innerHTML = `
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
      <button class="btn-secondary" onclick="showModalRevisionSalarios()">🔍 Revisar salarios</button>
      <button class="btn-secondary" onclick="showModalCalendarioAnual()">🗓️ Calendario anual</button>
      <button class="btn-primary" onclick="showModalNuevoPeriodo()">+ Nuevo Período</button>
    </div>

    ${_N.periodos.length === 0 ? `
      <div class="empty-state"><div class="empty-state-icon">💰</div>
        <div class="empty-state-title">Sin períodos de nómina</div>
        <p style="margin-top:8px;font-size:.82rem;color:var(--text-muted);">
          Crea el primer período para comenzar a generar recibos.
        </p>
      </div>` :

      `<div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Período</th><th>Tipo</th><th>Fechas</th>
            <th>Trabajadores</th><th>Total neto</th><th>Estado</th><th>Acciones</th>
          </tr></thead>
          <tbody>
            ${_N.periodos.map(p => {
              const cnt  = cntMap[p.id] || { n:0, total:0 };
              const esta = p.cerrado ? 'pagado' : (cnt.n > 0 ? 'aprobado' : 'borrador');
              return `<tr>
                <td><strong>${p.nombre}</strong></td>
                <td><span style="font-size:.78rem;">${badgeTipo[p.tipo]||p.tipo}</span></td>
                <td style="font-size:.82rem;">${formatDateShort(p.fecha_inicio)} — ${formatDateShort(p.fecha_fin)}</td>
                <td style="text-align:center;">${cnt.n}</td>
                <td style="font-weight:700;color:var(--green-ok);">${cnt.n ? fmt(cnt.total) : '—'}</td>
                <td><span class="badge ${estadoCls[esta]||''}">${{borrador:'Borrador',aprobado:'Generado',pagado:'Pagado'}[esta]}</span></td>
                <td>
                  <div class="actions">
                    <button class="btn-primary btn-sm" onclick="verDetallePeriodo('${p.id}')">Ver detalle</button>
                    ${cnt.n > 0 ? `
                      <button class="btn-secondary btn-sm" onclick="exportarSPEI('${p.id}')">SPEI</button>
                      <button class="btn-secondary btn-sm" onclick="descargarZIPRecibos('${p.id}')">ZIP</button>` : ''}
                    ${!p.cerrado ? `<button class="btn-secondary btn-sm" onclick="cerrarPeriodo('${p.id}')">✓ Cerrar</button>` : ''}
                    <button class="btn-sm" style="background:rgba(231,76,60,.12);color:var(--red-warn);border:1px solid rgba(231,76,60,.3);" onclick="confirmarEliminarPeriodo('${p.id}','${p.nombre.replace(/'/g,"\\'")}',${cnt.n})">🗑️</button>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`
    }
  `;
}

// ── Modal: Revisión / reconciliación de salarios por frecuencia ──────────────
// El campo salario_mensual guarda el monto DEL PERIODO DE PAGO del trabajador.
// Antes la etiqueta del alta decía siempre "Salario Mensual", por lo que un
// trabajador quincenal/semanal pudo capturarse con su sueldo mensual completo.
// Esta pantalla muestra, por trabajador, el monto capturado + salario diario +
// equivalente mensual para verificar/corregir el dato antes de generar nómina.
function showModalRevisionSalarios() {
  const trabs = (_N.trabajadores || []).filter(t => t.estado === 'activo');
  const perLabel = p => p === 'quincenal' ? 'Quincenal' : p === 'semanal' ? 'Semanal' : 'Mensual';

  const filas = trabs.map(t => {
    const per    = t.periodo_salario || 'mensual';
    const monto  = parseFloat(t.salario_mensual || 0);
    const diario = calcSalarioDiario(monto, per);
    const mens   = diario * 30;
    const alerta = per !== 'mensual'; // resaltar los más propensos a error de captura
    return `
      <tr style="${alerta ? 'background:rgba(245,166,35,.05);' : ''}">
        <td><strong>${t.nombre}</strong><div style="font-size:.72rem;color:var(--text-muted);">${t.puesto || ''}</div></td>
        <td>
          <select class="form-select" style="min-width:110px;" id="rec-per-${t.id}" onchange="_previewSalarioReconc('${t.id}')">
            <option value="mensual"   ${per==='mensual'?'selected':''}>Mensual</option>
            <option value="quincenal" ${per==='quincenal'?'selected':''}>Quincenal</option>
            <option value="semanal"   ${per==='semanal'?'selected':''}>Semanal</option>
          </select>
        </td>
        <td><input type="number" min="0" step="0.01" class="form-input" style="width:120px;"
                   id="rec-sal-${t.id}" value="${monto}" oninput="_previewSalarioReconc('${t.id}')" /></td>
        <td style="text-align:right;"><span id="rec-diario-${t.id}">${fmt(diario)}</span></td>
        <td style="text-align:right;"><span id="rec-mens-${t.id}">${fmt(mens)}</span></td>
        <td><button class="btn-secondary btn-sm" id="rec-btn-${t.id}" onclick="guardarSalarioReconciliacion('${t.id}')">💾</button></td>
      </tr>`;
  }).join('');

  showModal(`
    <div class="modal animate-in" style="max-width:820px;width:96vw;">
      <div class="modal-header">
        <div class="modal-title">🔍 Revisión de salarios por frecuencia de pago</div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <p style="font-size:.82rem;color:var(--text-muted);margin:0 0 12px;">
        El salario capturado corresponde al <strong>periodo de pago</strong> de cada trabajador.
        Verifica el <strong>salario diario</strong> y el <strong>equivalente mensual</strong>. Si un trabajador
        quincenal o semanal tiene capturado su sueldo mensual completo, corrígelo aquí antes de generar la nómina.
      </p>
      ${trabs.length === 0 ? '<div class="empty-state" style="padding:20px 0;"><div class="empty-state-title">Sin trabajadores activos</div></div>' : `
      <div class="table-wrap" style="max-height:52vh;overflow:auto;">
        <table class="data-table">
          <thead><tr>
            <th>Trabajador</th><th>Frecuencia</th><th>Salario capturado</th>
            <th style="text-align:right;">Diario</th><th style="text-align:right;">Equiv. mensual</th><th></th>
          </tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`}
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Cerrar</button>
      </div>
    </div>
  `);
}

function _previewSalarioReconc(id) {
  const per   = document.getElementById(`rec-per-${id}`)?.value || 'mensual';
  const monto = parseFloat(document.getElementById(`rec-sal-${id}`)?.value) || 0;
  const diario = calcSalarioDiario(monto, per);
  const dEl = document.getElementById(`rec-diario-${id}`);
  const mEl = document.getElementById(`rec-mens-${id}`);
  if (dEl) dEl.textContent = fmt(diario);
  if (mEl) mEl.textContent = fmt(diario * 30);
}

async function guardarSalarioReconciliacion(id) {
  const btn   = document.getElementById(`rec-btn-${id}`);
  const per   = document.getElementById(`rec-per-${id}`)?.value || 'mensual';
  const monto = parseFloat(document.getElementById(`rec-sal-${id}`)?.value);
  if (!(monto > 0)) { if (typeof showToast === 'function') showToast('El salario debe ser mayor a 0.', 'error'); return; }
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
  try {
    const { error } = await _sbN().from('trabajadores')
      .update({ salario_mensual: monto, periodo_salario: per })
      .eq('id', id).eq('empresa_id', CTX.empresa.id);
    if (error) throw error;
    // Reflejar en estado local para que la generación use el dato corregido
    const t = (_N.trabajadores || []).find(x => x.id === id);
    if (t) { t.salario_mensual = monto; t.periodo_salario = per; }
    if (btn) { btn.textContent = '✅'; btn.disabled = false; }
    if (typeof showToast === 'function') showToast('Salario actualizado.', 'success', 2500);
  } catch(e) {
    if (btn) { btn.textContent = '💾'; btn.disabled = false; }
    if (typeof showToast === 'function') showToast('Error: ' + e.message, 'error');
  }
}

// ── Modal: Nuevo Período ─────────────────────────────────────────────────────
function _detectarTipoPeriodoDominante() {
  const conteo = { semanal: 0, quincenal: 0, mensual: 0 };
  (_N.trabajadores || []).forEach(t => {
    const p = t.periodo_salario || 'mensual';
    if (conteo[p] !== undefined) conteo[p]++;
  });
  const max = Math.max(conteo.semanal, conteo.quincenal, conteo.mensual);
  if (max === 0)                return 'quincenal'; // sin trabajadores: quincenal (lo más común)
  if (conteo.quincenal === max) return 'quincenal'; // empates → quincenal, luego mensual, luego semanal
  if (conteo.mensual === max)   return 'mensual';
  return 'semanal';
}

function _sugerirFechasPeriodo(tipo, hoy) {
  const anio = hoy.getFullYear();
  const mes  = hoy.getMonth() + 1;
  const dia  = hoy.getDate();
  const mm   = String(mes).padStart(2,'0');
  const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  if (tipo === 'semanal') {
    const pad = d => String(d).padStart(2,'0');

    // El PERÍODO devengado es la semana natural lunes→domingo que contiene la
    // fecha ancla. NO se deriva del día de pago: el período (lo trabajado) y la
    // fecha de pago (cuándo se liquida, Art. 88 LFT) son independientes.
    const diasDesdeLunes = (hoy.getDay() + 6) % 7;   // JS: 0=dom … 6=sáb → 0=lun … 6=dom
    const iniSem = new Date(hoy);    iniSem.setDate(hoy.getDate() - diasDesdeLunes);
    const finSem = new Date(iniSem); finSem.setDate(iniSem.getDate() + 6);

    // Día de pago configurado (0=dom … 6=sáb), default viernes=5.
    // Se ubica DENTRO de esa misma semana lunes→domingo.
    const diaPago    = CTX?.empresa?.dia_pago_semanal ?? 5;
    const offsetPago = (diaPago + 6) % 7;            // lunes=0 … domingo=6
    const fechaPago  = new Date(iniSem); fechaPago.setDate(iniSem.getDate() + offsetPago);

    const iniStr = `${iniSem.getFullYear()}-${pad(iniSem.getMonth()+1)}-${pad(iniSem.getDate())}`;
    const finStr = `${finSem.getFullYear()}-${pad(finSem.getMonth()+1)}-${pad(finSem.getDate())}`;

    const semMes = Math.ceil(iniSem.getDate() / 7);
    const DIAS   = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const pagoStr = `${fechaPago.getFullYear()}-${pad(fechaPago.getMonth()+1)}-${pad(fechaPago.getDate())}`;
    return {
      nombre: `Semana ${semMes} — ${MESES[iniSem.getMonth()+1]} ${iniSem.getFullYear()} (pago ${DIAS[diaPago]})`,
      ini: iniStr,
      fin: finStr,
      pago: pagoStr, // día de pago dentro de la semana, independiente del fin
    };
  }

  if (tipo === 'quincenal') {
    const esQ1   = dia <= 15;
    const ultiDia= new Date(anio, mes, 0).getDate();
    // Día de pago: config de empresa (1ª/2ª quincena); 0 = último día del mes
    const cfgQ1  = CTX?.empresa?.dia_pago_quincenal_1 ?? 15;
    const cfgQ2  = CTX?.empresa?.dia_pago_quincenal_2 ?? 0;
    const diaPagoQ = esQ1 ? (cfgQ1 || 15) : (cfgQ2 ? Math.min(cfgQ2, ultiDia) : ultiDia);
    return {
      nombre: `${esQ1?'Quincena 1':'Quincena 2'} — ${MESES[mes]} ${anio}`,
      ini:    `${anio}-${mm}-${esQ1?'01':'16'}`,
      fin:    `${anio}-${mm}-${esQ1?'15':ultiDia}`,
      pago:   `${anio}-${mm}-${String(diaPagoQ).padStart(2,'0')}`,
    };
  }

  // mensual
  const ultiDia = new Date(anio, mes, 0).getDate();
  const cfgM     = CTX?.empresa?.dia_pago_mensual ?? 0;
  const diaPagoM = cfgM ? Math.min(cfgM, ultiDia) : ultiDia; // 0 = último día del mes
  return {
    nombre: `${MESES[mes]} ${anio}`,
    ini:    `${anio}-${mm}-01`,
    fin:    `${anio}-${mm}-${ultiDia}`,
    pago:   `${anio}-${mm}-${String(diaPagoM).padStart(2,'0')}`,
  };
}

// ── Calendario anual: precrea todos los períodos del año ─────────────────────
// Crea períodos VACÍOS (sin recibos) según la frecuencia elegida; el usuario
// genera la nómina de cada uno cuando toca. Evita duplicar los ya existentes.
function _construirCalendarioAnual(tipo, anio) {
  const periodos = [];
  if (tipo === 'mensual') {
    for (let m = 0; m < 12; m++) periodos.push(_sugerirFechasPeriodo('mensual', new Date(anio, m, 1)));
  } else if (tipo === 'quincenal') {
    for (let m = 0; m < 12; m++) {
      periodos.push(_sugerirFechasPeriodo('quincenal', new Date(anio, m, 1)));   // 1ª quincena
      periodos.push(_sugerirFechasPeriodo('quincenal', new Date(anio, m, 16)));  // 2ª quincena
    }
  } else { // semanal
    let anchor = new Date(anio, 0, 1);
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
      const s = _sugerirFechasPeriodo('semanal', anchor);
      const y = new Date(s.ini + 'T00:00:00').getFullYear();
      if (y > anio) break;
      if (y === anio && !seen.has(s.ini)) { seen.add(s.ini); periodos.push(s); }
      anchor = new Date(s.ini + 'T00:00:00'); anchor.setDate(anchor.getDate() + 7);
    }
  }
  return periodos;
}

function showModalCalendarioAnual() {
  const anioActual = new Date().getFullYear();
  const tipoDom    = _detectarTipoPeriodoDominante();
  showModal(`
    <div class="modal animate-in" style="max-width:520px;">
      <div class="modal-header">
        <div class="modal-title">🗓️ Generar calendario anual de nómina</div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <p style="font-size:.82rem;color:var(--text-muted);margin:0 0 14px;">
        Precrea todos los períodos del año para una frecuencia (vacíos, sin recibos).
        Luego generas la nómina de cada período cuando corresponda. No duplica los que ya existen.
      </p>
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Frecuencia</label>
          <select id="cal-tipo" class="form-select">
            <option value="semanal"   ${tipoDom==='semanal'?'selected':''}>Semanal (~52)</option>
            <option value="quincenal" ${tipoDom==='quincenal'?'selected':''}>Quincenal (24)</option>
            <option value="mensual"   ${tipoDom==='mensual'?'selected':''}>Mensual (12)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Año</label>
          <input id="cal-anio" type="number" class="form-input" value="${anioActual}" min="2020" max="2100" />
        </div>
      </div>
      <div id="cal-msg" style="display:none;margin:8px 0;"></div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-primary" id="cal-btn" onclick="generarCalendarioAnual()">Crear períodos</button>
      </div>
    </div>
  `);
}

async function generarCalendarioAnual() {
  const tipo = document.getElementById('cal-tipo')?.value || 'quincenal';
  const anio = parseInt(document.getElementById('cal-anio')?.value) || new Date().getFullYear();
  const msg  = document.getElementById('cal-msg');
  const btn  = document.getElementById('cal-btn');
  if (btn) { btn.textContent = '⏳ Creando…'; btn.disabled = true; }

  try {
    const candidatos = _construirCalendarioAnual(tipo, anio);
    // Descartar los que ya existen (mismo tipo + misma fecha de inicio)
    const existentes = new Set((_N.periodos || [])
      .filter(p => p.tipo === tipo)
      .map(p => p.fecha_inicio));
    const nuevos = candidatos
      .filter(s => !existentes.has(s.ini))
      .map(s => ({ empresa_id: CTX.empresa.id, nombre: s.nombre, tipo,
                   fecha_inicio: s.ini, fecha_fin: s.fin, fecha_pago: s.pago || s.fin }));

    if (nuevos.length === 0) {
      if (msg) { msg.textContent = 'Todos los períodos de ese año ya existen.'; msg.className = 'alert'; msg.style.display = ''; }
      if (btn) { btn.textContent = 'Crear períodos'; btn.disabled = false; }
      return;
    }

    // Insertar (tolerante si la columna fecha_pago no existe todavía)
    let { error } = await _sbN().from('periodos_nomina').insert(nuevos);
    if (error && /fecha_pago/i.test(error.message || '')) {
      const sinPago = nuevos.map(({ fecha_pago, ...r }) => r);
      ({ error } = await _sbN().from('periodos_nomina').insert(sinPago));
    }
    if (error) throw error;

    closeModal();
    // Recargar períodos
    const { data: periodos } = await _sbN().from('periodos_nomina')
      .select('*').eq('empresa_id', CTX.empresa.id).order('fecha_inicio', { ascending: false });
    _N.periodos = periodos || [];
    await _tabPeriodos();
    if (typeof showToast === 'function') showToast(`Se crearon ${nuevos.length} período(s) ${tipo} de ${anio}.`, 'success', 5000);
  } catch(e) {
    if (msg) { msg.textContent = '❌ ' + e.message; msg.className = 'alert alert-danger'; msg.style.display = ''; }
    if (btn) { btn.textContent = 'Crear períodos'; btn.disabled = false; }
  }
}

function showModalNuevoPeriodo(prefill = null) {
  const hoy  = new Date();

  const tipoDom = prefill?.tipo || _detectarTipoPeriodoDominante();
  const sug = _sugerirFechasPeriodo(tipoDom, hoy);
  const nombre = prefill?.nombre ?? sug.nombre;
  const ini    = prefill?.ini    ?? sug.ini;
  const fin    = prefill?.fin    ?? sug.fin;
  const pago   = prefill?.pago   ?? sug.pago;

  const sucOpts = _N.sucursales.length > 1
    ? `<div class="form-group span-2">
        <label class="form-label">Sucursal (dejar vacío = todas)</label>
        <select id="np-suc" class="form-select">
          <option value="">Todas las sucursales</option>
          ${_N.sucursales.map(s=>`<option value="${s.id}">${s.nombre}</option>`).join('')}
        </select>
       </div>` : '';

  showModal(`
    <div class="modal animate-in" style="max-width:580px;">
      <div class="modal-header">
        <div class="modal-title">💰 Nuevo Período de Nómina</div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div class="form-grid">
        <div class="form-group span-2">
          <label class="form-label">Nombre del período <span class="req">*</span></label>
          <input id="np-nombre" type="text" class="form-input" value="${nombre}" />
        </div>
        <div class="form-group">
          <label class="form-label">Tipo de período</label>
          <select id="np-tipo" class="form-select" onchange="_actualizarFechasPeriodo()">
            <option value="semanal" ${tipoDom==='semanal'?'selected':''}>Semanal</option>
            <option value="quincenal" ${tipoDom==='quincenal'?'selected':''}>Quincenal</option>
            <option value="mensual" ${tipoDom==='mensual'?'selected':''}>Mensual</option>
          </select>
        </div>
        <div class="form-group" style="grid-column:1;">
          <label class="form-label">Fecha inicio <span class="req">*</span></label>
          <input id="np-ini" type="date" class="form-input" value="${ini}"
                 onchange="_recalcularFinPeriodo()" />
        </div>
        <div class="form-group">
          <label class="form-label">Fecha fin <span class="req">*</span></label>
          <input id="np-fin" type="date" class="form-input" value="${fin}" />
        </div>
        <div class="form-group span-2">
          <label class="form-label">Fecha de pago
            <span style="font-size:.72rem;color:var(--text-muted);font-weight:400;">— día en que se liquida (Art. 88 LFT)</span>
          </label>
          <input id="np-pago" type="date" class="form-input" value="${pago || fin}" />
        </div>
        ${sucOpts}
        <div class="form-group span-2">
          <label class="form-label">Modo de generación</label>
          <div style="display:flex;gap:10px;margin-top:4px;">
            <label style="display:flex;align-items:flex-start;gap:8px;flex:1;cursor:pointer;padding:10px 12px;
                   border:1.5px solid var(--gold-primary);border-radius:8px;background:rgba(245,166,35,.06);">
              <input type="radio" name="np-modo" value="auto" checked
                     style="margin-top:2px;accent-color:var(--gold-primary);" />
              <div>
                <div style="font-weight:700;font-size:.85rem;">⚡ Automático</div>
                <div style="font-size:.75rem;color:var(--text-muted);margin-top:2px;">
                  Genera recibos para todos los trabajadores activos según sus especificaciones contractuales (salario, IMSS, ISR, deducciones).
                </div>
              </div>
            </label>
            <label style="display:flex;align-items:flex-start;gap:8px;flex:1;cursor:pointer;padding:10px 12px;
                   border:1.5px solid var(--border);border-radius:8px;" id="np-modo-manual-card">
              <input type="radio" name="np-modo" value="manual"
                     style="margin-top:2px;" onchange="_toggleModoCard()" />
              <div>
                <div style="font-weight:700;font-size:.85rem;">✏️ Manual</div>
                <div style="font-size:.75rem;color:var(--text-muted);margin-top:2px;">
                  Crea el período vacío. Podrás agregar y ajustar cada recibo desde el detalle.
                </div>
              </div>
            </label>
          </div>
        </div>
        <div class="form-group span-2" id="np-freq-group">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-top:4px;font-size:.82rem;">
            <input type="checkbox" id="np-incluir-todos"
                   style="width:16px;height:16px;accent-color:var(--gold-primary);" />
            Incluir a <strong>todos</strong> los trabajadores activos, sin importar su frecuencia de pago
          </label>
          <div class="helper-text">
            Por defecto solo se generan recibos para trabajadores cuyo periodo de pago coincide con el
            <strong>tipo de este período</strong>. Los semanales y mensuales llevan su propio período.
          </div>
        </div>
      </div>
      <div id="np-aviso" style="margin:0 0 8px;padding:8px 12px;background:rgba(245,166,35,.1);
           border:1px solid rgba(245,166,35,.3);border-radius:6px;font-size:.78rem;
           color:var(--gold-primary);display:none;">
        ⚠️ La fecha fin es anterior a la fecha inicio. Por favor corrígela.
      </div>
      <div id="np-error" class="error-msg" style="display:none;margin-bottom:8px;"></div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-primary" id="np-btn-crear" onclick="handleCrearPeriodo()">⚡ Crear y generar nómina</button>
      </div>
    </div>
  `);
  // Escuchar cambio de modo para actualizar el botón
  document.querySelectorAll('[name="np-modo"]').forEach(r => r.addEventListener('change', _toggleModoCard));
}

// Calcula la fecha fin y actualiza el nombre sugerido cuando cambia el tipo o la fecha inicio
function _actualizarFechasPeriodo() {
  const tipo     = document.getElementById('np-tipo')?.value;
  const iniInput = document.getElementById('np-ini');
  const finInput = document.getElementById('np-fin');
  const nomInput = document.getElementById('np-nombre');
  if (!iniInput?.value || !finInput) return;

  const d = new Date(iniInput.value + 'T00:00:00');
  const { nombre, fin, pago } = _sugerirFechasPeriodo(tipo, d);
  finInput.value = fin;
  if (nomInput) nomInput.value = nombre;
  const pagoInput = document.getElementById('np-pago');
  if (pagoInput && pago) pagoInput.value = pago;
  _validarFechasPeriodo();
}

function _recalcularFinPeriodo() {
  _actualizarFechasPeriodo();
}

function _validarFechasPeriodo() {
  const ini    = document.getElementById('np-ini')?.value;
  const fin    = document.getElementById('np-fin')?.value;
  const aviso  = document.getElementById('np-aviso');
  if (!aviso) return true;
  const invalido = ini && fin && fin < ini;
  aviso.style.display = invalido ? '' : 'none';
  return !invalido;
}

function _toggleModoCard() {
  const modo = document.querySelector('[name="np-modo"]:checked')?.value || 'auto';
  const btn  = document.getElementById('np-btn-crear');
  // Resaltar tarjeta seleccionada
  document.querySelectorAll('[name="np-modo"]').forEach(r => {
    const card = r.closest('label');
    if (r.checked) {
      card.style.borderColor = 'var(--gold-primary)';
      card.style.background  = 'rgba(245,166,35,.06)';
    } else {
      card.style.borderColor = 'var(--border)';
      card.style.background  = '';
    }
  });
  if (btn) btn.textContent = modo === 'auto' ? '⚡ Crear y generar nómina' : '📁 Crear período vacío';
}

async function handleCrearPeriodo() {
  const err    = document.getElementById('np-error');
  err.style.display = 'none';
  const nombre = document.getElementById('np-nombre')?.value.trim();
  const tipo   = document.getElementById('np-tipo')?.value;
  const ini    = document.getElementById('np-ini')?.value;
  const fin    = document.getElementById('np-fin')?.value;
  const sucId  = document.getElementById('np-suc')?.value || null;

  if (!nombre || !ini || !fin) {
    err.textContent = 'Nombre y fechas son obligatorios.';
    err.style.display = ''; return;
  }
  if (fin < ini) {
    err.textContent = `❌ La fecha fin (${fin}) es anterior a la fecha inicio (${ini}). Verifica las fechas del período.`;
    err.style.display = ''; return;
  }
  // Validar que no sea un rango absurdo (> 35 días)
  const diasRango = Math.round((new Date(fin) - new Date(ini)) / 86400000) + 1;
  if (diasRango > 35) {
    err.textContent = `⚠️ El período tiene ${diasRango} días. ¿Es correcto? Los períodos normales son 7, 15 o 30 días.`;
    err.style.display = ''; return;
  }

  const modo = document.querySelector('[name="np-modo"]:checked')?.value || 'auto';
  const btn  = document.getElementById('np-btn-crear');
  if (btn) { btn.textContent = '⏳ Creando…'; btn.disabled = true; }

  const pago = document.getElementById('np-pago')?.value || null;

  try {
    // Crear período (fecha_pago requiere la migración 22; se reintenta sin ella)
    const baseInsert = { empresa_id: CTX.empresa.id, nombre, tipo, fecha_inicio: ini, fecha_fin: fin, sucursal_id: sucId };
    let periodo, pErr;
    ({ data: periodo, error: pErr } = await _sbN()
      .from('periodos_nomina')
      .insert({ ...baseInsert, fecha_pago: pago })
      .select().single());
    if (pErr && /fecha_pago/i.test(pErr.message || '')) {
      console.warn('Columna periodos_nomina.fecha_pago no existe — aplica la migración 22_migration_nomina_programacion.sql');
      ({ data: periodo, error: pErr } = await _sbN()
        .from('periodos_nomina').insert(baseInsert).select().single());
    }
    if (pErr) throw pErr;

    // Generar recibos solo en modo automático
    let avisoExcluidos = null;
    if (modo === 'auto') {
      if (btn) btn.textContent = '⏳ Generando recibos…';
      const incluirTodos = document.getElementById('np-incluir-todos')?.checked || false;
      await generarNominaPeriodo(periodo.id, ini, fin, sucId, { tipoPeriodo: tipo, incluirTodos });

      // Detectar trabajadores de otra frecuencia que quedaron fuera (para avisar)
      if (!incluirTodos) {
        const activos = (_N.trabajadores || []).filter(t =>
          t.estado === 'activo' && (!sucId || t.sucursal_id === sucId));
        const otros = activos.filter(t => (t.periodo_salario || 'mensual') !== tipo);
        if (otros.length > 0) {
          const porTipo = otros.reduce((m, t) => {
            const k = t.periodo_salario || 'mensual'; m[k] = (m[k] || 0) + 1; return m;
          }, {});
          const detalle = Object.entries(porTipo)
            .map(([k, n]) => `${n} ${k === 'semanal' ? 'semanal(es)' : k === 'mensual' ? 'mensual(es)' : 'quincenal(es)'}`)
            .join(', ');
          avisoExcluidos = `Este período es ${tipo}. Quedaron fuera ${otros.length} trabajador(es) de otra frecuencia (${detalle}). Crea su propio período o marca "Incluir a todos".`;
        }
      }
    }

    closeModal();
    _N.periodos.unshift(periodo);
    _N.periodoActualId = periodo.id;
    _N.tab = 2;
    _renderShellNomina();
    await _cargarTabNomina();
    if (avisoExcluidos && typeof showToast === 'function') showToast(avisoExcluidos, 'warn', 8000);
  } catch(e) {
    err.textContent = e.message; err.style.display = '';
    if (btn) { btn.textContent = modo === 'auto' ? '⚡ Crear y generar nómina' : '📁 Crear período vacío'; btn.disabled = false; }
  }
}

async function verDetallePeriodo(periodoId) {
  _N.periodoActualId = periodoId;
  _N.tab = 2;
  _renderShellNomina();
  await _cargarTabNomina();
}

async function cerrarPeriodo(periodoId) {
  if (!confirm('¿Marcar este período como pagado y cerrado?')) return;
  await _sbN().from('periodos_nomina').update({ cerrado: true }).eq('id', periodoId);
  const p = _N.periodos.find(x => x.id === periodoId);
  if (p) p.cerrado = true;
  await _tabPeriodos();

  // Ofrecer crear el siguiente período con las fechas ya calculadas
  if (p && confirm(`Período cerrado. ¿Crear el siguiente período ${p.tipo || ''} con las fechas calculadas?`)) {
    const finD = new Date((p.fecha_fin || '') + 'T00:00:00');
    finD.setDate(finD.getDate() + 1); // anclar en el día siguiente al fin
    const sug = _sugerirFechasPeriodo(p.tipo || 'quincenal', finD);
    showModalNuevoPeriodo({ tipo: p.tipo || 'quincenal', sucursal_id: p.sucursal_id || '', ...sug });
  }
}

function confirmarEliminarPeriodo(periodoId, nombrePeriodo, numRecibos) {
  const detalle = numRecibos > 0
    ? `<div style="margin:12px 0;padding:10px 14px;background:rgba(231,76,60,.1);border:1px solid rgba(231,76,60,.3);border-radius:8px;font-size:.83rem;">
        ⚠️ Este período tiene <strong>${numRecibos} recibo${numRecibos!==1?'s':''} de nómina</strong> que también serán eliminados permanentemente.
       </div>`
    : `<div style="margin:12px 0;padding:8px 12px;background:rgba(255,255,255,.04);border-radius:8px;font-size:.83rem;color:var(--text-muted);">
        Este período no tiene recibos generados.
       </div>`;

  showModal(`
    <div class="modal animate-in" style="max-width:440px;">
      <div class="modal-header" style="background:rgba(231,76,60,.15);border-bottom:1px solid rgba(231,76,60,.3);">
        <div class="modal-title" style="color:var(--red-warn);">🗑️ Eliminar período de nómina</div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div style="padding:18px 20px;">
        <p style="font-size:.9rem;margin:0 0 4px;">¿Estás seguro de que deseas eliminar el período:</p>
        <p style="font-weight:800;font-size:1rem;margin:0 0 4px;">${nombrePeriodo}</p>
        ${detalle}
        <p style="font-size:.8rem;color:var(--red-warn);margin:0;">⛔ Esta acción es <strong>irreversible</strong>. No se podrá recuperar la información.</p>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-sm" style="background:var(--red-warn);color:#fff;padding:8px 18px;border-radius:6px;font-weight:700;border:none;cursor:pointer;"
          onclick="eliminarPeriodo('${periodoId}')">Sí, eliminar definitivamente</button>
      </div>
    </div>
  `);
}

async function eliminarPeriodo(periodoId) {
  const btn = document.querySelector('#modal-container [onclick^="eliminarPeriodo"]');
  if (btn) { btn.textContent = '⏳ Eliminando…'; btn.disabled = true; }
  try {
    // Eliminar recibos primero (FK constraint)
    const { error: e1 } = await _sbN().from('recibos_nomina').delete().eq('periodo_id', periodoId);
    if (e1) throw e1;
    const { error: e2 } = await _sbN().from('periodos_nomina').delete().eq('id', periodoId);
    if (e2) throw e2;

    _N.periodos = _N.periodos.filter(p => p.id !== periodoId);
    if (_N.periodoActualId === periodoId) { _N.periodoActualId = null; _N.tab = 1; }
    closeModal();
    _renderShellNomina();
    await _cargarTabNomina();
  } catch(e) {
    if (btn) { btn.textContent = 'Sí, eliminar definitivamente'; btn.disabled = false; }
    alert('Error al eliminar: ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  TAB 2 — DETALLE DEL PERÍODO
// ═══════════════════════════════════════════════════════════════════════════
async function _tabDetalle() {
  const el = document.getElementById('nomina-content');
  if (!_N.periodoActualId) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📅</div>
      <div class="empty-state-title">Selecciona un período desde la pestaña Períodos</div></div>`;
    return;
  }

  const { data: periodo } = await _sbN()
    .from('periodos_nomina').select('*').eq('id', _N.periodoActualId).single();
  const { data: recibos } = await _sbN()
    .from('recibos_nomina')
    .select('*, trabajadores(nombre,puesto,rfc,sucursal_id,cuenta_bancaria,clabe_interbancaria,telefono)')
    .eq('periodo_id', _N.periodoActualId)
    .order('created_at');

  _N.recibos = recibos || [];

  const totalPerc        = _N.recibos.reduce((s,r) => s + parseFloat(r.total_percepciones||0), 0);
  const totalDed         = _N.recibos.reduce((s,r) => s + parseFloat(r.total_deducciones||0), 0);
  const totalNeto        = _N.recibos.reduce((s,r) => s + parseFloat(r.neto_pagar||0), 0);
  const totalInfPatronal = _N.recibos.reduce((s,r) => {
    // Si ya está guardado en BD lo usa; si no, lo calcula al vuelo
    if (r.infonavit_patronal != null && parseFloat(r.infonavit_patronal) > 0) return s + parseFloat(r.infonavit_patronal);
    const d = r.dias_laborados > 0 ? parseFloat(r.salario_base) / r.dias_laborados : 0;
    const uma = typeof _umaVigente === 'function' ? _umaVigente() : 117.31;
    return s + parseFloat((Math.min(d, 25*uma) * 0.05 * r.dias_laborados).toFixed(2));
  }, 0);
  // Costo patronal IMSS + ISN (migración 32; 0 en recibos generados antes)
  const totalImssPatronal = _N.recibos.reduce((s,r) => s + parseFloat(r.imss_patronal || 0), 0);
  const totalISN          = _N.recibos.reduce((s,r) => s + parseFloat(r.isn || 0), 0);
  const costoPatronal     = totalPerc + totalImssPatronal + totalInfPatronal + totalISN;

  el.innerHTML = `
    <!-- Resumen del período -->
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
      <button class="btn-secondary btn-sm" onclick="switchNominaTab(1)">← Períodos</button>
      <div style="font-weight:800;font-size:1.1rem;">${periodo?.nombre || ''}</div>
      <div style="font-size:.8rem;color:var(--text-muted);">
        ${formatDateShort(periodo?.fecha_inicio)} — ${formatDateShort(periodo?.fecha_fin)}
      </div>
      ${periodo?.cerrado ? '<span class="badge badge-activo">Pagado</span>' : '<span class="badge">Abierto</span>'}
    </div>

    <div class="kpi-grid animate-in" style="margin-bottom:16px;">
      <div class="kpi-card"><div class="kpi-icon"><svg class="ic"><use href="#i-download"></use></svg></div><div class="kpi-num" style="font-size:1.3rem;">${fmt(totalPerc)}</div><div class="kpi-label">Total percepciones</div></div>
      <div class="kpi-card"><div class="kpi-icon"><svg class="ic"><use href="#i-bar"></use></svg></div><div class="kpi-num" style="font-size:1.3rem;color:var(--red-warn);">${fmt(totalDed)}</div><div class="kpi-label">Total deducciones</div></div>
      <div class="kpi-card" style="background:var(--navy-deep);border-color:var(--navy-deep);"><div class="kpi-icon" style="color:#9db0c2;"><svg class="ic"><use href="#i-wallet"></use></svg></div><div class="kpi-num" style="font-size:1.3rem;color:#fff;">${fmt(totalNeto)}</div><div class="kpi-label" style="color:#9db0c2;">Total neto a pagar</div></div>
      <div class="kpi-card"><div class="kpi-icon"><svg class="ic"><use href="#i-user"></use></svg></div><div class="kpi-num">${_N.recibos.length}</div><div class="kpi-label">Trabajadores</div></div>
      <div class="kpi-card" style="border-color:var(--border);opacity:.85;" title="Costo patronal INFONAVIT 5% SBC — no se descuenta al trabajador (Art. 29 Ley INFONAVIT)">
        <div class="kpi-icon"><svg class="ic"><use href="#i-bank"></use></svg></div>
        <div class="kpi-num" style="font-size:1.1rem;color:var(--text-muted);">${fmt(totalInfPatronal)}</div>
        <div class="kpi-label">Aportación INFONAVIT patronal</div>
      </div>
      <div class="kpi-card" style="border-color:var(--border);opacity:.85;"
           title="Cuotas patronales IMSS (con prima de riesgo ${parseFloat(CTX.empresa.prima_riesgo_pct || 0.54355)}%): cuota fija, excedente, prestaciones en dinero, GMP, riesgos de trabajo, invalidez y vida, guarderías, retiro y CEAV progresiva">
        <div class="kpi-icon"><svg class="ic"><use href="#i-bank"></use></svg></div>
        <div class="kpi-num" style="font-size:1.1rem;color:var(--text-muted);">${fmt(totalImssPatronal)}</div>
        <div class="kpi-label">Cuotas IMSS patronales</div>
      </div>
      <div class="kpi-card" style="border-color:var(--gold-border);"
           title="Lo que esta nómina cuesta realmente a la empresa: percepciones brutas + cuotas patronales IMSS + INFONAVIT 5% + ISN estatal (${((parseFloat(CTX.empresa.isn_pct)||0)*100).toFixed(2)}%: ${fmt(totalISN)})">
        <div class="kpi-icon" style="color:var(--gold-primary);"><svg class="ic"><use href="#i-pie"></use></svg></div>
        <div class="kpi-num" style="font-size:1.3rem;color:var(--gold-primary);">${fmt(costoPatronal)}</div>
        <div class="kpi-label">Costo total para la empresa</div>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
      <button class="btn-secondary" onclick="recalcularTodo()">Recalcular todo</button>
      <button class="btn-secondary" onclick="exportarSPEI('${_N.periodoActualId}')">Exportar SPEI</button>
      <button class="btn-secondary" onclick="descargarZIPRecibos('${_N.periodoActualId}')">Descargar todos los recibos (ZIP)</button>
    </div>

    ${_N.recibos.length === 0 ? `
      <div class="empty-state"><div class="empty-state-icon">📋</div>
        <div class="empty-state-title">Sin recibos — usa "Recalcular todo" para generarlos</div>
      </div>` :

      `<div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Trabajador</th><th>Días lab.</th><th>Salario base</th>
            <th>💰 Comisiones</th><th>Extras</th><th>Faltas</th>
            <th>IMSS</th><th>ISR</th>
            <th title="INFONAVIT: aportación patronal 5% SBC (informativo) + descuento crédito si aplica">INFONAVIT</th>
            <th style="color:var(--green-ok);">NETO</th><th>Acciones</th>
          </tr></thead>
          <tbody>
            ${_N.recibos.map(r => {
              const comTotal      = parseFloat(r.comisiones_ventas||0) + parseFloat(r.comisiones_recuperacion||0) + parseFloat(r.bono_meta||0);
              const infonavitDed  = parseFloat(r.infonavit_descuento||0);
              // Aportación patronal 5% SBC (capped 25 UMA diarias = $2,828.50) — informativa, no reduce neto
              const dailyApprox   = r.dias_laborados > 0 ? parseFloat(r.salario_base) / r.dias_laborados : 0;
              const sdiCap        = Math.min(dailyApprox, 25 * 113.14);
              const infPatronal   = parseFloat((sdiCap * 0.05 * r.dias_laborados).toFixed(2));
              return `<tr id="rn-${r.id}">
                <td>
                  <strong>${r.trabajadores?.nombre||'—'}</strong>
                  <br><span style="font-size:.75rem;color:var(--text-muted);">${r.trabajadores?.puesto||''}</span>
                </td>
                <td style="text-align:center;">${r.dias_laborados}</td>
                <td>${fmt(r.salario_base)}</td>
                <td style="font-size:.82rem;color:${comTotal>0?'var(--gold-primary)':'inherit'};">
                  ${comTotal > 0 ? fmt(comTotal) : '—'}
                </td>
                <td style="font-size:.82rem;">
                  ${r.vales_despensa>0?`🛒 ${fmt(r.vales_despensa)}`:''}
                  ${r.bonos>0?`🎯 ${fmt(r.bonos)}`:''}
                  ${r.monto_horas_extra>0?`⏱ ${fmt(r.monto_horas_extra)}`:''}
                  ${r.prima_vacacional>0?`🏖 ${fmt(r.prima_vacacional)}`:''}
                  ${!r.vales_despensa&&!r.bonos&&!r.monto_horas_extra&&!r.prima_vacacional?'—':''}
                </td>
                <td style="color:${r.monto_faltas>0?'var(--red-warn)':'inherit'};">
                  ${r.dias_falta>0?`${r.dias_falta} día${r.dias_falta!==1?'s':''} (-${fmt(r.monto_faltas)})`:'—'}
                </td>
                <td>-${fmt(r.cuota_imss)}</td>
                <td>-${fmt(r.isr_retenido)}</td>
                <td style="font-size:.78rem;line-height:1.6;">
                  <span style="color:var(--text-muted);" title="Aportación patronal 5% SBC — costo del patrón, no se descuenta al trabajador">
                    🏛 ${fmt(infPatronal)}
                  </span>
                  ${infonavitDed > 0 ? `<br><span style="color:var(--red-warn);" title="Descuento crédito INFONAVIT activo">-${fmt(infonavitDed)}</span>` : ''}
                </td>
                <td style="font-weight:800;color:var(--green-ok);font-size:1rem;">${fmt(r.neto_pagar)}</td>
                <td>
                  <div class="actions">
                    <button class="btn-primary btn-sm" onclick="descargarReciboNomina('${r.id}')"
                      title="${r.estado === 'aprobado' ? 'Recibo aprobado — descargar PDF' : 'Previsualizar y aprobar'}">
                      ${r.estado === 'aprobado' ? '✅ PDF' : '📋 Ver'}
                    </button>
                    <button class="btn-secondary btn-sm" onclick="editarReciboInline('${r.id}')">✏️</button>
                    ${htmlBotonWhatsApp(r.trabajadores?.telefono, `Hola ${r.trabajadores?.nombre||''}, tu recibo de nómina del período ${periodo?.nombre||''} (${formatDateShort(periodo?.fecha_inicio)} – ${formatDateShort(periodo?.fecha_fin)}) ya está listo. Neto a pagar: ${fmt(r.neto_pagar)}. Descárgalo desde la plataforma.`, { ocultarSiFalta: true })}
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`
    }
    <div id="detalle-msg" style="display:none;margin-top:10px;"></div>
  `;
}

async function recalcularTodo() {
  const msg = document.getElementById('detalle-msg');
  if (msg) { msg.textContent = '⏳ Recalculando nómina…'; msg.style.display = ''; msg.className = ''; }
  try {
    const { data: periodo } = await _sbN().from('periodos_nomina').select('*').eq('id', _N.periodoActualId).single();
    // Regenerar solo los trabajadores que ya tienen recibo en este período
    // (no altera el conjunto: no agrega ni elimina trabajadores del período).
    const idsExistentes = (_N.recibos || []).map(r => r.trabajador_id);
    await generarNominaPeriodo(_N.periodoActualId, periodo.fecha_inicio, periodo.fecha_fin, periodo.sucursal_id,
      idsExistentes.length ? { soloTrabajadorIds: idsExistentes } : { tipoPeriodo: periodo.tipo });
    if (msg) { msg.textContent = '✅ Nómina recalculada correctamente.'; msg.className = 'alert alert-success'; }
    await _tabDetalle();
  } catch(e) {
    if (msg) { msg.textContent = '❌ ' + e.message; msg.className = 'alert alert-danger'; }
  }
}

async function editarReciboInline(reciboId) {
  const r = _N.recibos.find(x => x.id === reciboId);
  if (!r) return;
  const t     = r.trabajadores || {};
  const daily = calcSalarioDiario(t.salario_mensual || 0, t.periodo_salario || 'mensual');
  // Tarifa default: salario por hora (jornada de 8 hrs) × factor de la empresa (Art. 67-68 LFT)
  const tarifaHE = parseFloat(r.horas_extra || 0) > 0
    ? (parseFloat(r.monto_horas_extra || 0) / parseFloat(r.horas_extra)).toFixed(2)
    : ((daily / 8) * prestacionesEmpresa().factorHE).toFixed(2);

  // Función auxiliar para campo numérico
  const nv = (campo, def = 0) => parseFloat(r[campo] || def);

  showModal(`
    <div class="modal animate-in" style="max-width:600px;width:96vw;">
      <div class="modal-header" style="background:var(--navy-deep);border-radius:var(--radius-md) var(--radius-md) 0 0;padding:14px 18px;">
        <div>
          <div class="modal-title" style="color:#fff;font-size:.95rem;">✏️ Editar recibo</div>
          <div style="font-size:.75rem;color:rgba(255,255,255,.5);margin-top:1px;">
            ${t.nombre || ''} &nbsp;·&nbsp; Salario base: <strong style="color:var(--gold-primary);">${fmt(nv('salario_base'))}</strong>
          </div>
        </div>
        <button class="modal-close" onclick="closeModal()" style="color:#fff;">×</button>
      </div>

      <!-- Sub-tabs -->
      <div style="display:flex;border-bottom:1px solid var(--border);">
        <button id="retab-1" class="tab-btn active" style="flex:1;border-radius:0;border-bottom:none;"
          onclick="_reTab(1)">💰 Comisiones</button>
        <button id="retab-2" class="tab-btn" style="flex:1;border-radius:0;border-bottom:none;"
          onclick="_reTab(2)">📤 Deducciones</button>
        <button id="retab-3" class="tab-btn" style="flex:1;border-radius:0;border-bottom:none;"
          onclick="_reTab(3)">⏱ Extras</button>
      </div>

      <div style="padding:16px 18px;max-height:55vh;overflow-y:auto;">

        <!-- TAB 1 — Comisiones -->
        <div id="repanel-1">
          <p style="font-size:.75rem;color:var(--text-muted);margin-bottom:12px;">
            Captura los montos de venta/recuperación para calcular comisiones automáticamente. (Art. 285-289 LFT)
          </p>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Monto de ventas del período</label>
              <input id="re-mventas" type="number" class="form-input" value="${nv('monto_ventas')}"
                min="0" step="0.01" oninput="_recalcularPreviewRecibo()" />
            </div>
            <div class="form-group">
              <label class="form-label">% Comisión sobre ventas</label>
              <input id="re-pct-ventas" type="number" class="form-input" value="${nv('pct_comision_ventas') * 100}"
                min="0" max="100" step="0.01" placeholder="ej. 5 = 5%"
                oninput="_recalcularPreviewRecibo()" />
            </div>
            <div class="form-group">
              <label class="form-label">Monto recuperado (cartera)</label>
              <input id="re-mrecup" type="number" class="form-input" value="${nv('monto_recuperado')}"
                min="0" step="0.01" oninput="_recalcularPreviewRecibo()" />
            </div>
            <div class="form-group">
              <label class="form-label">% Comisión recuperación</label>
              <input id="re-pct-recup" type="number" class="form-input" value="${nv('pct_comision_recuper') * 100}"
                min="0" max="100" step="0.01" placeholder="ej. 3 = 3%"
                oninput="_recalcularPreviewRecibo()" />
            </div>
            <div class="form-group">
              <label class="form-label">Bono por meta (monto fijo)</label>
              <input id="re-bono-meta" type="number" class="form-input" value="${nv('bono_meta')}"
                min="0" step="0.01" oninput="_recalcularPreviewRecibo()" />
            </div>
            <div class="form-group">
              <label class="form-label">Concepto del bono</label>
              <input id="re-concepto-bono" type="text" class="form-input"
                value="${r.concepto_bono_meta || ''}" placeholder="ej. Meta mensual alcanzada" />
            </div>
            <div class="form-group">
              <label class="form-label">Prima vacacional proporcional</label>
              <input id="re-prima-vac" type="number" class="form-input" value="${nv('prima_vacacional')}"
                min="0" step="0.01" oninput="_recalcularPreviewRecibo()" />
            </div>
            <div class="form-group">
              <label class="form-label">Aguinaldo proporcional</label>
              <input id="re-aguinaldo" type="number" class="form-input" value="${nv('aguinaldo_prop')}"
                min="0" step="0.01" oninput="_recalcularPreviewRecibo()" />
            </div>
          </div>
        </div>

        <!-- TAB 2 — Deducciones -->
        <div id="repanel-2" style="display:none;">
          <p style="font-size:.75rem;color:var(--text-muted);margin-bottom:12px;">
            Deducciones autorizadas por ley. El ISR e IMSS se recalculan automáticamente.
          </p>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Fondo de ahorro obrero <span style="font-size:.68rem;color:var(--text-muted);">(Art. 110 fr. IV LFT)</span></label>
              <input id="re-fondo-ahorro" type="number" class="form-input" value="${nv('fondo_ahorro_obrero')}"
                min="0" step="0.01" oninput="_recalcularPreviewRecibo()" />
            </div>
            <div class="form-group">
              <label class="form-label" style="color:var(--text-muted);font-size:.78rem;">Aportación patronal (igual, informativo)</label>
              <input id="re-fondo-patron" type="number" class="form-input" style="opacity:.6;"
                value="${nv('fondo_ahorro_patronal')}" min="0" step="0.01" readonly />
            </div>
            <div class="form-group">
              <label class="form-label">Préstamo empresa <span style="font-size:.68rem;color:var(--text-muted);">(Art. 110 fr. I LFT)</span></label>
              <input id="re-prestamo" type="number" class="form-input" value="${nv('prestamo_empresa')}"
                min="0" step="0.01" oninput="_recalcularPreviewRecibo()" />
            </div>
            <div class="form-group">
              <label class="form-label">INFONAVIT <span style="font-size:.68rem;color:var(--text-muted);">(Art. 97 Ley INFONAVIT)</span></label>
              <input id="re-infonavit" type="number" class="form-input" value="${nv('infonavit_descuento')}"
                min="0" step="0.01" oninput="_recalcularPreviewRecibo()" />
            </div>
            <div class="form-group">
              <label class="form-label">Pensión alimenticia <span style="font-size:.68rem;color:var(--text-muted);">(Art. 110 fr. V LFT)</span></label>
              <input id="re-pension" type="number" class="form-input" value="${nv('pension_alimenticia')}"
                min="0" step="0.01" oninput="_recalcularPreviewRecibo()" />
            </div>
            <div class="form-group">
              <label class="form-label">Otras deducciones</label>
              <input id="re-otras-ded" type="number" class="form-input" value="${nv('otras_deducciones')}"
                min="0" step="0.01" oninput="_recalcularPreviewRecibo()" />
            </div>
          </div>
        </div>

        <!-- TAB 3 — Extras -->
        <div id="repanel-3" style="display:none;">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Horas extra <span style="font-size:.68rem;color:var(--text-muted);">(Art. 67-68 LFT)</span></label>
              <input id="re-hextra" type="number" class="form-input" value="${nv('horas_extra')}"
                min="0" step="0.5" oninput="_recalcularPreviewRecibo()" />
            </div>
            <div class="form-group">
              <label class="form-label">Tarifa por hora extra</label>
              <input id="re-tarifa" type="number" class="form-input" value="${tarifaHE}"
                step="0.01" oninput="_recalcularPreviewRecibo()" />
            </div>
            <div class="form-group">
              <label class="form-label">Prima dominical <span style="font-size:.68rem;color:var(--text-muted);">(Art. 71 LFT)</span></label>
              <input id="re-prima-dom" type="number" class="form-input" value="${nv('prima_dominical')}"
                min="0" step="0.01" oninput="_recalcularPreviewRecibo()" />
            </div>
            <div class="form-group">
              <label class="form-label">Prima día festivo trabajado <span style="font-size:.68rem;color:var(--text-muted);">(Art. 75 LFT)</span></label>
              <input id="re-prima-fest" type="number" class="form-input" value="${nv('prima_festivo')}"
                min="0" step="0.01" oninput="_recalcularPreviewRecibo()" />
            </div>
            <div class="form-group">
              <label class="form-label">Vales de despensa <span style="font-size:.68rem;color:var(--text-muted);">(Art. 27 LISR)</span></label>
              <input id="re-vales" type="number" class="form-input" value="${nv('vales_despensa')}"
                min="0" step="0.01" oninput="_recalcularPreviewRecibo()" />
            </div>
            <div class="form-group">
              <label class="form-label">Bonos adicionales</label>
              <input id="re-bonos" type="number" class="form-input" value="${nv('bonos')}"
                min="0" step="0.01" oninput="_recalcularPreviewRecibo()" />
            </div>
            <div class="form-group span-2">
              <label class="form-label">Notas del recibo</label>
              <input id="re-notas" type="text" class="form-input" value="${r.notas || ''}" />
            </div>
          </div>
        </div>

      </div><!-- /scroll area -->

      <!-- Footer live preview -->
      <div style="background:var(--bg-surface);border-top:1px solid var(--border);
                  padding:10px 18px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
        <div style="flex:1;display:flex;gap:16px;flex-wrap:wrap;font-size:.8rem;">
          <span>📥 <strong style="color:var(--green-ok);" id="re-preview-perc">${fmt(nv('total_percepciones'))}</strong> percepciones</span>
          <span>📤 <strong style="color:var(--red-warn);" id="re-preview-ded">${fmt(nv('total_deducciones'))}</strong> deducciones</span>
          <span style="font-size:.95rem;">💵 <strong style="color:var(--gold-primary);font-size:1rem;" id="re-preview-neto">${fmt(nv('neto_pagar'))}</strong> neto</span>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn-secondary btn-sm" onclick="closeModal()">Cancelar</button>
          <button class="btn-primary" onclick="guardarEdicionRecibo('${reciboId}')">💾 Guardar</button>
        </div>
      </div>
    </div>
  `);

  // Guardar datos del recibo en contexto para el recalculo.
  // El factor ISR debe usar el periodo de pago del TRABAJADOR (coherente con
  // cómo se almacena su salario y con la generación automática), no el tipo del
  // período de nómina. Fallback: tipo del período y, en último caso, 'mensual'.
  const _trabRec   = (_N.trabajadores || []).find(x => x.id === r.trabajador_id);
  const _perTipoRec = _trabRec?.periodo_salario
    || (_N.periodos.find(p => p.id === _N.periodoActualId) || {}).tipo
    || 'mensual';
  window._reData = { r, periodoTipo: _perTipoRec };
}

function _reTab(n) {
  [1,2,3].forEach(i => {
    const btn   = document.getElementById(`retab-${i}`);
    const panel = document.getElementById(`repanel-${i}`);
    if (btn)   btn.classList.toggle('active', i === n);
    if (panel) panel.style.display = i === n ? '' : 'none';
  });
}

// Cuota obrera del IMSS para un recibo, por ramos sobre el SBC diario del
// trabajador (fallback: salario diario, y en último caso el % plano previo).
function _imssObreroRecibo(r, salBase) {
  const t   = (_N.trabajadores || []).find(x => x.id === r.trabajador_id) || {};
  const uma = typeof _umaVigente === 'function' ? _umaVigente() : (typeof UMA_DIARIA !== 'undefined' ? UMA_DIARIA : 113.14);
  const sbcD = parseFloat(t.sbc) > 0
    ? parseFloat(t.sbc)
    : calcSalarioDiario(parseFloat(t.salario_mensual || 0), t.periodo_salario || 'mensual');
  const dias = parseInt(r.dias_laborados) || 0;
  return typeof calcIMSSObrero === 'function'
    ? calcIMSSObrero(sbcD, dias, uma)
    : parseFloat((parseFloat(salBase || 0) * IMSS_OBRERO_PCT).toFixed(2));
}

function _recalcularPreviewRecibo() {
  if (!window._reData) return;
  const { r, periodoTipo } = window._reData;
  const g = id => parseFloat(document.getElementById(id)?.value) || 0;

  // Percepciones
  const salBase    = parseFloat(r.salario_base || 0);
  const comVentas  = parseFloat(((g('re-mventas') * g('re-pct-ventas')) / 100).toFixed(2));
  const comRecup   = parseFloat(((g('re-mrecup')  * g('re-pct-recup'))  / 100).toFixed(2));
  const bonoMeta   = g('re-bono-meta');
  const primaVac   = g('re-prima-vac');
  const aguinaldo  = g('re-aguinaldo');
  const hextra     = g('re-hextra');
  const tarifa     = g('re-tarifa');
  const montoHE    = parseFloat((hextra * tarifa).toFixed(2));
  const primaDom   = g('re-prima-dom');
  const primaFest  = g('re-prima-fest');
  const vales      = g('re-vales');
  const bonos      = g('re-bonos');

  // Auto-sync fondo patronal = fondo obrero
  const fondoObr = g('re-fondo-ahorro');
  const fpInput  = document.getElementById('re-fondo-patron');
  if (fpInput) fpInput.value = fondoObr.toFixed(2);

  const otrosIngresos = parseFloat(r.otros_ingresos || 0); // p. ej. pago patronal de incapacidad
  const totalPerc = parseFloat((salBase + comVentas + comRecup + bonoMeta + primaVac + aguinaldo + montoHE + primaDom + primaFest + vales + bonos + otrosIngresos).toFixed(2));

  // ISR e IMSS recalculados sobre total percepciones
  const { isrNeto } = calcISR(totalPerc, periodoTipo);
  const imss        = _imssObreroRecibo(r, salBase);

  // Deducciones
  const montoFaltas = parseFloat(r.monto_faltas || 0);
  const montoPSin   = parseFloat(r.monto_permiso_sin || 0);
  const fondoAhorro = g('re-fondo-ahorro');
  const prestamo    = g('re-prestamo');
  const infonavit   = g('re-infonavit');
  const pension     = g('re-pension');
  const otrasDed    = g('re-otras-ded');

  const totalDed  = parseFloat((montoFaltas + montoPSin + imss + isrNeto + fondoAhorro + prestamo + infonavit + pension + otrasDed).toFixed(2));
  const neto      = parseFloat((totalPerc - totalDed).toFixed(2));

  const el = (id) => document.getElementById(id);
  if (el('re-preview-perc')) el('re-preview-perc').textContent = fmt(totalPerc);
  if (el('re-preview-ded'))  el('re-preview-ded').textContent  = fmt(totalDed);
  if (el('re-preview-neto')) el('re-preview-neto').textContent = fmt(neto);
}

async function guardarEdicionRecibo(reciboId) {
  const r = _N.recibos.find(x => x.id === reciboId);
  if (!r) return;
  const g = id => parseFloat(document.getElementById(id)?.value) || 0;
  const gs = id => document.getElementById(id)?.value.trim() || null;

  // Percepciones
  const salBase    = parseFloat(r.salario_base || 0);
  const montoVentas= g('re-mventas');
  const pctVentas  = g('re-pct-ventas') / 100;
  const comVentas  = parseFloat((montoVentas * pctVentas).toFixed(2));
  const montoRecup = g('re-mrecup');
  const pctRecup   = g('re-pct-recup') / 100;
  const comRecup   = parseFloat((montoRecup * pctRecup).toFixed(2));
  const bonoMeta   = g('re-bono-meta');
  const concBono   = gs('re-concepto-bono');
  const primaVac   = g('re-prima-vac');
  const aguinaldo  = g('re-aguinaldo');
  const hextra     = g('re-hextra');
  const tarifa     = g('re-tarifa');
  const montoHE    = parseFloat((hextra * tarifa).toFixed(2));
  const primaDom   = g('re-prima-dom');
  const primaFest  = g('re-prima-fest');
  const vales      = g('re-vales');
  const bonos      = g('re-bonos');

  const otrosIngresos = parseFloat(r.otros_ingresos || 0); // p. ej. pago patronal de incapacidad
  const totalPerc = parseFloat((
    salBase + comVentas + comRecup + bonoMeta + primaVac + aguinaldo + montoHE + primaDom + primaFest + vales + bonos + otrosIngresos
  ).toFixed(2));

  // ISR e IMSS recalculados — el factor ISR usa el periodo de pago del trabajador
  // (mismo criterio que la generación automática), no el tipo del período.
  const _trabEdit   = (_N.trabajadores || []).find(x => x.id === r.trabajador_id);
  const periodoTipo = _trabEdit?.periodo_salario
    || (_N.periodos.find(p => p.id === _N.periodoActualId) || {}).tipo
    || 'mensual';
  const { isrNeto } = calcISR(totalPerc, periodoTipo);
  const imss        = _imssObreroRecibo(r, salBase);

  // Deducciones
  const montoFaltas = parseFloat(r.monto_faltas || 0);
  const montoPSin   = parseFloat(r.monto_permiso_sin || 0);
  const fondoAhorro = g('re-fondo-ahorro');
  const fondoPatron = g('re-fondo-patron');
  const prestamo    = g('re-prestamo');
  const infonavit   = g('re-infonavit');
  const pension     = g('re-pension');
  const otrasDed    = g('re-otras-ded');
  const notas       = gs('re-notas');

  const totalDed = parseFloat((
    montoFaltas + montoPSin + imss + isrNeto +
    fondoAhorro + prestamo + infonavit + pension + otrasDed
  ).toFixed(2));
  const neto = parseFloat((totalPerc - totalDed).toFixed(2));

  const btn = document.querySelector('#modal-container .btn-primary');
  if (btn) { btn.textContent = '⏳ Guardando…'; btn.disabled = true; }

  try {
    await _sbN().from('recibos_nomina').update({
      // Comisiones
      monto_ventas:          montoVentas,
      pct_comision_ventas:   pctVentas,
      comisiones_ventas:     comVentas,
      monto_recuperado:      montoRecup,
      pct_comision_recuper:  pctRecup,
      comisiones_recuperacion: comRecup,
      bono_meta:             bonoMeta,
      concepto_bono_meta:    concBono,
      prima_vacacional:      primaVac,
      aguinaldo_prop:        aguinaldo,
      // Extras
      horas_extra:           hextra,
      monto_horas_extra:     montoHE,
      prima_dominical:       primaDom,
      prima_festivo:         primaFest,
      vales_despensa:        vales,
      bonos,
      // Deducciones
      fondo_ahorro_obrero:   fondoAhorro,
      fondo_ahorro_patronal: fondoPatron,
      prestamo_empresa:      prestamo,
      infonavit_descuento:   infonavit,
      pension_alimenticia:   pension,
      otras_deducciones:     otrasDed,
      notas,
      // Totales recalculados
      cuota_imss:            imss,
      isr_retenido:          isrNeto,
      total_percepciones:    totalPerc,
      total_deducciones:     totalDed,
      neto_pagar:            neto,
    }).eq('id', reciboId);

    closeModal();
    await _tabDetalle();
  } catch(e) {
    alert('Error al guardar: ' + e.message);
    if (btn) { btn.textContent = '💾 Guardar'; btn.disabled = false; }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  TAB 3 — HISTORIAL POR TRABAJADOR
// ═══════════════════════════════════════════════════════════════════════════
async function _tabHistorial() {
  const el = document.getElementById('nomina-content');
  el.innerHTML = `
    <div class="form-grid" style="margin-bottom:16px;">
      <div class="form-group span-2">
        <label class="form-label">Selecciona un trabajador</label>
        <select class="form-select" id="hist-nom-trab" onchange="cargarHistorialTrabajador(this.value)">
          <option value="">— Seleccionar —</option>
          ${_N.trabajadores.map(t=>`<option value="${t.id}" ${t.id===_N.histTrabId?'selected':''}>${t.nombre} — ${t.puesto||''}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="hist-nom-resultados"></div>
  `;
  if (_N.histTrabId) await cargarHistorialTrabajador(_N.histTrabId);
}

async function cargarHistorialTrabajador(trabId) {
  _N.histTrabId = trabId;
  const el = document.getElementById('hist-nom-resultados');
  if (!el || !trabId) return;
  el.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;

  const { data: recibos } = await _sbN()
    .from('recibos_nomina')
    .select('*, periodos_nomina(nombre,fecha_inicio,fecha_fin,tipo)')
    .eq('trabajador_id', trabId)
    .eq('empresa_id', CTX.empresa.id)
    .order('created_at', { ascending:false });

  if (!recibos?.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-title">Sin recibos de nómina para este trabajador</div></div>`;
    return;
  }

  const anoActual = new Date().getFullYear();
  const acumAnio  = recibos
    .filter(r => new Date(r.created_at).getFullYear() === anoActual)
    .reduce((a,r) => ({
      perc: a.perc + parseFloat(r.total_percepciones||0),
      isr:  a.isr  + parseFloat(r.isr_retenido||0),
      imss: a.imss + parseFloat(r.cuota_imss||0),
      neto: a.neto + parseFloat(r.neto_pagar||0),
    }), { perc:0, isr:0, imss:0, neto:0 });

  el.innerHTML = `
    <!-- Acumulados año -->
    <div class="card animate-in" style="margin-bottom:14px;border-color:var(--gold-border);">
      <div class="card-header"><span class="card-title">📊 Acumulado ${anoActual}</span></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:10px;text-align:center;">
        ${[
          ['Total percibido',   fmt(acumAnio.perc), 'var(--green-ok)'],
          ['ISR retenido',      fmt(acumAnio.isr),  'var(--red-warn)'],
          ['IMSS obrero',       fmt(acumAnio.imss), 'var(--blue-accent)'],
          ['Neto recibido',     fmt(acumAnio.neto), 'var(--gold-primary)'],
        ].map(([lbl,val,col])=>`
          <div style="padding:10px;background:var(--bg-surface);border-radius:var(--radius-sm);">
            <div style="font-family:'Montserrat',sans-serif;font-size:1.1rem;font-weight:900;color:${col};">${val}</div>
            <div style="font-size:.7rem;color:var(--text-muted);">${lbl}</div>
          </div>`).join('')}
      </div>
    </div>

    <!-- Tabla de recibos -->
    <div class="card animate-in">
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Período</th><th>Días</th><th>Percepciones</th><th>Deducciones</th><th>NETO</th><th></th></tr></thead>
          <tbody>
            ${recibos.map(r=>`<tr>
              <td>
                <strong>${r.periodos_nomina?.nombre||'—'}</strong>
                <br><span style="font-size:.75rem;color:var(--text-muted);">
                  ${formatDateShort(r.periodos_nomina?.fecha_inicio)} — ${formatDateShort(r.periodos_nomina?.fecha_fin)}
                </span>
              </td>
              <td style="text-align:center;">${r.dias_laborados}</td>
              <td>${fmt(r.total_percepciones)}</td>
              <td style="color:var(--red-warn);">-${fmt(r.total_deducciones)}</td>
              <td style="font-weight:800;color:var(--green-ok);">${fmt(r.neto_pagar)}</td>
              <td><button class="btn-primary btn-sm" onclick="descargarReciboNomina('${r.id}')"
                title="${r.estado === 'aprobado' ? 'Recibo aprobado' : 'Previsualizar'}">
                ${r.estado === 'aprobado' ? '✅ PDF' : '📋 Ver'}
              </button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
//  MOTOR DE CÁLCULO
// ═══════════════════════════════════════════════════════════════════════════
async function generarNominaPeriodo(periodoId, fechaIni, fechaFin, sucursalId, opts = {}) {
  // Filtrar trabajadores por sucursal si aplica
  let trabs = _N.trabajadores;
  if (sucursalId) trabs = trabs.filter(t => t.sucursal_id === sucursalId);

  // Filtrado por frecuencia de pago:
  //  · opts.soloTrabajadorIds → regeneración: solo los que ya tienen recibo
  //    en el período (no agrega ni quita trabajadores).
  //  · opts.tipoPeriodo (sin incluirTodos) → generación inicial: solo los
  //    trabajadores cuya frecuencia de pago coincide con el tipo del período
  //    (un período quincenal no debe generar recibos de 15 días a un semanal
  //    o mensual — eso mezclaba frecuencias y retenciones de ISR).
  if (opts.soloTrabajadorIds) {
    const set = new Set(opts.soloTrabajadorIds);
    trabs = trabs.filter(t => set.has(t.id));
  } else if (opts.tipoPeriodo && !opts.incluirTodos) {
    trabs = trabs.filter(t => (t.periodo_salario || 'mensual') === opts.tipoPeriodo);
  }

  // Prestaciones particulares de la empresa (fallback a mínimos de ley)
  const prest = prestacionesEmpresa();

  // Cargar TODA la asistencia del período en una sola query
  let { data: todasAsist, error: errAsist } = await _sbN()
    .from('asistencia')
    .select('trabajador_id, tipo, fecha, horas_extra, trabajo_festivo')
    .eq('empresa_id', CTX.empresa.id)
    .gte('fecha', fechaIni)
    .lte('fecha', fechaFin);

  // Tolerancia: si la migración 15 no está aplicada, reintentar sin trabajo_festivo
  if (errAsist && /trabajo_festivo/i.test(errAsist.message || '')) {
    console.warn('Columna asistencia.trabajo_festivo no existe — aplica la migración 15_migration_festivos.sql');
    ({ data: todasAsist, error: errAsist } = await _sbN()
      .from('asistencia')
      .select('trabajador_id, tipo, fecha, horas_extra')
      .eq('empresa_id', CTX.empresa.id)
      .gte('fecha', fechaIni)
      .lte('fecha', fechaFin));
  }

  // Tolerancia: si la migración 14 no está aplicada, reintentar sin horas_extra
  if (errAsist && /horas_extra/i.test(errAsist.message || '')) {
    console.warn('Columna asistencia.horas_extra no existe — aplica la migración 14_migration_prestaciones.sql');
    ({ data: todasAsist } = await _sbN()
      .from('asistencia')
      .select('trabajador_id, tipo, fecha')
      .eq('empresa_id', CTX.empresa.id)
      .gte('fecha', fechaIni)
      .lte('fecha', fechaFin));
  }

  // Descuentos/préstamos activos (migración 17). Si la tabla no existe
  // todavía, se usa el mecanismo plano anterior (infonavit_activo/
  // pension_activa en trabajadores) como respaldo — ver más abajo.
  const { data: todosDescuentos, error: errDesc } = await _sbN()
    .from('descuentos_trabajador')
    .select('*')
    .eq('empresa_id', CTX.empresa.id)
    .eq('activo', true);
  const descuentosDisponibles = !errDesc;
  if (errDesc) console.warn('descuentos_trabajador no disponible — aplica la migración 17_migration_prestamos_descuentos.sql:', errDesc.message);

  const descMap = {};
  (todosDescuentos || []).forEach(d => {
    if (!descMap[d.trabajador_id]) descMap[d.trabajador_id] = [];
    descMap[d.trabajador_id].push(d);
  });

  const smgDiarioVigente = typeof _smgVigente === 'function' ? _smgVigente('general') : SMG_GENERAL;
  const aplicacionesDescuento = []; // se insertan en descuentos_aplicados tras el upsert de recibos

  // Prestaciones adicionales de previsión social (migración 18): premios de
  // puntualidad/asistencia, ayuda de transporte, otras. Vales de despensa y
  // fondo de ahorro NO viven aquí — conservan su almacenamiento actual.
  const { data: todasPrestaciones, error: errPrest } = await _sbN()
    .from('prestaciones_trabajador')
    .select('*')
    .eq('empresa_id', CTX.empresa.id)
    .eq('activo', true);
  if (errPrest) console.warn('prestaciones_trabajador no disponible — aplica la migración 18_migration_prestaciones_fiscal.sql:', errPrest.message);
  const prestMap = {};
  (todasPrestaciones || []).forEach(p => {
    if (!prestMap[p.trabajador_id]) prestMap[p.trabajador_id] = [];
    prestMap[p.trabajador_id].push(p);
  });

  // Incapacidades IMSS que se traslapan con el período (migración 08). El
  // patrón cubre los primeros 3 días de enfermedad general / riesgo de trabajo
  // (Art. 42 LFT); maternidad, paternidad y el resto los cubre el IMSS al 100%.
  const { data: todasIncap, error: errInc } = await _sbN()
    .from('incapacidades')
    .select('trabajador_id, tipo, fecha_inicio, fecha_fin')
    .eq('empresa_id', CTX.empresa.id)
    .lte('fecha_inicio', fechaFin)
    .gte('fecha_fin', fechaIni);
  if (errInc) console.warn('incapacidades no disponible:', errInc.message);
  const incapMap = {};
  (todasIncap || []).forEach(i => {
    if (!incapMap[i.trabajador_id]) incapMap[i.trabajador_id] = [];
    incapMap[i.trabajador_id].push(i);
  });

  // Vacaciones aprobadas que se traslapan con el período: dan derecho a la
  // prima vacacional (mínimo 25% del salario de los días gozados — Art. 80
  // LFT). Los permisos con/sin goce (tipo permiso_goce/permiso_sin) no
  // llevan prima, por eso se filtra tipo='vacacion'.
  const { data: todasVac, error: errVacPrima } = await _sbN()
    .from('vacaciones')
    .select('trabajador_id, fecha_inicio, fecha_fin')
    .eq('empresa_id', CTX.empresa.id)
    .eq('estado', 'aprobada')
    .eq('tipo', 'vacacion')
    .lte('fecha_inicio', fechaFin)
    .gte('fecha_fin', fechaIni);
  if (errVacPrima) console.warn('vacaciones no disponible para prima vacacional:', errVacPrima.message);
  const vacMap = {};
  (todasVac || []).forEach(v => {
    if (!vacMap[v.trabajador_id]) vacMap[v.trabajador_id] = [];
    vacMap[v.trabajador_id].push(v);
  });

  // Indexar por trabajador
  const asistMap = {};
  (todasAsist || []).forEach(a => {
    if (!asistMap[a.trabajador_id]) asistMap[a.trabajador_id] = [];
    asistMap[a.trabajador_id].push(a);
  });

  // Días totales del período
  const dIni        = new Date(fechaIni + 'T00:00:00');
  const dFin        = new Date(fechaFin + 'T00:00:00');
  const diasPeriodo = Math.ceil((dFin - dIni) / 86400000) + 1;

  // UMA diaria vigente (config_valores, migración 15; con respaldo local)
  const UMA_DIARIA_2026    = typeof _umaVigente === 'function' ? _umaVigente() : 113.14;
  const SBC_TOPE_INFONAVIT = 25 * UMA_DIARIA_2026; // tope Art. 29 Ley INFONAVIT

  const recibos = [];
  for (const t of trabs) {
    const asist = asistMap[t.id] || [];

    const faltas     = asist.filter(a => a.tipo === 'falta').length;
    const permisoSin = asist.filter(a => a.tipo === 'permiso_sin').length;
    const incapDias  = asist.filter(a => a.tipo === 'incapacidad').length;

    // Días que cubre el salario base = TODOS los días naturales del período,
    // menos los de incapacidad (los cubre el IMSS vía subsidio; el patrón solo
    // paga los primeros 3 días de enfermedad general/riesgo → incapacidadMonto).
    //
    // Se parte del total de días del período y NO de los días con registro de
    // asistencia, porque el 7º día de descanso se paga íntegro (Arts. 69-72
    // LFT), igual que festivos, vacaciones y permisos con goce. Antes se
    // contaban solo los días registrados: si el patrón capturaba nada más los
    // días trabajados (lun-vie), el descanso semanal quedaba SIN PAGAR.
    //
    // Faltas y permisos sin goce NO se restan aquí: se descuentan de forma
    // explícita como deducción (monto_faltas / monto_permiso_sin) para que el
    // recibo las muestre. Restarlas también aquí las cobraría DOS VECES.
    const diasPagados = Math.max(0, diasPeriodo - incapDias);

    // Salario diario según período de pago
    const daily = calcSalarioDiario(t.salario_mensual, t.periodo_salario || 'mensual');

    // Horas extra capturadas en asistencia: tarifa = salario/hora (jornada 8 h) × factor empresa
    const horasExtra = parseFloat(asist.reduce((s, a) => s + (parseFloat(a.horas_extra) || 0), 0).toFixed(2));
    const tarifaHE   = parseFloat(((daily / 8) * prest.factorHE).toFixed(2));
    const montoHE    = parseFloat((horasExtra * tarifaHE).toFixed(2));

    // Prima dominical: domingos efectivamente trabajados (Art. 71 LFT)
    const domingosTrab = asist.filter(a =>
      ['asistencia','retardo','retardo_grave'].includes(a.tipo) &&
      new Date(a.fecha + 'T00:00:00').getDay() === 0).length;
    const primaDom = calcularPrimaDominical(daily, domingosTrab, prest.primaDomPct);

    // Prima por día festivo oficial trabajado (Art. 75 LFT) — distinta de la
    // prima dominical: se paga cuando el trabajador labora en un descanso
    // obligatorio del Art. 74 LFT (el flag lo pone registrar_checada()/la
    // migración 15). El salario ordinario de ese día ya está en salBase.
    const festivosTrab = asist.filter(a => a.trabajo_festivo).length;
    const primaFestivo = calcularPagoFestivo(daily, festivosTrab);

    // Percepciones base
    const salBase   = parseFloat((daily * diasPagados).toFixed(2));
    // Vales: el monto individual del trabajador prevalece; si no tiene y la
    // empresa los otorga, aplicar la configuración de empresa
    let vales = parseFloat(t.vales_despensa || 0);
    if (!vales && prest.vales.activo) {
      vales = prest.vales.tipo === 'pct'
        ? parseFloat((salBase * prest.vales.valor).toFixed(2))
        : parseFloat(prest.vales.valor.toFixed(2));
    }
    const bono      = parseFloat(t.bono_fijo      || 0);

    // Prestaciones adicionales de previsión social (migración 18): premios
    // de puntualidad/asistencia, ayuda de transporte, otras — SÍ forman
    // parte de la percepción total (a diferencia del fondo de ahorro, que
    // es una deducción/retención, no un ingreso adicional).
    const prestacionesTrab = prestMap[t.id] || [];
    const otrasPrestacionesMonto = parseFloat(prestacionesTrab.reduce((s, p) => s + (
      p.modalidad === 'porcentaje_salario' ? salBase * (parseFloat(p.valor) || 0) / 100 : parseFloat(p.valor || 0)
    ), 0).toFixed(2));

    // Incapacidad a cargo del patrón: primeros 3 días de enfermedad general /
    // recaída / riesgo de trabajo que caen dentro del período (Art. 42 LFT).
    // Maternidad/paternidad las cubre el IMSS al 100% (patrón no paga aquí).
    let incapacidadDias   = 0;
    let incapacidadMonto  = 0;
    for (const inc of (incapMap[t.id] || [])) {
      if (!['enfermedad_general','recaida','riesgo_trabajo'].includes(inc.tipo)) continue;
      const incIni    = new Date(inc.fecha_inicio + 'T00:00:00');
      const tercerDia = new Date(incIni); tercerDia.setDate(incIni.getDate() + 2); // días 1-3
      const incFin    = new Date(inc.fecha_fin + 'T00:00:00');
      // Intersección de [período] ∩ [incapacidad] ∩ [primeros 3 días]
      const start = new Date(Math.max(dIni, incIni));
      const end   = new Date(Math.min(dFin, incFin, tercerDia));
      if (end >= start) incapacidadDias += Math.round((end - start) / 86400000) + 1;
    }
    if (incapacidadDias > 0) incapacidadMonto = parseFloat((daily * incapacidadDias).toFixed(2));

    // Prima vacacional de los días de vacaciones que se gozan en este
    // período (Art. 80 LFT: mínimo 25% del salario de esos días). Se
    // cuentan solo los días hábiles (lunes a viernes) de la intersección
    // entre cada solicitud aprobada y el período, igual criterio que usa
    // vacaciones.js al capturar la solicitud — así, si una solicitud cruza
    // dos períodos de pago, cada uno paga solo sus días sin duplicar ni
    // dejar días sin prima.
    let diasVacPeriodo = 0;
    for (const v of (vacMap[t.id] || [])) {
      const vIni  = new Date(v.fecha_inicio + 'T00:00:00');
      const vFin  = new Date(v.fecha_fin + 'T00:00:00');
      const start = new Date(Math.max(dIni, vIni));
      const end   = new Date(Math.min(dFin, vFin));
      const cur   = new Date(start);
      while (cur <= end) { const dw = cur.getDay(); if (dw >= 1 && dw <= 5) diasVacPeriodo++; cur.setDate(cur.getDate() + 1); }
    }
    const primaVacGoce = parseFloat((diasVacPeriodo * daily * prest.primaVacPct).toFixed(2));

    const totalPerc = parseFloat((salBase + vales + bono + montoHE + primaDom + primaFestivo + otrasPrestacionesMonto + incapacidadMonto + primaVacGoce).toFixed(2));

    // Deducciones base
    const montoFaltas = parseFloat((daily * faltas).toFixed(2));
    const montoPSin   = parseFloat((daily * permisoSin).toFixed(2));
    // IMSS obrero por ramos sobre el SBC diario (fallback: salario diario si el
    // trabajador aún no tiene SBC calculado). Días cotizados = días pagados.
    const sbcDiarioIMSS = parseFloat(t.sbc) > 0 ? parseFloat(t.sbc) : daily;
    const imss        = typeof calcIMSSObrero === 'function'
      ? calcIMSSObrero(sbcDiarioIMSS, diasPagados, UMA_DIARIA_2026)
      : parseFloat((salBase * IMSS_OBRERO_PCT).toFixed(2));
    const { isrNeto, subsidio: subsidioEmpleo } = calcISR(totalPerc, t.periodo_salario || 'mensual');

    // Costo patronal del período (migración 32) — informativo, no afecta el
    // neto del trabajador: cuotas patronales IMSS (con la prima de riesgo de
    // la empresa) e ISN estatal sobre las percepciones.
    const imssPatronal = typeof calcIMSSPatronal === 'function'
      ? calcIMSSPatronal(sbcDiarioIMSS, diasPagados, UMA_DIARIA_2026,
                         CTX.empresa.prima_riesgo_pct, t.smg_zone || 'general').total
      : 0;
    const isnPeriodo   = parseFloat((totalPerc * (parseFloat(CTX.empresa.isn_pct) || 0)).toFixed(2));

    // ── Deducciones especiales según config del trabajador ──────────────────

    // Fondo de ahorro obrero (Art. 110 fr. IV LFT)
    let fondoAhorroObrero   = 0;
    let fondoAhorroPatronal = 0;
    if (t.fondo_ahorro_activo) {
      const pct = parseFloat(t.fondo_ahorro_pct || 0.13);
      fondoAhorroObrero   = parseFloat((salBase * pct).toFixed(2));
      fondoAhorroPatronal = fondoAhorroObrero; // patrón aporta igual (informativo)
    }

    // Aportación patronal INFONAVIT 5% SBC — obligatoria para TODOS (Art. 29 fracc. II Ley INFONAVIT)
    // No se descuenta al trabajador; es costo del patrón. Se registra informativo en el recibo.
    const sdiInfonavit      = Math.min(daily, SBC_TOPE_INFONAVIT);
    const infonavitPatronal = parseFloat((sdiInfonavit * 0.05 * diasPeriodo).toFixed(2));

    // Desglose fiscal de previsión social (migración 18): qué integra al SBC
    // (informativo, lo usa la Fase 5/SBC) y qué está exento/gravado para ISR.
    let prestacionesExento  = 0;
    let prestacionesGravado = 0;
    const prestacionesDetalle = [];
    if (typeof desglosarPrestacion === 'function') {
      if (vales > 0) {
        const dv = desglosarPrestacion({ tipo:'vales_despensa', montoPeriodo:vales, diasPeriodo }, daily, UMA_DIARIA_2026);
        prestacionesExento += dv.exentoISR; prestacionesGravado += dv.gravadoISR;
        prestacionesDetalle.push({ tipo:'vales_despensa', ...dv });
      }
      if (fondoAhorroObrero > 0) {
        const df = desglosarPrestacion({ tipo:'fondo_ahorro', montoPeriodo:fondoAhorroPatronal, aportacionTrabajador:fondoAhorroObrero, salarioBasePeriodo:salBase, diasPeriodo }, daily, UMA_DIARIA_2026);
        prestacionesExento += df.exentoISR; prestacionesGravado += df.gravadoISR;
        prestacionesDetalle.push({ tipo:'fondo_ahorro', ...df });
      }
      for (const p of prestacionesTrab) {
        const montoP = p.modalidad === 'porcentaje_salario'
          ? parseFloat((salBase * (parseFloat(p.valor)||0) / 100).toFixed(2))
          : parseFloat(p.valor || 0);
        const dp = desglosarPrestacion({ tipo:p.tipo, montoPeriodo:montoP, diasPeriodo }, daily, UMA_DIARIA_2026);
        prestacionesExento += dp.exentoISR; prestacionesGravado += dp.gravadoISR;
        prestacionesDetalle.push({ tipo:p.tipo, descripcion:p.tipo, montoAplicado: montoP, integraSBC: dp.integraSBC, exentoISR: dp.exentoISR, gravadoISR: dp.gravadoISR });
      }
    }
    prestacionesExento  = parseFloat(prestacionesExento.toFixed(2));
    prestacionesGravado = parseFloat(prestacionesGravado.toFixed(2));

    // Descuentos/préstamos (INFONAVIT, FONACOT, pensión alimenticia, préstamo
    // empresa) — migración 17: se calculan con calcularDescuentosPeriodo()
    // (prioridad legal + tope Art. 110 fr. I) a partir de descuentos_trabajador.
    // Si la migración no está aplicada o el trabajador no tiene filas ahí,
    // se usa el mecanismo plano anterior (infonavit_activo/pension_activa)
    // como respaldo, para no perder configuraciones no migradas.
    let infonavitDescuento = 0;
    let pensionAlimenticia = 0;
    let prestamoEmpresa    = 0;
    let descuentosDetalle  = [];

    const descuentosTrab = descMap[t.id] || [];
    if (descuentosDisponibles && descuentosTrab.length > 0) {
      const { aplicados } = calcularDescuentosPeriodo(descuentosTrab, totalPerc, diasPeriodo, smgDiarioVigente, UMA_DIARIA_2026);
      for (const a of aplicados) {
        const tipo = a.descuento.tipo;
        if (tipo === 'infonavit') infonavitDescuento += a.montoAplicado;
        else if (tipo === 'pension_alimenticia') pensionAlimenticia += a.montoAplicado;
        else if (tipo === 'prestamo_empresa') prestamoEmpresa += a.montoAplicado;
        else descuentosDetalle.push({
          tipo, descripcion: a.descuento.descripcion, numero_credito: a.descuento.numero_credito,
          monto: a.montoAplicado, recortado: a.recortado,
        });
        if (a.montoAplicado > 0) {
          aplicacionesDescuento.push({
            descuento_id: a.descuento.id,
            empresa_id:   CTX.empresa.id,
            periodo_id:   periodoId,
            monto_aplicado: a.montoAplicado,
            saldo_despues:  a.saldoDespues,
            _descuentoRow: a.descuento,
            _liquidado:    a.liquidado,
          });
        }
      }
    } else {
      // Respaldo: mecanismo plano previo a la migración 17
      if (t.infonavit_activo) {
        const tipo = t.infonavit_tipo || 'cuota_fija';
        const val  = parseFloat(t.infonavit_valor || 0);
        if (tipo === 'factor')    infonavitDescuento = parseFloat((val * UMA_DIARIA_2026 * diasPeriodo).toFixed(2));
        else if (tipo === 'pct')  infonavitDescuento = parseFloat((salBase * val).toFixed(2));
        else                      infonavitDescuento = val;
      }
      if (t.pension_activa) {
        const tipo = t.pension_tipo || 'fijo';
        const val  = parseFloat(t.pension_valor || 0);
        if (tipo === 'pct') {
          const netoBase = totalPerc - montoFaltas - montoPSin - imss - isrNeto - fondoAhorroObrero - infonavitDescuento;
          pensionAlimenticia = parseFloat((Math.max(0, netoBase) * val).toFixed(2));
        } else {
          pensionAlimenticia = val;
        }
      }
    }

    const totalDed = parseFloat((
      montoFaltas + montoPSin + imss + isrNeto + fondoAhorroObrero +
      infonavitDescuento + pensionAlimenticia + prestamoEmpresa +
      descuentosDetalle.reduce((s, d) => s + d.monto, 0)
    ).toFixed(2));
    const neto = parseFloat((totalPerc - totalDed).toFixed(2));

    recibos.push({
      empresa_id:           CTX.empresa.id,
      trabajador_id:        t.id,
      periodo_id:           periodoId,
      salario_base:         salBase,
      // Días que cubre el salario base. El recibo lo imprime como el
      // multiplicador ("N días × salario diario"), así que debe cuadrar
      // exactamente con salario_base. Las faltas van aparte, como deducción.
      dias_laborados:       diasPagados,
      otros_ingresos:       incapacidadMonto, // pago patronal primeros 3 días de incapacidad (Art. 42 LFT)
      horas_extra:          horasExtra,
      monto_horas_extra:    montoHE,
      prima_dominical:      primaDom,
      prima_festivo:        primaFestivo,
      prima_vacacional:     primaVacGoce,
      vales_despensa:       vales,
      bonos:                bono,
      total_percepciones:   totalPerc,
      dias_falta:           faltas,
      monto_faltas:         montoFaltas,
      dias_permiso_sin:     permisoSin,
      monto_permiso_sin:    montoPSin,
      cuota_imss:           imss,
      isr_retenido:         isrNeto,
      subsidio_empleo:      subsidioEmpleo,
      imss_patronal:        imssPatronal,
      infonavit_patronal:   infonavitPatronal,
      isn:                  isnPeriodo,
      // Regenerar el período resetea el ajuste anual: el módulo de ajuste
      // (Art. 97) debe volver a aplicarse para mantener el neto consistente.
      ajuste_anual_isr:     0,
      fondo_ahorro_obrero:  fondoAhorroObrero,
      fondo_ahorro_patronal:fondoAhorroPatronal,
      infonavit_descuento:  infonavitDescuento,
      infonavit_tipo:       t.infonavit_tipo || null,
      infonavit_valor:      parseFloat(t.infonavit_valor || 0),
      pension_alimenticia:  pensionAlimenticia,
      pension_tipo:         t.pension_tipo || null,
      prestamo_empresa:     prestamoEmpresa,
      descuentos_detalle:   descuentosDetalle,
      prestaciones_exento:  prestacionesExento,
      prestaciones_gravado: prestacionesGravado,
      prestaciones_detalle: prestacionesDetalle,
      total_deducciones:    totalDed,
      neto_pagar:           neto,
      forma_pago:           t.forma_pago || 'deposito',
      cuenta_bancaria:      t.clabe_interbancaria || t.cuenta_bancaria || null,
      folio:                `NOM-${Date.now()}-${t.id.slice(-4)}`,
      estado:               'borrador',
    });
  }

  // Upsert masivo
  const { error } = await _sbN()
    .from('recibos_nomina')
    .upsert(recibos, { onConflict: 'trabajador_id,periodo_id' });
  if (error) {
    // Tolerancia: si la migración 32 no está aplicada, reintentar sin las columnas patronales
    if (/imss_patronal|infonavit_patronal|subsidio_empleo|ajuste_anual_isr|"isn"|column .*isn/i.test(error.message || '')) {
      console.warn('Columnas patronales de recibos_nomina no existen — aplica la migración 32_migration_fiscal_patronal.sql');
      const sinPat = recibos.map(({ imss_patronal, infonavit_patronal, isn, subsidio_empleo, ajuste_anual_isr, ...resto }) => resto);
      const { error: err32 } = await _sbN()
        .from('recibos_nomina')
        .upsert(sinPat, { onConflict: 'trabajador_id,periodo_id' });
      if (err32) throw err32;
    // Tolerancia: si la migración 18 no está aplicada, reintentar sin las columnas de prestaciones fiscales
    } else if (/prestaciones_(exento|gravado|detalle)/i.test(error.message || '')) {
      console.warn('Columnas recibos_nomina.prestaciones_* no existen — aplica la migración 18_migration_prestaciones_fiscal.sql');
      const sinPrest = recibos.map(({ prestaciones_exento, prestaciones_gravado, prestaciones_detalle, ...resto }) => resto);
      const { error: err2 } = await _sbN()
        .from('recibos_nomina')
        .upsert(sinPrest, { onConflict: 'trabajador_id,periodo_id' });
      if (err2) throw err2;
    // Tolerancia: si la migración 17 no está aplicada, reintentar sin descuentos_detalle/prestamo_empresa
    } else if (/descuentos_detalle/i.test(error.message || '')) {
      console.warn('Columna recibos_nomina.descuentos_detalle no existe — aplica la migración 17_migration_prestamos_descuentos.sql');
      const sinDD = recibos.map(({ descuentos_detalle, ...resto }) => resto);
      const { error: err2 } = await _sbN()
        .from('recibos_nomina')
        .upsert(sinDD, { onConflict: 'trabajador_id,periodo_id' });
      if (err2) throw err2;
    // Tolerancia: si la migración 15 no está aplicada, reintentar sin prima_festivo
    } else if (/prima_festivo/i.test(error.message || '')) {
      console.warn('Columna recibos_nomina.prima_festivo no existe — aplica la migración 15_migration_festivos.sql');
      const sinPF = recibos.map(({ prima_festivo, ...resto }) => resto);
      const { error: err2 } = await _sbN()
        .from('recibos_nomina')
        .upsert(sinPF, { onConflict: 'trabajador_id,periodo_id' });
      if (err2) throw err2;
    // Tolerancia: si la migración 14 no está aplicada, reintentar sin prima_dominical
    } else if (/prima_dominical/i.test(error.message || '')) {
      console.warn('Columna recibos_nomina.prima_dominical no existe — aplica la migración 14_migration_prestaciones.sql');
      const sinPD = recibos.map(({ prima_dominical, prima_festivo, ...resto }) => resto);
      const { error: err2 } = await _sbN()
        .from('recibos_nomina')
        .upsert(sinPD, { onConflict: 'trabajador_id,periodo_id' });
      if (err2) throw err2;
    } else {
      throw error;
    }
  }

  // Historial de descuentos aplicados (migración 17): registra cada
  // aplicación y actualiza el saldo restante; desactiva el descuento y
  // genera una alerta informativa cuando queda liquidado.
  for (const ap of aplicacionesDescuento) {
    const { _descuentoRow, _liquidado, ...fila } = ap;
    const { error: errAp } = await _sbN().from('descuentos_aplicados').insert(fila);
    if (errAp) console.warn('No se pudo registrar descuentos_aplicados:', errAp.message);

    const updateFields = { saldo_restante: ap.saldo_despues };
    if (_liquidado) updateFields.activo = false;
    const { error: errUpd } = await _sbN().from('descuentos_trabajador').update(updateFields).eq('id', ap.descuento_id);
    if (errUpd) console.warn('No se pudo actualizar saldo_restante:', errUpd.message);

    if (_liquidado) {
      const { error: errAlerta } = await _sbN().from('alertas').insert({
        empresa_id: CTX.empresa.id,
        trabajador_id: _descuentoRow.trabajador_id,
        tipo: 'descuento_liquidado',
        titulo: `Crédito liquidado: ${_descuentoRow.descripcion || _descuentoRow.tipo}`,
        descripcion: `El descuento "${_descuentoRow.descripcion || _descuentoRow.tipo}" quedó liquidado en este periodo de nómina y se desactivó automáticamente.`,
        prioridad: 'baja',
        articulo_lft: null,
        accion_sugerida: 'Verificar con el trabajador si corresponde dar de baja el trámite ante la institución (INFONAVIT/FONACOT).',
      });
      if (errAlerta) console.warn('No se pudo generar la alerta de liquidación:', errAlerta.message);
    }
  }

  // Actualizar totales en el período
  const totalNeto = recibos.reduce((s,r) => s + r.neto_pagar, 0);
  const totalPerc = recibos.reduce((s,r) => s + r.total_percepciones, 0);
  await _sbN().from('periodos_nomina').update({
    total_neto: totalNeto, total_percepciones: totalPerc,
  }).eq('id', periodoId);

  // Recargar estado local
  _N.recibos = recibos;
  return recibos;
}

// ═══════════════════════════════════════════════════════════════════════════
//  EXPORTAR SPEI
// ═══════════════════════════════════════════════════════════════════════════
async function exportarSPEI(periodoId) {
  const { data: recibos } = await _sbN()
    .from('recibos_nomina')
    .select('neto_pagar, cuenta_bancaria, trabajadores(nombre,rfc)')
    .eq('periodo_id', periodoId)
    .eq('empresa_id', CTX.empresa.id);

  if (!recibos?.length) { alert('No hay recibos en este período.'); return; }

  if (typeof XLSX !== 'undefined') {
    const datos = recibos.map(r => ({
      'CLABE Interbancaria': r.cuenta_bancaria || 'SIN CLABE',
      'Nombre Beneficiario': r.trabajadores?.nombre || '',
      'Monto':               parseFloat(r.neto_pagar||0).toFixed(2),
      'Concepto':            'NOMINA ' + new Date().toLocaleDateString('es-MX'),
      'RFC Beneficiario':    r.trabajadores?.rfc || '',
    }));
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SPEI');
    XLSX.writeFile(wb, `layout-spei-nomina-${periodoId.slice(-6)}.xlsx`);
  } else {
    // Fallback CSV
    const header = 'CLABE|NOMBRE|MONTO|CONCEPTO|RFC\n';
    const rows   = recibos.map(r =>
      `${r.cuenta_bancaria||''}|${r.trabajadores?.nombre||''}|${parseFloat(r.neto_pagar||0).toFixed(2)}|NOMINA|${r.trabajadores?.rfc||''}`
    ).join('\n');
    const blob = new Blob([header + rows], { type:'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `spei-${periodoId.slice(-6)}.txt`;
    a.click(); URL.revokeObjectURL(url);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  DESCARGA MASIVA ZIP
// ═══════════════════════════════════════════════════════════════════════════
async function descargarZIPRecibos(periodoId) {
  if (typeof JSZip === 'undefined') {
    alert('JSZip no está cargado. Verifica que esté incluido en app.html.');
    return;
  }

  const { data: recibos } = await _sbN()
    .from('recibos_nomina')
    .select('id, neto_pagar, trabajadores(nombre)')
    .eq('periodo_id', periodoId)
    .eq('empresa_id', CTX.empresa.id);

  if (!recibos?.length) { alert('Sin recibos para descargar.'); return; }

  const btn = document.querySelector(`[onclick="descargarZIPRecibos('${periodoId}')"]`);
  if (btn) { btn.textContent = '⏳ Generando ZIP…'; btn.disabled = true; }

  try {
    const zip = new JSZip();
    for (const r of recibos) {
      const pdfBlob = await generarReciboNominaBlob(r.id);
      if (pdfBlob) {
        const nombre = (r.trabajadores?.nombre || r.id).replace(/\s+/g,'-').toLowerCase();
        zip.file(`recibo-${nombre}.pdf`, pdfBlob);
      }
    }
    const zipBlob = await zip.generateAsync({ type:'blob' });
    const url     = URL.createObjectURL(zipBlob);
    const a       = document.createElement('a');
    a.href = url; a.download = `nomina-periodo-${periodoId.slice(-6)}.zip`;
    a.click(); URL.revokeObjectURL(url);
  } catch(e) { alert('Error: ' + e.message); }
  finally {
    if (btn) { btn.textContent = '📦 Descargar todos los recibos (ZIP)'; btn.disabled = false; }
  }
}

// ── Previsualización del recibo antes de generar PDF ────────────────────────
async function descargarReciboNomina(reciboId) {
  // Mostrar spinner en el botón mientras cargamos datos
  const btn = document.querySelector(`[onclick="descargarReciboNomina('${reciboId}')"]`);
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }

  try {
    const { recibo, empresa } = await window._getNominaData(reciboId);
    if (!recibo) { alert('No se encontró el recibo.'); return; }

    const t  = recibo.trabajadores   || {};
    const p  = recibo.periodos_nomina || {};
    const daily = calcSalarioDiario(t.salario_mensual || 0, t.periodo_salario || 'mensual');

    // ── Filas de percepciones ────────────────────────────────────────────────
    const percRows = [
      ['Salario base', `${recibo.dias_laborados} días × ${fmt(daily)}`, recibo.salario_base],
    ];
    if (parseFloat(recibo.comisiones_ventas || 0) > 0)
      percRows.push(['Comisión s/ventas', `${fmt(recibo.monto_ventas)} × ${((recibo.pct_comision_ventas||0)*100).toFixed(2)}%  Art. 285-289 LFT`, recibo.comisiones_ventas]);
    if (parseFloat(recibo.comisiones_recuperacion || 0) > 0)
      percRows.push(['Comisión s/recuperación', `${fmt(recibo.monto_recuperado)} × ${((recibo.pct_comision_recuper||0)*100).toFixed(2)}%  Art. 285-289 LFT`, recibo.comisiones_recuperacion]);
    if (parseFloat(recibo.bono_meta || 0) > 0)
      percRows.push([`Bono por meta${recibo.concepto_bono_meta ? ' — ' + recibo.concepto_bono_meta : ''}`, 'RIT / Acuerdo', recibo.bono_meta]);
    if (parseFloat(recibo.prima_vacacional || 0) > 0)
      percRows.push(['Prima vacacional proporcional', 'Art. 80 LFT', recibo.prima_vacacional]);
    if (parseFloat(recibo.aguinaldo_prop || 0) > 0)
      percRows.push(['Aguinaldo proporcional', 'Art. 87 LFT', recibo.aguinaldo_prop]);
    if (parseFloat(recibo.monto_horas_extra || 0) > 0)
      percRows.push(['Horas extra', `${recibo.horas_extra} hrs  Art. 67-68 LFT`, recibo.monto_horas_extra]);
    if (parseFloat(recibo.prima_dominical || 0) > 0)
      percRows.push(['Prima dominical', 'Art. 71 LFT', recibo.prima_dominical]);
    if (parseFloat(recibo.prima_festivo || 0) > 0)
      percRows.push(['Prima por día festivo trabajado', 'Art. 75 LFT', recibo.prima_festivo]);
    if (parseFloat(recibo.vales_despensa || 0) > 0)
      percRows.push(['Vales de despensa', 'Art. 27 LISR', recibo.vales_despensa]);
    (Array.isArray(recibo.prestaciones_detalle) ? recibo.prestaciones_detalle : [])
      .filter(p => ['premio_puntualidad','premio_asistencia','ayuda_transporte','otro'].includes(p.tipo) && parseFloat(p.montoAplicado||0) > 0)
      .forEach(p => percRows.push([_labelPrestacion(p.tipo), `Exento ISR ${fmt(p.exentoISR||0)} · Gravado ${fmt(p.gravadoISR||0)}`, p.montoAplicado]));
    if (parseFloat(recibo.bonos || 0) > 0)
      percRows.push(['Bono adicional', 'Período', recibo.bonos]);
    if (parseFloat(recibo.otros_ingresos || 0) > 0)
      percRows.push(['Otros ingresos', '—', recibo.otros_ingresos]);

    // ── Filas de deducciones ─────────────────────────────────────────────────
    const dedRows = [];
    if (parseFloat(recibo.monto_faltas || 0) > 0)
      dedRows.push(['Desc. por faltas', `${recibo.dias_falta} días × ${fmt(daily)}  Art. 58 LFT`, recibo.monto_faltas]);
    if (parseFloat(recibo.monto_permiso_sin || 0) > 0)
      dedRows.push(['Desc. permiso sin goce', `${recibo.dias_permiso_sin} días`, recibo.monto_permiso_sin]);
    if (parseFloat(recibo.cuota_imss || 0) > 0)
      dedRows.push(['Cuota IMSS obrero', '2.25% s/ base  Art. 25 LSS', recibo.cuota_imss]);
    if (parseFloat(recibo.isr_retenido || 0) > 0)
      dedRows.push(['ISR retenido', 'Art. 96 LISR 2026', recibo.isr_retenido]);
    if (parseFloat(recibo.fondo_ahorro_obrero || 0) > 0)
      dedRows.push(['Fondo de ahorro obrero', 'Art. 110 fr. IV LFT', recibo.fondo_ahorro_obrero]);
    if (parseFloat(recibo.prestamo_empresa || 0) > 0)
      dedRows.push(['Préstamo empresa', 'Art. 110 fr. I LFT', recibo.prestamo_empresa]);
    if (parseFloat(recibo.infonavit_descuento || 0) > 0)
      dedRows.push(['INFONAVIT', 'Art. 97 Ley INFONAVIT', recibo.infonavit_descuento]);
    if (parseFloat(recibo.pension_alimenticia || 0) > 0)
      dedRows.push(['Pensión alimenticia', 'Art. 110 fr. V LFT', recibo.pension_alimenticia]);
    (Array.isArray(recibo.descuentos_detalle) ? recibo.descuentos_detalle : []).forEach(d => {
      if (parseFloat(d.monto || 0) > 0)
        dedRows.push([d.descripcion || d.tipo, d.numero_credito ? `Núm. ${d.numero_credito}` : 'Art. 110 LFT', d.monto]);
    });
    if (parseFloat(recibo.otras_deducciones || 0) > 0)
      dedRows.push(['Otras deducciones', recibo.notas || '—', recibo.otras_deducciones]);

    const mkPercRow = ([concepto, calculo, monto]) => `
      <tr>
        <td style="padding:7px 10px;font-size:.82rem;color:var(--text-main);">${concepto}</td>
        <td style="padding:7px 10px;font-size:.78rem;color:var(--text-muted);">${calculo}</td>
        <td style="padding:7px 10px;text-align:right;font-weight:700;color:var(--green-ok);">${fmt(monto)}</td>
      </tr>`;

    const mkDedRow = ([concepto, calculo, monto]) => `
      <tr>
        <td style="padding:7px 10px;font-size:.82rem;color:var(--text-main);">${concepto}</td>
        <td style="padding:7px 10px;font-size:.78rem;color:var(--text-muted);">${calculo}</td>
        <td style="padding:7px 10px;text-align:right;font-weight:700;color:var(--red-warn);">-${fmt(monto)}</td>
      </tr>`;

    showModal(`
      <div class="modal animate-in" style="max-width:660px;width:95vw;">

        <!-- Header -->
        <div class="modal-header" style="background:var(--navy-deep);border-radius:var(--radius-md) var(--radius-md) 0 0;padding:16px 20px;">
          <div>
            <div class="modal-title" style="color:#fff;font-size:1rem;">📋 Previsualización del Recibo</div>
            <div style="font-size:.75rem;color:rgba(255,255,255,.55);margin-top:2px;">
              Folio: ${recibo.folio || reciboId.slice(-8)}
            </div>
          </div>
          <button class="modal-close" onclick="closeModal()" style="color:#fff;">×</button>
        </div>

        <div style="padding:18px 20px;max-height:72vh;overflow-y:auto;scrollbar-width:thin;">

          <!-- Bloque trabajador -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;
                      background:var(--bg-surface);border:1px solid var(--border);
                      border-radius:var(--radius-sm);padding:14px;">
            <div>
              <div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;
                          color:var(--text-muted);margin-bottom:3px;">Trabajador</div>
              <div style="font-weight:800;font-size:.95rem;">${t.nombre || '—'}</div>
              <div style="font-size:.78rem;color:var(--text-muted);margin-top:2px;">
                ${[t.puesto, t.departamento].filter(Boolean).join(' · ')}
              </div>
              ${t.rfc ? `<div style="font-size:.75rem;color:var(--text-muted);margin-top:2px;">RFC: ${t.rfc}</div>` : ''}
            </div>
            <div>
              <div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;
                          color:var(--text-muted);margin-bottom:3px;">Período</div>
              <div style="font-weight:700;font-size:.88rem;">${p.nombre || '—'}</div>
              <div style="font-size:.78rem;color:var(--text-muted);margin-top:2px;">
                ${formatDateShort(p.fecha_inicio)} — ${formatDateShort(p.fecha_fin)}
              </div>
              <div style="font-size:.75rem;color:var(--text-muted);margin-top:2px;">
                Días laborados: <strong>${recibo.dias_laborados}</strong>
                &nbsp;·&nbsp; Salario diario: <strong>${fmt(daily)}</strong>
              </div>
            </div>
          </div>

          <!-- Tabla percepciones -->
          <div style="border:1px solid #27ae6044;border-radius:var(--radius-sm);overflow:hidden;margin-bottom:10px;">
            <div style="background:#1e8449;color:#fff;padding:7px 10px;
                        font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">
              📥 Percepciones
            </div>
            <table style="width:100%;border-collapse:collapse;">
              <colgroup>
                <col style="width:44%"><col style="width:34%"><col style="width:22%">
              </colgroup>
              <thead>
                <tr style="background:rgba(39,174,96,.08);font-size:.72rem;color:var(--text-muted);">
                  <th style="padding:5px 10px;text-align:left;font-weight:600;">Concepto</th>
                  <th style="padding:5px 10px;text-align:left;font-weight:600;">Cálculo</th>
                  <th style="padding:5px 10px;text-align:right;font-weight:600;">Importe</th>
                </tr>
              </thead>
              <tbody>
                ${percRows.map(mkPercRow).join('')}
              </tbody>
              <tfoot>
                <tr style="background:rgba(39,174,96,.12);border-top:2px solid #27ae6044;">
                  <td colspan="2" style="padding:8px 10px;font-weight:800;font-size:.83rem;">
                    SUBTOTAL PERCEPCIONES
                  </td>
                  <td style="padding:8px 10px;text-align:right;font-weight:900;
                             font-size:.95rem;color:var(--green-ok);">
                    ${fmt(recibo.total_percepciones)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <!-- Tabla deducciones -->
          <div style="border:1px solid #c0392b44;border-radius:var(--radius-sm);overflow:hidden;margin-bottom:16px;">
            <div style="background:#922b21;color:#fff;padding:7px 10px;
                        font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">
              📤 Deducciones
            </div>
            <table style="width:100%;border-collapse:collapse;">
              <colgroup>
                <col style="width:44%"><col style="width:34%"><col style="width:22%">
              </colgroup>
              <thead>
                <tr style="background:rgba(192,57,43,.08);font-size:.72rem;color:var(--text-muted);">
                  <th style="padding:5px 10px;text-align:left;font-weight:600;">Concepto</th>
                  <th style="padding:5px 10px;text-align:left;font-weight:600;">Referencia</th>
                  <th style="padding:5px 10px;text-align:right;font-weight:600;">Importe</th>
                </tr>
              </thead>
              <tbody>
                ${dedRows.length ? dedRows.map(mkDedRow).join('') : `
                  <tr><td colspan="3" style="padding:10px;text-align:center;
                    font-size:.8rem;color:var(--text-muted);">Sin deducciones</td></tr>`}
              </tbody>
              <tfoot>
                <tr style="background:rgba(192,57,43,.12);border-top:2px solid #c0392b44;">
                  <td colspan="2" style="padding:8px 10px;font-weight:800;font-size:.83rem;">
                    SUBTOTAL DEDUCCIONES
                  </td>
                  <td style="padding:8px 10px;text-align:right;font-weight:900;
                             font-size:.95rem;color:var(--red-warn);">
                    -${fmt(recibo.total_deducciones)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <!-- Neto a pagar -->
          <div style="background:var(--navy-deep);border-radius:var(--radius-sm);
                      padding:16px 20px;text-align:center;margin-bottom:16px;">
            <div style="font-size:.72rem;color:rgba(255,255,255,.5);
                        text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">
              Neto a Pagar
            </div>
            <div style="font-family:'Montserrat',sans-serif;font-size:1.8rem;
                        font-weight:900;color:var(--gold-primary);">
              ${fmt(recibo.neto_pagar)}
            </div>
            <div style="font-size:.72rem;color:rgba(255,255,255,.4);margin-top:4px;">
              ${numToWords(recibo.neto_pagar)} pesos M.N.
            </div>
          </div>

          <!-- Acumulados del año -->
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:6px;">
            ${[
              ['Percibido acum. año', fmt(recibo.acum_percepciones || recibo.total_percepciones), 'var(--green-ok)'],
              ['ISR acum. retenido',  fmt(recibo.acum_isr         || recibo.isr_retenido),        'var(--red-warn)'],
              ['IMSS obrero acum.',   fmt(recibo.cuota_imss),                                      'var(--blue-accent)'],
            ].map(([lbl, val, col]) => `
              <div style="background:var(--bg-surface);border:1px solid var(--border);
                          border-radius:var(--radius-sm);padding:8px;text-align:center;">
                <div style="font-size:.85rem;font-weight:800;color:${col};">${val}</div>
                <div style="font-size:.65rem;color:var(--text-muted);margin-top:2px;">${lbl}</div>
              </div>`).join('')}
          </div>

          <!-- Aviso legal -->
          <div style="font-size:.7rem;color:var(--text-muted);
                      border-top:1px solid var(--border);padding-top:10px;margin-top:10px;
                      line-height:1.5;">
            ℹ️ Al aprobar, el recibo quedará marcado como <strong>aprobado</strong>
            y se generará el PDF para firma. Este documento tiene validez conforme
            a los Arts. 82, 88 y 132 Fracc. VII de la LFT.
          </div>
        </div>

        <!-- Footer con acciones -->
        <div class="modal-footer" style="border-top:1px solid var(--border);gap:10px;">
          <button class="btn-secondary" onclick="closeModal()">
            ✏️ Cerrar y editar
          </button>
          <button class="btn-primary" id="btn-aprobar-recibo"
            onclick="aprobarYGenerarPDF('${reciboId}')"
            style="background:var(--green-ok);border-color:var(--green-ok);">
            ✅ Aprobar y Generar PDF
          </button>
        </div>
      </div>
    `);

  } catch(e) {
    alert('Error al cargar el recibo: ' + e.message);
  } finally {
    if (btn) { btn.textContent = '📄 PDF'; btn.disabled = false; }
  }
}

// ── Aprobación + generación del PDF ─────────────────────────────────────────
async function aprobarYGenerarPDF(reciboId) {
  const btn = document.getElementById('btn-aprobar-recibo');
  if (btn) { btn.textContent = '⏳ Generando…'; btn.disabled = true; }
  try {
    // Marcar como aprobado en Supabase
    await _sbN().from('recibos_nomina')
      .update({ estado: 'aprobado' })
      .eq('id', reciboId);

    closeModal();

    // Generar PDF — usa pdfs.js si está disponible, si no la versión interna
    if (typeof generateReciboNomina === 'function') {
      await generateReciboNomina(reciboId);
    } else {
      const blob = await _generarReciboNominaBlob(reciboId);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href = url;
        a.download = `recibo-nomina-${reciboId.slice(-6)}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }

    // Refrescar la tabla si estamos en Tab 2
    if (_N.tab === 2) await _tabDetalle();

  } catch(e) {
    alert('Error al generar PDF: ' + e.message);
    if (btn) { btn.textContent = '✅ Aprobar y Generar PDF'; btn.disabled = false; }
  }
}

// ── Generador de PDF interno (independiente de pdfs.js) ──────────────────────
async function _generarReciboNominaBlob(reciboId) {
  const { recibo, empresa } = await window._getNominaData(reciboId);
  if (!recibo) return null;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const ml  = 25, mr = 25;
  const pw  = doc.internal.pageSize.getWidth();
  const ph  = doc.internal.pageSize.getHeight();
  const tw  = pw - ml - mr;
  const t   = recibo.trabajadores   || {};
  const p   = recibo.periodos_nomina || {};

  // Normalizar caracteres especiales
  const np = s => (s || '').toString()
    .replace(/[áà]/g,'a').replace(/[éè]/g,'e').replace(/[íì]/g,'i')
    .replace(/[óò]/g,'o').replace(/[úùü]/g,'u').replace(/ñ/g,'n')
    .replace(/[ÁÀ]/g,'A').replace(/[ÉÈ]/g,'E').replace(/[ÍÌ]/g,'I')
    .replace(/[ÓÒ]/g,'O').replace(/[ÚÙÜ]/g,'U').replace(/Ñ/g,'N')
    .replace(/[¿¡×—]/g,'');

  const folio = recibo.folio || `NOM-${reciboId.slice(-6)}`;
  const daily = calcSalarioDiario(t.salario_mensual || 0, t.periodo_salario || 'mensual');
  let y = 0;
  const ck = (n = 20) => { if (y + n > ph - 16) { doc.addPage(); y = 22; } };

  // 1. ENCABEZADO
  doc.setFillColor(15, 20, 40); doc.rect(0, 0, pw, 36, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(245,166,35);
  doc.text(np(empresa.nombre || ''), pw/2, 11, { align:'center' });
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(180,185,200);
  doc.text(np([empresa.rfc, empresa.domicilio].filter(Boolean).join(' | ')), pw/2, 18, { align:'center' });
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(255,255,255);
  doc.text('RECIBO DE NOMINA', pw/2, 30, { align:'center' });
  y = 42;
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(120,120,120);
  doc.text(`Folio: ${np(folio)}  |  Periodo: ${np(p.nombre || '')}`, pw/2, y, { align:'center' });
  y += 10;

  // 2. BLOQUE TRABAJADOR
  const bH = 40;
  doc.setFillColor(248,248,252); doc.rect(ml, y, tw, bH, 'F');
  doc.setDrawColor(220,220,220); doc.setLineWidth(0.3);
  doc.rect(ml, y, tw, bH); doc.line(pw/2, y, pw/2, y + bH);
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(20,20,20);
  doc.text(np(t.nombre || ''), ml+3, y+8);
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(80,80,80);
  let yi = y+14;
  if (t.rfc)         { doc.text(`RFC: ${np(t.rfc)}`,          ml+3, yi); yi+=4.2; }
  if (t.nss)         { doc.text(`NSS: ${np(t.nss)}`,          ml+3, yi); yi+=4.2; }
  if (t.puesto)      { doc.text(`Puesto: ${np(t.puesto)}`,    ml+3, yi); yi+=4.2; }
  if (t.departamento){ doc.text(`Area: ${np(t.departamento)}`,ml+3, yi); }
  const c2x = pw/2 + 3; let yj = y+8;
  doc.text(`Periodo: ${np(formatDateShort(p.fecha_inicio))} al ${np(formatDateShort(p.fecha_fin))}`, c2x, yj); yj+=4.5;
  doc.text(`Dias laborados: ${recibo.dias_laborados}`,  c2x, yj); yj+=4.5;
  doc.text(`Salario diario: ${np(fmt(daily))}`,         c2x, yj); yj+=4.5;
  doc.text(`Forma de pago: ${np(recibo.forma_pago || 'Deposito')}`, c2x, yj);
  y += bH + 10;

  // 3. PERCEPCIONES
  const percRows = [['Salario base', `${recibo.dias_laborados} dias x ${np(fmt(daily))}  Art. 82 LFT`, fmt(recibo.salario_base)]];
  if (parseFloat(recibo.comisiones_ventas||0) > 0)      percRows.push(['Comision s/ventas', `${np(fmt(recibo.monto_ventas))} x ${((recibo.pct_comision_ventas||0)*100).toFixed(2)}%  Art. 285-289 LFT`, fmt(recibo.comisiones_ventas)]);
  if (parseFloat(recibo.comisiones_recuperacion||0) > 0) percRows.push(['Comision s/recuperacion', `${np(fmt(recibo.monto_recuperado))} x ${((recibo.pct_comision_recuper||0)*100).toFixed(2)}%  Art. 285-289 LFT`, fmt(recibo.comisiones_recuperacion)]);
  if (parseFloat(recibo.bono_meta||0) > 0)              percRows.push([`Bono por meta${recibo.concepto_bono_meta?' — '+np(recibo.concepto_bono_meta):''}`, 'RIT / Acuerdo', fmt(recibo.bono_meta)]);
  if (parseFloat(recibo.prima_vacacional||0) > 0)       percRows.push(['Prima vacacional prop.', 'Art. 80 LFT', fmt(recibo.prima_vacacional)]);
  if (parseFloat(recibo.aguinaldo_prop||0) > 0)         percRows.push(['Aguinaldo proporcional', 'Art. 87 LFT', fmt(recibo.aguinaldo_prop)]);
  if (parseFloat(recibo.monto_horas_extra||0) > 0)      percRows.push(['Horas extra', `${recibo.horas_extra} hrs  Art. 67-68 LFT`, fmt(recibo.monto_horas_extra)]);
  if (parseFloat(recibo.prima_dominical||0) > 0)        percRows.push(['Prima dominical', 'Art. 71 LFT', fmt(recibo.prima_dominical)]);
  if (parseFloat(recibo.prima_festivo||0) > 0)          percRows.push(['Prima por día festivo trabajado', 'Art. 75 LFT', fmt(recibo.prima_festivo)]);
  if (parseFloat(recibo.vales_despensa||0) > 0)         percRows.push(['Vales de despensa', 'Art. 27 LISR', fmt(recibo.vales_despensa)]);
  (Array.isArray(recibo.prestaciones_detalle) ? recibo.prestaciones_detalle : [])
    .filter(p => ['premio_puntualidad','premio_asistencia','ayuda_transporte','otro'].includes(p.tipo) && parseFloat(p.montoAplicado||0) > 0)
    .forEach(p => percRows.push([_labelPrestacion(p.tipo), `Exento ISR ${fmt(p.exentoISR||0)} · Gravado ${fmt(p.gravadoISR||0)}`, fmt(p.montoAplicado)]));
  if (parseFloat(recibo.bonos||0) > 0)                  percRows.push(['Bono adicional', 'Periodo', fmt(recibo.bonos)]);
  if (parseFloat(recibo.otros_ingresos||0) > 0)         percRows.push(['Otros ingresos', '—', fmt(recibo.otros_ingresos)]);
  doc.autoTable({
    startY: y, margin: { left:ml, right:mr },
    head: [['PERCEPCIONES','Calculo','Importe']],
    body: percRows,
    foot: [['SUBTOTAL PERCEPCIONES','', fmt(recibo.total_percepciones)]],
    styles: { fontSize:9, cellPadding:3 },
    headStyles: { fillColor:[39,174,96], textColor:[255,255,255], fontStyle:'bold' },
    footStyles: { fillColor:[27,120,66], textColor:[255,255,255], fontStyle:'bold', fontSize:9.5 },
    alternateRowStyles: { fillColor:[240,255,244] },
    columnStyles: { 0:{cellWidth:80,fontStyle:'bold'}, 1:{cellWidth:64,textColor:[100,100,100]}, 2:{cellWidth:32,halign:'right',fontStyle:'bold'} },
    theme: 'grid',
  });
  y = doc.lastAutoTable.finalY + 8;

  // 4. DEDUCCIONES
  const dedRows = [];
  if (parseFloat(recibo.monto_faltas||0) > 0)           dedRows.push(['Desc. por faltas', `${recibo.dias_falta} dias x ${np(fmt(daily))}  Art. 58 LFT`, `-${fmt(recibo.monto_faltas)}`]);
  if (parseFloat(recibo.monto_permiso_sin||0) > 0)      dedRows.push(['Desc. permiso sin goce', `${recibo.dias_permiso_sin} dias`, `-${fmt(recibo.monto_permiso_sin)}`]);
  if (parseFloat(recibo.cuota_imss||0) > 0)             dedRows.push(['Cuota IMSS obrero', '2.25% s/base  Art. 25 LSS', `-${fmt(recibo.cuota_imss)}`]);
  if (parseFloat(recibo.isr_retenido||0) > 0)           dedRows.push(['ISR retenido', 'Art. 96 LISR 2026', `-${fmt(recibo.isr_retenido)}`]);
  if (parseFloat(recibo.fondo_ahorro_obrero||0) > 0)    dedRows.push(['Fondo de ahorro obrero', 'Art. 110 fr. IV LFT', `-${fmt(recibo.fondo_ahorro_obrero)}`]);
  if (parseFloat(recibo.prestamo_empresa||0) > 0)       dedRows.push(['Prestamo empresa', 'Art. 110 fr. I LFT', `-${fmt(recibo.prestamo_empresa)}`]);
  if (parseFloat(recibo.infonavit_descuento||0) > 0)    dedRows.push(['INFONAVIT', 'Art. 97 Ley INFONAVIT', `-${fmt(recibo.infonavit_descuento)}`]);
  if (parseFloat(recibo.pension_alimenticia||0) > 0)    dedRows.push(['Pension alimenticia', 'Art. 110 fr. V LFT', `-${fmt(recibo.pension_alimenticia)}`]);
  (Array.isArray(recibo.descuentos_detalle) ? recibo.descuentos_detalle : []).forEach(d => {
    if (parseFloat(d.monto || 0) > 0) dedRows.push([np(d.descripcion || d.tipo), d.numero_credito ? `Num. ${np(d.numero_credito)}` : 'Art. 110 LFT', `-${fmt(d.monto)}`]);
  });
  if (parseFloat(recibo.otras_deducciones||0) > 0)      dedRows.push(['Otras deducciones', np(recibo.notas || '—'), `-${fmt(recibo.otras_deducciones)}`]);
  if (!dedRows.length) dedRows.push(['Sin deducciones','','$0.00']);
  ck(dedRows.length * 10 + 50);
  doc.autoTable({
    startY: y, margin: { left:ml, right:mr },
    head: [['DEDUCCIONES','Concepto','Importe']],
    body: dedRows,
    foot: [['SUBTOTAL DEDUCCIONES','', `-${fmt(recibo.total_deducciones)}`]],
    styles: { fontSize:9, cellPadding:3 },
    headStyles: { fillColor:[192,57,43], textColor:[255,255,255], fontStyle:'bold' },
    footStyles: { fillColor:[120,30,20], textColor:[255,255,255], fontStyle:'bold', fontSize:9.5 },
    alternateRowStyles: { fillColor:[255,245,245] },
    columnStyles: { 0:{cellWidth:80,fontStyle:'bold'}, 1:{cellWidth:64,textColor:[100,100,100]}, 2:{cellWidth:32,halign:'right',fontStyle:'bold'} },
    theme: 'grid',
  });
  y = doc.lastAutoTable.finalY + 10;

  // 5. NETO A PAGAR
  ck(30);
  doc.setFillColor(15,20,40); doc.rect(ml, y, tw, 22, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(180,185,200);
  doc.text('NETO A PAGAR', pw/2, y+7, { align:'center' });
  doc.setFontSize(15); doc.setTextColor(245,166,35);
  doc.text(np(`${fmt(recibo.neto_pagar)}   (${numToWords(recibo.neto_pagar)} PESOS M.N.)`), pw/2, y+17, { align:'center' });
  y += 30;

  // 6. ACUMULADOS
  ck(24);
  doc.autoTable({
    startY: y, margin: { left:ml, right:mr },
    head: [['Acumulado del año','Percibido','ISR retenido','IMSS obrero']],
    body: [[
      new Date().getFullYear().toString(),
      fmt(recibo.acum_percepciones || recibo.total_percepciones),
      fmt(recibo.acum_isr || recibo.isr_retenido),
      fmt(recibo.cuota_imss),
    ]],
    styles: { fontSize:8, cellPadding:2.5, textColor:[100,100,100] },
    headStyles: { fillColor:[70,70,90], textColor:[200,200,210], fontStyle:'bold', fontSize:7.5 },
    theme: 'grid',
  });
  y = doc.lastAutoTable.finalY + 10;

  // 7. DECLARACIÓN LEGAL
  ck(22);
  const decl = `El trabajador declara haber recibido la cantidad senalada como neto a pagar, conforme a los Articulos 82, 88 y 132 fraccion VII de la Ley Federal del Trabajo.`;
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(120,120,120);
  const dl = doc.splitTextToSize(np(decl), tw);
  doc.text(dl, ml, y); y += dl.length * 4.5 + 8;

  // 8. PLACEHOLDER CFDI
  ck(22);
  doc.setDrawColor(180,180,180); doc.setLineWidth(0.3); doc.setLineDash([2,2]);
  doc.rect(ml, y, tw, 14); doc.setLineDash([]);
  doc.setFont('helvetica','italic'); doc.setFontSize(7.5); doc.setTextColor(170,170,170);
  doc.text('Timbrado CFDI — Proximamente (Art. 99 Fracc. III LISR)', pw/2, y+8, { align:'center' });
  y += 22;

  // 9. FIRMAS
  ck(40);
  const colW = tw/2 - 5;
  const c1f = ml, c2f = ml + colW + 10;
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  doc.line(c1f, y+18, c1f+colW, y+18);
  doc.line(c2f, y+18, c2f+colW, y+18);
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(30,30,30);
  doc.text('EL PATRON / REPRESENTANTE', c1f+colW/2, y+23, {align:'center'});
  doc.text('EL TRABAJADOR',             c2f+colW/2, y+23, {align:'center'});
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80);
  doc.text(np(empresa.nombre || ''), c1f+colW/2, y+28, {align:'center'});
  doc.text(np(t.nombre || ''),       c2f+colW/2, y+28, {align:'center'});

  // 10. PIE DE PÁGINA
  const totalPags = doc.getNumberOfPages();
  for (let i = 1; i <= totalPags; i++) {
    doc.setPage(i);
    doc.setDrawColor(220,220,220); doc.setLineWidth(0.2);
    doc.line(ml, ph-11, pw-mr, ph-11);
    doc.setFontSize(6.5); doc.setFont('helvetica','normal'); doc.setTextColor(160,160,160);
    doc.text(np(`${folio}  |  Pagina ${i} de ${totalPags}  |  Capital Humano MX  |  Arts. 82, 88, 132 LFT`), pw/2, ph-7, {align:'center'});
  }

  return doc.output('blob');
}

// Exponer para uso desde pdfs.js
window._getNominaData = async (reciboId) => {
  const [{ data: recibo }, empresa] = await Promise.all([
    _sbN().from('recibos_nomina')
      .select('*, trabajadores(*), periodos_nomina(nombre,fecha_inicio,fecha_fin,fecha_pago,tipo)')
      .eq('id', reciboId).single(),
    Promise.resolve(CTX.empresa),
  ]);
  return { recibo, empresa };
};
