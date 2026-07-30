/**
 * Capital Humano MX — Módulo PTU
 * Art. 117-131 LFT: 10% utilidad repartible; 50% igual por días / 50% proporcional al salario.
 */

let _PTU = { tab: 1, ejercicios: [], detalle: [] };
const _sbPTU = () => window.supabase;

async function renderPTU() {
  const _gen = typeof _navGen !== 'undefined' ? _navGen : 0;
  _PTU.tab = 1; // Resetear al entrar al módulo
  try {
    const { data } = await _sbPTU().from('ptu_ejercicios')
      .select('*')
      .eq('empresa_id', CTX.empresa.id)
      .order('ejercicio', { ascending: false });
    _PTU.ejercicios = data || [];
    if (typeof _navStale === 'function' && _navStale(_gen)) return;
    _renderShellPTU();
    _renderPTUTab();
  } catch(e) { showError(e); }
}

function _renderShellPTU() {
  const main = document.getElementById('main-view');
  main.innerHTML = `
    <div class="view-header animate-in">
      <div>
        <div class="view-title">PTU</div>
        <div class="view-subtitle">Participación de los Trabajadores en las Utilidades · Art. 117-131 LFT — 50% días trabajados / 50% salarios devengados</div>
      </div>
    </div>
    <div class="tabs animate-in">
      <button class="tab-btn ${_PTU.tab===1?'active':''}" onclick="switchPTUTab(1)">Calcular PTU</button>
      <button class="tab-btn ${_PTU.tab===2?'active':''}" onclick="switchPTUTab(2)">Historial</button>
    </div>
    <div id="ptu-content" class="animate-in"></div>
  `;
}

async function switchPTUTab(n) {
  _PTU.tab = n;
  document.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', i+1===n));
  _renderPTUTab();
}

function _renderPTUTab() {
  const c = document.getElementById('ptu-content');
  if (!c) return;
  _PTU.tab === 1 ? _renderPTUCalc(c) : _renderPTUHistorial(c);
}

function _renderPTUCalc(c) {
  const anioActual = new Date().getFullYear() - 1; // PTU se paga del año anterior
  c.innerHTML = `
    <div class="card animate-in" style="max-width:560px;">
      <div class="card-header"><span class="card-title">Datos del ejercicio fiscal</span></div>
      <div class="form-grid" style="margin-top:14px;">
        <div class="form-group">
          <label class="form-label" for="ptu-anio">Año fiscal <span class="req">*</span></label>
          <input id="ptu-anio" type="number" class="form-input" value="${anioActual}" min="2020" max="${new Date().getFullYear()}" required aria-required="true" />
        </div>
        <div class="form-group">
          <label class="form-label" for="ptu-utilidad">Utilidad repartible (MXN) <span class="req">*</span></label>
          <input id="ptu-utilidad" type="number" class="form-input" min="0" step="0.01" placeholder="Ej. 500000.00" required aria-required="true" />
          <div class="helper-text">10% de la utilidad fiscal declarada ante SAT (Art. 117 LFT)</div>
        </div>
      </div>
      <div id="ptu-calc-error" class="error-msg" role="alert" style="display:none;margin-top:10px;"></div>
      <div style="display:flex;justify-content:flex-end;margin-top:16px;">
        <button class="btn-primary" onclick="calcularPTU()">Calcular distribución</button>
      </div>
    </div>
    <div id="ptu-resultado"></div>
  `;
}

async function calcularPTU() {
  const anio     = parseInt(document.getElementById('ptu-anio')?.value);
  const utilidad = parseFloat(document.getElementById('ptu-utilidad')?.value);
  const err      = document.getElementById('ptu-calc-error');
  const res      = document.getElementById('ptu-resultado');
  err.style.display = 'none';

  if (!anio || !utilidad || utilidad <= 0) {
    err.textContent = 'Ingresa el año fiscal y la utilidad repartible.';
    err.style.display = '';
    return;
  }

  res.innerHTML = `<div class="loading" style="margin-top:20px;"><div class="spinner"></div> Consultando nómina del año ${anio}…</div>`;

  try {
    // Consultar recibos del año para calcular días trabajados y salarios
    const { data: periodos } = await _sbPTU().from('periodos_nomina')
      .select('id,fecha_inicio')
      .eq('empresa_id', CTX.empresa.id)
      .gte('fecha_inicio', `${anio}-01-01`)
      .lte('fecha_inicio', `${anio}-12-31`);

    const periodoIds = (periodos || []).map(p => p.id);

    let recibos = [];
    if (periodoIds.length) {
      const { data, error } = await _sbPTU().from('recibos_nomina')
        .select('trabajador_id,dias_laborados,salario_base,trabajadores(nombre,salario_mensual,periodo_salario)')
        .in('periodo_id', periodoIds);
      if (error) throw error;
      recibos = data || [];
    }

    // Agrupar por trabajador
    const map = {};
    for (const r of recibos) {
      if (!map[r.trabajador_id]) map[r.trabajador_id] = {
        id: r.trabajador_id, nombre: r.trabajadores?.nombre || '—', dias: 0, salarioAcum: 0, periodos: 0,
        salarioMensualOrd: calcSalarioDiario(parseFloat(r.trabajadores?.salario_mensual) || 0,
                                             r.trabajadores?.periodo_salario || 'mensual') * 30,
      };
      map[r.trabajador_id].dias        += r.dias_laborados || 0;
      map[r.trabajador_id].salarioAcum += parseFloat(r.salario_base) || 0;
      map[r.trabajador_id].periodos++;
    }
    const trabajadores = Object.values(map);

    if (!trabajadores.length) {
      res.innerHTML = `<div class="alert alert-warn" style="margin-top:16px;"><svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg><span>No se encontraron recibos de nómina para el año ${anio}. Genera la nómina del año antes de calcular el PTU.</span></div>`;
      return;
    }

    const totalDias    = trabajadores.reduce((a,t) => a + t.dias, 0);
    const totalSalario = trabajadores.reduce((a,t) => a + t.salarioAcum, 0);
    const parteDias    = utilidad * 0.5;
    const parteSalario = utilidad * 0.5;
    const factorDias   = totalDias    > 0 ? parteDias    / totalDias    : 0;
    const factorSal    = totalSalario > 0 ? parteSalario / totalSalario : 0;

    // Exención de ISR: 15 UMA (Art. 93 fr. XIV LISR); el excedente se grava
    // con el procedimiento del Art. 174 RLISR. Tope individual: 3 meses de
    // salario (Art. 127 fr. VIII LFT, reforma 2021) — el remanente no se paga.
    const uma        = _umaVigente();
    const exencionPTU = 15 * uma;

    const detalle = trabajadores.map(t => {
      const sdProm  = t.periodos > 0 ? t.salarioAcum / t.periodos : 0;
      const pd      = t.dias      * factorDias;
      const ps      = t.salarioAcum * factorSal;
      const bruto   = pd + ps;
      const tope3m  = t.salarioMensualOrd > 0 ? t.salarioMensualOrd * 3 : Infinity;
      const topado  = bruto > tope3m;
      const total   = parseFloat(Math.min(bruto, tope3m).toFixed(2));
      const exento  = parseFloat(Math.min(total, exencionPTU).toFixed(2));
      const gravado = parseFloat(Math.max(0, total - exento).toFixed(2));
      const isr     = typeof calcISRArt174 === 'function'
        ? calcISRArt174(gravado, t.salarioMensualOrd).isr : 0;
      const neto    = parseFloat((total - isr).toFixed(2));
      return { ...t, sdProm, pd, ps, bruto, topado, total, exento, gravado, isr, neto };
    });

    const totalPTU  = detalle.reduce((a,d) => a + d.total, 0);
    const totalISR  = detalle.reduce((a,d) => a + d.isr, 0);
    const totalNeto = detalle.reduce((a,d) => a + d.neto, 0);
    const remanente = detalle.reduce((a,d) => a + Math.max(0, d.bruto - d.total), 0);

    res.innerHTML = `
      <div class="card animate-in" style="margin-top:16px;">
        <div class="card-header">
          <span class="card-title">Distribución PTU ${anio} — Utilidad: ${fmt(utilidad)}</span>
          <button class="btn-secondary btn-sm" onclick="_exportarPTU()">Excel</button>
        </div>
        <div class="kpi-grid" style="margin:12px 0 16px;">
          <div class="kpi-card"><div class="kpi-icon"><svg class="ic"><use href="#i-calendar"></use></svg></div><div class="kpi-num">${totalDias.toLocaleString()}</div><div class="kpi-label">Total días trabajados</div></div>
          <div class="kpi-card"><div class="kpi-icon"><svg class="ic"><use href="#i-wallet"></use></svg></div><div class="kpi-num">${fmt(totalSalario)}</div><div class="kpi-label">Masa salarial del año</div></div>
          <div class="kpi-card"><div class="kpi-icon"><svg class="ic"><use href="#i-pie"></use></svg></div><div class="kpi-num">${fmt(totalPTU)}</div><div class="kpi-label">PTU a repartir (con tope 3 meses)</div></div>
          <div class="kpi-card" title="ISR del excedente de 15 UMA (${fmt(exencionPTU)}), procedimiento Art. 174 RLISR"><div class="kpi-icon"><svg class="ic"><use href="#i-bar"></use></svg></div><div class="kpi-num" style="color:var(--red-warn);">${fmt(totalISR)}</div><div class="kpi-label">ISR a retener</div></div>
          <div class="kpi-card"><div class="kpi-icon"><svg class="ic"><use href="#i-wallet"></use></svg></div><div class="kpi-num">${fmt(totalNeto)}</div><div class="kpi-label">Neto a pagar</div></div>
        </div>
        ${remanente > 0 ? `
        <div class="alert alert-info" style="margin-bottom:12px;"><svg class="ic" style="flex-shrink:0;"><use href="#i-info"></use></svg>
          <span>Se aplicó el <strong>tope de 3 meses de salario</strong> (Art. 127 fr. VIII LFT) a los trabajadores marcados con .
          Remanente no repartido por tope: <strong>${fmt(remanente)}</strong>. Verifica con tu contador si aplica el promedio de PTU de los últimos 3 años como tope alternativo más favorable.</span>
        </div>` : ''}
        <div class="table-wrap">
          <table class="data-table" id="ptu-tabla-resultado">
            <thead>
              <tr><th>Trabajador</th><th>Días</th><th>Salario acumulado</th><th>Parte días</th><th>Parte salario</th><th>Total PTU</th><th title="Exento hasta 15 UMA (Art. 93 fr. XIV LISR)">Exento</th><th title="Art. 174 RLISR">ISR</th><th>Neto</th></tr>
            </thead>
            <tbody>
              ${detalle.map(d => `
                <tr>
                  <td><strong>${escapeHtml(d.nombre)}</strong></td>
                  <td>${d.dias}</td>
                  <td>${fmt(d.salarioAcum)}</td>
                  <td>${fmt(d.pd)}</td>
                  <td>${fmt(d.ps)}</td>
                  <td><strong>${fmt(d.total)}</strong>${d.topado ? ' <span title="Topado a 3 meses de salario (Art. 127 fr. VIII LFT)"></span>' : ''}</td>
                  <td style="color:var(--text-muted);">${fmt(d.exento)}</td>
                  <td style="color:${d.isr > 0 ? 'var(--red-warn)' : 'var(--text-muted)'};">${fmt(d.isr)}</td>
                  <td><strong>${fmt(d.neto)}</strong></td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr style="font-weight:700;border-top:2px solid var(--border);">
                <td>TOTAL</td>
                <td>${totalDias}</td>
                <td>${fmt(totalSalario)}</td>
                <td>${fmt(parteDias)}</td>
                <td>${fmt(parteSalario)}</td>
                <td>${fmt(totalPTU)}</td>
                <td></td>
                <td>${fmt(totalISR)}</td>
                <td>${fmt(totalNeto)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:16px;">
          <button class="btn-primary" onclick="_guardarEjercicioPTU(${anio},${utilidad},${factorDias},${factorSal})">Guardar ejercicio</button>
        </div>
      </div>
    `;
    window._ptuDetalleActual = { anio, utilidad, detalle, factorDias, factorSal };
  } catch(e) {
    res.innerHTML = '';
    err.textContent = e.message;
    err.style.display = '';
  }
}

async function _guardarEjercicioPTU(anio, utilidad, factorDias, factorSal) {
  const d = window._ptuDetalleActual;
  if (!d) return;
  try {
    const { data: ej, error: ejErr } = await _sbPTU().from('ptu_ejercicios').upsert({
      empresa_id: CTX.empresa.id,
      ejercicio: anio, utilidad_repartible: utilidad,
      factor_dias: factorDias, factor_salario: factorSal,
      estado: 'calculado',
    }, { onConflict: 'empresa_id,ejercicio' }).select().single();
    if (ejErr) throw ejErr;

    const rows = d.detalle.map(t => ({
      ptu_ejercicio_id: ej.id,
      trabajador_id: t.id,
      dias_trabajados: t.dias,
      salario_promedio: parseFloat(t.sdProm.toFixed(2)),
      parte_dias:    parseFloat(t.pd.toFixed(2)),
      parte_salario: parseFloat(t.ps.toFixed(2)),
      total_ptu:     parseFloat(t.total.toFixed(2)),
    }));
    // Borrar detalle anterior para este ejercicio y reinsertar
    await _sbPTU().from('ptu_detalle').delete().eq('ptu_ejercicio_id', ej.id);
    const { error: dErr } = await _sbPTU().from('ptu_detalle').insert(rows);
    if (dErr) throw dErr;

    showToast(`Ejercicio PTU ${anio} guardado.`, 'success');
    _PTU.tab = 2;
    await renderPTU();
  } catch(e) { alert('Error al guardar: ' + e.message); }
}

function _exportarPTU() {
  const d = window._ptuDetalleActual;
  if (!d || !window.XLSX) { alert('Datos no disponibles o XLSX no cargado.'); return; }
  const ws = XLSX.utils.json_to_sheet(d.detalle.map(t => ({
    'Trabajador':         t.nombre,
    'Días trabajados':    t.dias,
    'Salario acumulado':  parseFloat(t.salarioAcum.toFixed(2)),
    'Parte días (50%)':   parseFloat(t.pd.toFixed(2)),
    'Parte salario (50%)': parseFloat(t.ps.toFixed(2)),
    'PTU bruta':          parseFloat(t.bruto.toFixed(2)),
    'Tope 3 meses aplicado': t.topado ? 'SÍ' : 'No',
    'Total PTU':          parseFloat(t.total.toFixed(2)),
    'Exento (15 UMA)':    t.exento,
    'Gravado':            t.gravado,
    'ISR (Art. 174 RLISR)': t.isr,
    'Neto a pagar':       t.neto,
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `PTU ${d.anio}`);
  XLSX.writeFile(wb, `PTU_${d.anio}_${CTX.empresa.nombre}.xlsx`);
}

function _renderPTUHistorial(c) {
  if (!_PTU.ejercicios.length) {
    c.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><svg class="ic"><use href="#i-pie"></use></svg></div><div class="empty-state-title">Sin ejercicios PTU guardados</div></div>`;
    return;
  }
  const ESTADO = {
    borrador:  '<span style="background:rgba(127,140,141,.15);color:var(--text-muted);border:1px solid var(--border);border-radius:100px;padding:2px 10px;font-size:.75rem;">Borrador</span>',
    calculado: '<span style="background:rgba(39,174,96,.15);color:var(--green-ok);border:1px solid rgba(39,174,96,.3);border-radius:100px;padding:2px 10px;font-size:.75rem;font-weight:700;">Calculado</span>',
    pagado:    '<span style="background:rgba(44,111,176,.15);color:var(--blue-accent);border:1px solid rgba(44,111,176,.3);border-radius:100px;padding:2px 10px;font-size:.75rem;font-weight:700;">Pagado</span>',
  };
  c.innerHTML = `
    <div class="table-wrap animate-in">
      <table class="data-table">
        <thead><tr><th>Año</th><th>Utilidad repartible</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${_PTU.ejercicios.map(e => `
            <tr>
              <td><strong>${e.ejercicio}</strong></td>
              <td>${fmt(e.utilidad_repartible)}</td>
              <td>${ESTADO[e.estado] || e.estado}</td>
              <td>
                ${e.estado === 'calculado' ? `<button class="btn-sm" style="background:rgba(44,111,176,.12);color:var(--blue-accent);border:1px solid rgba(44,111,176,.3);" onclick="_marcarPTUPagado('${e.id}')">Marcar pagado</button>` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function _marcarPTUPagado(id) {
  if (!(await showConfirmacion('¿Marcar este ejercicio PTU como pagado?'))) return;
  try {
    await _sbPTU().from('ptu_ejercicios').update({ estado: 'pagado' }).eq('id', id);
    await renderPTU();
  } catch(e) { alert('Error: ' + e.message); }
}
