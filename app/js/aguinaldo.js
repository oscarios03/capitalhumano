/**
 * Capital Humano MX — Módulo Aguinaldo
 * Art. 87 LFT: mínimo 15 días de salario; trabajadores con menos de un año reciben proporcional.
 */

const _sbAG = () => window.supabase;

async function renderAguinaldo() {
  try {
    const main = document.getElementById('main-view');
    main.innerHTML = `<div class="loading"><div class="spinner"></div> Cargando…</div>`;

    const { data: trabajadores } = await _sbAG()
      .from('trabajadores')
      .select('id,nombre,fecha_ingreso,salario_mensual,periodo_salario,estado')
      .eq('empresa_id', CTX.empresa.id)
      .eq('estado', 'activo')
      .order('nombre');

    const anioActual = new Date().getFullYear();
    const hoy        = new Date();
    const limite20dic = new Date(anioActual, 11, 20);
    const diasParaLimite = Math.ceil((limite20dic - hoy) / 86400000);

    // Días de aguinaldo configurados por la empresa (mínimo de ley: 15)
    const prest = prestacionesEmpresa();
    const diasAgEmpresa = prest.aguinaldoDias;

    // Exención de ISR: 30 UMA (Art. 93 fr. XIV LISR); el excedente se grava
    // con el procedimiento del Art. 174 RLISR (tasa efectiva, ver nomina.js)
    const uma       = typeof _umaVigente === 'function' ? _umaVigente() : 117.31;
    const exencionAg = 30 * uma;

    const rows = (trabajadores || []).map(t => {
      const ingreso      = new Date(t.fecha_ingreso + 'T00:00:00');
      const inicioAnio   = new Date(anioActual, 0, 1);
      const finAnio      = new Date(anioActual, 11, 31);
      const inicio       = ingreso > inicioAnio ? ingreso : inicioAnio;
      const diasTrab     = diasEnAnoCalendario ? diasEnAnoCalendario(inicio, finAnio) : 365;
      const diasAguinaldo = parseFloat(((diasTrab / 365) * diasAgEmpresa).toFixed(4));
      const sd           = calcSalarioDiario(t.salario_mensual, t.periodo_salario || 'mensual');
      const monto        = sd * diasAguinaldo;
      const exento       = parseFloat(Math.min(monto, exencionAg).toFixed(2));
      const gravado      = parseFloat(Math.max(0, monto - exento).toFixed(2));
      const isr          = typeof calcISRArt174 === 'function'
        ? calcISRArt174(gravado, sd * 30).isr
        : 0;
      const neto         = parseFloat((monto - isr).toFixed(2));
      return { ...t, sd, diasTrab, diasAguinaldo, monto, exento, gravado, isr, neto };
    });

    const totalMonto = rows.reduce((a,r) => a + r.monto, 0);
    const totalISR   = rows.reduce((a,r) => a + r.isr, 0);
    const totalNeto  = rows.reduce((a,r) => a + r.neto, 0);

    main.innerHTML = `
      <div class="view-header animate-in">
        <div>
          <div class="view-title">Aguinaldo</div>
          <div class="view-subtitle">Art. 87 LFT — ${diasAgEmpresa} días de salario${diasAgEmpresa > 15 ? ' (superior al mínimo de ley, configurado en Mi Empresa)' : ' (mínimo de ley)'}, pago antes del 20 de diciembre</div>
        </div>
        <button class="btn-primary" onclick="_generarPeriodoAguinaldo()"><svg class="ic"><use href="#i-plus"></use></svg> Generar período de aguinaldo</button>
      </div>

      <div class="kpi-grid animate-in">
        <div class="kpi-card">
          <div class="kpi-icon"><svg class="ic"><use href="#i-user"></use></svg></div>
          <div class="kpi-num">${rows.length}</div>
          <div class="kpi-label">Trabajadores activos</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon"><svg class="ic"><use href="#i-wallet"></use></svg></div>
          <div class="kpi-num">${fmt(totalMonto)}</div>
          <div class="kpi-label">Total aguinaldo bruto ${anioActual}</div>
        </div>
        <div class="kpi-card" title="ISR del excedente de 30 UMA (${fmt(exencionAg)}) calculado con el procedimiento del Art. 174 RLISR">
          <div class="kpi-icon"><svg class="ic"><use href="#i-bar"></use></svg></div>
          <div class="kpi-num" style="color:var(--red-warn);">${fmt(totalISR)}</div>
          <div class="kpi-label">ISR a retener (Art. 174 RLISR)</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon"><svg class="ic"><use href="#i-wallet"></use></svg></div>
          <div class="kpi-num">${fmt(totalNeto)}</div>
          <div class="kpi-label">Neto a pagar</div>
        </div>
        <div class="kpi-card ${diasParaLimite < 0 ? 'kpi-alert' : diasParaLimite < 30 ? '' : ''}">
          <div class="kpi-icon"><svg class="ic"><use href="#i-calendar"></use></svg></div>
          <div class="kpi-num" style="font-size:1.1rem;color:${diasParaLimite < 0 ? 'var(--red-warn)' : diasParaLimite < 30 ? '#f39c12' : 'inherit'}">
            ${diasParaLimite < 0 ? 'VENCIDO' : diasParaLimite === 0 ? 'HOY' : diasParaLimite + ' días'}
          </div>
          <div class="kpi-label">Para vencimiento (20 dic)</div>
        </div>
      </div>

      ${diasParaLimite < 30 && diasParaLimite >= 0 ? `
        <div class="alert alert-warn animate-in">
          <span>⚠️</span>
          <span>El aguinaldo debe pagarse antes del <strong>20 de diciembre</strong>. Quedan <strong>${diasParaLimite} días</strong>.</span>
        </div>
      ` : diasParaLimite < 0 ? `
        <div class="alert alert-danger animate-in">
          <span>🔴</span>
          <span>El plazo para pagar el aguinaldo <strong>ya venció</strong> (20 de diciembre de ${anioActual}).</span>
        </div>
      ` : ''}

      <div class="card animate-in" style="margin-top:8px;">
        <div class="card-header">
          <span class="card-title">Cálculo de aguinaldo ${anioActual}</span>
        </div>
        <div class="table-wrap" style="margin-top:12px;">
          <table class="data-table">
            <thead>
              <tr><th>Trabajador</th><th>Fecha ingreso</th><th>Días ${anioActual}</th><th>Días aguinaldo</th><th>Salario diario</th><th>Bruto</th><th title="Exento hasta 30 UMA (Art. 93 fr. XIV LISR)">Exento</th><th>Gravado</th><th title="Art. 174 RLISR">ISR</th><th>Neto</th></tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td><strong>${r.nombre}</strong></td>
                  <td>${formatDateShort(r.fecha_ingreso)}</td>
                  <td>${r.diasTrab}</td>
                  <td>${r.diasAguinaldo.toFixed(2)}</td>
                  <td>${fmt(r.sd)}</td>
                  <td>${fmt(r.monto)}</td>
                  <td style="color:var(--text-muted);">${fmt(r.exento)}</td>
                  <td style="color:var(--text-muted);">${fmt(r.gravado)}</td>
                  <td style="color:${r.isr > 0 ? 'var(--red-warn)' : 'var(--text-muted)'};">${fmt(r.isr)}</td>
                  <td><strong>${fmt(r.neto)}</strong></td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr style="font-weight:700;border-top:2px solid var(--border);">
                <td colspan="5" style="text-align:right;padding-right:16px;">TOTAL</td>
                <td>${fmt(totalMonto)}</td>
                <td colspan="2"></td>
                <td>${fmt(totalISR)}</td>
                <td>${fmt(totalNeto)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div style="margin-top:10px;font-size:.78rem;color:var(--text-muted);">
        * Días calculados desde el 1 de enero de ${anioActual} (o fecha de ingreso si fue posterior) hasta el 31 de diciembre.
        Trabajadores con menos de un año reciben proporción según días laborados.
      </div>
    `;

    window._aguinaldoRows = rows;
  } catch(e) { showError(e); }
}

async function _generarPeriodoAguinaldo() {
  const rows = window._aguinaldoRows;
  if (!rows?.length) { alert('No hay datos de aguinaldo calculados.'); return; }
  if (!confirm(`¿Generar período de aguinaldo para ${rows.length} trabajadores?\n\nSe creará un período en Nómina con los montos calculados.`)) return;

  const anio = new Date().getFullYear();
  const nombre = `Aguinaldo ${anio}`;

  try {
    // Crear período
    const { data: periodo, error: pErr } = await _sbAG().from('periodos_nomina').insert({
      empresa_id: CTX.empresa.id,
      nombre,
      fecha_inicio: `${anio}-12-01`,
      fecha_fin:    `${anio}-12-20`,
    }).select().single();
    if (pErr) throw pErr;

    // Upsert recibos: bruto en aguinaldo_prop, ISR (Art. 174 RLISR) retenido
    const recibos = rows.map(r => ({
      empresa_id:     CTX.empresa.id,
      periodo_id:     periodo.id,
      trabajador_id:  r.id,
      dias_laborados: 0, // no cubre salario ordinario: el período paga solo aguinaldo
      salario_base:   0,
      aguinaldo_prop:     parseFloat(r.monto.toFixed(2)),
      total_percepciones: parseFloat(r.monto.toFixed(2)),
      isr_retenido:       r.isr,
      total_deducciones:  r.isr,
      neto_pagar:         r.neto,
      folio:              `AG-${anio}-${r.id.slice(-6)}`,
      estado:             'borrador',
    }));
    const { error: rErr } = await _sbAG().from('recibos_nomina').upsert(recibos, { onConflict: 'trabajador_id,periodo_id' });
    if (rErr) throw rErr;

    await _sbAG().from('periodos_nomina').update({
      total_percepciones: parseFloat(recibos.reduce((s,x) => s + x.total_percepciones, 0).toFixed(2)),
      total_neto:         parseFloat(recibos.reduce((s,x) => s + x.neto_pagar, 0).toFixed(2)),
    }).eq('id', periodo.id);

    alert(`✅ Período "${nombre}" creado con ${rows.length} recibos.\nPuedes revisarlo en el módulo de Nómina.`);
    navigate('nomina');
  } catch(e) { alert('Error al generar período: ' + e.message); }
}
