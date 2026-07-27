/**
 * Capital Humano MX — Módulo Reportes y Exportaciones
 */

let _REP = { tipo: 'nomina_periodo', periodos: [], trabajadores: [], sucursales: [] };
const _sbREP = () => window.supabase;

async function renderReportes() {
  const _gen = typeof _navGen !== 'undefined' ? _navGen : 0;
  try {
    const main = document.getElementById('main-view');
    main.innerHTML = `<div class="loading"><div class="spinner"></div> Cargando…</div>`;

    const [perRes, trabRes, sucRes] = await Promise.all([
      _sbREP().from('periodos_nomina')
        .select('id,nombre,fecha_inicio,fecha_fin,estado')
        .eq('empresa_id', CTX.empresa.id)
        .order('fecha_inicio', { ascending: false })
        .limit(100),
      _sbREP().from('trabajadores')
        .select('id,nombre,rfc,nss,salario_mensual,periodo_salario,sbc,estado,departamento,sucursal_id,fecha_ingreso,fecha_baja,tipo_baja,smg_zone')
        .eq('empresa_id', CTX.empresa.id)
        .order('nombre'),
      _sbREP().from('sucursales')
        .select('id,nombre')
        .eq('empresa_id', CTX.empresa.id),
    ]);
    _REP.periodos     = perRes.data || [];
    _REP.trabajadores = trabRes.data || [];
    _REP.sucursales   = sucRes.data || [];

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
        <div class="view-title">Reportes</div>
        <div class="view-subtitle">Nómina, acumulados, constancias y SUA</div>
      </div>
    </div>

    <div class="card animate-in" style="margin-bottom:16px;">
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${[
          ['nomina_periodo',  'Nómina por período'],
          ['acumulado_anual', 'Acumulado anual'],
          ['constancia_pdf',  'Constancia PDF'],
          ['sua_imss',        'SUA / IMSS'],
          ['rotacion',        'Rotación de personal'],
          ['ausentismo',      'Ausentismo por sucursal'],
          ['costo_depto',     'Costo laboral por departamento'],
          ['antiguedades',    'Antigüedades'],
          ['paquete_contador','Paquete para el contador'],
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
          <button class="btn-primary" onclick="_repGenConstancia()">Generar PDF</button>
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
          <button class="btn-secondary" onclick="_exportarSUAcsv()">Exportar CSV</button>
        </div>
      </div>
    `;
    _repGenSUA();
  } else if (_REP.tipo === 'rotacion') {
    c.innerHTML = `
      <div class="card">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Año</label>
            <select id="rep-rot-anio" class="form-select">
              ${anios.map(a => `<option value="${a}">${a}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px;">
          <button class="btn-primary" onclick="_repGenRotacion()"><svg class="ic"><use href="#i-eye"></use></svg> Ver reporte</button>
        </div>
      </div>
    `;
  } else if (_REP.tipo === 'ausentismo') {
    const hoy = new Date();
    const iniMes = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-01`;
    const finMes = new Date(hoy.getFullYear(), hoy.getMonth()+1, 0).toISOString().split('T')[0];
    c.innerHTML = `
      <div class="card">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Desde</label>
            <input id="rep-aus-ini" type="date" class="form-input" value="${iniMes}" />
          </div>
          <div class="form-group">
            <label class="form-label">Hasta</label>
            <input id="rep-aus-fin" type="date" class="form-input" value="${finMes}" />
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px;">
          <button class="btn-primary" onclick="_repGenAusentismo()"><svg class="ic"><use href="#i-eye"></use></svg> Ver reporte</button>
        </div>
      </div>
    `;
  } else if (_REP.tipo === 'costo_depto') {
    const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    c.innerHTML = `
      <div class="card">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Año</label>
            <select id="rep-cd-anio" class="form-select">
              ${anios.map(a => `<option value="${a}">${a}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Mes</label>
            <select id="rep-cd-mes" class="form-select">
              <option value="">Todo el año</option>
              ${MESES.map((m,i) => `<option value="${i+1}" ${i===new Date().getMonth()?'selected':''}>${m}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px;">
          <button class="btn-primary" onclick="_repGenCostoDepto()"><svg class="ic"><use href="#i-eye"></use></svg> Ver reporte</button>
        </div>
      </div>
    `;
  } else if (_REP.tipo === 'antiguedades') {
    c.innerHTML = `
      <div class="card">
        <p style="font-size:.88rem;color:var(--text-muted);margin-bottom:14px;">
          Antigüedad de los trabajadores activos, próximos aniversarios y la prima de antigüedad potencial (Art. 162 LFT) de quienes ya cumplieron 15 años.
        </p>
        <div style="display:flex;gap:8px;">
          <button class="btn-primary" onclick="_repGenAntiguedades()"><svg class="ic"><use href="#i-eye"></use></svg> Ver reporte</button>
          <button class="btn-secondary" onclick="_exportarAntiguedadesXLSX()">Excel</button>
        </div>
      </div>
    `;
    _repGenAntiguedades();
  } else if (_REP.tipo === 'paquete_contador') {
    const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    c.innerHTML = `
      <div class="card">
        <p style="font-size:.88rem;color:var(--text-muted);margin-bottom:14px;">
          Genera un ZIP con la nómina del mes lista para tu contador: un Excel por período, el acumulado del mes, las cuotas patronales por trabajador y el CSV para el SUA.
        </p>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Año</label>
            <select id="rep-pc-anio" class="form-select">
              ${anios.map(a => `<option value="${a}">${a}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Mes</label>
            <select id="rep-pc-mes" class="form-select">
              ${MESES.map((m,i) => `<option value="${i+1}" ${i===new Date().getMonth()?'selected':''}>${m}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px;">
          <button class="btn-primary" id="rep-pc-btn" onclick="_generarPaqueteContador()">Generar paquete (ZIP)</button>
        </div>
      </div>
    `;
  }
}

// ── R1: Nómina por período ────────────────────────────────────────────────────
async function _repGenNominaPeriodo() {
  const periodoId = document.getElementById('rep-periodo')?.value;
  const res = document.getElementById('rep-resultado');
  if (!periodoId) { res.innerHTML = `<div class="alert alert-warn"><svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg><span>Selecciona un período.</span></div>`; return; }
  res.innerHTML = `<div class="loading"><div class="spinner"></div> Cargando recibos…</div>`;
  try {
    const { data } = await _sbREP().from('recibos_nomina')
      .select('*,trabajadores(nombre,nss)')
      .eq('periodo_id', periodoId)
      .order('trabajadores(nombre)');
    const periodo = _REP.periodos.find(p => p.id === periodoId);
    window._repDataNomina = data || [];
    res.innerHTML = `
      <div class="card animate-in" style="margin-top:16px;">
        <div class="card-header">
          <span class="card-title">Nómina: ${escapeHtml(periodo?.nombre) || ''}</span>
          <button class="btn-secondary btn-sm" onclick="_exportarNominaXLSX()">Excel</button>
        </div>
        <div class="table-wrap" style="margin-top:12px;">
          <table class="data-table">
            <thead><tr><th scope="col">Trabajador</th><th scope="col">Días</th><th scope="col">Percepciones</th><th scope="col">IMSS obrero</th><th scope="col">ISR</th><th scope="col">INFONAVIT pat.</th><th scope="col">Otras ded.</th><th scope="col">Neto</th></tr></thead>
            <tbody>
              ${(data||[]).map(r => {
                const otDed = (r.total_deducciones||0) - (r.cuota_imss||0) - (r.isr_retenido||0);
                return `<tr>
                  <td><strong>${escapeHtml(r.trabajadores?.nombre) || '—'}</strong></td>
                  <td>${r.dias_laborados||0}</td>
                  <td>${fmt(r.total_percepciones||0)}</td>
                  <td>${fmt(r.cuota_imss||0)}</td>
                  <td>${fmt(r.isr_retenido||0)}</td>
                  <td style="color:var(--text-muted);font-size:.82rem;">${fmt(r.infonavit_patronal||0)}</td>
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
    'Percepciones':    r.total_percepciones || 0,
    'IMSS obrero':     r.cuota_imss || 0,
    'ISR':             r.isr_retenido || 0,
    'Otras deducciones': Math.max(0, (r.total_deducciones||0) - (r.cuota_imss||0) - (r.isr_retenido||0)),
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

    if (!data?.length) { res.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><svg class="ic"><use href="#i-calendar"></use></svg></div><div class="empty-state-title">Sin datos para el período seleccionado</div></div>`; return; }

    window._repDataAcumulado = data;
    const totPer = data.reduce((a,r)=>a+(r.total_percepciones||0),0);
    const totISR = data.reduce((a,r)=>a+(r.isr_retenido||0),0);
    const totIMSS= data.reduce((a,r)=>a+(r.cuota_imss||0),0);
    const totNet = data.reduce((a,r)=>a+(r.neto_pagar||0),0);

    res.innerHTML = `
      <div class="card animate-in" style="margin-top:16px;">
        <div class="card-header">
          <span class="card-title">Acumulado ${anio}${trabId ? ' — ' + escapeHtml(_REP.trabajadores.find(t=>t.id===trabId)?.nombre) : ''}</span>
          <button class="btn-secondary btn-sm" onclick="_exportarAcumuladoXLSX()">Excel</button>
        </div>
        <div class="table-wrap" style="margin-top:12px;">
          <table class="data-table">
            <thead><tr><th scope="col">Período</th><th scope="col">Trabajador</th><th scope="col">Percepciones</th><th scope="col">ISR</th><th scope="col">IMSS obrero</th><th scope="col">Neto</th></tr></thead>
            <tbody>
              ${data.map(r => `<tr>
                <td>${escapeHtml(r.periodos_nomina?.nombre) || '—'}</td>
                <td>${escapeHtml(r.trabajadores?.nombre) || '—'}</td>
                <td>${fmt(r.total_percepciones||0)}</td>
                <td>${fmt(r.isr_retenido||0)}</td>
                <td>${fmt(r.cuota_imss||0)}</td>
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
    'Percepciones': r.total_percepciones || 0,
    'ISR':          r.isr_retenido || 0,
    'IMSS obrero':  r.cuota_imss || 0,
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
    _registrarFuenteRoboto(doc);
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
      fmt(r.total_percepciones||0),
      fmt(r.cuota_imss||0),
      fmt(r.isr_retenido||0),
      fmt(r.neto_pagar||0),
    ]);
    const totPer  = (data||[]).reduce((a,r)=>a+(r.total_percepciones||0),0);
    const totIMSS = (data||[]).reduce((a,r)=>a+(r.cuota_imss||0),0);
    const totISR  = (data||[]).reduce((a,r)=>a+(r.isr_retenido||0),0);
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
/** Filas SUA (compartida entre la pestaña SUA/IMSS y el paquete del contador). */
function _calcularFilasSUA() {
  const IMSS_PAT_ENFF = 0.1049; // cuota patronal enf. y maternidad estimada
  const _prestRep = prestacionesEmpresa();
  const _umaRep   = _umaVigente();
  return _REP.trabajadores.filter(t => t.estado === 'activo').map(t => {
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
}

async function _repGenSUA() {
  const res = document.getElementById('rep-resultado');
  const filas = _calcularFilasSUA();
  window._repDataSUA = filas;

  if (!filas.length) {
    res.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><svg class="ic"><use href="#i-bank"></use></svg></div><div class="empty-state-title">Sin trabajadores activos</div></div>`;
    return;
  }

  res.innerHTML = `
    <div class="card animate-in" style="margin-top:16px;">
      <div class="card-header">
        <span class="card-title">Listado SUA / IMSS</span>
        <button class="btn-secondary btn-sm" onclick="_exportarSUAcsv()">CSV</button>
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

/** Texto CSV del listado SUA (compartido con el paquete del contador). */
function _textoSUAcsv(filas) {
  const header = 'NSS|RFC|Nombre|Salario diario|SDI|IMSS obrero mensual|IMSS patronal estimado';
  const rows = filas.map(t => [
    _csvSafe(t.nss||''), _csvSafe(t.rfc||''), _csvSafe(t.nombre||''),
    t.sd.toFixed(2),
    (t.sdi ?? t.sd * 1.045).toFixed(2),
    t.imssOb.toFixed(2),
    t.immsPat.toFixed(2),
  ].join('|')).join('\n');
  return header + '\n' + rows;
}

function _exportarSUAcsv() {
  const filas = window._repDataSUA;
  if (!filas?.length) { alert('Primero genera el listado SUA.'); return; }
  const blob = new Blob([_textoSUAcsv(filas)], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `SUA_${CTX.empresa.nombre}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ── R5: Rotación de personal ───────────────────────────────────────────────────
const _MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const _TIPO_BAJA_LABEL = { injustificada: 'Despido injustificado', justificada: 'Despido justificado', renuncia: 'Renuncia' };

async function _repGenRotacion() {
  const anio = parseInt(document.getElementById('rep-rot-anio')?.value) || new Date().getFullYear();
  const res  = document.getElementById('rep-resultado');
  res.innerHTML = `<div class="loading"><div class="spinner"></div> Cargando…</div>`;
  try {
    // Se traen TODOS los trabajadores (activos y de baja) para poder calcular
    // la plantilla al inicio de cada mes, no sólo los eventos del año elegido.
    const { data, error } = await _sbREP().from('trabajadores')
      .select('id,fecha_ingreso,fecha_baja,tipo_baja')
      .eq('empresa_id', CTX.empresa.id);
    if (error) throw error;

    const filas = _MESES_CORTOS.map((label, i) => {
      const inicioMes = new Date(anio, i, 1);
      const finMes    = new Date(anio, i + 1, 0);
      const plantillaInicio = data.filter(t => {
        const ing = new Date(t.fecha_ingreso + 'T00:00:00');
        const baja = t.fecha_baja ? new Date(t.fecha_baja + 'T00:00:00') : null;
        return ing < inicioMes && (!baja || baja >= inicioMes);
      }).length;
      const altas = data.filter(t => {
        const ing = new Date(t.fecha_ingreso + 'T00:00:00');
        return ing >= inicioMes && ing <= finMes;
      }).length;
      const bajasMes = data.filter(t => {
        if (!t.fecha_baja) return false;
        const baja = new Date(t.fecha_baja + 'T00:00:00');
        return baja >= inicioMes && baja <= finMes;
      });
      const porMotivo = { injustificada: 0, justificada: 0, renuncia: 0 };
      bajasMes.forEach(t => { if (porMotivo[t.tipo_baja] !== undefined) porMotivo[t.tipo_baja]++; });
      const tasaRotacion = plantillaInicio > 0 ? (bajasMes.length / plantillaInicio) * 100 : 0;
      return { mes: label, plantillaInicio, altas, bajas: bajasMes.length, ...porMotivo, tasaRotacion };
    });

    window._repDataRotacion = filas;
    const totAltas = filas.reduce((s,f)=>s+f.altas,0);
    const totBajas = filas.reduce((s,f)=>s+f.bajas,0);
    const plantillaFinal = data.filter(t => !t.fecha_baja || new Date(t.fecha_baja+'T00:00:00') > new Date(anio, 11, 31)).length;

    res.innerHTML = `
      <div class="card animate-in" style="margin-top:16px;">
        <div class="card-header">
          <span class="card-title">Rotación de personal ${anio}</span>
          <button class="btn-secondary btn-sm" onclick="_exportarRotacionXLSX()">Excel</button>
        </div>
        <div style="display:flex;gap:18px;margin:10px 0 14px;flex-wrap:wrap;">
          <div><span style="color:var(--text-muted);font-size:.8rem;">Altas del año</span><br><strong style="font-size:1.2rem;color:var(--green-ok);">${totAltas}</strong></div>
          <div><span style="color:var(--text-muted);font-size:.8rem;">Bajas del año</span><br><strong style="font-size:1.2rem;color:var(--red-warn);">${totBajas}</strong></div>
          <div><span style="color:var(--text-muted);font-size:.8rem;">Plantilla al 31-dic</span><br><strong style="font-size:1.2rem;">${plantillaFinal}</strong></div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Mes</th><th>Plantilla inicio</th><th>Altas</th><th>Bajas</th><th>Injustificado</th><th>Justificado</th><th>Renuncia</th><th>Rotación</th></tr></thead>
            <tbody>${filas.map(f => `<tr>
              <td>${f.mes}</td><td>${f.plantillaInicio}</td>
              <td style="color:var(--green-ok);">${f.altas||'—'}</td>
              <td style="color:var(--red-warn);">${f.bajas||'—'}</td>
              <td>${f.injustificada||'—'}</td><td>${f.justificada||'—'}</td><td>${f.renuncia||'—'}</td>
              <td>${f.tasaRotacion.toFixed(1)}%</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
        <div style="font-size:.74rem;color:var(--text-muted);margin-top:10px;">
          Rotación mensual = bajas del mes ÷ plantilla al inicio del mes × 100. Sirve para detectar picos y comparar contra el promedio de tu sector.
        </div>
      </div>
    `;
  } catch(e) { res.innerHTML = `<p style="color:var(--red-warn)">${e.message}</p>`; }
}

function _exportarRotacionXLSX() {
  if (!window.XLSX || !window._repDataRotacion) return;
  const ws = XLSX.utils.json_to_sheet(window._repDataRotacion.map(f => ({
    'Mes': f.mes, 'Plantilla al inicio': f.plantillaInicio, 'Altas': f.altas, 'Bajas': f.bajas,
    'Injustificado': f.injustificada, 'Justificado': f.justificada, 'Renuncia': f.renuncia,
    'Rotación %': parseFloat(f.tasaRotacion.toFixed(1)),
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rotación');
  XLSX.writeFile(wb, `Rotacion_${document.getElementById('rep-rot-anio')?.value||''}.xlsx`);
}

// ── R6: Ausentismo por sucursal ────────────────────────────────────────────────
async function _repGenAusentismo() {
  const ini = document.getElementById('rep-aus-ini')?.value;
  const fin = document.getElementById('rep-aus-fin')?.value;
  const res = document.getElementById('rep-resultado');
  if (!ini || !fin) { res.innerHTML = `<div class="alert alert-warn"><svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg><span>Selecciona el rango de fechas.</span></div>`; return; }
  res.innerHTML = `<div class="loading"><div class="spinner"></div> Cargando…</div>`;
  try {
    const { data, error } = await _sbREP().from('asistencia')
      .select('tipo,trabajador_id,trabajadores(sucursal_id)')
      .eq('empresa_id', CTX.empresa.id)
      .gte('fecha', ini).lte('fecha', fin);
    if (error) throw error;

    const sucNombre = id => id ? (_REP.sucursales.find(s => s.id === id)?.nombre || 'Sucursal sin nombre') : 'Sin sucursal asignada';
    const porSuc = {};
    (data || []).forEach(a => {
      const key = a.trabajadores?.sucursal_id || '__sin__';
      if (!porSuc[key]) porSuc[key] = { nombre: sucNombre(a.trabajadores?.sucursal_id), falta: 0, retardo: 0, incapacidad: 0, permiso: 0, otro: 0 };
      const t = a.tipo || '';
      if (t === 'falta' || t === 'falta_justif') porSuc[key].falta++;
      else if (t === 'retardo' || t === 'retardo_grave') porSuc[key].retardo++;
      else if (t === 'incapacidad') porSuc[key].incapacidad++;
      else if (t === 'permiso_goce' || t === 'permiso_sin') porSuc[key].permiso++;
      else if (t && t !== 'asistencia' && t !== 'descanso' && t !== 'festivo' && t !== 'vacaciones') porSuc[key].otro++;
    });
    const filas = Object.values(porSuc).sort((a,b) => (b.falta+b.retardo+b.incapacidad) - (a.falta+a.retardo+a.incapacidad));
    window._repDataAusentismo = filas;

    if (!filas.length) {
      res.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><svg class="ic"><use href="#i-check-circle"></use></svg></div><div class="empty-state-title">Sin incidencias en el rango seleccionado</div></div>`;
      return;
    }

    res.innerHTML = `
      <div class="card animate-in" style="margin-top:16px;">
        <div class="card-header">
          <span class="card-title">Ausentismo por sucursal (${formatDateShort(ini)} – ${formatDateShort(fin)})</span>
          <button class="btn-secondary btn-sm" onclick="_exportarAusentismoXLSX()">Excel</button>
        </div>
        <div class="table-wrap" style="margin-top:12px;">
          <table class="data-table">
            <thead><tr><th>Sucursal</th><th>Faltas</th><th>Retardos</th><th>Incapacidades</th><th>Permisos</th><th>Otro</th><th>Total incidencias</th></tr></thead>
            <tbody>${filas.map(f => `<tr>
              <td><strong>${f.nombre}</strong></td>
              <td>${f.falta||'—'}</td><td>${f.retardo||'—'}</td><td>${f.incapacidad||'—'}</td>
              <td>${f.permiso||'—'}</td><td>${f.otro||'—'}</td>
              <td><strong>${f.falta+f.retardo+f.incapacidad+f.permiso+f.otro}</strong></td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
    `;
  } catch(e) { res.innerHTML = `<p style="color:var(--red-warn)">${e.message}</p>`; }
}

function _exportarAusentismoXLSX() {
  if (!window.XLSX || !window._repDataAusentismo) return;
  const ws = XLSX.utils.json_to_sheet(window._repDataAusentismo.map(f => ({
    'Sucursal': f.nombre, 'Faltas': f.falta, 'Retardos': f.retardo, 'Incapacidades': f.incapacidad,
    'Permisos': f.permiso, 'Otro': f.otro, 'Total incidencias': f.falta+f.retardo+f.incapacidad+f.permiso+f.otro,
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ausentismo');
  XLSX.writeFile(wb, `Ausentismo_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ── R7: Costo laboral por departamento ─────────────────────────────────────────
async function _repGenCostoDepto() {
  const anio = parseInt(document.getElementById('rep-cd-anio')?.value) || new Date().getFullYear();
  const mes  = document.getElementById('rep-cd-mes')?.value;
  const res  = document.getElementById('rep-resultado');
  res.innerHTML = `<div class="loading"><div class="spinner"></div> Cargando…</div>`;
  try {
    const desde = mes ? `${anio}-${String(mes).padStart(2,'0')}-01` : `${anio}-01-01`;
    const hasta = mes ? new Date(anio, parseInt(mes), 0).toISOString().split('T')[0] : `${anio}-12-31`;

    const { data: periodos, error: errP } = await _sbREP().from('periodos_nomina')
      .select('id').eq('empresa_id', CTX.empresa.id)
      .gte('fecha_inicio', desde).lte('fecha_inicio', hasta);
    if (errP) throw errP;

    const periodoIds = (periodos || []).map(p => p.id);
    let recibos = [];
    if (periodoIds.length) {
      const { data, error: errR } = await _sbREP().from('recibos_nomina')
        .select('total_percepciones,imss_patronal,infonavit_patronal,isn,trabajador_id')
        .in('periodo_id', periodoIds);
      if (errR) throw errR;
      recibos = data || [];
    }

    const deptoDe = {};
    _REP.trabajadores.forEach(t => { deptoDe[t.id] = t.departamento || 'Sin departamento'; });

    const porDepto = {};
    recibos.forEach(r => {
      const key = deptoDe[r.trabajador_id] || 'Sin departamento';
      if (!porDepto[key]) porDepto[key] = { depto: key, percepciones: 0, imssPat: 0, infonavitPat: 0, isn: 0 };
      porDepto[key].percepciones += parseFloat(r.total_percepciones || 0);
      porDepto[key].imssPat      += parseFloat(r.imss_patronal || 0);
      porDepto[key].infonavitPat += parseFloat(r.infonavit_patronal || 0);
      porDepto[key].isn          += parseFloat(r.isn || 0);
    });
    const filas = Object.values(porDepto)
      .map(f => ({ ...f, costoTotal: f.percepciones + f.imssPat + f.infonavitPat + f.isn }))
      .sort((a,b) => b.costoTotal - a.costoTotal);
    window._repDataCostoDepto = filas;

    if (!filas.length) {
      res.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><svg class="ic"><use href="#i-bank"></use></svg></div><div class="empty-state-title">Sin nómina generada en el período seleccionado</div></div>`;
      return;
    }

    const totCosto = filas.reduce((s,f)=>s+f.costoTotal,0);
    res.innerHTML = `
      <div class="card animate-in" style="margin-top:16px;">
        <div class="card-header">
          <span class="card-title">Costo laboral por departamento — ${mes ? `${anio}/${String(mes).padStart(2,'0')}` : `Año ${anio}`}</span>
          <button class="btn-secondary btn-sm" onclick="_exportarCostoDeptoXLSX()">Excel</button>
        </div>
        <div class="table-wrap" style="margin-top:12px;">
          <table class="data-table">
            <thead><tr><th>Departamento</th><th>Percepciones</th><th>IMSS patronal</th><th>INFONAVIT patronal</th><th>ISN</th><th>Costo total</th><th>% del total</th></tr></thead>
            <tbody>${filas.map(f => `<tr>
              <td><strong>${f.depto}</strong></td>
              <td>${fmt(f.percepciones)}</td>
              <td style="color:var(--text-muted);">${fmt(f.imssPat)}</td>
              <td style="color:var(--text-muted);">${fmt(f.infonavitPat)}</td>
              <td style="color:var(--text-muted);">${fmt(f.isn)}</td>
              <td><strong>${fmt(f.costoTotal)}</strong></td>
              <td>${totCosto > 0 ? ((f.costoTotal/totCosto)*100).toFixed(1) : '0.0'}%</td>
            </tr>`).join('')}</tbody>
            <tfoot><tr style="font-weight:700;border-top:2px solid var(--border);">
              <td>TOTAL</td>
              <td>${fmt(filas.reduce((s,f)=>s+f.percepciones,0))}</td>
              <td>${fmt(filas.reduce((s,f)=>s+f.imssPat,0))}</td>
              <td>${fmt(filas.reduce((s,f)=>s+f.infonavitPat,0))}</td>
              <td>${fmt(filas.reduce((s,f)=>s+f.isn,0))}</td>
              <td>${fmt(totCosto)}</td>
              <td>100%</td>
            </tr></tfoot>
          </table>
        </div>
      </div>
    `;
  } catch(e) { res.innerHTML = `<p style="color:var(--red-warn)">${e.message}</p>`; }
}

function _exportarCostoDeptoXLSX() {
  if (!window.XLSX || !window._repDataCostoDepto) return;
  const ws = XLSX.utils.json_to_sheet(window._repDataCostoDepto.map(f => ({
    'Departamento': f.depto, 'Percepciones': f.percepciones, 'IMSS patronal': f.imssPat,
    'INFONAVIT patronal': f.infonavitPat, 'ISN': f.isn, 'Costo total': f.costoTotal,
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Costo por depto');
  XLSX.writeFile(wb, `CostoLaboral_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ── R8: Antigüedades ────────────────────────────────────────────────────────────
async function _repGenAntiguedades() {
  const res = document.getElementById('rep-resultado');
  const hoy = new Date();
  const uma = _umaVigente();

  const filas = _REP.trabajadores.filter(t => t.estado === 'activo').map(t => {
    const ingreso = new Date(t.fecha_ingreso + 'T00:00:00');
    const anios = fullYears(ingreso, hoy);
    let proximo = new Date(hoy.getFullYear(), ingreso.getMonth(), ingreso.getDate());
    if (proximo < hoy) proximo = new Date(hoy.getFullYear() + 1, ingreso.getMonth(), ingreso.getDate());
    const diasParaAniversario = Math.round((proximo - hoy) / 86400000);
    let primaAntig = 0;
    if (anios >= 15) {
      const daily = calcSalarioDiario(parseFloat(t.salario_mensual) || 0, t.periodo_salario || 'mensual');
      const smg = _smgVigente(t.smg_zone);
      const sdiCap = Math.min(daily, 2 * smg);
      primaAntig = parseFloat((anios * PRIMA_ANTIG_DAYS * sdiCap).toFixed(2));
    }
    return { nombre: t.nombre, fecha_ingreso: t.fecha_ingreso, anios, proximo, diasParaAniversario, cumplira: anios + 1, primaAntig };
  }).sort((a,b) => a.diasParaAniversario - b.diasParaAniversario);

  window._repDataAntiguedades = filas;

  if (!filas.length) {
    res.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><svg class="ic"><use href="#i-sparkle"></use></svg></div><div class="empty-state-title">Sin trabajadores activos</div></div>`;
    return;
  }

  res.innerHTML = `
    <div class="card animate-in" style="margin-top:16px;">
      <div class="card-header">
        <span class="card-title">Antigüedades (${filas.length} trabajadores activos)</span>
        <button class="btn-secondary btn-sm" onclick="_exportarAntiguedadesXLSX()">Excel</button>
      </div>
      <div class="table-wrap" style="margin-top:12px;">
        <table class="data-table">
          <thead><tr><th>Trabajador</th><th>Ingreso</th><th>Años cumplidos</th><th>Próximo aniversario</th><th>Faltan</th><th>Prima de antigüedad*</th></tr></thead>
          <tbody>${filas.map(f => `<tr${f.diasParaAniversario <= 30 ? ' style="background:var(--gold-dim);"' : ''}>
            <td><strong>${f.nombre}</strong></td>
            <td>${formatDateShort(f.fecha_ingreso)}</td>
            <td>${f.anios}</td>
            <td>${formatDateShort(f.proximo.toISOString().split('T')[0])} <span style="font-size:.72rem;color:var(--text-muted);">(cumple ${f.cumplira})</span></td>
            <td>${f.diasParaAniversario <= 30 ? `<strong style="color:var(--gold-primary);">${f.diasParaAniversario} días</strong>` : `${f.diasParaAniversario} días`}</td>
            <td>${f.primaAntig > 0 ? fmt(f.primaAntig) : '<span style="color:var(--text-muted);">— (&lt;15 años)</span>'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
      <div style="font-size:.74rem;color:var(--text-muted);margin-top:10px;">
        * Prima de antigüedad potencial si el trabajador renunciara hoy (12 días por año, tope 2 veces el salario mínimo — Art. 162 LFT). En despido o muerte del trabajador aplica sin importar los años de servicio.
      </div>
    </div>
  `;
}

function _exportarAntiguedadesXLSX() {
  if (!window.XLSX || !window._repDataAntiguedades) return;
  const ws = XLSX.utils.json_to_sheet(window._repDataAntiguedades.map(f => ({
    'Trabajador': f.nombre, 'Fecha de ingreso': f.fecha_ingreso, 'Años cumplidos': f.anios,
    'Próximo aniversario': f.proximo.toISOString().split('T')[0], 'Días para el aniversario': f.diasParaAniversario,
    'Prima de antigüedad potencial': f.primaAntig,
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Antigüedades');
  XLSX.writeFile(wb, `Antiguedades_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ── R9: Paquete para el contador ────────────────────────────────────────────────
/** Hoja XLSX de un conjunto de recibos, mismo detalle que _repGenNominaPeriodo(). */
function _hojaXLSXRecibos(recibos) {
  return XLSX.utils.json_to_sheet(recibos.map(r => ({
    'Trabajador':      r.trabajadores?.nombre || '—',
    'NSS':             r.trabajadores?.nss || '—',
    'Días':            r.dias_laborados || 0,
    'Percepciones':    r.total_percepciones || 0,
    'IMSS obrero':     r.cuota_imss || 0,
    'ISR':             r.isr_retenido || 0,
    'Otras deducciones': Math.max(0, (r.total_deducciones||0) - (r.cuota_imss||0) - (r.isr_retenido||0)),
    'Neto a pagar':    r.neto_pagar || 0,
  })));
}

async function _generarPaqueteContador() {
  const anio = parseInt(document.getElementById('rep-pc-anio')?.value) || new Date().getFullYear();
  const mes  = parseInt(document.getElementById('rep-pc-mes')?.value) || (new Date().getMonth() + 1);
  const btn  = document.getElementById('rep-pc-btn');
  if (!window.JSZip) { alert('JSZip no está cargado.'); return; }

  const desde = `${anio}-${String(mes).padStart(2,'0')}-01`;
  const hasta = new Date(anio, mes, 0).toISOString().split('T')[0];
  const nombreMes = document.getElementById('rep-pc-mes')?.selectedOptions?.[0]?.textContent || mes;

  btnCargando(btn, 'Generando…');
  try {
    const { data: periodos, error: errP } = await _sbREP().from('periodos_nomina')
      .select('id, nombre, fecha_inicio, fecha_fin')
      .eq('empresa_id', CTX.empresa.id)
      .gte('fecha_inicio', desde).lte('fecha_inicio', hasta)
      .order('fecha_inicio');
    if (errP) throw errP;

    if (!periodos?.length) {
      alert(`Sin períodos de nómina generados en ${nombreMes} ${anio}.`);
      return;
    }

    const zip = new JSZip();
    let todosRecibos = [];

    for (const p of periodos) {
      const { data: recibos, error: errR } = await _sbREP().from('recibos_nomina')
        .select('*, trabajadores(nombre,nss)')
        .eq('periodo_id', p.id)
        .order('trabajadores(nombre)');
      if (errR) throw errR;
      if (!recibos?.length) continue;
      todosRecibos = todosRecibos.concat(recibos);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, _hojaXLSXRecibos(recibos), 'Nómina');
      const nombreArchivo = (p.nombre || 'periodo').replace(/[\\/:*?"<>|]/g, '-');
      zip.file(`01-periodos/${nombreArchivo}.xlsx`, XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    }

    if (!todosRecibos.length) {
      alert(`Los períodos de ${nombreMes} ${anio} no tienen recibos generados todavía.`);
      return;
    }

    // Acumulado del mes
    const wbAcum = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbAcum, _hojaXLSXRecibos(todosRecibos), 'Acumulado del mes');
    zip.file(`02-acumulado-${nombreMes}-${anio}.xlsx`.toLowerCase(), XLSX.write(wbAcum, { type: 'array', bookType: 'xlsx' }));

    // Cuotas patronales / provisiones del mes, por trabajador (Fase 1: migración 32)
    const porTrab = {};
    todosRecibos.forEach(r => {
      const key = r.trabajador_id;
      if (!porTrab[key]) porTrab[key] = { nombre: r.trabajadores?.nombre || '—', percepciones:0, imssPat:0, infonavitPat:0, isn:0, ajusteAnual:0 };
      porTrab[key].percepciones  += parseFloat(r.total_percepciones || 0);
      porTrab[key].imssPat       += parseFloat(r.imss_patronal || 0);
      porTrab[key].infonavitPat  += parseFloat(r.infonavit_patronal || 0);
      porTrab[key].isn           += parseFloat(r.isn || 0);
      porTrab[key].ajusteAnual   += parseFloat(r.ajuste_anual_isr || 0);
    });
    const filasCuotas = Object.values(porTrab);
    const wsCuotas = XLSX.utils.json_to_sheet(filasCuotas.map(f => ({
      'Trabajador': f.nombre, 'Percepciones': f.percepciones, 'IMSS patronal': f.imssPat,
      'INFONAVIT patronal': f.infonavitPat, 'ISN': f.isn, 'Ajuste anual ISR': f.ajusteAnual,
      'Costo patronal total': f.imssPat + f.infonavitPat + f.isn,
    })));
    const wbCuotas = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbCuotas, wsCuotas, 'Cuotas patronales');
    zip.file('03-cuotas-patronales.xlsx', XLSX.write(wbCuotas, { type: 'array', bookType: 'xlsx' }));

    // CSV para el SUA (situación vigente de trabajadores activos, no del mes histórico)
    const filasSUA = _calcularFilasSUA();
    if (filasSUA.length) zip.file('04-SUA.csv', _textoSUAcsv(filasSUA));

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url; a.download = `paquete-contador-${anio}-${String(mes).padStart(2,'0')}.zip`;
    a.click(); URL.revokeObjectURL(url);
  } catch(e) {
    alert('Error al generar el paquete: ' + e.message);
  } finally {
    btnRestaurar(btn);
  }
}
