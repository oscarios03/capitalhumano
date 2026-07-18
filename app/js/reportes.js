/**
 * Capital Humano MX — Módulo Reportes y Exportaciones
 */

let _REP = { tipo: 'nomina_periodo', periodos: [], trabajadores: [] };
const _sbREP = () => window.supabase;

async function renderReportes() {
  const _gen = typeof _navGen !== 'undefined' ? _navGen : 0;
  try {
    const main = document.getElementById('main-view');
    main.innerHTML = `<div class="loading"><div class="spinner"></div> Cargando…</div>`;

    const [perRes, trabRes] = await Promise.all([
      _sbREP().from('periodos_nomina')
        .select('id,nombre,fecha_inicio,fecha_fin,estado')
        .eq('empresa_id', CTX.empresa.id)
        .order('fecha_inicio', { ascending: false })
        .limit(100),
      _sbREP().from('trabajadores')
        .select('id,nombre,rfc,nss,salario_mensual,periodo_salario,sbc,estado')
        .eq('empresa_id', CTX.empresa.id)
        .order('nombre'),
    ]);
    _REP.periodos     = perRes.data || [];
    _REP.trabajadores = trabRes.data || [];

    if (typeof _navStale === 'function' && _navStale(_gen)) return;
    _renderShellREP();
    _renderREPForm();
  } catch(e) { showError(e); }
}

function _renderShellREP() {
  const main = document.getElementById('main-view');
  main.innerHTML = `
    <div class="view-header animate-in">
      <div>
        <div class="view-title">📈 Reportes y Exportaciones</div>
        <div class="view-subtitle">Nómina, acumulados, constancias y SUA</div>
      </div>
    </div>

    <div class="card animate-in" style="margin-bottom:16px;">
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${[
          ['nomina_periodo',  '💰 Nómina por período'],
          ['acumulado_anual', '📅 Acumulado anual'],
          ['constancia_pdf',  '📄 Constancia PDF'],
          ['sua_imss',        '🏛 SUA / IMSS'],
        ].map(([v,l]) => `
          <button onclick="_repSelTipo('${v}')" id="rep-btn-${v}"
            class="btn-secondary btn-sm ${_REP.tipo===v?'active':''}"
            style="${_REP.tipo===v?'border-color:var(--gold-primary);color:var(--gold-primary);':''}">${l}</button>
        `).join('')}
      </div>
    </div>

    <div id="rep-form" class="animate-in"></div>
    <div id="rep-resultado" class="animate-in"></div>
  `;
  _renderREPForm();
}

function _repSelTipo(t) {
  _REP.tipo = t;
  document.querySelectorAll('[id^="rep-btn-"]').forEach(b => {
    b.classList.remove('active');
    b.style.borderColor = '';
    b.style.color = '';
  });
  const btn = document.getElementById(`rep-btn-${t}`);
  if (btn) { btn.classList.add('active'); btn.style.borderColor='var(--gold-primary)'; btn.style.color='var(--gold-primary)'; }
  document.getElementById('rep-resultado').innerHTML = '';
  _renderREPForm();
}

function _renderREPForm() {
  const c = document.getElementById('rep-form');
  if (!c) return;
  const anioActual = new Date().getFullYear();
  const anios = Array.from({length:6},(_,i) => anioActual - i);

  if (_REP.tipo === 'nomina_periodo') {
    c.innerHTML = `
      <div class="card">
        <div class="form-grid">
          <div class="form-group span-2">
            <label class="form-label" for="rep-periodo">Período de nómina</label>
            <select id="rep-periodo" class="form-select">
              <option value="">— Seleccionar —</option>
              ${_REP.periodos.map(p => `<option value="${p.id}">${escapeHtml(p.nombre)} (${formatDateShort(p.fecha_inicio)} – ${formatDateShort(p.fecha_fin)})</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px;">
          <button class="btn-primary" onclick="_repGenNominaPeriodo()"><svg class="ic"><use href="#i-eye"></use></svg> Ver reporte</button>
        </div>
      </div>
    `;
  } else if (_REP.tipo === 'acumulado_anual') {
    c.innerHTML = `
      <div class="card">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label" for="rep-anio">Año</label>
            <select id="rep-anio" class="form-select">
              ${anios.map(a => `<option value="${a}">${a}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="rep-trab">Trabajador</label>
            <select id="rep-trab" class="form-select">
              <option value="">Todos</option>
              ${_REP.trabajadores.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px;">
          <button class="btn-primary" onclick="_repGenAcumulado()"><svg class="ic"><use href="#i-eye"></use></svg> Ver reporte</button>
        </div>
      </div>
    `;
  } else if (_REP.tipo === 'constancia_pdf') {
    c.innerHTML = `
      <div class="card">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label" for="rep-trab-pdf">Trabajador <span class="req">*</span></label>
            <select id="rep-trab-pdf" class="form-select" required aria-required="true">
              <option value="">— Seleccionar —</option>
              ${_REP.trabajadores.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="rep-anio-pdf">Año</label>
            <select id="rep-anio-pdf" class="form-select">
              ${anios.map(a => `<option value="${a}">${a}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px;">
          <button class="btn-primary" onclick="_repGenConstancia()">📄 Generar PDF</button>
        </div>
      </div>
    `;
  } else if (_REP.tipo === 'sua_imss') {
    c.innerHTML = `
      <div class="card">
        <p style="font-size:.88rem;color:var(--text-muted);margin-bottom:14px;">
          Genera el listado de trabajadores con sus datos para el SUA (Sistema Único de Autodeterminación del IMSS).
        </p>
        <div style="display:flex;gap:8px;">
          <button class="btn-primary" onclick="_repGenSUA()"><svg class="ic"><use href="#i-eye"></use></svg> Ver listado</button>
          <button class="btn-secondary" onclick="_exportarSUAcsv()">⬇ Exportar CSV</button>
        </div>
      </div>
    `;
    _repGenSUA();
  }
}

// ── R1: Nómina por período ────────────────────────────────────────────────────
async function _repGenNominaPeriodo() {
  const periodoId = document.getElementById('rep-periodo')?.value;
  const res = document.getElementById('rep-resultado');
  if (!periodoId) { res.innerHTML = `<div class="alert alert-warn"><span>⚠️</span><span>Selecciona un período.</span></div>`; return; }
  res.innerHTML = `<div class="loading"><div class="spinner"></div> Cargando recibos…</div>`;
  try {
    const { data } = await _sbREP().from('recibos_nomina')
      .select('*,trabajadores(nombre,nss)')
      .eq('periodo_id', periodoId)
      .order('trabajadores(nombre)');
    const periodo = _REP.periodos.find(p => p.id === periodoId);
    window._repDataNomina = data || [];
    const SBC_TOPE = 25 * 113.14;
    res.innerHTML = `
      <div class="card animate-in" style="margin-top:16px;">
        <div class="card-header">
          <span class="card-title">Nómina: ${escapeHtml(periodo?.nombre) || ''}</span>
          <button class="btn-secondary btn-sm" onclick="_exportarNominaXLSX()">⬇ Excel</button>
        </div>
        <div class="table-wrap" style="margin-top:12px;">
          <table class="data-table">
            <thead><tr><th scope="col">Trabajador</th><th scope="col">Días</th><th scope="col">Percepciones</th><th scope="col">IMSS obrero</th><th scope="col">ISR</th><th scope="col">INFONAVIT pat.</th><th scope="col">Otras ded.</th><th scope="col">Neto</th></tr></thead>
            <tbody>
              ${(data||[]).map(r => {
                const sbc = Math.min(r.salario_diario * 30, SBC_TOPE);
                const infoPat = sbc * 0.05;
                const otDed = (r.deducciones_totales||0) - (r.imss_obrero||0) - (r.isr||0);
                return `<tr>
                  <td><strong>${escapeHtml(r.trabajadores?.nombre) || '—'}</strong></td>
                  <td>${r.dias_laborados||0}</td>
                  <td>${fmt(r.percepciones_totales||0)}</td>
                  <td>${fmt(r.imss_obrero||0)}</td>
                  <td>${fmt(r.isr||0)}</td>
                  <td style="color:var(--text-muted);font-size:.82rem;">${fmt(infoPat)}</td>
                  <td>${otDed > 0 ? fmt(otDed) : '—'}</td>
                  <td><strong>${fmt(r.neto_pagar||0)}</strong></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch(e) { res.innerHTML = `<p style="color:var(--red-warn)">${e.message}</p>`; }
}

function _exportarNominaXLSX() {
  if (!window.XLSX || !window._repDataNomina) return;
  const ws = XLSX.utils.json_to_sheet((window._repDataNomina).map(r => ({
    'Trabajador':      r.trabajadores?.nombre || '—',
    'NSS':             r.trabajadores?.nss || '—',
    'Días':            r.dias_laborados || 0,
    'Percepciones':    r.percepciones_totales || 0,
    'IMSS obrero':     r.imss_obrero || 0,
    'ISR':             r.isr || 0,
    'Otras deducciones': Math.max(0, (r.deducciones_totales||0) - (r.imss_obrero||0) - (r.isr||0)),
    'Neto a pagar':    r.neto_pagar || 0,
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Nómina');
  XLSX.writeFile(wb, `Nomina_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ── R2: Acumulado anual ───────────────────────────────────────────────────────
async function _repGenAcumulado() {
  const anio   = parseInt(document.getElementById('rep-anio')?.value);
  const trabId = document.getElementById('rep-trab')?.value;
  const res    = document.getElementById('rep-resultado');
  res.innerHTML = `<div class="loading"><div class="spinner"></div> Cargando…</div>`;
  try {
    const { data: periodos } = await _sbREP().from('periodos_nomina')
      .select('id,nombre,fecha_inicio')
      .eq('empresa_id', CTX.empresa.id)
      .gte('fecha_inicio', `${anio}-01-01`)
      .lte('fecha_inicio', `${anio}-12-31`)
      .order('fecha_inicio');

    let q = _sbREP().from('recibos_nomina')
      .select('*,trabajadores(nombre),periodos_nomina(nombre,fecha_inicio)')
      .in('periodo_id', (periodos||[]).map(p => p.id));
    if (trabId) q = q.eq('trabajador_id', trabId);
    const { data } = await q;

    if (!data?.length) { res.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📅</div><div class="empty-state-title">Sin datos para el período seleccionado</div></div>`; return; }

    window._repDataAcumulado = data;
    const totPer = data.reduce((a,r)=>a+(r.percepciones_totales||0),0);
    const totISR = data.reduce((a,r)=>a+(r.isr||0),0);
    const totIMSS= data.reduce((a,r)=>a+(r.imss_obrero||0),0);
    const totNet = data.reduce((a,r)=>a+(r.neto_pagar||0),0);

    res.innerHTML = `
      <div class="card animate-in" style="margin-top:16px;">
        <div class="card-header">
          <span class="card-title">Acumulado ${anio}${trabId ? ' — ' + escapeHtml(_REP.trabajadores.find(t=>t.id===trabId)?.nombre) : ''}</span>
          <button class="btn-secondary btn-sm" onclick="_exportarAcumuladoXLSX()">⬇ Excel</button>
        </div>
        <div class="table-wrap" style="margin-top:12px;">
          <table class="data-table">
            <thead><tr><th scope="col">Período</th><th scope="col">Trabajador</th><th scope="col">Percepciones</th><th scope="col">ISR</th><th scope="col">IMSS obrero</th><th scope="col">Neto</th></tr></thead>
            <tbody>
              ${data.map(r => `<tr>
                <td>${escapeHtml(r.periodos_nomina?.nombre) || '—'}</td>
                <td>${escapeHtml(r.trabajadores?.nombre) || '—'}</td>
                <td>${fmt(r.percepciones_totales||0)}</td>
                <td>${fmt(r.isr||0)}</td>
                <td>${fmt(r.imss_obrero||0)}</td>
                <td><strong>${fmt(r.neto_pagar||0)}</strong></td>
              </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr style="font-weight:700;border-top:2px solid var(--border);">
                <td colspan="2">TOTAL</td>
                <td>${fmt(totPer)}</td>
                <td>${fmt(totISR)}</td>
                <td>${fmt(totIMSS)}</td>
                <td>${fmt(totNet)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  } catch(e) { res.innerHTML = `<p style="color:var(--red-warn)">${e.message}</p>`; }
}

function _exportarAcumuladoXLSX() {
  if (!window.XLSX || !window._repDataAcumulado) return;
  const ws = XLSX.utils.json_to_sheet(window._repDataAcumulado.map(r => ({
    'Período':      r.periodos_nomina?.nombre || '—',
    'Trabajador':   r.trabajadores?.nombre || '—',
    'Percepciones': r.percepciones_totales || 0,
    'ISR':          r.isr || 0,
    'IMSS obrero':  r.imss_obrero || 0,
    'Neto':         r.neto_pagar || 0,
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Acumulado');
  XLSX.writeFile(wb, `Acumulado_${document.getElementById('rep-anio')?.value || ''}.xlsx`);
}

// ── R3: Constancia PDF ────────────────────────────────────────────────────────
async function _repGenConstancia() {
  const trabId = document.getElementById('rep-trab-pdf')?.value;
  const anio   = parseInt(document.getElementById('rep-anio-pdf')?.value);
  if (!trabId) { alert('Selecciona un trabajador.'); return; }

  try {
    const trab = _REP.trabajadores.find(t => t.id === trabId);
    const { data: periodos } = await _sbREP().from('periodos_nomina')
      .select('id,nombre,fecha_inicio')
      .eq('empresa_id', CTX.empresa.id)
      .gte('fecha_inicio', `${anio}-01-01`)
      .lte('fecha_inicio', `${anio}-12-31`)
      .order('fecha_inicio');

    const { data } = await _sbREP().from('recibos_nomina')
      .select('*,periodos_nomina(nombre,fecha_inicio)')
      .in('periodo_id', (periodos||[]).map(p=>p.id))
      .eq('trabajador_id', trabId);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    const emp = CTX.empresa;

    doc.setFillColor(30,30,40);
    doc.rect(0,0,210,28,'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(14); doc.setFont(undefined,'bold');
    doc.text(emp.nombre || 'Empresa', 14, 12);
    doc.setFontSize(9); doc.setFont(undefined,'normal');
    doc.text(`RFC: ${emp.rfc||''}`, 14, 19);
    doc.text('CONSTANCIA DE PERCEPCIONES Y RETENCIONES', 210/2, 12, {align:'center'});
    doc.text(`Año fiscal: ${anio}`, 210/2, 19, {align:'center'});

    doc.setTextColor(0,0,0);
    doc.setFontSize(10); doc.setFont(undefined,'bold');
    doc.text(`Trabajador: ${trab?.nombre || '—'}`, 14, 36);
    doc.setFont(undefined,'normal');
    doc.text(`RFC: ${trab?.rfc || '—'}  |  NSS: ${trab?.nss || '—'}`, 14, 43);

    const rows = (data||[]).map(r => [
      r.periodos_nomina?.nombre || '—',
      formatDateShort(r.periodos_nomina?.fecha_inicio),
      fmt(r.percepciones_totales||0),
      fmt(r.imss_obrero||0),
      fmt(r.isr||0),
      fmt(r.neto_pagar||0),
    ]);
    const totPer  = (data||[]).reduce((a,r)=>a+(r.percepciones_totales||0),0);
    const totIMSS = (data||[]).reduce((a,r)=>a+(r.imss_obrero||0),0);
    const totISR  = (data||[]).reduce((a,r)=>a+(r.isr||0),0);
    const totNet  = (data||[]).reduce((a,r)=>a+(r.neto_pagar||0),0);
    rows.push(['TOTALES','',fmt(totPer),fmt(totIMSS),fmt(totISR),fmt(totNet)]);

    doc.autoTable({
      startY: 50,
      head: [['Período','Fecha','Percepciones','IMSS obrero','ISR retenido','Neto pagado']],
      body: rows,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [30,30,40], textColor: 255, fontStyle: 'bold' },
      foot: [],
    });

    const finalY = doc.lastAutoTable?.finalY || 180;
    doc.setFontSize(8); doc.setTextColor(120,120,120);
    doc.text('Esta constancia fue generada por Capital Humano MX.', 14, finalY + 14);
    doc.text(`Fecha de emisión: ${new Date().toLocaleDateString('es-MX')}`, 14, finalY + 20);

    doc.save(`Constancia_${trab?.nombre||'trab'}_${anio}.pdf`);
  } catch(e) { alert('Error al generar constancia: ' + e.message); }
}

// ── R4: SUA / IMSS ────────────────────────────────────────────────────────────
async function _repGenSUA() {
  const res = document.getElementById('rep-resultado');
  const IMSS_PAT_ENFF = 0.1049; // cuota patronal enf. y maternidad estimada
  const _prestRep = prestacionesEmpresa();
  const _umaRep   = typeof _umaVigente === 'function' ? _umaVigente() : (typeof UMA_DIARIA !== 'undefined' ? UMA_DIARIA : 113.14);
  const filas = _REP.trabajadores.filter(t => t.estado === 'activo').map(t => {
    const sd  = calcSalarioDiario(t.salario_mensual, t.periodo_salario || 'mensual');
    const sdi = calcSDI ? calcSDI(sd, vacDaysForYear(0, _prestRep.vacDiasExtra), _prestRep.primaVacPct, _prestRep.aguinaldoDias) : sd * 1.045;
    // Base de cotización: SBC del trabajador si existe, si no el SDI estimado
    const sbc = parseFloat(t.sbc) > 0 ? parseFloat(t.sbc) : sdi;
    // IMSS obrero mensual (30 días) por ramos sobre SBC, consistente con la nómina
    const imssOb  = typeof calcIMSSObrero === 'function'
      ? calcIMSSObrero(sbc, 30, _umaRep)
      : sd * 30 * 0.0225;
    const immsPat = sd * 30 * IMSS_PAT_ENFF;
    return { ...t, sd, sdi, imssOb, immsPat };
  });
  window._repDataSUA = filas;

  if (!filas.length) {
    res.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🏛</div><div class="empty-state-title">Sin trabajadores activos</div></div>`;
    return;
  }

  res.innerHTML = `
    <div class="card animate-in" style="margin-top:16px;">
      <div class="card-header">
        <span class="card-title">Listado SUA / IMSS</span>
        <button class="btn-secondary btn-sm" onclick="_exportarSUAcsv()">⬇ CSV</button>
      </div>
      <div class="table-wrap" style="margin-top:12px;">
        <table class="data-table">
          <thead><tr><th scope="col">Nombre</th><th scope="col">RFC</th><th scope="col">NSS</th><th scope="col">Salario diario</th><th scope="col">SDI (aprox.)</th><th scope="col">IMSS obrero/mes</th><th scope="col">IMSS patronal (est.)</th></tr></thead>
          <tbody>
            ${filas.map(t => `<tr>
              <td><strong>${escapeHtml(t.nombre)}</strong></td>
              <td style="font-size:.82rem;">${escapeHtml(t.rfc) || '—'}</td>
              <td style="font-size:.82rem;">${escapeHtml(t.nss) || '—'}</td>
              <td>${fmt(t.sd)}</td>
              <td>${fmt(t.sdi)}</td>
              <td>${fmt(t.imssOb)}</td>
              <td style="color:var(--text-muted);">${fmt(t.immsPat)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:8px;font-size:.75rem;color:var(--text-muted);">
        * IMSS patronal es estimado (cuota enf. y maternidad). SDI calculado con los días de vacaciones, prima vacacional y aguinaldo configurados en Mi Empresa (mínimos de ley si no hay configuración).
      </div>
    </div>
  `;
}

// B-2: neutraliza fórmula-injection — si el valor empieza con =, +, -, o @,
// Excel/LibreOffice lo interpretan como fórmula al abrir el CSV. Anteponer
// un apóstrofe fuerza que se lea como texto literal.
function _csvSafe(val) {
  const s = String(val ?? '');
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function _exportarSUAcsv() {
  const filas = window._repDataSUA;
  if (!filas?.length) { alert('Primero genera el listado SUA.'); return; }
  const header = 'NSS|RFC|Nombre|Salario diario|SDI|IMSS obrero mensual|IMSS patronal estimado';
  const rows = filas.map(t => [
    _csvSafe(t.nss||''), _csvSafe(t.rfc||''), _csvSafe(t.nombre||''),
    t.sd.toFixed(2),
    (t.sdi ?? t.sd * 1.045).toFixed(2),
    t.imssOb.toFixed(2),
    t.immsPat.toFixed(2),
  ].join('|')).join('\n');
  const blob = new Blob([header + '\n' + rows], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `SUA_${CTX.empresa.nombre}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
}
