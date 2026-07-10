/**
 * LiquidaLFT — Motor de Cálculo + Generación de Documentos PDF
 * Ley Federal del Trabajo (LFT) — México 2026
 * ============================================================
 */

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const SMG_GENERAL      = 315.04;
const SMG_FRONTERA     = 440.87;
const AGUINALDO_DAYS   = 15;
const PRIMA_VAC_PCT    = 0.25;
const PRIMA_ANTIG_DAYS = 12;
const INDEM_CONST_DAYS = 90;
const DIAS_20_POR_ANIO = 20;

const VACATION_TABLE = [
  { from:1,  to:1,  days:12 }, { from:2,  to:2,  days:14 },
  { from:3,  to:3,  days:16 }, { from:4,  to:4,  days:18 },
  { from:5,  to:9,  days:20 }, { from:10, to:14, days:22 },
  { from:15, to:19, days:24 }, { from:20, to:24, days:26 },
  { from:25, to:29, days:28 }, { from:30, to:34, days:30 },
  { from:35, to:39, days:32 },
];

// ─── APP STATE ────────────────────────────────────────────────────────────────
const state = {
  step: 1,
  mode: 'liquidacion',
  result: null,
  formData: {}
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmt = (v) => new Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN', minimumFractionDigits:2 }).format(v);

function daysBetween(a, b) { return Math.max(0, Math.floor((b - a) / 86400000)); }

function fullYears(start, end) {
  let y = end.getFullYear() - start.getFullYear();
  const m = end.getMonth() - start.getMonth();
  if (m < 0 || (m === 0 && end.getDate() < start.getDate())) y--;
  return Math.max(0, y);
}

function fracYears(start, end) { return Math.max(0, daysBetween(start, end) / 365); }

function vacDaysForYear(yrs) {
  if (yrs <= 0) return 12;
  for (const r of VACATION_TABLE) if (yrs >= r.from && yrs <= r.to) return r.days;
  return 30 + (Math.floor((yrs - 30) / 5) + 1) * 2;
}

function propVacDays(start, end) {
  const completed   = fullYears(start, end);
  const entitlement = vacDaysForYear(completed + 1); // año en curso
  const anniversary = new Date(start);
  anniversary.setFullYear(anniversary.getFullYear() + completed);
  const elapsed  = daysBetween(anniversary, end);
  const fraction = Math.min(1, elapsed / 365);
  return parseFloat((entitlement * fraction).toFixed(4));
}

function diasEnAnoCalendario(startDate, endDate) {
  const inicioAno = new Date(endDate.getFullYear(), 0, 1);
  const fechaBase = startDate > inicioAno ? startDate : inicioAno;
  return Math.max(0, daysBetween(fechaBase, endDate));
}

function calcSalarioDiario(monto, periodo) {
  if (periodo === 'quincenal') return monto / 15;
  if (periodo === 'semanal')   return monto / 7;
  return monto / 30;
}

function calcSDI(daily, vacDays, primaPct, agDays) {
  return daily * (1 + (vacDays * primaPct + agDays) / 365);
}

/** Spanish month names */
const MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];

function formatDateLong(d) {
  const date = d instanceof Date ? d : new Date(d + 'T00:00:00');
  return `${date.getDate()} de ${MESES[date.getMonth()]} de ${date.getFullYear()}`;
}

function formatDateShort(d) {
  const date = d instanceof Date ? d : new Date(d + 'T00:00:00');
  const day   = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year  = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/** Strip accents for PDF (Helvetica font safety) */
function np(s) {
  return (s || '').toString()
    .replace(/[áà]/g,'a').replace(/[éè]/g,'e').replace(/[íì]/g,'i')
    .replace(/[óò]/g,'o').replace(/[úùü]/g,'u').replace(/ñ/g,'n')
    .replace(/[ÁÀ]/g,'A').replace(/[ÉÈ]/g,'E').replace(/[ÍÌ]/g,'I')
    .replace(/[ÓÒ]/g,'O').replace(/[ÚÙÜ]/g,'U').replace(/Ñ/g,'N')
    .replace(/[¿¡]/g,'');
}

function npDate(d) { return np(formatDateLong(d)); }

// ─── CALCULATION ENGINE ───────────────────────────────────────────────────────
function calcLiquidacion(p) {
  const smg   = p.smgZone === 'frontera' ? SMG_FRONTERA : SMG_GENERAL;
  const daily = calcSalarioDiario(p.monthlySalary, p.periodoSalario || 'mensual');
  const completed   = fullYears(p.startDate, p.endDate);
  const frac        = fracYears(p.startDate, p.endDate);
  const entitlement = vacDaysForYear(completed + 1);
  const sdi    = calcSDI(daily, entitlement, PRIMA_VAC_PCT, AGUINALDO_DAYS);
  const sdiCap = Math.min(sdi, 2 * smg);

  const propVac  = propVacDays(p.startDate, p.endDate);
  const vacPend  = p.vacacionesPendientes || 0;
  const vacTotal = propVac + vacPend;
  const vac = vacTotal * sdi;
  const pv  = vac * PRIMA_VAC_PCT;

  const esDiciembre = p.endDate.getMonth() === 11;
  const diasAg = p.aguinaldoPagado ? 0
    : (esDiciembre ? 365 : diasEnAnoCalendario(p.startDate, p.endDate));
  const ag = AGUINALDO_DAYS * (diasAg / 365) * sdi;

  const ic = INDEM_CONST_DAYS * sdi;
  const pa = PRIMA_ANTIG_DAYS * frac * sdiCap;
  const sp = (p.diasPendientes || 0) * daily;
  const total = ic + pa + vac + pv + ag + sp;

  const itemsVac = vacPend > 0
    ? [
        { icon:'🌴', bg:'rgba(46,204,113,.15)', name:'Vacaciones devengadas (años anteriores)',
          calc:`${vacPend} días x ${fmt(sdi)}`, amount: vacPend * sdi },
        { icon:'🌴', bg:'rgba(46,204,113,.10)', name:'Vacaciones proporcionales (año en curso)',
          calc:`${propVac.toFixed(1)} días x ${fmt(sdi)}`, amount: propVac * sdi },
      ]
    : [{ icon:'🌴', bg:'rgba(46,204,113,.15)', name:'Vacaciones proporcionales',
         calc:`${propVac.toFixed(1)} días x ${fmt(sdi)}`, amount: vac }];

  const diasLaborados  = daysBetween(p.startDate, p.endDate);
  const diasEnAnio     = diasEnAnoCalendario(p.startDate, p.endDate);

  return {
    type:'liquidacion', sdi, sdiCap, smg, daily,
    completed, frac, propVac, vacPend, vacTotal, entitlement, diasLaborados, diasEnAnio,
    items:[
      { icon:'⚖️', bg:'rgba(245,166,35,.15)', name:'Indemnización constitucional',
        calc:`${INDEM_CONST_DAYS} días x ${fmt(sdi)} SDI`, amount:ic },
      { icon:'🏅', bg:'rgba(155,89,182,.15)', name:'Prima de antigüedad',
        calc:`${frac.toFixed(2)} años x ${PRIMA_ANTIG_DAYS} días x ${fmt(sdiCap)} (tope 2×SMG)`, amount:pa },
      ...itemsVac,
      { icon:'✨', bg:'rgba(26,188,156,.15)', name:'Prima vacacional',
        calc:`${fmt(vac)} x 25%`, amount:pv },
      { icon:'🎄', bg:'rgba(231,76,60,.15)', name:'Aguinaldo proporcional',
        calc: p.aguinaldoPagado ? 'Ya pagado este año' : `${diasAg} días (${p.endDate.getFullYear()}) x ${fmt(sdi)} ÷ 365`,
        amount:ag },
      { icon:'💼', bg:'rgba(149,165,166,.15)', name:'Salarios pendientes',
        calc:`${p.diasPendientes||0} día${(p.diasPendientes||0)!==1?'s':''} x ${fmt(daily)}`, amount:sp },
    ],
    total
  };
}

function calcFiniquito(p) {
  const smg   = p.smgZone === 'frontera' ? SMG_FRONTERA : SMG_GENERAL;
  const daily = calcSalarioDiario(p.monthlySalary, p.periodoSalario || 'mensual');
  const completed   = fullYears(p.startDate, p.endDate);
  const frac        = fracYears(p.startDate, p.endDate);
  const entitlement = vacDaysForYear(completed + 1);
  const sdi    = calcSDI(daily, entitlement, PRIMA_VAC_PCT, AGUINALDO_DAYS);
  const sdiCap = Math.min(sdi, 2 * smg);
  const hasAntig = completed >= 15 || p.tieneAntig;

  const propVac  = propVacDays(p.startDate, p.endDate);
  const vacPend  = p.vacacionesPendientes || 0;
  const vacTotal = propVac + vacPend;
  const vac = vacTotal * sdi;
  const pv  = vac * PRIMA_VAC_PCT;

  const esDiciembre = p.endDate.getMonth() === 11;
  const diasAg = p.aguinaldoPagado ? 0
    : (esDiciembre ? 365 : diasEnAnoCalendario(p.startDate, p.endDate));
  const ag = AGUINALDO_DAYS * (diasAg / 365) * sdi;

  const pa = hasAntig ? PRIMA_ANTIG_DAYS * frac * sdiCap : 0;
  const sp = (p.diasPendientes || 0) * daily;
  const total = vac + pv + ag + pa + sp;

  const itemsVac = vacPend > 0
    ? [
        { icon:'🌴', bg:'rgba(46,204,113,.15)', name:'Vacaciones devengadas (años anteriores)',
          calc:`${vacPend} días x ${fmt(sdi)}`, amount: vacPend * sdi },
        { icon:'🌴', bg:'rgba(46,204,113,.10)', name:'Vacaciones proporcionales (año en curso)',
          calc:`${propVac.toFixed(1)} días x ${fmt(sdi)}`, amount: propVac * sdi },
      ]
    : [{ icon:'🌴', bg:'rgba(46,204,113,.15)', name:'Vacaciones proporcionales',
         calc:`${propVac.toFixed(1)} días x ${fmt(sdi)}`, amount: vac }];

  const diasLaborados  = daysBetween(p.startDate, p.endDate);
  const diasEnAnio     = diasEnAnoCalendario(p.startDate, p.endDate);

  return {
    type:'finiquito', sdi, sdiCap, smg, daily,
    completed, frac, propVac, vacPend, vacTotal, entitlement, diasLaborados, diasEnAnio,
    items:[
      ...itemsVac,
      { icon:'✨', bg:'rgba(26,188,156,.15)', name:'Prima vacacional',
        calc:`${fmt(vac)} x 25%`, amount:pv },
      { icon:'🎄', bg:'rgba(231,76,60,.15)', name:'Aguinaldo proporcional',
        calc: p.aguinaldoPagado ? 'Ya pagado este año' : `${diasAg} días (${p.endDate.getFullYear()}) x ${fmt(sdi)} ÷ 365`,
        amount:ag },
      { icon:'🏅', bg:'rgba(155,89,182,.15)', name:'Prima de antigüedad',
        calc: hasAntig ? `${frac.toFixed(2)} años x ${PRIMA_ANTIG_DAYS} días x ${fmt(sdiCap)}` : 'No aplica (< 15 años)',
        amount:pa },
      { icon:'💼', bg:'rgba(149,165,166,.15)', name:'Salarios pendientes',
        calc:`${p.diasPendientes||0} día${(p.diasPendientes||0)!==1?'s':''} x ${fmt(daily)}`, amount:sp },
    ],
    total
  };
}

// ─── PDF DOCUMENT GENERATORS ──────────────────────────────────────────────────

/** Shared: draw horizontal line */
function pdfLine(doc, y, ml, mr) {
  const pw = doc.internal.pageSize.getWidth();
  doc.setDrawColor(200,200,200);
  doc.setLineWidth(0.3);
  doc.line(ml, y, pw - mr, y);
  return y + 3;
}

/** Shared: draw page header band */
function pdfHeader(doc, title, subtitle, ml, mr) {
  const pw = doc.internal.pageSize.getWidth();
  doc.setFillColor(15, 20, 40);
  doc.rect(0, 0, pw, 32, 'F');
  doc.setTextColor(245, 166, 35);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(np(title), pw / 2, 13, { align:'center' });
  doc.setFontSize(8);
  doc.setTextColor(180, 185, 200);
  doc.setFont('helvetica', 'normal');
  doc.text(np(subtitle), pw / 2, 21, { align:'center' });
  return 40;
}

/** Shared: signature block at bottom */
function pdfSignatures(doc, patron, trabajador, y, ml, mr) {
  const pw = doc.internal.pageSize.getWidth();
  const mid = pw / 2;
  const sigY = y + 20;

  doc.setDrawColor(150,150,150);
  doc.setLineWidth(0.4);
  doc.line(ml, sigY, mid - 12, sigY);
  doc.line(mid + 12, sigY, pw - mr, sigY);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(30,30,30);
  doc.text(np('EL PATRON / REPRESENTANTE'), (ml + mid - 12) / 2, sigY + 5, { align:'center' });
  doc.text(np('EL TRABAJADOR'), (mid + 12 + pw - mr) / 2, sigY + 5, { align:'center' });

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100,100,100);
  const pLines = doc.splitTextToSize(np(patron), mid - ml - 20);
  doc.text(pLines, (ml + mid - 12) / 2, sigY + 11, { align:'center' });
  const wLines = doc.splitTextToSize(np(trabajador), pw - mr - mid - 20);
  doc.text(wLines, (mid + 12 + pw - mr) / 2, sigY + 11, { align:'center' });

  return sigY + 30;
}

// ─── PDF 1: Carta de Renuncia ─────────────────────────────────────────────────
function generateCartaRenuncia() {
  const { jsPDF } = window.jspdf;
  const doc  = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  const ml   = 25, mr = 25;
  const pw   = doc.internal.pageSize.getWidth();
  const tw   = pw - ml - mr;
  const fd   = state.formData;
  let y      = pdfHeader(doc, 'CARTA DE RENUNCIA VOLUNTARIA',
    'Ley Federal del Trabajo — Articulo 51', ml, mr);

  // City / Date
  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(60,60,60);
  doc.text(`${np(fd.ciudadFirma)}, a ${npDate(fd.endDate)}`, pw - mr, y, { align:'right' });
  y += 12;

  // Addressee
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(20,20,20);
  doc.text(np(fd.razonSocial.toUpperCase()), ml, y);
  y += 6;
  if (fd.representanteLegal) {
    doc.setFont('helvetica','normal');
    doc.text(`Attn.: ${np(fd.representanteLegal)}`, ml, y); y += 6;
  }
  if (fd.domicilioFiscal) {
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(80,80,80);
    doc.text(np(fd.domicilioFiscal), ml, y); y += 6;
  }
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(20,20,20);
  doc.text('P  R  E  S  E  N  T  E', ml, y); y += 12;

  // Body
  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(40,40,40);
  const puesto = fd.puesto || 'empleado(a)';
  const depto  = fd.departamento ? ` en el departamento de ${np(fd.departamento)}` : '';

  const p1 = `Por medio del presente escrito, yo ${np(fd.nombreTrabajador)}, con RFC ${np(fd.rfcTrabajador || 'N/A')} y CURP ${np(fd.curp || 'N/A')}, quien he prestado mis servicios como ${np(puesto)}${np(depto)} en su empresa desde el ${npDate(fd.startDate)}, me permito comunicarle mi decision de presentar RENUNCIA VOLUNTARIA e irrevocable al cargo que venia desempenando, con efectos a partir del dia ${npDate(fd.endDate)}.`;
  const l1 = doc.splitTextToSize(p1, tw);
  doc.text(l1, ml, y); y += l1.length * 5.5 + 8;

  const p2 = `Lo anterior de conformidad con lo dispuesto por la Ley Federal del Trabajo vigente, sin que medie presion o condicionamiento alguno de parte de la empresa.`;
  const l2 = doc.splitTextToSize(p2, tw);
  doc.text(l2, ml, y); y += l2.length * 5.5 + 8;

  const p3 = `Por medio de la presente, manifiesto que no tengo adeudo alguno pendiente con la empresa por ningun concepto, y agradezco sinceramente la oportunidad de haber formado parte de su organizacion. Quedo en espera del pago de las prestaciones proporcionales correspondientes conforme a la Ley.`;
  const l3 = doc.splitTextToSize(p3, tw);
  doc.text(l3, ml, y); y += l3.length * 5.5 + 12;

  doc.text('Sin otro particular, quedo de usted.', ml, y); y += 8;
  doc.setFont('helvetica','italic');
  doc.text('A t e n t a m e n t e,', ml, y); y += 18;

  // Signature
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  doc.line(ml, y, ml + 100, y); y += 5;
  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(30,30,30);
  doc.text(np(fd.nombreTrabajador), ml, y); y += 5;
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(80,80,80);
  if (fd.rfcTrabajador) { doc.text(`RFC: ${np(fd.rfcTrabajador)}`, ml, y); y += 4.5; }
  if (fd.curp)          { doc.text(`CURP: ${np(fd.curp)}`, ml, y); y += 4.5; }
  if (fd.nss)           { doc.text(`NSS: ${np(fd.nss)}`, ml, y); y += 4.5; }

  // Footer
  const ph = doc.internal.pageSize.getHeight();
  doc.setFontSize(7); doc.setTextColor(160,160,160);
  doc.text('Documento generado por LiquidaLFT — Caracter referencial, no sustituye asesoria legal', pw/2, ph - 10, { align:'center' });

  doc.save('carta-renuncia.pdf');
}

// ─── PDF 2: Aviso de Rescisión ────────────────────────────────────────────────
function generateAvisoRecision() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  const ml  = 25, mr = 25;
  const pw  = doc.internal.pageSize.getWidth();
  const tw  = pw - ml - mr;
  const fd  = state.formData;
  const r   = state.result;
  let y     = pdfHeader(doc, 'AVISO DE TERMINACION DE RELACION LABORAL',
    'Articulo 53 fraccion I — Ley Federal del Trabajo', ml, mr);

  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(60,60,60);
  doc.text(`${np(fd.ciudadFirma)}, a ${npDate(fd.endDate)}`, pw - mr, y, { align:'right' });
  y += 12;

  // Addressee (trabajador)
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(20,20,20);
  doc.text(`C. ${np(fd.nombreTrabajador).toUpperCase()}`, ml, y); y += 6;
  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(40,40,40);
  if (fd.puesto) { doc.text(`Cargo: ${np(fd.puesto)}`, ml, y); y += 6; }
  doc.setFont('helvetica','bold');
  doc.text('P  R  E  S  E  N  T  E', ml, y); y += 12;

  // Body
  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(40,40,40);
  const rep = fd.representanteLegal ? ` a traves de su Representante Legal ${np(fd.representanteLegal)},` : ',';
  const body1 = `Por medio del presente, ${np(fd.razonSocial)}${rep} con RFC ${np(fd.rfcPatron || 'N/A')}, le comunica formalmente la TERMINACION DE SU RELACION LABORAL, con efectos a partir del dia ${npDate(fd.endDate)}, en terminos de los articulos 49 y 50 de la Ley Federal del Trabajo.`;
  const l1 = doc.splitTextToSize(body1, tw);
  doc.text(l1, ml, y); y += l1.length * 5.5 + 8;

  const body2 = `La empresa procede al pago de la indemnizacion y demas prestaciones legales correspondientes, cuyo desglose se detalla en el Recibo de Liquidacion adjunto al presente aviso.`;
  const l2 = doc.splitTextToSize(body2, tw);
  doc.text(l2, ml, y); y += l2.length * 5.5 + 10;

  // Data table
  y = pdfLine(doc, y, ml, mr) + 4;
  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(50,50,50);
  doc.text('DATOS DE LA RELACION LABORAL', ml, y); y += 8;

  const rows = [
    ['Trabajador',       np(fd.nombreTrabajador)],
    ['RFC Trabajador',   np(fd.rfcTrabajador || 'N/A')],
    ['CURP',             np(fd.curp || 'N/A')],
    ['NSS (IMSS)',        np(fd.nss || 'N/A')],
    ['Puesto',           np(fd.puesto || 'N/A')],
    ['Departamento',     np(fd.departamento || 'N/A')],
    ['Fecha de ingreso', npDate(fd.startDate)],
    ['Fecha de baja',    npDate(fd.endDate)],
    ['Antiguedad',       `${r.completed} ano${r.completed!==1?'s':''} (${r.frac.toFixed(2)} fraccion)`],
    ['Salario mensual',  fmt(fd.monthlySalary)],
    ['SDI',              fmt(r.sdi)],
  ];

  doc.autoTable({
    startY: y, margin: { left: ml, right: mr },
    head: [['Concepto','Dato']],
    body: rows,
    styles: { fontSize:9, cellPadding:3, textColor:[40,40,40] },
    headStyles: { fillColor:[245,166,35], textColor:[0,0,0], fontStyle:'bold', fontSize:8 },
    alternateRowStyles: { fillColor:[248,248,252] },
    columnStyles: { 0: { fontStyle:'bold', cellWidth:60 } },
    theme: 'grid'
  });
  y = doc.lastAutoTable.finalY + 14;

  // Signatures
  const body3 = `Conforme a lo anterior, el Trabajador reconoce haber sido notificado de la terminacion de su relacion laboral y queda en espera del pago de los conceptos estipulados por la Ley.`;
  const l3 = doc.splitTextToSize(body3, tw);
  doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(40,40,40);
  doc.text(l3, ml, y); y += l3.length * 5.5 + 10;

  pdfSignatures(doc, `${np(fd.razonSocial)}\nRFC: ${np(fd.rfcPatron||'N/A')}`,
                     `${np(fd.nombreTrabajador)}\nRFC: ${np(fd.rfcTrabajador||'N/A')}`, y, ml, mr);

  const ph = doc.internal.pageSize.getHeight();
  doc.setFontSize(7); doc.setTextColor(160,160,160);
  doc.text('Documento generado por LiquidaLFT — Caracter referencial, no sustituye asesoria legal', pw/2, ph-10, { align:'center' });
  doc.save('aviso-rescision.pdf');
}

// ─── PDF 3: Recibo de Liquidación / Finiquito ─────────────────────────────────
function generateRecibo() {
  const { jsPDF } = window.jspdf;
  const doc   = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  const ml    = 25, mr = 25;
  const pw    = doc.internal.pageSize.getWidth();
  const tw    = pw - ml - mr;
  const fd    = state.formData;
  const r     = state.result;
  const isLiq = r.type === 'liquidacion';
  const tipo  = isLiq ? 'LIQUIDACION' : 'FINIQUITO';
  const folio = `${tipo.charAt(0)}-${Date.now().toString().slice(-6)}`;
  let y       = pdfHeader(doc, `RECIBO DE ${tipo}`, `Folio: ${folio} | Ley Federal del Trabajo`, ml, mr);

  // Parties header
  doc.setFillColor(248,248,252);
  doc.rect(ml, y - 2, tw, 34, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(100,100,100);
  doc.text('EL PATRON', ml + 4, y + 4);
  doc.text('EL TRABAJADOR', pw / 2 + 4, y + 4);

  doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(20,20,20);
  doc.text(np(fd.razonSocial), ml + 4, y + 10);
  doc.text(np(fd.nombreTrabajador), pw / 2 + 4, y + 10);

  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(80,80,80);
  const patronInfo = [
    fd.rfcPatron && `RFC: ${np(fd.rfcPatron)}`,
    fd.representanteLegal && `Rep: ${np(fd.representanteLegal)}`,
  ].filter(Boolean);

  const trabajadorInfo = [
    fd.rfcTrabajador && `RFC: ${np(fd.rfcTrabajador)}`,
    fd.curp && `CURP: ${np(fd.curp)}`,
    fd.nss  && `NSS: ${np(fd.nss)}`,
    fd.puesto && `Puesto: ${np(fd.puesto)}`,
  ].filter(Boolean);

  let yInfo = y + 16;
  patronInfo.forEach(l => { doc.text(l, ml + 4, yInfo); yInfo += 4.5; });
  yInfo = y + 16;
  trabajadorInfo.forEach(l => { doc.text(l, pw / 2 + 4, yInfo); yInfo += 4.5; });

  doc.setDrawColor(220,220,220); doc.setLineWidth(0.3);
  doc.line(pw/2, y - 2, pw/2, y + 32);
  y += 36;

  // Period info
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(60,60,60);
  const periodText = `Periodo: ${npDate(fd.startDate)} al ${npDate(fd.endDate)}  |  Antiguedad: ${r.completed} anos  |  Salario mensual: ${fmt(fd.monthlySalary)}  |  SDI: ${fmt(r.sdi)}`;
  const periodLines = doc.splitTextToSize(periodText, tw);
  doc.text(periodLines, ml, y); y += periodLines.length * 5 + 8;

  // Table
  const head = [['Concepto','Calculo','Importe']];
  const body  = r.items.map(item => [
    np(item.name),
    np(item.calc),
    fmt(item.amount)
  ]);

  doc.autoTable({
    startY: y,
    margin: { left: ml, right: mr },
    head, body,
    foot: [['','TOTAL', fmt(r.total)]],
    styles: { fontSize:9, cellPadding:3.5, textColor:[40,40,40] },
    headStyles: { fillColor:[245,166,35], textColor:[0,0,0], fontStyle:'bold', fontSize:8.5 },
    footStyles: { fillColor:[30,40,80], textColor:[245,166,35], fontStyle:'bold', fontSize:10 },
    alternateRowStyles: { fillColor:[250,250,255] },
    columnStyles: {
      0: { cellWidth:72, fontStyle:'bold' },
      1: { cellWidth:68, textColor:[100,100,100] },
      2: { cellWidth:36, halign:'right', fontStyle:'bold' }
    },
    theme: 'grid'
  });
  y = doc.lastAutoTable.finalY + 14;

  // Declaration
  const decl = `En la Ciudad de ${np(fd.ciudadFirma)}, a ${npDate(fd.endDate)}, el C. ${np(fd.nombreTrabajador)} declara haber recibido de ${np(fd.razonSocial)} la cantidad total de ${np(fmt(r.total))} (${np(numToWords(r.total))} PESOS 00/100 M.N.) por concepto de ${tipo}, manifestando que con dicho pago no tiene reclamacion adicional alguna en contra del Patron por concepto de salarios, prestaciones, indemnizaciones o cualquier otro derivado de la relacion laboral, en terminos de los articulos 50, 76, 80, 87 y 162 de la Ley Federal del Trabajo.`;
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(40,40,40);
  const declLines = doc.splitTextToSize(decl, tw);
  doc.text(declLines, ml, y); y += declLines.length * 5 + 12;

  // Check if need new page for signatures
  if (y > 220) { doc.addPage(); y = 25; }

  pdfSignatures(doc,
    `${np(fd.razonSocial)}\nRFC: ${np(fd.rfcPatron||'N/A')}`,
    `${np(fd.nombreTrabajador)}\nRFC: ${np(fd.rfcTrabajador||'N/A')}`,
    y, ml, mr);

  const ph = doc.internal.pageSize.getHeight();
  doc.setFontSize(7); doc.setTextColor(160,160,160);
  doc.text(`Folio ${folio} | LiquidaLFT | Caracter referencial, no sustituye asesoria legal`, pw/2, ph-10, { align:'center' });
  doc.save(`recibo-${isLiq ? 'liquidacion' : 'finiquito'}.pdf`);
}

/** Simple number-to-words (hundreds) for totals */
function numToWords(num) {
  const n = Math.floor(num);
  if (n === 0) return 'CERO';
  const u = ['','UN','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE',
             'DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISEIS','DIECISIETE','DIECIOCHO','DIECINUEVE'];
  const d = ['','','VEINTE','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'];
  const c = ['','CIEN','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS',
             'SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];
  function toWords(n) {
    if (n < 20) return u[n];
    if (n < 100) return d[Math.floor(n/10)] + (n%10 ? ' Y ' + u[n%10] : '');
    if (n === 100) return 'CIEN';
    if (n < 1000) return c[Math.floor(n/100)] + (n%100 ? ' ' + toWords(n%100) : '');
    if (n < 1000000) {
      const th = Math.floor(n/1000);
      return (th === 1 ? 'MIL' : toWords(th) + ' MIL') + (n%1000 ? ' ' + toWords(n%1000) : '');
    }
    return n.toLocaleString();
  }
  return toWords(n);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function shakeField(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.borderColor = '#e74c3c';
  el.style.boxShadow = '0 0 0 3px rgba(231,76,60,.2)';
  el.focus();
  setTimeout(() => { el.style.borderColor = ''; el.style.boxShadow = ''; }, 2000);
}

function scrollToCalc() {
  document.getElementById('calculadora').scrollIntoView({ behavior:'smooth', block:'start' });
}

// ─── TOGGLE CAMPOS CONDICIONALES ─────────────────────────────────────────────
function toggleVacPendientes(gozadas) {
  const g = document.getElementById('vac-pendientes-group');
  if (g) g.classList.toggle('hidden', gozadas);
}

function checkFechaBaja() {
  const endStr = document.getElementById('end-date').value;
  if (!endStr) return;
  const endDate = new Date(endStr + 'T00:00:00');
  const esDiciembre = endDate.getMonth() === 11;
  const g = document.getElementById('ag-pagado-group');
  if (g) g.classList.toggle('hidden', !esDiciembre);
}

// ─── COLLECT FORM DATA (solo datos laborales) ─────────────────────────────────
function collectFormData() {
  const startStr = document.getElementById('start-date').value;
  const endStr   = document.getElementById('end-date').value;
  const salary   = parseFloat(document.getElementById('monthly-salary').value);

  if (!startStr || !endStr || !salary || salary <= 0) return null;

  const startDate = new Date(startStr + 'T00:00:00');
  const endDate   = new Date(endStr   + 'T00:00:00');
  if (startDate >= endDate) return null;

  const vacGozadas = document.getElementById('vac-gozadas')?.checked ?? true;

  return {
    startDate, endDate,
    monthlySalary:        salary,
    periodoSalario:       document.getElementById('periodo-salario')?.value || 'mensual',
    smgZone:              document.getElementById('smg-zone').value,
    diasPendientes:       parseInt(document.getElementById('dias-pendientes').value) || 0,
    tieneAntig:           document.getElementById('tiene-antig')?.checked || false,
    vacacionesPendientes: vacGozadas ? 0 : (parseInt(document.getElementById('vac-pendientes')?.value) || 0),
    aguinaldoPagado:      document.getElementById('ag-pagado')?.checked || false,
    // Campos de documentos — se llenan desde el formulario opcional
    razonSocial: '', rfcPatron: '', representanteLegal: '', domicilioFiscal: '',
    ciudadFirma: 'México', nombreTrabajador: '', rfcTrabajador: '',
    curp: '', nss: '', puesto: '', departamento: '',
  };
}

// ─── COLLECT DOCS FORM DATA (opcional, para generación de PDFs) ───────────────
function collectDocsFormData() {
  return {
    razonSocial:        document.getElementById('razon-social')?.value.trim()        || '',
    ciudadFirma:        document.getElementById('ciudad-firma')?.value.trim()        || 'México',
    rfcPatron:          document.getElementById('rfc-patron')?.value.trim()          || '',
    representanteLegal: document.getElementById('representante-legal')?.value.trim() || '',
    domicilioFiscal:    document.getElementById('domicilio-fiscal')?.value.trim()    || '',
    nombreTrabajador:   document.getElementById('nombre-trabajador')?.value.trim()   || '',
    rfcTrabajador:      document.getElementById('rfc-trabajador')?.value.trim()      || '',
    curp:               document.getElementById('curp')?.value.trim()                || '',
    nss:                document.getElementById('nss')?.value.trim()                 || '',
    puesto:             document.getElementById('puesto')?.value.trim()              || '',
    departamento:       document.getElementById('departamento')?.value.trim()        || '',
  };
}

function prepareDocsFormData() {
  const docs = collectDocsFormData();
  if (!docs.razonSocial)      { shakeField('razon-social');      return false; }
  if (!docs.ciudadFirma)      { shakeField('ciudad-firma');       return false; }
  if (!docs.nombreTrabajador) { shakeField('nombre-trabajador'); return false; }
  Object.assign(state.formData, docs);
  return true;
}

// ─── MAIN CALCULATE HANDLER ───────────────────────────────────────────────────
function handleCalculate() {
  const fd = collectFormData();
  if (!fd) {
    const btn = document.getElementById('btn-calc');
    btn.style.background = 'linear-gradient(135deg,#e74c3c,#c0392b)';
    btn.querySelector('.btn-calc-label').textContent = 'Completa todos los campos requeridos';
    setTimeout(() => {
      btn.style.background = '';
      btn.querySelector('.btn-calc-label').textContent = 'Calcular Finiquito y Liquidación';
    }, 2500);
    return;
  }

  state.formData  = fd;
  state.resultLiq = calcLiquidacion(fd);
  state.resultFin = calcFiniquito(fd);
  state.result    = state.resultLiq; // default para PDFs

  // Cerrar docs form si estaba abierto
  document.getElementById('docs-optional-form').classList.add('hidden');
  document.getElementById('btn-toggle-docs').textContent = '📄 Generar documentos (opcional) ▾';

  renderResults(state.resultLiq, state.resultFin, fd);

  const section = document.getElementById('results-section');
  section.classList.remove('hidden');
  setTimeout(() => section.scrollIntoView({ behavior:'smooth', block:'start' }), 100);
}

// ─── RENDER RESULTS ───────────────────────────────────────────────────────────
function renderResults(liqResult, finResult, params) {
  renderSummaryBar(liqResult, params);
  renderCalcColumn('panel-finiquito',   finResult, 'FINIQUITO',   '📄', '#27ae60');
  renderCalcColumn('panel-liquidacion', liqResult, 'LIQUIDACIÓN', '⚖️', '#f5a623');
}

function renderSummaryBar(result, params) {
  const bar = document.getElementById('results-summary');
  bar.className = 'sdi-box animate-in';
  bar.innerHTML = `
    <div>
      <div class="sdi-item-label">Días laborados</div>
      <div class="sdi-item-value">${result.diasLaborados.toLocaleString('es-MX')}</div>
    </div>
    <div>
      <div class="sdi-item-label">Período</div>
      <div class="sdi-item-value" style="font-size:.9rem;">${formatDateShort(params.startDate)} → ${formatDateShort(params.endDate)}</div>
    </div>
    <div>
      <div class="sdi-item-label">Antigüedad</div>
      <div class="sdi-item-value">${result.completed} año${result.completed!==1?'s':''}</div>
    </div>
    <div>
      <div class="sdi-item-label">Salario Diario</div>
      <div class="sdi-item-value">${fmt(result.daily)}</div>
    </div>
    <div>
      <div class="sdi-item-label">SDI</div>
      <div class="sdi-item-value highlight">${fmt(result.sdi)}</div>
    </div>
    <div>
      <div class="sdi-item-label">Días laborados en ${params.endDate.getFullYear()}</div>
      <div class="sdi-item-value">${result.diasEnAnio} días</div>
    </div>
  `;
}

function renderCalcColumn(panelId, result, typeLabel, icon, accentColor) {
  const panel = document.getElementById(panelId);
  panel.innerHTML = '';

  // Total card
  const total = document.createElement('div');
  total.className = 'total-card animate-in';
  total.innerHTML = `
    <div class="total-label">${icon} ${typeLabel}</div>
    <div class="total-amount">${fmt(result.total)}</div>
    <div class="total-subtitle">${typeLabel === 'LIQUIDACIÓN'
      ? 'Despido injustificado — Arts. 49–50 LFT'
      : 'Renuncia voluntaria — Art. 51 LFT'}</div>
    <div class="total-badge">⚡ Conforme a la LFT 2026</div>
  `;
  panel.appendChild(total);

  // Desglose
  const bk = document.createElement('div');
  bk.className = 'card animate-in';
  bk.style.animationDelay = '.07s';
  bk.innerHTML = `
    <div class="breakdown-header">
      <span class="breakdown-title">Desglose de conceptos</span>
      <span class="breakdown-count">${result.items.length} conceptos</span>
    </div>
  `;

  // Fila de días laborados
  const diasRow = document.createElement('div');
  diasRow.className = 'breakdown-row';
  diasRow.innerHTML = `
    <div class="breakdown-icon" style="background:rgba(100,120,200,.15)">📅</div>
    <div class="breakdown-info">
      <div class="breakdown-name">Días laborados</div>
      <div class="breakdown-calc">${formatDateShort(state.formData.startDate)} → ${formatDateShort(state.formData.endDate)}</div>
    </div>
    <div class="breakdown-amount" style="font-size:.95rem;">${result.diasLaborados} días</div>
  `;
  bk.appendChild(diasRow);

  result.items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'breakdown-row';
    row.innerHTML = `
      <div class="breakdown-icon" style="background:${item.bg}">${item.icon}</div>
      <div class="breakdown-info">
        <div class="breakdown-name">${item.name}</div>
        <div class="breakdown-calc">${item.calc}</div>
      </div>
      <div class="breakdown-amount ${item.amount===0?'zero':''}">${fmt(item.amount)}</div>
    `;
    bk.appendChild(row);
  });
  panel.appendChild(bk);

  // Nota ISR (solo liquidación)
  if (result.type === 'liquidacion') {
    const note = document.createElement('div');
    note.className = 'info-note animate-in';
    note.style.animationDelay = '.15s';
    note.innerHTML = `<span class="note-icon">ℹ️</span><span>Posible exención de ISR hasta ${fmt(result.sdi * 90)} (90 días SDI, Art. 93 LISR). Consulta a un contador.</span>`;
    panel.appendChild(note);
  }
}

// ─── FAQ ACCORDION ────────────────────────────────────────────────────────────
function initFAQ() {
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });
}

// ─── NAVBAR SCROLL ────────────────────────────────────────────────────────────
function initNavbar() {
  const nav = document.querySelector('.site-nav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 60);
  });
}


// ─── VACATION TABLE ───────────────────────────────────────────────────────────
function buildVacationTable() {
  const rows = [
    { label:'1 año',       days:12 },
    { label:'2 años',      days:14 },
    { label:'3 años',      days:16 },
    { label:'4 años',      days:18 },
    { label:'5 – 9 años',  days:20 },
    { label:'10 – 14 años',days:22 },
    { label:'15 – 19 años',days:24 },
    { label:'20 – 24 años',days:26 },
    { label:'25 – 29 años',days:28 },
    { label:'30 – 34 años',days:30 },
    { label:'35 – 39 años',days:32 },
  ];
  const tbody = document.getElementById('vac-tbody');
  rows.forEach(r => {
    const conPrima = (r.days * 1.25).toFixed(0);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600;padding:12px 20px;">${r.label}</td>
      <td style="padding:12px 20px;"><span class="vac-badge">${r.days} días</span></td>
      <td style="padding:12px 20px;" class="vac-prima">${conPrima} días</td>
    `;
    tbody.appendChild(tr);
  });
}

// ─── ACTAS ADMINISTRATIVAS ────────────────────────────────────────────────────

const FALTAS_CATALOG = [
  { value:'impuntualidad', label:'Impuntualidad reiterada',
    causal:'Art. 134 Fracc. II LFT — Obligación de desempeñar el servicio con la intensidad, cuidado y esmero apropiados / Reglamento Interior de Trabajo',
    severity:['amonestacion','formal'] },
  { value:'desobediencia', label:'Desobediencia / Negativa a cumplir instrucciones',
    causal:'Art. 134 Fracc. II LFT — Obligación de obedecer al patrón y a sus representantes en todo lo concerniente al trabajo',
    severity:['amonestacion','formal','rescisoria'] },
  { value:'medidas', label:'Negativa a adoptar medidas de seguridad e higiene',
    causal:'Art. 47 Fracc. VII LFT — Negativa a adoptar las medidas preventivas o procedimientos indicados para evitar accidentes o enfermedades',
    severity:['amonestacion','formal','rescisoria'] },
  { value:'asistencia', label:'Falta de asistencia injustificada',
    causal:'Art. 47 Fracc. X LFT — Más de tres faltas de asistencia en un período de treinta días sin permiso del patrón ni causa justificada',
    severity:['formal','rescisoria'] },
  { value:'danos', label:'Daño intencional a bienes de la empresa',
    causal:'Art. 47 Fracc. IV LFT — Daño intencional al edificio, obras, maquinaria, instrumentos, materias primas y demás objetos de la empresa',
    severity:['formal','rescisoria'] },
  { value:'negligencia', label:'Daño grave por negligencia o imprudencia',
    causal:'Art. 47 Fracc. V LFT — Perjuicio material causado directamente por negligencia grave e inexcusable del trabajador',
    severity:['formal','rescisoria'] },
  { value:'embriaguez', label:'Presentarse bajo efectos de alcohol o drogas',
    causal:'Art. 47 Fracc. VIII LFT — Presentarse al trabajo en estado de embriaguez o bajo la influencia de algún narcótico o droga enervante',
    severity:['formal','rescisoria'] },
  { value:'violencia', label:'Violencia / Agresión física o verbal',
    causal:'Art. 47 Fracc. III LFT — Actos de violencia, amagos, injurias o malos tratamientos contra el patrón, compañeros o clientes',
    severity:['formal','rescisoria'] },
  { value:'robo', label:'Robo / Fraude / Deshonestidad',
    causal:'Art. 47 Fracc. II LFT — Faltas de probidad u honradez en el desempeño de sus funciones',
    severity:['rescisoria'] },
  { value:'secretos', label:'Revelación de información confidencial',
    causal:'Art. 47 Fracc. VII LFT — Revelar los secretos técnicos, comerciales o de fabricación de los que tenga conocimiento con motivo de su trabajo',
    severity:['rescisoria'] },
  { value:'acoso', label:'Acoso laboral o sexual',
    causal:'Art. 47 Fracc. XI Bis LFT — Hostigamiento o acoso sexual contra cualquier persona en el lugar de trabajo',
    severity:['rescisoria'] },
  { value:'otra', label:'Otra falta (especificar en descripción)',
    causal:'Reglamento Interior de Trabajo / Art. 134 LFT — Obligaciones generales del trabajador',
    severity:['amonestacion','formal','rescisoria'] },
];

const actaState = { step:1, severity:'amonestacion', data:{} };

// ─── ACTA STEPPER ─────────────────────────────────────────────────────────────
function setActaStep(step) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`acta-step-${i}`);
    if (el) el.classList.toggle('hidden', i !== step);
  }
  actaState.step = step;
  updateActaStepper();
}

function updateActaStepper() {
  document.querySelectorAll('[data-acta-step]').forEach(el => {
    const n = parseInt(el.dataset.actaStep);
    if (el.classList.contains('step-dot')) {
      el.classList.remove('active','done');
      if (n === actaState.step) el.classList.add('active');
      else if (n < actaState.step) el.classList.add('done');
    } else if (el.classList.contains('stepper-label')) {
      el.classList.remove('active','done');
      if (n === actaState.step) el.classList.add('active');
      else if (n < actaState.step) el.classList.add('done');
    }
  });
  document.querySelectorAll('[data-acta-after]').forEach(line => {
    line.classList.toggle('done', parseInt(line.dataset.actaAfter) < actaState.step);
  });
}

function nextActaStep(current) {
  if (current === 2 && !validateActaStep2()) return;
  if (current === 3 && !validateActaStep3()) return;
  if (current < 4) setActaStep(current + 1);
}

function prevActaStep(current) {
  if (current > 1) setActaStep(current - 1);
}

function validateActaStep2() {
  const rs = document.getElementById('acta-razon-social').value.trim();
  const city = document.getElementById('acta-ciudad').value.trim();
  if (!rs)   { shakeField('acta-razon-social'); return false; }
  if (!city) { shakeField('acta-ciudad');       return false; }
  return true;
}

function validateActaStep3() {
  const nombre = document.getElementById('acta-nombre').value.trim();
  const puesto = document.getElementById('acta-puesto').value.trim();
  if (!nombre) { shakeField('acta-nombre'); return false; }
  if (!puesto) { shakeField('acta-puesto'); return false; }
  return true;
}

// ─── ACTA SEVERITY & CATALOG ──────────────────────────────────────────────────
function selectActaSeverity(severity) {
  actaState.severity = severity;
  document.getElementById('acta-card-amon').classList.toggle('selected',       severity === 'amonestacion');
  document.getElementById('acta-card-formal').classList.toggle('selected',     severity === 'formal');
  document.getElementById('acta-card-rescisoria').classList.toggle('selected', severity === 'rescisoria');
  populateFaltasCatalog(severity);
  const labels = {
    amonestacion: 'Generar Acta de Amonestación',
    formal:       'Generar Acta Administrativa Formal',
    rescisoria:   'Generar Acta Rescisoria',
  };
  const lbl = document.getElementById('acta-btn-label');
  if (lbl) lbl.textContent = labels[severity];
}

function populateFaltasCatalog(severity) {
  const select = document.getElementById('acta-tipo-falta');
  if (!select) return;
  const prev = select.value;
  select.innerHTML = '';
  FALTAS_CATALOG.filter(f => f.severity.includes(severity)).forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.value;
    opt.textContent = f.label;
    if (f.value === prev) opt.selected = true;
    select.appendChild(opt);
  });
  updateCausalFromFalta();
}

function updateCausalFromFalta() {
  const select = document.getElementById('acta-tipo-falta');
  const causalInput = document.getElementById('acta-causal');
  if (!select || !causalInput) return;
  const falta = FALTAS_CATALOG.find(f => f.value === select.value);
  if (falta) causalInput.value = falta.causal;
}

// ─── COLLECT ACTA DATA ────────────────────────────────────────────────────────
function collectActaData() {
  const razonSocial = document.getElementById('acta-razon-social').value.trim();
  const nombre      = document.getElementById('acta-nombre').value.trim();
  const puesto      = document.getElementById('acta-puesto').value.trim();
  const fechaStr    = document.getElementById('acta-fecha-falta').value;
  const descripcion = document.getElementById('acta-descripcion').value.trim();
  const causal      = document.getElementById('acta-causal').value.trim();
  if (!razonSocial || !nombre || !puesto || !fechaStr || !descripcion || !causal) return null;

  const tipoSelect = document.getElementById('acta-tipo-falta');
  return {
    severity:        actaState.severity,
    razonSocial,
    rfcPatron:       document.getElementById('acta-rfc-patron').value.trim(),
    representante:   document.getElementById('acta-representante').value.trim(),
    ciudad:          document.getElementById('acta-ciudad').value.trim() || 'México',
    nombre,
    rfcTrab:         document.getElementById('acta-rfc-trab').value.trim(),
    nss:             document.getElementById('acta-nss').value.trim(),
    puesto,
    departamento:    document.getElementById('acta-departamento').value.trim(),
    fechaIngreso:    document.getElementById('acta-fecha-ingreso').value,
    fechaFalta:      new Date(fechaStr + 'T00:00:00'),
    horaFalta:       document.getElementById('acta-hora-falta').value,
    lugar:           document.getElementById('acta-lugar').value.trim(),
    tipoFaltaLabel:  tipoSelect.options[tipoSelect.selectedIndex]?.text || '',
    reincidente:     document.getElementById('acta-reincidente').value,
    causal,
    descripcion,
    testigo1:        document.getElementById('acta-testigo1').value.trim(),
    testigo1Puesto:  document.getElementById('acta-testigo1-puesto').value.trim(),
    testigo2:        document.getElementById('acta-testigo2').value.trim(),
    testigo2Puesto:  document.getElementById('acta-testigo2-puesto').value.trim(),
    aceptacion:      document.getElementById('acta-aceptacion').value,
  };
}

// ─── HANDLE GENERATE ACTA ─────────────────────────────────────────────────────
function handleGenerateActa() {
  const d = collectActaData();
  const btn = document.getElementById('acta-btn-gen');
  const lbl = document.getElementById('acta-btn-label');
  if (!d) {
    btn.style.background = 'linear-gradient(135deg,#e74c3c,#c0392b)';
    lbl.textContent = 'Completa todos los campos requeridos';
    setTimeout(() => {
      btn.style.background = '';
      selectActaSeverity(actaState.severity);
    }, 2500);
    return;
  }
  actaState.data = d;
  renderActaResults(d);
  const section = document.getElementById('acta-results-section');
  section.classList.remove('hidden');
  setTimeout(() => section.scrollIntoView({ behavior:'smooth', block:'start' }), 100);
}

// ─── RENDER ACTA RESULTS ──────────────────────────────────────────────────────
function renderActaResults(d) {
  renderActaSummary(d);
  renderActaDocPanel(d);
}

function renderActaSummary(d) {
  const panel = document.getElementById('acta-summary-panel');
  panel.innerHTML = '';

  const si = {
    amonestacion: { label:'Amonestación',                    icon:'📝', color:'rgba(245,166,35,.12)',  border:'rgba(245,166,35,.4)'  },
    formal:       { label:'Acta Formal con Apercibimiento',  icon:'⚠️', color:'rgba(231,76,60,.1)',    border:'rgba(231,76,60,.35)'  },
    rescisoria:   { label:'Acta Rescisoria (Art. 47 LFT)',   icon:'🚫', color:'rgba(155,89,182,.12)', border:'rgba(155,89,182,.4)'  },
  }[d.severity];

  const badge = document.createElement('div');
  badge.className = 'total-card animate-in';
  badge.style.cssText = `background:${si.color};border-color:${si.border};margin-bottom:20px;`;
  badge.innerHTML = `
    <div class="total-label">${si.icon} TIPO DE ACTA</div>
    <div style="font-family:'Montserrat',sans-serif;font-size:1.4rem;font-weight:900;margin:8px 0;">${si.label}</div>
    <div style="font-size:.88rem;color:var(--text-secondary);">${d.razonSocial}</div>
    <div style="font-size:.82rem;color:var(--text-muted);margin-top:4px;">Trabajador: ${d.nombre} — ${formatDateLong(d.fechaFalta)}</div>
  `;
  panel.appendChild(badge);

  const details = document.createElement('div');
  details.className = 'card animate-in';
  details.style.animationDelay = '.05s';
  const rows = [
    { icon:'👤', label:'Trabajador',             value:`${d.nombre} — ${d.puesto}${d.departamento ? ' / ' + d.departamento : ''}` },
    { icon:'🏢', label:'Empresa',                value:d.razonSocial },
    { icon:'⚠️', label:'Tipo de falta',          value:d.tipoFaltaLabel },
    { icon:'📋', label:'Causal legal',           value:d.causal },
    { icon:'🔄', label:'Reincidencia',           value:d.reincidente === 'si' ? 'Sí — reincidente' : 'No — primer incidente' },
    { icon:'🙋', label:'Posición del trabajador',value:{ acepta:'Acepta y firma de conformidad', no_acepta:'No acepta los hechos pero firma', no_firma:'Se negó a firmar el acta' }[d.aceptacion] },
    d.testigo1 && { icon:'👥', label:'Testigos', value:`${d.testigo1}${d.testigo2 ? ' / ' + d.testigo2 : ''}` },
  ].filter(Boolean);

  details.innerHTML = `<div class="breakdown-header"><span class="breakdown-title">Resumen del Acta</span><span class="breakdown-count">${rows.length} datos</span></div>` +
    rows.map(r => `
      <div class="breakdown-row">
        <div class="breakdown-icon" style="background:rgba(255,255,255,.05);font-size:14px;">${r.icon}</div>
        <div class="breakdown-info">
          <div class="breakdown-name">${r.label}</div>
          <div class="breakdown-calc">${r.value}</div>
        </div>
      </div>`).join('');
  panel.appendChild(details);

  if (d.severity === 'rescisoria') {
    const warn = document.createElement('div');
    warn.className = 'info-note animate-in';
    warn.style.cssText = 'background:rgba(155,89,182,.08);border-color:rgba(155,89,182,.25);margin-top:16px;animation-delay:.15s;';
    warn.innerHTML = `<span class="note-icon">⚖️</span><span>El trabajador cuenta con <strong>30 días naturales</strong> para impugnar la rescisión ante el Tribunal Laboral competente (Art. 518 LFT). Se recomienda asesoría jurídica profesional antes de proceder.</span>`;
    panel.appendChild(warn);
  }
}

function renderActaDocPanel(d) {
  const panel = document.getElementById('acta-doc-panel');
  panel.innerHTML = '';

  const docTitles = {
    amonestacion: 'Acta de Amonestación',
    formal:       'Acta Administrativa con Apercibimiento',
    rescisoria:   'Acta Rescisoria (Art. 47 LFT)',
  };

  const title = document.createElement('div');
  title.className = 'docs-title animate-in';
  title.innerHTML = `📋 Documento generado`;
  panel.appendChild(title);

  const card = document.createElement('div');
  card.className = 'doc-card animate-in';
  card.style.animationDelay = '.08s';
  card.innerHTML = `
    <div class="doc-card-header">
      <span class="doc-card-icon">📋</span>
      <div>
        <div class="doc-card-title">${docTitles[d.severity]}</div>
        <div class="doc-card-desc">Listo para imprimir y firmar — ${d.razonSocial}</div>
      </div>
    </div>
    <div class="doc-card-body">
      <div class="doc-preview">Acta levantada el ${formatDateLong(d.fechaFalta)} | Trabajador: ${d.nombre} | Falta: ${d.tipoFaltaLabel}. ${d.causal}...</div>
      <button class="btn-download" id="acta-btn-download">
        ⬇️ Descargar PDF — ${docTitles[d.severity]}
      </button>
    </div>
  `;
  panel.appendChild(card);

  const notes = [
    { icon:'🖨️', text:'Imprime <strong>dos ejemplares</strong>: uno para el trabajador y uno para el expediente de la empresa.' },
    { icon:'👥', text:'Procura contar con al menos <strong>dos testigos</strong> presentes al momento de la firma.' },
    { icon:'📁', text:'Conserva el acta en el <strong>expediente laboral</strong> del trabajador durante toda la relación de trabajo.' },
  ];
  if (d.severity === 'formal') {
    notes.push({ icon:'⚠️', text:'Esta acta constituye <strong>antecedente disciplinario</strong> para fundamentar una rescisión en caso de reincidencia.' });
  }
  notes.forEach((n, i) => {
    const note = document.createElement('div');
    note.className = 'info-note animate-in';
    note.style.animationDelay = `${.12 + i * .05}s`;
    note.innerHTML = `<span class="note-icon">${n.icon}</span><span>${n.text}</span>`;
    panel.appendChild(note);
  });

  card.querySelector('#acta-btn-download').addEventListener('click', () => {
    const btn = card.querySelector('#acta-btn-download');
    btn.textContent = '⏳ Generando PDF...';
    btn.disabled = true;
    try { generateActaPDF(d); } catch(e) { console.error(e); }
    setTimeout(() => {
      btn.innerHTML = `⬇️ Descargar PDF — ${docTitles[d.severity]}`;
      btn.disabled = false;
    }, 1500);
  });
}

// ─── ACTA PDF GENERATOR ───────────────────────────────────────────────────────
function generateActaPDF(d) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  const ml = 25, mr = 25;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const tw = pw - ml - mr;

  const titles = {
    amonestacion: 'ACTA DE AMONESTACION',
    formal:       'ACTA ADMINISTRATIVA',
    rescisoria:   'ACTA DE RESCISION DE CONTRATO DE TRABAJO',
  };
  const subtitles = {
    amonestacion: 'Documento disciplinario — Ley Federal del Trabajo',
    formal:       'Acta con apercibimiento — Articulo 47 Ley Federal del Trabajo',
    rescisoria:   'Rescision sin responsabilidad patronal — Articulo 47 LFT',
  };

  const folio = `ACT-${d.severity.substring(0,3).toUpperCase()}-${Date.now().toString().slice(-6)}`;
  let y = pdfHeader(doc, titles[d.severity], subtitles[d.severity], ml, mr);

  // Folio y ciudad
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(80,80,80);
  doc.text(`${np(d.ciudad)}, a ${npDate(d.fechaFalta)}`, pw - mr, y, { align:'right' });
  doc.text(`Folio: ${folio}`, ml, y);
  y += 12;

  // Bloque de partes
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(100,100,100);
  doc.text('PATRON / EMPRESA:', ml, y);
  doc.text('TRABAJADOR:', pw / 2 + 4, y);
  y += 5;

  doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(20,20,20);
  doc.text(np(d.razonSocial), ml, y);
  doc.text(np(d.nombre), pw / 2 + 4, y);
  y += 5;

  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(70,70,70);
  const patronLines = [
    d.rfcPatron    && `RFC: ${np(d.rfcPatron)}`,
    d.representante && `Rep.: ${np(d.representante)}`,
  ].filter(Boolean);
  const trabajLines = [
    `Puesto: ${np(d.puesto)}`,
    d.departamento  && `Area: ${np(d.departamento)}`,
    d.rfcTrab       && `RFC: ${np(d.rfcTrab)}`,
    d.nss           && `NSS: ${np(d.nss)}`,
    d.fechaIngreso  && `Ingreso: ${np(formatDateShort(d.fechaIngreso))}`,
  ].filter(Boolean);

  const maxLines = Math.max(patronLines.length, trabajLines.length);
  for (let i = 0; i < maxLines; i++) {
    if (patronLines[i]) doc.text(patronLines[i], ml, y);
    if (trabajLines[i]) doc.text(trabajLines[i], pw / 2 + 4, y);
    y += 4.5;
  }
  y += 4;
  y = pdfLine(doc, y, ml, mr) + 6;

  // Tabla datos de la falta
  doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(50,50,50);
  doc.text('DATOS DE LA FALTA', ml, y); y += 6;

  const incidentRows = [
    ['Tipo de falta',  np(d.tipoFaltaLabel)],
    ['Fecha',          npDate(d.fechaFalta)],
    d.horaFalta        && ['Hora',       d.horaFalta],
    d.lugar            && ['Lugar',      np(d.lugar)],
    ['Reincidencia',   d.reincidente === 'si' ? 'Si — ha incurrido en esta falta con anterioridad' : 'No — primer incidente'],
    ['Causal legal',   np(d.causal)],
  ].filter(Boolean);

  doc.autoTable({
    startY: y, margin:{ left:ml, right:mr },
    body: incidentRows,
    styles:{ fontSize:8.5, cellPadding:3, textColor:[40,40,40] },
    alternateRowStyles:{ fillColor:[248,248,252] },
    columnStyles:{ 0:{ fontStyle:'bold', cellWidth:44 } },
    theme:'grid',
  });
  y = doc.lastAutoTable.finalY + 10;

  // Hechos
  doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(50,50,50);
  doc.text('HECHOS:', ml, y); y += 5;
  doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(30,30,30);
  const descLines = doc.splitTextToSize(np(d.descripcion), tw);
  doc.text(descLines, ml, y); y += descLines.length * 5.2 + 8;

  // Cláusula legal
  y = pdfLine(doc, y, ml, mr) + 5;
  let clausula = '';
  if (d.severity === 'amonestacion') {
    clausula = `Por medio del presente documento, ${np(d.razonSocial)} hace constar la AMONESTACION formal al C. ${np(d.nombre)}, apercibiendole de que de reincidir en la conducta descrita podra ser sujeto de medidas disciplinarias mas severas, incluyendo la rescision de la relacion laboral sin responsabilidad para el patron, en terminos de la Ley Federal del Trabajo.`;
  } else if (d.severity === 'formal') {
    clausula = `Por medio del presente documento, ${np(d.razonSocial)} levanta ACTA ADMINISTRATIVA al C. ${np(d.nombre)} por incurrir en la conducta antes descrita, la cual contraviene ${np(d.causal)}. Se le APERCIBE formalmente que de reincidir en dicha conducta, la empresa estara en posibilidad de rescindir el contrato de trabajo sin responsabilidad patronal en terminos del articulo 47 de la Ley Federal del Trabajo.`;
  } else {
    clausula = `Con fundamento en el articulo 47 de la Ley Federal del Trabajo, ${np(d.razonSocial)} comunica formalmente al C. ${np(d.nombre)} la RESCISION DE SU CONTRATO DE TRABAJO SIN RESPONSABILIDAD PARA EL PATRON, por haber incurrido en la causal antes senalada. La empresa queda a disposicion del trabajador para el pago de las prestaciones proporcionales a que haya lugar conforme a la Ley. NOTA LEGAL: El trabajador dispone de 30 dias naturales para impugnar la presente rescision ante el Tribunal Laboral competente (Art. 518 LFT).`;
  }
  doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(30,30,30);
  const clausulaLines = doc.splitTextToSize(clausula, tw);
  doc.text(clausulaLines, ml, y); y += clausulaLines.length * 5.2 + 8;

  // Posición del trabajador
  const aceptacionTxt = {
    acepta:    'El trabajador acepta los hechos descritos en la presente acta y firma de conformidad.',
    no_acepta: 'El trabajador no acepta los hechos descritos pero firma el acta para constancia.',
    no_firma:  'EL TRABAJADOR SE NEGO A FIRMAR LA PRESENTE ACTA. Se hace constar ante la presencia de los testigos abajo firmantes.',
  }[d.aceptacion];
  doc.setFont('helvetica','italic'); doc.setFontSize(8.5);
  doc.setTextColor(d.aceptacion === 'no_firma' ? 160 : 80, d.aceptacion === 'no_firma' ? 50 : 80, d.aceptacion === 'no_firma' ? 50 : 80);
  const aLines = doc.splitTextToSize(aceptacionTxt, tw);
  doc.text(aLines, ml, y); y += aLines.length * 5 + 10;

  // Nueva página si no caben las firmas
  if (y + 80 > ph - 20) { doc.addPage(); y = 25; }

  // Firmas patrón y trabajador
  y = pdfSignatures(doc,
    `${np(d.razonSocial)}${d.representante ? '\n' + np(d.representante) : ''}`,
    `${np(d.nombre)}\n${np(d.puesto)}`,
    y, ml, mr);

  // Testigos
  if (d.testigo1 || d.testigo2) {
    y += 10;
    doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(80,80,80);
    doc.text('T E S T I G O S', pw / 2, y, { align:'center' }); y += 10;

    const mid = pw / 2;
    doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
    if (d.testigo1) {
      doc.line(ml, y, mid - 8, y);
      doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(30,30,30);
      doc.text(np(d.testigo1), (ml + mid - 8) / 2, y + 5, { align:'center' });
      if (d.testigo1Puesto) {
        doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80);
        doc.text(np(d.testigo1Puesto), (ml + mid - 8) / 2, y + 10, { align:'center' });
      }
    }
    if (d.testigo2) {
      doc.line(mid + 8, y, pw - mr, y);
      doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(30,30,30);
      doc.text(np(d.testigo2), (mid + 8 + pw - mr) / 2, y + 5, { align:'center' });
      if (d.testigo2Puesto) {
        doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80);
        doc.text(np(d.testigo2Puesto), (mid + 8 + pw - mr) / 2, y + 10, { align:'center' });
      }
    }
  }

  // Footer
  doc.setFontSize(7); doc.setTextColor(160,160,160);
  doc.text(`Folio ${folio} | LiquidaLFT | Caracter referencial, no sustituye asesoria legal`, pw / 2, ph - 10, { align:'center' });

  const fileNames = { amonestacion:'acta-amonestacion.pdf', formal:'acta-administrativa.pdf', rescisoria:'acta-rescisoria.pdf' };
  doc.save(fileNames[d.severity]);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Fecha de baja = hoy por defecto
  document.getElementById('end-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('end-date').addEventListener('change', checkFechaBaja);
  checkFechaBaja();

  // Calculadora
  document.getElementById('btn-calc').addEventListener('click', handleCalculate);

  // Toggle documentos opcionales
  document.getElementById('btn-toggle-docs').addEventListener('click', () => {
    const form = document.getElementById('docs-optional-form');
    const btn  = document.getElementById('btn-toggle-docs');
    const show = form.classList.contains('hidden');
    form.classList.toggle('hidden', !show);
    btn.textContent = show ? '📄 Ocultar formulario de documentos ▲' : '📄 Generar documentos (opcional) ▾';
    if (show) setTimeout(() => form.scrollIntoView({ behavior:'smooth', block:'start' }), 50);
  });

  // Botones de generación de PDFs
  document.getElementById('btn-gen-renuncia').addEventListener('click', () => {
    if (!prepareDocsFormData()) return;
    state.result = state.resultFin;
    generateCartaRenuncia();
  });
  document.getElementById('btn-gen-recibo-fin').addEventListener('click', () => {
    if (!prepareDocsFormData()) return;
    state.result = state.resultFin;
    generateRecibo();
  });
  document.getElementById('btn-gen-aviso').addEventListener('click', () => {
    if (!prepareDocsFormData()) return;
    state.result = state.resultLiq;
    generateAvisoRecision();
  });
  document.getElementById('btn-gen-recibo-liq').addEventListener('click', () => {
    if (!prepareDocsFormData()) return;
    state.result = state.resultLiq;
    generateRecibo();
  });

  initFAQ();
  initNavbar();
  buildVacationTable();

  // ── Actas admin ──
  document.getElementById('acta-card-amon').addEventListener('click',       () => selectActaSeverity('amonestacion'));
  document.getElementById('acta-card-formal').addEventListener('click',     () => selectActaSeverity('formal'));
  document.getElementById('acta-card-rescisoria').addEventListener('click', () => selectActaSeverity('rescisoria'));

  document.getElementById('acta-btn-next-1').addEventListener('click', () => nextActaStep(1));
  document.getElementById('acta-btn-back-2').addEventListener('click', () => prevActaStep(2));
  document.getElementById('acta-btn-next-2').addEventListener('click', () => nextActaStep(2));
  document.getElementById('acta-btn-back-3').addEventListener('click', () => prevActaStep(3));
  document.getElementById('acta-btn-next-3').addEventListener('click', () => nextActaStep(3));
  document.getElementById('acta-btn-back-4').addEventListener('click', () => prevActaStep(4));
  document.getElementById('acta-btn-gen').addEventListener('click',    handleGenerateActa);

  document.getElementById('acta-tipo-falta').addEventListener('change', updateCausalFromFalta);

  document.getElementById('acta-fecha-falta').value = new Date().toISOString().split('T')[0];
  populateFaltasCatalog('amonestacion');
  updateActaStepper();
});
