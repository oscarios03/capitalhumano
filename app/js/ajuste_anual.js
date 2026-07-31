/**
 * Capital Humano MX — Ajuste anual de ISR (Art. 97 LISR)
 *
 * El patrón está obligado a calcular el impuesto anual de cada trabajador y
 * a enterar la diferencia contra lo retenido durante el año, a más tardar en
 * febrero del año siguiente (en la práctica se aplica en la nómina de
 * diciembre). NO se hace ajuste a quien (Art. 97, penúltimo párrafo):
 *   · obtuvo ingresos anuales superiores a $400,000
 *   · inició o dejó de prestar servicios durante el ejercicio
 *   · comunicó por escrito que presentará su declaración anual por su cuenta
 * Los dos primeros casos se detectan solos; el tercero se marca a mano.
 *
 * Depende de: nomina.js (ISR_ANUAL_2026, _sbN), calculo.js (fmt), app.js (CTX)
 */

const AJUSTE_LIMITE_ART97 = 400000; // Art. 97 LISR — tope de ingresos anuales

let _AA = {
  anio:      new Date().getFullYear(),
  filas:     [],
  excluidos: new Set(), // ids marcados a mano (presenta declaración propia)
};

const _sbAA = () => window.supabase;

/** ISR del ejercicio con la tarifa anual del Art. 152 LISR. */
function calcISRAnual(baseAnual) {
  if (!(baseAnual > 0)) return 0;
  const b = _tramoISR(ISR_ANUAL_2026, baseAnual);
  return parseFloat((b.cuota + (baseAnual - b.limInf) * b.pct).toFixed(2));
}

// ═══════════════════════════════════════════════════════════════════════════
//  CÁLCULO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Acumula los recibos del año por trabajador y calcula el ajuste.
 * @returns {Array} filas con { id, nombre, base, isrAnual, isrRetenido,
 *                              subsidio, diferencia, aplica, motivoExclusion }
 */
async function calcularAjusteAnual(anio) {
  const { data: periodos, error: errP } = await _sbAA()
    .from('periodos_nomina')
    .select('id')
    .eq('empresa_id', CTX.empresa.id)
    .gte('fecha_inicio', `${anio}-01-01`)
    .lte('fecha_inicio', `${anio}-12-31`);
  if (errP) throw errP;

  const ids = (periodos || []).map(p => p.id);
  if (!ids.length) return [];

  // percepciones_gravadas viene de la migración 49. Sin ella no hay forma de
  // saber qué parte del ejercicio fue exenta, así que se degrada a las
  // percepciones totales y se avisa: el resultado sobreestima el impuesto.
  const COLS = 'trabajador_id, total_percepciones, percepciones_gravadas, isr_retenido, subsidio_empleo, trabajadores(nombre, fecha_ingreso, fecha_baja, estado)';
  let { data: recibos, error: errR } = await _sbAA()
    .from('recibos_nomina').select(COLS).in('periodo_id', ids);
  let sinDesglose = false;
  if (errR && /percepciones_gravadas/i.test(errR.message || '')) {
    sinDesglose = true;
    console.warn('Falta la migración 49: el ajuste anual usará las percepciones totales como base y sobreestimará el ISR del ejercicio.');
    ({ data: recibos, error: errR } = await _sbAA()
      .from('recibos_nomina')
      .select(COLS.replace('percepciones_gravadas, ', ''))
      .in('periodo_id', ids));
  }
  if (errR) throw errR;

  const map = {};
  for (const r of (recibos || [])) {
    const t = r.trabajadores || {};
    if (!map[r.trabajador_id]) map[r.trabajador_id] = {
      id: r.trabajador_id, nombre: t.nombre || '—',
      fechaIngreso: t.fecha_ingreso, fechaBaja: t.fecha_baja, estado: t.estado,
      base: 0, ingresoTotal: 0, isrRetenido: 0, subsidio: 0, recibos: 0, sinDesglose,
    };
    const f = map[r.trabajador_id];
    const percTotal = parseFloat(r.total_percepciones || 0);
    // Base del impuesto anual: SOLO lo gravado. Acumular total_percepciones
    // metía los exentos del Art. 93 (aguinaldo hasta 30 UMA, prima vacacional,
    // vales, tiempo extra dentro del límite) en la tarifa del Art. 152 y
    // cobraba en diciembre un impuesto que el trabajador no debía.
    f.base         += r.percepciones_gravadas != null
      ? parseFloat(r.percepciones_gravadas) : percTotal;
    f.ingresoTotal += percTotal;
    f.isrRetenido  += parseFloat(r.isr_retenido || 0);
    f.subsidio     += parseFloat(r.subsidio_empleo || 0);
    f.recibos++;
  }

  return Object.values(map).map(f => {
    // Exclusiones del Art. 97, penúltimo párrafo. El límite de $400,000 se mide
    // sobre los INGRESOS del ejercicio (no sobre la base gravable).
    let motivo = null;
    if (f.ingresoTotal > AJUSTE_LIMITE_ART97) motivo = `Ingresos anuales superiores a ${fmt(AJUSTE_LIMITE_ART97)}`;
    // "con posterioridad al 1 de enero": quien inició EL 1 de enero sí se ajusta.
    else if (f.fechaIngreso && f.fechaIngreso > `${anio}-01-01`) motivo = 'Inició labores durante el ejercicio';
    // "antes del 1 de diciembre": una baja de diciembre SÍ se ajusta.
    else if (f.fechaBaja && f.fechaBaja >= `${anio}-01-01` && f.fechaBaja < `${anio}-12-01`) motivo = 'Dejó de prestar servicios antes del 1 de diciembre';
    else if (_AA.excluidos.has(f.id)) motivo = 'Presenta declaración anual por su cuenta';

    const base        = parseFloat(f.base.toFixed(2));
    const ingresoTotal = parseFloat(f.ingresoTotal.toFixed(2));
    const isrAnual    = calcISRAnual(base);
    const isrRetenido = parseFloat(f.isrRetenido.toFixed(2));
    const subsidio    = parseFloat(f.subsidio.toFixed(2));
    // El subsidio al empleo acreditado en el año reduce el impuesto del
    // ejercicio; `isr_retenido` ya viene NETO de él, así que compararlo contra
    // un ISR anual bruto lo cobraba dos veces. Se computaba y se exportaba al
    // Excel, pero nunca se restaba.
    const isrAnualNeto = parseFloat(Math.max(0, isrAnual - subsidio).toFixed(2));
    // Diferencia > 0 = falta retener (a cargo); < 0 = se retuvo de más (a favor)
    const diferencia = parseFloat((isrAnualNeto - isrRetenido).toFixed(2));

    return {
      ...f, base, ingresoTotal, isrAnual, isrAnualNeto, isrRetenido, subsidio,
      diferencia, aplica: !motivo, motivoExclusion: motivo,
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// ═══════════════════════════════════════════════════════════════════════════
//  VISTA
// ═══════════════════════════════════════════════════════════════════════════

async function renderAjusteAnual(el) {
  const cont = el || document.getElementById('nomina-content');
  if (!cont) return;
  cont.innerHTML = `<div class="loading"><div class="spinner"></div> Calculando ajuste anual…</div>`;

  const anioActual = new Date().getFullYear();
  const anios = Array.from({ length: 5 }, (_, i) => anioActual - i);

  try {
    _AA.filas = await calcularAjusteAnual(_AA.anio);
  } catch(e) {
    cont.innerHTML = `<div class="alert alert-danger"><svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg><span>${e.message}</span></div>`;
    return;
  }

  const aplicables = _AA.filas.filter(f => f.aplica);
  const aCargo   = aplicables.filter(f => f.diferencia > 0);
  const aFavor   = aplicables.filter(f => f.diferencia < 0);
  const totalCargo = aCargo.reduce((s, f) => s + f.diferencia, 0);
  const totalFavor = aFavor.reduce((s, f) => s + Math.abs(f.diferencia), 0);

  cont.innerHTML = `
    <div class="card animate-in" style="margin-bottom:16px;">
      <div class="card-header">
        <span class="card-title">Ajuste anual de ISR — Art. 97 LISR</span>
        <div style="display:flex;gap:8px;align-items:center;">
          <select id="aa-anio" class="form-select" style="width:auto;" onchange="_aaCambiarAnio(this.value)">
            ${anios.map(a => `<option value="${a}" ${_AA.anio === a ? 'selected' : ''}>Ejercicio ${a}</option>`).join('')}
          </select>
          <button class="btn-secondary btn-sm" onclick="_aaExportarXLSX()">Excel</button>
        </div>
      </div>
      <p style="font-size:.85rem;color:var(--text-muted);margin-top:10px;">
        Compara el ISR del ejercicio (tarifa anual del Art. 152 sobre las percepciones
        <strong>gravadas</strong>, menos el subsidio al empleo acreditado) contra lo retenido en el año.
        La diferencia se aplica en la nómina de diciembre. Se excluye automáticamente a quien
        ganó más de ${fmt(AJUSTE_LIMITE_ART97)}, a quien inició labores después del 1 de enero
        y a quien dejó de prestar servicios antes del 1 de diciembre (Art. 97, penúltimo párrafo).
      </p>
    </div>

    ${!_AA.filas.length ? `
      <div class="empty-state">
        <div class="empty-state-icon"><svg class="ic"><use href="#i-file"></use></svg></div>
        <div class="empty-state-title">Sin recibos de nómina en ${_AA.anio}</div>
        <p style="font-size:.85rem;color:var(--text-muted);margin-top:8px;">Genera la nómina del ejercicio antes de calcular el ajuste anual.</p>
      </div>` : `

    <div class="kpi-grid animate-in" style="margin-bottom:16px;">
      <div class="kpi-card">
        <div class="kpi-icon"><svg class="ic"><use href="#i-user"></use></svg></div>
        <div class="kpi-num">${aplicables.length}</div>
        <div class="kpi-label">Con ajuste aplicable</div>
      </div>
      <div class="kpi-card" title="Falta ISR por retener: se descuenta en la nómina de diciembre">
        <div class="kpi-icon"><svg class="ic"><use href="#i-bar"></use></svg></div>
        <div class="kpi-num" style="font-size:1.2rem;color:var(--red-warn);">${fmt(totalCargo)}</div>
        <div class="kpi-label">A cargo (${aCargo.length} trabajadores)</div>
      </div>
      <div class="kpi-card" title="Se retuvo ISR de más: se compensa en la nómina de diciembre">
        <div class="kpi-icon"><svg class="ic"><use href="#i-wallet"></use></svg></div>
        <div class="kpi-num" style="font-size:1.2rem;color:var(--green-ok);">${fmt(totalFavor)}</div>
        <div class="kpi-label">A favor (${aFavor.length} trabajadores)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon"><svg class="ic"><use href="#i-alert"></use></svg></div>
        <div class="kpi-num">${_AA.filas.length - aplicables.length}</div>
        <div class="kpi-label">Excluidos (Art. 97)</div>
      </div>
    </div>

    <div class="card animate-in">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Trabajador</th>
              <th title="Percepciones gravadas del ejercicio, sin la parte exenta del Art. 93 LISR">Base gravable</th>
              <th title="Tarifa anual Art. 152 LISR, menos el subsidio al empleo acreditado en el año">ISR del ejercicio</th>
              <th title="Subsidio al empleo acreditado durante el ejercicio">Subsidio</th>
              <th>ISR retenido</th>
              <th title="Positivo: falta retener. Negativo: se retuvo de más.">Diferencia</th>
              <th>Aplica</th>
            </tr>
          </thead>
          <tbody>
            ${_AA.filas.map(f => `
              <tr style="${f.aplica ? '' : 'opacity:.55;'}">
                <td><strong>${f.nombre}</strong>
                  ${f.motivoExclusion ? `<div style="font-size:.72rem;color:var(--text-muted);">${f.motivoExclusion}</div>` : ''}
                </td>
                <td>${fmt(f.base)}${f.sinDesglose ? ' <span title="Sin la migración 49 no se puede separar la parte exenta: esta base incluye ingresos exentos y sobreestima el impuesto." style="color:var(--amber-warn);">!</span>' : ''}</td>
                <td>${fmt(f.isrAnualNeto)}</td>
                <td style="color:var(--text-muted);">${fmt(f.subsidio)}</td>
                <td>${fmt(f.isrRetenido)}</td>
                <td style="font-weight:700;color:${!f.aplica ? 'var(--text-muted)' : f.diferencia > 0 ? 'var(--red-warn)' : f.diferencia < 0 ? 'var(--green-ok)' : 'var(--text-muted)'};">
                  ${f.diferencia > 0 ? '+' : ''}${fmt(f.diferencia)}
                  ${f.aplica && f.diferencia !== 0 ? `<div style="font-size:.7rem;font-weight:400;color:var(--text-muted);">${f.diferencia > 0 ? 'a cargo' : 'a favor'}</div>` : ''}
                </td>
                <td>
                  ${f.motivoExclusion && !_AA.excluidos.has(f.id)
                    ? '<span class="badge">Excluido por ley</span>'
                    : `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:.8rem;">
                         <input type="checkbox" ${_AA.excluidos.has(f.id) ? '' : 'checked'}
                                onchange="_aaToggleExcluir('${f.id}')" />
                         ${_AA.excluidos.has(f.id) ? 'No' : 'Sí'}
                       </label>`}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="alert alert-info" style="margin-top:14px;"><svg class="ic" style="flex-shrink:0;"><use href="#i-info"></use></svg>
        <span>Al aplicar, la diferencia se escribe en el recibo de diciembre de cada trabajador
        (se recalcula su neto). Si después regeneras la nómina de diciembre, el ajuste se borra
        y hay que volver a aplicarlo.</span>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:14px;">
        <button class="btn-primary" onclick="_aaAplicar()" ${!aplicables.filter(f => f.diferencia !== 0).length ? 'disabled' : ''}>
          Aplicar ajuste en la nómina de diciembre
        </button>
      </div>
    </div>`}
  `;
}

async function _aaCambiarAnio(anio) {
  _AA.anio = parseInt(anio);
  _AA.excluidos.clear();
  await renderAjusteAnual();
}

async function _aaToggleExcluir(id) {
  if (_AA.excluidos.has(id)) _AA.excluidos.delete(id);
  else _AA.excluidos.add(id);
  await renderAjusteAnual();
}

// ═══════════════════════════════════════════════════════════════════════════
//  APLICACIÓN EN LA NÓMINA DE DICIEMBRE
// ═══════════════════════════════════════════════════════════════════════════

async function _aaAplicar() {
  const aplicables = _AA.filas.filter(f => f.aplica && f.diferencia !== 0);
  if (!aplicables.length) return;

  // Período de diciembre del ejercicio: el último que termina en diciembre
  const { data: periodos, error: errP } = await _sbAA()
    .from('periodos_nomina')
    .select('id, nombre, cerrado, fecha_fin')
    .eq('empresa_id', CTX.empresa.id)
    .gte('fecha_fin', `${_AA.anio}-12-01`)
    .lte('fecha_fin', `${_AA.anio}-12-31`)
    .order('fecha_fin', { ascending: false });
  if (errP) { showToast('Error al buscar la nómina de diciembre: ' + errP.message, 'error'); return; }

  const periodo = (periodos || []).find(p => !p.cerrado);
  if (!periodo) {
    showToast((periodos || []).length
      ? `La nómina de diciembre ${_AA.anio} ya está cerrada. Reábrela para aplicar el ajuste.`
      : `No existe un período de nómina de diciembre ${_AA.anio}. Créalo primero.`, 'error', 7000);
    return;
  }

  const totalCargo = aplicables.filter(f => f.diferencia > 0).reduce((s, f) => s + f.diferencia, 0);
  const totalFavor = aplicables.filter(f => f.diferencia < 0).reduce((s, f) => s + Math.abs(f.diferencia), 0);

  showModal(`
    <div class="modal animate-in" style="max-width:460px;">
      <div class="modal-header">
        <div class="modal-title">Aplicar ajuste anual ${_AA.anio}</div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div style="padding:20px 24px;">
        <p style="font-size:.9rem;color:var(--text-secondary);margin-bottom:16px;">
          Se modificará el recibo de <strong>${periodo.nombre}</strong> de ${aplicables.length} trabajador${aplicables.length !== 1 ? 'es' : ''}, recalculando su neto.
        </p>
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px 16px;display:grid;gap:10px;font-size:.88rem;">
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Retención adicional (a cargo)</span><strong style="color:var(--red-warn);">${fmt(totalCargo)}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Compensación (a favor)</span><strong style="color:var(--green-ok);">${fmt(totalFavor)}</strong></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="closeModal();_aaConfirmarAplicar('${periodo.id}')">Aplicar</button>
      </div>
    </div>
  `);
}

async function _aaConfirmarAplicar(periodoId) {
  const aplicables = _AA.filas.filter(f => f.aplica && f.diferencia !== 0);

  const { data: recibos, error: errR } = await _sbAA()
    .from('recibos_nomina')
    .select('id, trabajador_id, total_deducciones, neto_pagar, ajuste_anual_isr')
    .eq('periodo_id', periodoId);
  if (errR) {
    if (/ajuste_anual_isr/i.test(errR.message || '')) {
      showToast('Falta aplicar la migración 32_migration_fiscal_patronal.sql en Supabase.', 'error', 7000);
      return;
    }
    showToast('Error: ' + errR.message, 'error'); return;
  }

  const porTrab = {};
  (recibos || []).forEach(r => { porTrab[r.trabajador_id] = r; });

  let aplicados = 0, sinRecibo = 0;
  for (const f of aplicables) {
    const r = porTrab[f.id];
    if (!r) { sinRecibo++; continue; }
    // Revertir un ajuste previo antes de aplicar el nuevo (idempotente)
    const previo   = parseFloat(r.ajuste_anual_isr || 0);
    const deduccion = parseFloat(r.total_deducciones || 0) - previo + f.diferencia;
    const neto      = parseFloat(r.neto_pagar || 0) + previo - f.diferencia;

    const { error } = await _sbAA().from('recibos_nomina').update({
      ajuste_anual_isr:  f.diferencia,
      total_deducciones: parseFloat(deduccion.toFixed(2)),
      neto_pagar:        parseFloat(neto.toFixed(2)),
    }).eq('id', r.id);
    if (error) { console.warn('ajuste anual:', f.nombre, error.message); continue; }
    aplicados++;
  }

  // Recalcular el total del período
  const { data: refrescados } = await _sbAA()
    .from('recibos_nomina').select('neto_pagar').eq('periodo_id', periodoId);
  await _sbAA().from('periodos_nomina').update({
    total_neto: parseFloat((refrescados || []).reduce((s, r) => s + parseFloat(r.neto_pagar || 0), 0).toFixed(2)),
  }).eq('id', periodoId);

  showToast(`Ajuste anual aplicado a ${aplicados} trabajador${aplicados !== 1 ? 'es' : ''}.` +
    (sinRecibo ? ` ${sinRecibo} sin recibo en diciembre (omitidos).` : ''), 'success', 6000);
  await renderAjusteAnual();
}

// ═══════════════════════════════════════════════════════════════════════════
//  EXPORTACIÓN
// ═══════════════════════════════════════════════════════════════════════════

function _aaExportarXLSX() {
  if (!_AA.filas.length || !window.XLSX) { showToast('Sin datos para exportar.', 'error'); return; }
  const ws = XLSX.utils.json_to_sheet(_AA.filas.map(f => ({
    'Trabajador':            f.nombre,
    'Ingresos del ejercicio': f.ingresoTotal,
    'Base gravable (Art. 93 aplicado)': f.base,
    'ISR tarifa anual (Art. 152)': f.isrAnual,
    'Subsidio al empleo acreditado': f.subsidio,
    'ISR del ejercicio neto de subsidio': f.isrAnualNeto,
    'ISR retenido en el año': f.isrRetenido,
    'Diferencia':             f.diferencia,
    'Resultado':              !f.aplica ? 'No aplica' : f.diferencia > 0 ? 'A cargo' : f.diferencia < 0 ? 'A favor' : 'Sin diferencia',
    'Motivo de exclusión':    f.motivoExclusion || '',
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Ajuste anual ${_AA.anio}`);
  XLSX.writeFile(wb, `Ajuste_anual_ISR_${_AA.anio}_${CTX.empresa.nombre}.xlsx`);
}
