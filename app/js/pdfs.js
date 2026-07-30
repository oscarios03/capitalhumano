/**
 * Capital Humano MX — Generadores de PDF
 * Funciones puras: reciben datos como parámetros (sin leer el DOM)
 * Requiere: jsPDF, jsPDF-AutoTable, calculo.js
 */

// ─── RECIBO DE NÓMINA ─────────────────────────────────────────────────────────
/**
 * Genera y descarga el PDF del recibo de nómina.
 * @param {string} reciboId  UUID del registro en recibos_nomina
 */
async function generateReciboNomina(reciboId) {
  const blob = await generarReciboNominaBlob(reciboId);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url;
  a.download = `recibo-nomina-${reciboId.slice(-6)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Genera el PDF como Blob (para descarga individual o empaquetado en ZIP).
 */
async function generarReciboNominaBlob(reciboId) {
  const { recibo, empresa } = await window._getNominaData(reciboId);
  if (!recibo) return null;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  const ml  = 25, mr = 25;
  const pw  = doc.internal.pageSize.getWidth();
  const ph  = doc.internal.pageSize.getHeight();
  const tw  = pw - ml - mr;
  const t   = recibo.trabajadores || {};
  const p   = recibo.periodos_nomina || {};

  const folio = recibo.folio || `NOM-${reciboId.slice(-6)}`;
  let y = 0;
  const ck = (n=20) => { if (y + n > ph - 16) { doc.addPage(); y = 22; } };

  // ── 1. ENCABEZADO ────────────────────────────────────────────────────────
  doc.setFillColor(15,20,40); doc.rect(0,0,pw,36,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(21,128,61);
  doc.text(np(empresa.nombre||''), pw/2, 11, { align:'center' });
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(180,185,200);
  doc.text(np([empresa.rfc, empresa.domicilio].filter(Boolean).join('  |  ')), pw/2, 18, { align:'center' });
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(255,255,255);
  doc.text('RECIBO DE NÓMINA', pw/2, 30, { align:'center' });
  y = 42;

  // Folio y período
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(120,120,120);
  doc.text(`Folio: ${np(folio)}  |  Período: ${np(p.nombre||'')}`, pw/2, y, { align:'center' });
  y += 10;

  // ── 2. BLOQUE TRABAJADOR ─────────────────────────────────────────────────
  const bH = 40;
  doc.setFillColor(248,248,252);
  doc.rect(ml, y, tw, bH, 'F');
  doc.setDrawColor(220,220,220); doc.setLineWidth(0.3);
  doc.rect(ml, y, tw, bH);
  doc.line(pw/2, y, pw/2, y+bH);

  // Columna izquierda — trabajador
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(20,20,20);
  doc.text(np(t.nombre||''), ml+3, y+8);
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(80,80,80);
  let yi = y+14;
  if (t.rfc)  { doc.text(`RFC: ${np(t.rfc)}`,   ml+3, yi); yi+=4.2; }
  if (t.nss)  { doc.text(`NSS: ${np(t.nss)}`,   ml+3, yi); yi+=4.2; }
  if (t.curp) { doc.text(`CURP: ${np(t.curp)}`, ml+3, yi); yi+=4.2; }
  if (t.puesto)     { doc.text(`Puesto: ${np(t.puesto)}`,          ml+3, yi); yi+=4; }
  if (t.departamento){ doc.text(`Área: ${np(t.departamento)}`,     ml+3, yi); }

  // Columna derecha — datos del período
  const daily = calcSalarioDiario(t.salario_mensual||0, t.periodo_salario||'mensual');
  const c2    = pw/2 + 3;
  let yj = y+8;
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(80,80,80);
  doc.text(`Período: ${np(formatDateShort(p.fecha_inicio))} al ${np(formatDateShort(p.fecha_fin))}`, c2, yj); yj+=4.5;
  // La fecha de pago es independiente del fin del período (Art. 88 LFT)
  if (p.fecha_pago) { doc.text(`Fecha de pago: ${np(formatDateShort(p.fecha_pago))}`, c2, yj); yj+=4.5; }
  doc.text(`Días laborados: ${recibo.dias_laborados}`,            c2, yj); yj+=4.5;
  doc.text(`Salario diario: ${np(fmt(daily))}`,                   c2, yj); yj+=4.5;
  doc.text(`Forma de pago: ${np(recibo.forma_pago||'Depósito')}`, c2, yj); yj+=4.5;
  if (recibo.cuenta_bancaria) doc.text(`CLABE: ${np(recibo.cuenta_bancaria)}`, c2, yj);
  y += bH + 10;

  // ── 3. TABLA PERCEPCIONES ────────────────────────────────────────────────
  const percRows = [
    [`Salario base`, `${recibo.dias_laborados} días × ${np(fmt(daily))}`, fmt(recibo.salario_base)],
  ];
  if (parseFloat(recibo.monto_horas_extra||0) > 0)
    percRows.push(['Horas extra', `${recibo.horas_extra} hrs`, fmt(recibo.monto_horas_extra)]);
  if (parseFloat(recibo.prima_dominical||0) > 0)
    percRows.push(['Prima dominical', 'Art. 71 LFT', fmt(recibo.prima_dominical)]);
  if (parseFloat(recibo.prima_festivo||0) > 0)
    percRows.push(['Prima por día festivo trabajado', 'Art. 75 LFT', fmt(recibo.prima_festivo)]);
  if (parseFloat(recibo.vales_despensa||0) > 0)
    percRows.push(['Vales de despensa', 'Prestación', fmt(recibo.vales_despensa)]);
  if (parseFloat(recibo.bonos||0) > 0)
    percRows.push(['Bono / Comisión', 'Período', fmt(recibo.bonos)]);
  if (parseFloat(recibo.otros_ingresos||0) > 0)
    percRows.push(['Otros ingresos', '—', fmt(recibo.otros_ingresos)]);

  doc.autoTable({
    startY: y, margin:{ left:ml, right:mr },
    head:[['PERCEPCIONES','Cálculo','Importe']],
    body: percRows,
    foot:[['SUBTOTAL PERCEPCIONES','', fmt(recibo.total_percepciones)]],
    styles:{ fontSize:9, cellPadding:3 },
    headStyles:{ fillColor:[39,174,96], textColor:[255,255,255], fontStyle:'bold', fontSize:8.5 },
    footStyles:{ fillColor:[27,120,66], textColor:[255,255,255], fontStyle:'bold', fontSize:9.5 },
    alternateRowStyles:{ fillColor:[240,255,244] },
    columnStyles:{ 0:{ cellWidth:80, fontStyle:'bold' }, 1:{ cellWidth:64, textColor:[100,100,100] }, 2:{ cellWidth:32, halign:'right', fontStyle:'bold' } },
    theme:'grid',
  });
  y = doc.lastAutoTable.finalY + 8;

  // ── 4. TABLA DEDUCCIONES ─────────────────────────────────────────────────
  const dedRows = [];
  if (parseFloat(recibo.monto_faltas||0) > 0)
    dedRows.push(['Desc. por faltas', `${recibo.dias_falta} días × ${np(fmt(daily))}`, `-${fmt(recibo.monto_faltas)}`]);
  if (parseFloat(recibo.monto_falta_justif||0) > 0)
    dedRows.push(['Desc. faltas justificadas', `${recibo.dias_falta_justif} días × ${np(fmt(daily))}`, `-${fmt(recibo.monto_falta_justif)}`]);
  if (parseFloat(recibo.monto_permiso_sin||0) > 0)
    dedRows.push(['Desc. permiso sin goce', `${recibo.dias_permiso_sin} días`, `-${fmt(recibo.monto_permiso_sin)}`]);
  if (parseFloat(recibo.cuota_imss||0) > 0)
    dedRows.push(['Cuota IMSS obrero', `2.25% sobre base`, `-${fmt(recibo.cuota_imss)}`]);
  if (parseFloat(recibo.isr_retenido||0) > 0)
    dedRows.push(['ISR retenido', 'Art. 96 LISR 2026', `-${fmt(recibo.isr_retenido)}`]);
  if (parseFloat(recibo.fondo_ahorro_obrero||0) > 0)
    dedRows.push(['Fondo de ahorro obrero', 'Art. 110 fr. IV LFT', `-${fmt(recibo.fondo_ahorro_obrero)}`]);
  if (parseFloat(recibo.prestamo_empresa||0) > 0)
    dedRows.push(['Préstamo empresa', 'Art. 110 fr. I LFT', `-${fmt(recibo.prestamo_empresa)}`]);
  if (parseFloat(recibo.infonavit_descuento||0) > 0)
    dedRows.push(['INFONAVIT', 'Art. 97 Ley INFONAVIT', `-${fmt(recibo.infonavit_descuento)}`]);
  if (parseFloat(recibo.pension_alimenticia||0) > 0)
    dedRows.push(['Pensión alimenticia', 'Art. 110 fr. V LFT', `-${fmt(recibo.pension_alimenticia)}`]);
  (Array.isArray(recibo.descuentos_detalle) ? recibo.descuentos_detalle : []).forEach(d => {
    if (parseFloat(d.monto||0) > 0)
      dedRows.push([np(d.descripcion || d.tipo), d.numero_credito ? `Núm. ${np(d.numero_credito)}` : 'Art. 110 LFT', `-${fmt(d.monto)}`]);
  });
  if (parseFloat(recibo.otras_deducciones||0) > 0)
    dedRows.push(['Otras deducciones', recibo.notas || '—', `-${fmt(recibo.otras_deducciones)}`]);
  if (!dedRows.length) dedRows.push(['Sin deducciones','','$0.00']);

  ck(dedRows.length * 10 + 50);
  doc.autoTable({
    startY: y, margin:{ left:ml, right:mr },
    head:[['DEDUCCIONES','Concepto','Importe']],
    body: dedRows,
    foot:[['SUBTOTAL DEDUCCIONES','', `-${fmt(recibo.total_deducciones)}`]],
    styles:{ fontSize:9, cellPadding:3 },
    headStyles:{ fillColor:[192,57,43], textColor:[255,255,255], fontStyle:'bold', fontSize:8.5 },
    footStyles:{ fillColor:[120,30,20], textColor:[255,255,255], fontStyle:'bold', fontSize:9.5 },
    alternateRowStyles:{ fillColor:[255,245,245] },
    columnStyles:{ 0:{ cellWidth:80, fontStyle:'bold' }, 1:{ cellWidth:64, textColor:[100,100,100] }, 2:{ cellWidth:32, halign:'right', fontStyle:'bold' } },
    theme:'grid',
  });
  y = doc.lastAutoTable.finalY + 10;

  // ── 5. NETO A PAGAR ──────────────────────────────────────────────────────
  ck(30);
  doc.setFillColor(15,20,40);
  doc.rect(ml, y, tw, 22, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(180,185,200);
  doc.text('NETO A PAGAR', pw/2, y+7, { align:'center' });
  doc.setFontSize(16); doc.setTextColor(21,128,61);
  doc.text(np(`${fmt(recibo.neto_pagar)}   (${numToWords(recibo.neto_pagar)} PESOS M.N.)`), pw/2, y+17, { align:'center' });
  y += 30;

  // ── 6. ACUMULADOS AÑO ────────────────────────────────────────────────────
  ck(28);
  doc.autoTable({
    startY: y, margin:{ left:ml, right:mr },
    head:[['Acumulado del año','Percibido','ISR retenido','IMSS obrero']],
    body: [[
      new Date().getFullYear().toString(),
      fmt(recibo.acum_percepciones || recibo.total_percepciones),
      fmt(recibo.acum_isr || recibo.isr_retenido),
      fmt(recibo.cuota_imss),
    ]],
    styles:{ fontSize:8, cellPadding:2.5, textColor:[100,100,100] },
    headStyles:{ fillColor:[70,70,90], textColor:[200,200,210], fontStyle:'bold', fontSize:7.5 },
    theme:'grid',
  });
  y = doc.lastAutoTable.finalY + 10;

  // ── 7. DECLARACIÓN LEGAL ─────────────────────────────────────────────────
  ck(22);
  const decl = `El trabajador declara haber recibido la cantidad señalada como neto a pagar, en conformidad con los conceptos detallados en el presente recibo, conforme a los Articulos 82, 88 y 132 fraccion VII de la Ley Federal del Trabajo.`;
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(120,120,120);
  const dl = doc.splitTextToSize(np(decl), tw);
  ck(dl.length * 4.5 + 4);
  doc.text(dl, ml, y); y += dl.length * 4.5 + 8;

  // ── 8. PLACEHOLDER CFDI ─────────────────────────────────────────────────
  ck(22);
  doc.setDrawColor(180,180,180); doc.setLineWidth(0.3);
  doc.setLineDash([2,2]);
  doc.rect(ml, y, tw, 16);
  doc.setLineDash([]);
  doc.setFont('helvetica','italic'); doc.setFontSize(7.5); doc.setTextColor(170,170,170);
  doc.text('Timbrado CFDI — Próximamente (Art. 99 Fracc. III LISR)', pw/2, y+9, { align:'center' });
  y += 24;

  // ── 9. FIRMAS ────────────────────────────────────────────────────────────
  ck(50);
  y += 4;
  const colW = tw/2 - 5;
  const cf1 = ml, cf2 = ml + colW + 10;
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  doc.line(cf1, y+18, cf1+colW, y+18);
  doc.line(cf2, y+18, cf2+colW, y+18);
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(30,30,30);
  doc.text('EL PATRON / REPRESENTANTE', cf1+colW/2, y+23, {align:'center'});
  doc.text('EL TRABAJADOR',             cf2+colW/2, y+23, {align:'center'});
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80);
  doc.text(np(empresa.nombre||''), cf1+colW/2, y+28, {align:'center'});
  if (empresa.representante) doc.text(np(empresa.representante), cf1+colW/2, y+32, {align:'center'});
  doc.text(np(t.nombre||''), cf2+colW/2, y+28, {align:'center'});

  // ── PIE DE PÁGINA ────────────────────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let i=1; i<=total; i++) {
    doc.setPage(i);
    doc.setDrawColor(220,220,220); doc.setLineWidth(0.2);
    doc.line(ml, ph-11, pw-mr, ph-11);
    doc.setFontSize(6.5); doc.setFont('helvetica','normal'); doc.setTextColor(160,160,160);
    doc.text(np(`${folio}  |  Página ${i} de ${total}  |  Capital Humano MX  |  Conforme Arts. 82, 88, 132 LFT`), pw/2, ph-7, {align:'center'});
  }

  return doc.output('blob');
}

// ─── HELPERS PDF ──────────────────────────────────────────────────────────────

/**
 * Resuelve la ubicación a usar en documentos:
 * si el trabajador tiene sucursal asignada, usa el domicilio de ésta;
 * si no, usa los datos fiscales de la empresa (matriz).
 * El nombre y RFC siempre son de la empresa.
 */
function resolveUbicacion(empresa, sucursal) {
  if (!sucursal) return empresa;
  return {
    ...empresa,
    domicilio:     sucursal.domicilio     || empresa.domicilio,
    ciudad:        sucursal.ciudad        || empresa.ciudad,
    representante: sucursal.responsable_nombre || empresa.representante,
  };
}

function np(s) {
  return (s || '').toString()
    .replace(/[áà]/g,'a').replace(/[éè]/g,'e').replace(/[íì]/g,'i')
    .replace(/[óò]/g,'o').replace(/[úùü]/g,'u').replace(/ñ/g,'n')
    .replace(/[ÁÀ]/g,'A').replace(/[ÉÈ]/g,'E').replace(/[ÍÌ]/g,'I')
    .replace(/[ÓÒ]/g,'O').replace(/[ÚÙÜ]/g,'U').replace(/Ñ/g,'N')
    .replace(/[¿¡×]/g,'');
}

function npDate(d) { return np(formatDateLong(d)); }

function pdfLine(doc, y, ml, mr) {
  const pw = doc.internal.pageSize.getWidth();
  doc.setDrawColor(200,200,200); doc.setLineWidth(0.3);
  doc.line(ml, y, pw - mr, y);
  return y + 3;
}

function pdfHeader(doc, title, subtitle, ml, mr) {
  const pw = doc.internal.pageSize.getWidth();
  doc.setFillColor(15,20,40);
  doc.rect(0, 0, pw, 32, 'F');
  doc.setTextColor(21,128,61); doc.setFont('helvetica','bold'); doc.setFontSize(13);
  doc.text(np(title), pw/2, 13, { align:'center' });
  doc.setFontSize(8); doc.setTextColor(180,185,200); doc.setFont('helvetica','normal');
  doc.text(np(subtitle), pw/2, 21, { align:'center' });
  return 40;
}

function pdfSignatures(doc, patronStr, trabajadorStr, y, ml, mr) {
  const pw = doc.internal.pageSize.getWidth();
  const mid = pw / 2;
  const sigY = y + 20;
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  doc.line(ml, sigY, mid - 12, sigY);
  doc.line(mid + 12, sigY, pw - mr, sigY);
  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(30,30,30);
  doc.text(np('EL PATRON / REPRESENTANTE'), (ml + mid - 12)/2, sigY + 5, { align:'center' });
  doc.text(np('EL TRABAJADOR'), (mid + 12 + pw - mr)/2, sigY + 5, { align:'center' });
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(100,100,100);
  const pLines = doc.splitTextToSize(np(patronStr), mid - ml - 20);
  doc.text(pLines, (ml + mid - 12)/2, sigY + 11, { align:'center' });
  const wLines = doc.splitTextToSize(np(trabajadorStr), pw - mr - mid - 20);
  doc.text(wLines, (mid + 12 + pw - mr)/2, sigY + 11, { align:'center' });
  return sigY + 30;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CONTRATOS LABORALES — 5 tipos LFT 2026
//  Entrada: generateContrato(trabajadorId, tipoContrato)
// ═══════════════════════════════════════════════════════════════════════════

/** Punto de entrada asíncrono: carga datos de Supabase y genera el PDF. */
async function generateContrato(trabajadorId, tipoContrato) {
  try {
    const _sb = window.supabase;
    const { data: { user } } = await _sb.auth.getUser();
    const [{ data: trab }, { data: perfil }] = await Promise.all([
      _sb.from('trabajadores').select('*, sucursales(*)').eq('id', trabajadorId).single(),
      _sb.from('perfiles').select('empresa_id').eq('id', user.id).single(),
    ]);
    const { data: empresa } = await _sb.from('empresas').select('*').eq('id', perfil.empresa_id).single();
    const data = _buildContratoData(trab, empresa, trab.sucursales);
    const generators = {
      indeterminado: generateContratoIndeterminado,
      indefinido:    generateContratoIndeterminado,
      determinado:   generateContratoDeterminado,
      obra:          generateContratoObra,
      temporada:     generateContratoTemporada,
      comision:      generateContratoComision,
    };
    (generators[tipoContrato] || generateContratoIndeterminado)(data);
  } catch(err) {
    console.error('generateContrato:', err);
    alert('Error al generar contrato: ' + (err.message || err));
  }
}

function _buildContratoData(trab, empresa, sucursal) {
  return {
    razonSocial:         empresa.nombre        || '',
    rfcPatron:           empresa.rfc           || '',
    domicilioFiscal:     empresa.domicilio     || '',
    ciudadFirma:         empresa.ciudad        || 'Leon, Guanajuato',
    representanteLegal:  empresa.representante || '',
    cargoRepresentante:  'Representante Legal',
    domicilioSucursal:   sucursal?.domicilio   || empresa.domicilio || '',
    nombreSucursal:      sucursal?.nombre      || 'Matriz',
    ciudadSucursal:      sucursal?.ciudad      || empresa.ciudad    || '',
    nombre:              trab.nombre           || '',
    rfc:                 trab.rfc              || '',
    curp:                trab.curp             || '',
    nss:                 trab.nss              || '',
    edad:                trab.edad             || '',
    estadoCivil:         trab.estado_civil     || '',
    nacionalidad:        trab.nacionalidad     || 'Mexicana',
    domicilio:           trab.domicilio        || '',
    tipoIdentificacion:  trab.tipo_identificacion || 'INE/IFE',
    numIdentificacion:   trab.num_identificacion  || '',
    puesto:              trab.puesto           || '',
    departamento:        trab.departamento     || '',
    fechaIngreso:        trab.fecha_ingreso    || '',
    fechaIngresoReconocida: trab.fecha_ingreso_reconocida || trab.fecha_ingreso || '',
    salario:             trab.salario_mensual  || 0,
    periodoSalario:      trab.periodo_salario  || 'mensual',
    formaPago:           trab.forma_pago === 'efectivo' ? 'efectivo' : 'deposito bancario',
    diasPago:            trab.dias_pago        || '',
    tipoPruebaDias:      trab.periodo_prueba_dias || 30,
    funciones:           trab.funciones        || `Las inherentes al puesto de ${trab.puesto || '[PUESTO]'}`,
    horaInicio:          trab.hora_inicio      || '09:00',
    horaFin:             trab.hora_fin         || '18:00',
    horaDescansoInicio:  trab.hora_descanso_inicio || '14:00',
    horaDescansoFin:     trab.hora_descanso_fin    || '15:00',
    diasSemana:          trab.dias_semana      || ['Lunes','Martes','Miercoles','Jueves','Viernes'],
    diaDescanso:         trab.dia_descanso     || 'Domingo',
    fechaVencimiento:    trab.fecha_vencimiento_contrato || '',
    nombreProyecto:      trab.nombre_proyecto  || '',
    fechaFinProyecto:    trab.fecha_fin_proyecto || '',
    temporadas:          trab.temporadas       || [],
    zonaAsignada:        trab.zona_asignada    || '',
    diasPresentacion:    trab.dias_presentacion || [],
    horarioPresentacion: trab.horario_presentacion || '',
    tablaComisiones:     trab.tabla_comisiones || [],
    beneficiario1Nombre:     trab.beneficiario1_nombre     || '',
    beneficiario1Parentesco: trab.beneficiario1_parentesco || '',
    beneficiario1Telefono:   trab.beneficiario1_telefono   || '',
    beneficiario2Nombre:     trab.beneficiario2_nombre     || '',
    beneficiario2Parentesco: trab.beneficiario2_parentesco || '',
    beneficiario2Telefono:   trab.beneficiario2_telefono   || '',
    // Prestaciones particulares de la empresa + config individual del trabajador
    prestaciones:        prestacionesEmpresa(empresa),
    fondoAhorroActivo:   !!trab.fondo_ahorro_activo,
    fondoAhorroPct:      parseFloat(trab.fondo_ahorro_pct || 0.13),
    valesDespensaTrab:   parseFloat(trab.vales_despensa || 0),
  };
}

// ── Infraestructura interna del PDF ─────────────────────────────────────────

function _initContratoDoc(titulo, subtitulo, data) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  const ml = 25, mr = 25;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const tw = pw - ml - mr;
  const folio = `${titulo.replace(/\s+/g,'').substring(0,4).toUpperCase()}-${Date.now().toString().slice(-7)}`;
  const state = { doc, ml, mr, pw, ph, tw, y: 0, folio };
  state.y = _cHeader(state, titulo, subtitulo, data);
  return state;
}

function _cHeader(state, titulo, subtitulo, data) {
  const { doc, ml, mr, pw } = state;
  // Banda oscura superior
  doc.setFillColor(15, 20, 40);
  doc.rect(0, 0, pw, 30, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(255,255,255);
  doc.text(np(data.razonSocial), pw/2, 10, { align:'center' });
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(180,185,200);
  const sub = [data.rfcPatron, data.domicilioSucursal || data.domicilioFiscal].filter(Boolean).join('  |  ');
  doc.text(np(sub), pw/2, 18, { align:'center' });
  // Barra dorada con título
  doc.setFillColor(21,128,61);
  doc.rect(ml - 2, 24, pw - ml - mr + 4, 12, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(15, 20, 40);
  doc.text(np(titulo.toUpperCase()), pw/2, 31.5, { align:'center' });
  return 44;
}

function _addFooters(state, data) {
  const { doc, pw, ph, ml, mr, folio } = state;
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(220,220,220); doc.setLineWidth(0.2);
    doc.line(ml, ph - 11, pw - mr, ph - 11);
    doc.setFontSize(6.5); doc.setFont('helvetica','normal'); doc.setTextColor(160,160,160);
    doc.text(np(`Folio ${folio}  |  Pagina ${i} de ${total}  |  Capital Humano MX  |  Caracter referencial, no sustituye asesoria juridica`), pw/2, ph - 7, { align:'center' });
  }
}

function _newPage(state) {
  state.doc.addPage();
  state.y = 22;
}

function _checkY(state, needed = 22) {
  if (state.y + needed > state.ph - 16) _newPage(state);
}

function _h(state, num, titulo) {
  _checkY(state, 18);
  const { doc, ml } = state;
  doc.setFillColor(21,128,61);
  doc.rect(ml, state.y, 2.5, 7, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(21,128,61);
  doc.text(np(`CLAUSULA ${num}a — ${titulo.toUpperCase()}`), ml + 5, state.y + 5);
  state.y += 11;
}

function _p(state, texto, opts = {}) {
  if (!texto) return;
  const { bold = false, indent = 0, fontSize = 9.5, color = [50,50,50] } = opts;
  const { doc, ml, tw } = state;
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(fontSize);
  doc.setTextColor(...color);
  const lines = doc.splitTextToSize(np(texto), tw - indent);
  _checkY(state, lines.length * 5.4 + 3);
  doc.text(lines, ml + indent, state.y, { lineHeightFactor: 1.45 });
  state.y += lines.length * 5.4 + 4;
}

function _gap(state, mm = 5) { state.y += mm; }

function _line(state) {
  _checkY(state, 5);
  const { doc, ml, mr, pw } = state;
  doc.setDrawColor(220,220,220); doc.setLineWidth(0.3);
  doc.line(ml, state.y, pw - mr, state.y);
  state.y += 6;
}

function _table(state, head, body, extra = {}) {
  _checkY(state, 34);
  const { doc, ml, mr } = state;
  doc.autoTable({
    startY: state.y, margin: { left: ml, right: mr },
    head, body,
    styles: { fontSize: 8.5, cellPadding: 3, textColor: [40,40,40] },
    headStyles: { fillColor: [15,36,56], textColor: [21,128,61], fontStyle:'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248,248,252] },
    theme: 'grid', ...extra,
  });
  state.y = doc.lastAutoTable.finalY + 8;
}

function _recuadro(state, texto, tipo = 'info') {
  _checkY(state, 28);
  const { doc, ml, mr, pw } = state;
  const tw = pw - ml - mr;
  const bg = tipo === 'warn' ? [255,248,225] : [230,240,255];
  const br = tipo === 'warn' ? [21,128,61]  : [74,144,226];
  const lines = doc.splitTextToSize(np(texto), tw - 10);
  const h = lines.length * 5 + 10;
  doc.setFillColor(...bg); doc.setDrawColor(...br); doc.setLineWidth(0.5);
  doc.roundedRect(ml, state.y, tw, h, 2, 2, 'FD');
  doc.setFont('helvetica','normal'); doc.setFontSize(8.2); doc.setTextColor(50,50,50);
  doc.text(lines, ml + 5, state.y + 7);
  state.y += h + 6;
}

// ── Cláusulas comunes 7ª–18ª ────────────────────────────────────────────────
function _clausulasComunes(state, data, start) {
  let n = start;

  const prC = data.prestaciones || prestacionesEmpresa();
  const vacTxt = prC.vacDiasExtra > 0
    ? `Vacaciones conforme al Art. 76 LFT MAS ${prC.vacDiasExtra} dia(s) adicionales otorgados por EL PATRON (superior al minimo de ley)`
    : `Vacaciones conforme al Art. 76 LFT (12 dias el primer ano, con incrementos bienales)`;
  const pvTxt = prC.primaVacPct > 0.25
    ? `Prima vacacional del ${(prC.primaVacPct*100).toFixed(0)}% (superior al minimo del 25%, Art. 80 LFT)`
    : `Prima vacacional del 25% (Art. 80 LFT)`;
  const agTxt = prC.aguinaldoDias > 15
    ? `Aguinaldo de ${prC.aguinaldoDias} dias de salario, superior al minimo legal de 15 dias, pagadero antes del 20 de diciembre (Art. 87 LFT)`
    : `Aguinaldo minimo de 15 dias de salario antes del 20 de diciembre (Art. 87 LFT)`;

  _h(state, n++, 'Prestaciones de Ley');
  _p(state, `EL TRABAJADOR tendra derecho a todas las prestaciones minimas de la Ley Federal del Trabajo: a) ${vacTxt}; b) ${pvTxt}; c) ${agTxt}; d) Participacion de Utilidades (Art. 117 LFT); e) Afiliacion al IMSS; f) Aportaciones al INFONAVIT (Art. 29 Ley INFONAVIT); g) Prima de antiguedad (Art. 162 LFT).`);

  // ── Prestaciones adicionales (solo si aplican al trabajador/empresa) ──────
  const adics = [];
  if (data.fondoAhorroActivo || prC.fondoAhorro.activo) {
    const pctT = data.fondoAhorroActivo ? data.fondoAhorroPct : prC.fondoAhorro.pctTrabajador;
    const pctP = data.fondoAhorroActivo ? data.fondoAhorroPct : prC.fondoAhorro.pctPatron;
    adics.push(`Fondo de ahorro con aportacion del ${(pctT*100).toFixed(1)}% a cargo de EL TRABAJADOR y ${(pctP*100).toFixed(1)}% a cargo de EL PATRON, en terminos del Art. 110 fraccion IV LFT`);
  }
  if ((data.valesDespensaTrab || 0) > 0) {
    adics.push(`Vales de despensa por $${Number(data.valesDespensaTrab).toFixed(2)} M.N. por periodo de pago`);
  } else if (prC.vales.activo && prC.vales.valor > 0) {
    adics.push(prC.vales.tipo === 'pct'
      ? `Vales de despensa equivalentes al ${(prC.vales.valor*100).toFixed(1)}% del salario del periodo`
      : `Vales de despensa por $${Number(prC.vales.valor).toFixed(2)} M.N. por periodo de pago`);
  }
  if (prC.primaDomPct > 0.25) {
    adics.push(`Prima dominical del ${(prC.primaDomPct*100).toFixed(0)}%, superior al minimo del 25% (Art. 71 LFT)`);
  }
  if (prC.factorHE > 2) {
    adics.push(`Pago de horas extraordinarias a razon de ${prC.factorHE} veces el salario por hora, superior al minimo legal (Arts. 67-68 LFT)`);
  }
  if (prC.festivos.length > 0) {
    const listaFest = prC.festivos.map(f =>
      `${f.valor}${f.descripcion ? ' (' + f.descripcion + ')' : ''}${f.tipo === 'recurrente' ? ' de cada ano' : ''}`).join('; ');
    adics.push(`Dias de descanso con goce de sueldo adicionales a los festivos oficiales del Art. 74 LFT: ${listaFest}`);
  }
  if (adics.length > 0) {
    _h(state, n++, 'Prestaciones Adicionales');
    _p(state, `Ademas de las prestaciones minimas de ley, EL PATRON otorga a EL TRABAJADOR las siguientes prestaciones adicionales: ${adics.map((a,i) => String.fromCharCode(97+i) + ') ' + a).join('; ')}. Estas prestaciones se otorgan en beneficio de EL TRABAJADOR y no podran ser inferiores a los minimos establecidos en la Ley Federal del Trabajo.`);
  }

  _h(state, n++, 'Instrumentos y Herramientas de Trabajo');
  _p(state, `EL PATRON proporcionara los equipos e instrumentos necesarios para el desempeno de las funciones, los cuales son de propiedad exclusiva de EL PATRON. EL TRABAJADOR se obliga a darles uso exclusivamente laboral y a devolverlos en buen estado al terminar la relacion, respondiendo por danos causados por dolo, negligencia o descuido.`);

  _h(state, n++, 'Capacitacion y Adiestramiento (Arts. 153-A al 153-X LFT)');
  _p(state, `EL TRABAJADOR participara en los programas de capacitacion y adiestramiento que EL PATRON determine, con la finalidad de actualizar y perfeccionar sus conocimientos. La capacitacion recibida no generara derecho adicional de permanencia en la empresa.`);

  _h(state, n++, 'Obligaciones del Trabajador (Art. 134 LFT)');
  _p(state, `EL TRABAJADOR se obliga a: I) Ejecutar el trabajo con la intensidad y cuidado apropiados; II) Observar medidas de higiene y seguridad; III) Guardar escrupulosamente los secretos tecnico y comerciales; IV) Observar buenas costumbres; V) Prestar auxilios en casos de siniestro; VI) Comunicar al patron deficiencias que advierta; VII) Someterse a reconocimientos medicos en los terminos que establezca el patron.`);

  _h(state, n++, 'Deducciones de Ley (Art. 110 LFT)');
  _p(state, `EL PATRON queda autorizado para realizar las deducciones al salario conforme al Art. 110 LFT: I) Deudas por anticipos o articulos del patron; II) Cuotas IMSS e INFONAVIT; III) Pagos de creditos INFONAVIT; IV) Descuentos autorizados por convenio escrito.`);

  _h(state, n++, 'Confidencialidad, Secrecy y Propiedad Industrial');
  _p(state, `EL TRABAJADOR se obliga a guardar absoluta confidencialidad sobre informacion, datos, procesos, listados de clientes, estrategias comerciales, software y cualquier secreto industrial o comercial, durante y despues de la relacion laboral.`);
  _p(state, `La violacion puede configurar delitos del Art. 210-211 del Codigo Penal Federal (revelacion de secretos), Art. 229 del Codigo Penal de Guanajuato, y Arts. 82-86 y 213 de la Ley Federal de Proteccion a la Propiedad Industrial.`);
  _p(state, `Todos los trabajos, creaciones y desarrollos realizados en ejercicio de las funciones o con recursos del PATRON son de titularidad exclusiva de este; EL TRABAJADOR cede en este acto todos los derechos patrimoniales de autor que pudieran corresponderle.`);

  _h(state, n++, 'Causas de Rescision y Aviso de Renuncia');
  _p(state, `Son causas de rescision sin responsabilidad para EL PATRON las del Art. 47 LFT; y sin responsabilidad para EL TRABAJADOR las del Art. 51 LFT. En caso de renuncia voluntaria, EL TRABAJADOR dara un aviso previo de 15 dias naturales para la debida transicion. El incumplimiento del aviso puede dar lugar a descuento de un dia de salario por cada dia de incumplimiento (Art. 49 LFT).`);

  _h(state, n++, 'Beneficiarios (Art. 25 fracc. X LFT)');
  _p(state, `EL TRABAJADOR designa como beneficiarios para recibir salarios e indemnizaciones en caso de fallecimiento:`);
  const bRows = [];
  if (data.beneficiario1Nombre) bRows.push([np(data.beneficiario1Nombre), np(data.beneficiario1Parentesco), np(data.beneficiario1Telefono)]);
  else bRows.push(['[NOMBRE BENEFICIARIO 1]','[PARENTESCO]','[TELEFONO]']);
  if (data.beneficiario2Nombre) bRows.push([np(data.beneficiario2Nombre), np(data.beneficiario2Parentesco), np(data.beneficiario2Telefono)]);
  else bRows.push(['[NOMBRE BENEFICIARIO 2 — OPCIONAL]','','']);
  _table(state, [['Nombre Completo','Parentesco','Telefono']], bRows);

  _h(state, n++, 'Reconocimiento de Antiguedad');
  _p(state, `Para efectos del computo de la antiguedad y prestaciones derivadas, se toma como fecha de inicio de la relacion laboral el dia ${npDate((data.fechaIngresoReconocida || data.fechaIngreso) + 'T00:00:00')}, de conformidad con el Art. 158 LFT.`);

  _h(state, n++, 'Trabajadores Menores de Edad (Arts. 22-23 LFT)');
  _p(state, `En caso de que EL TRABAJADOR sea menor de 18 anos, las partes declaran que se cumplen las disposiciones de los Arts. 22-23 LFT: autorizacion de padres o tutores, prohibicion de trabajo nocturno industrial y jornada maxima de 6 horas diarias.`);

  _h(state, n++, 'Jurisdiccion y Competencia');
  _p(state, `Para la interpretacion y cumplimiento del presente contrato las partes se someten a la jurisdiccion del Tribunal Laboral del Centro de Justicia Laboral del Estado de Guanajuato, con sede en Leon, Guanajuato, renunciando al fuero que pudiera corresponderles por su domicilio u otra causa.`);

  _h(state, n++, 'Supletoriedad');
  _p(state, `En todo lo no previsto expresamente en el presente contrato se aplicara supletoriamente la Ley Federal del Trabajo vigente y demas disposiciones aplicables. Las condiciones mas favorables para EL TRABAJADOR prevalecen sobre lo aqui estipulado.`);
}

// ── Bloque de firmas ─────────────────────────────────────────────────────────
function _firmas(state, data) {
  _checkY(state, 78);
  const { doc, ml, mr, pw } = state;
  const tw = pw - ml - mr;
  const colW = tw / 2 - 5;
  _gap(state, 6); _line(state);
  _p(state, `En la ciudad de ${np(data.ciudadFirma)}, siendo las ___:___ horas del dia ${npDate(new Date().toISOString())}, se firma el presente contrato en dos tantos originales quedando uno en poder de cada parte, previa lectura y ratificacion de su contenido.`, { fontSize: 8.5, color:[80,80,80] });
  _gap(state, 12);
  const y0 = state.y;
  const c1 = ml, c2 = ml + colW + 10;
  // Firma 1 y 2
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  doc.line(c1, y0+20, c1+colW, y0+20);
  doc.line(c2, y0+20, c2+colW, y0+20);
  doc.line(c1, y0+50, c1+colW, y0+50);
  doc.line(c2, y0+50, c2+colW, y0+50);
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(30,30,30);
  doc.text('EL PATRON / REPRESENTANTE', c1+colW/2, y0+25, {align:'center'});
  doc.text('EL TRABAJADOR',             c2+colW/2, y0+25, {align:'center'});
  doc.text('TESTIGO 1',                 c1+colW/2, y0+55, {align:'center'});
  doc.text('TESTIGO 2',                 c2+colW/2, y0+55, {align:'center'});
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80);
  doc.text(np(data.razonSocial),         c1+colW/2, y0+30, {align:'center'});
  if (data.representanteLegal) doc.text(np(data.representanteLegal), c1+colW/2, y0+34, {align:'center'});
  doc.text(np(data.nombre),              c2+colW/2, y0+30, {align:'center'});
  if (data.rfc) doc.text(`RFC: ${np(data.rfc)}`, c2+colW/2, y0+34, {align:'center'});
  state.y = y0 + 68;
}

// ── Generador 1: Tiempo Indeterminado ────────────────────────────────────────
function generateContratoIndeterminado(data) {
  const state = _initContratoDoc(
    'CONTRATO INDIVIDUAL DE TRABAJO POR TIEMPO INDETERMINADO',
    'Articulo 35 — Ley Federal del Trabajo 2026', data);

  _h(state, 1, 'Duracion (Art. 35 LFT)');
  _p(state, `El presente contrato se celebra por TIEMPO INDETERMINADO entre ${np(data.razonSocial)}, con RFC ${np(data.rfcPatron)}, representada por ${np(data.representanteLegal) || '[REPRESENTANTE]'}, con domicilio en ${np(data.domicilioSucursal || data.domicilioFiscal)}, en adelante "EL PATRON"; y el C. ${np(data.nombre)}, con RFC ${np(data.rfc)}, CURP ${np(data.curp)}, NSS ${np(data.nss)}, en adelante "EL TRABAJADOR". La relacion laboral inicia el ${npDate(data.fechaIngreso+'T00:00:00')} con vigencia indefinida.`);

  _h(state, 2, `Periodo de Prueba — ${data.tipoPruebaDias} dias (Art. 39-A LFT)`);
  _p(state, `Las partes convienen un periodo de prueba de ${data.tipoPruebaDias} dias naturales contados desde el inicio de la relacion. Durante este lapso EL PATRON evaluara el desempeno y aptitudes de EL TRABAJADOR. Si al termino no se notifica rescision, el contrato queda ratificado de pleno derecho.`);
  if (Number(data.tipoPruebaDias) > 30) _recuadro(state, 'El periodo de 180 dias aplica exclusivamente para puestos de direccion, gerencia o que requieran conocimientos o habilidades especiales (Art. 39-A, parrafo segundo, LFT).', 'warn');

  _h(state, 3, 'Objeto — Servicio a Prestar');
  _p(state, `EL TRABAJADOR se obliga a prestar sus servicios personales y subordinados como ${np(data.puesto)}${data.departamento ? ', en el area de '+np(data.departamento) : ''}. Funciones principales:`);
  _p(state, np(data.funciones), { indent: 4, color:[70,70,70] });

  _h(state, 4, 'Salario (Art. 82-88 LFT)');
  _p(state, `EL PATRON pagara a EL TRABAJADOR un salario ${np(data.periodoSalario)} de $${Number(data.salario).toFixed(2)} M.N. (${np(numToWords(data.salario))} PESOS 00/100 M.N.) mediante ${np(data.formaPago)}${data.diasPago ? ', los dias '+np(data.diasPago) : ''}. El salario cubre la jornada ordinaria y no sera inferior al salario minimo vigente.`);

  _h(state, 5, 'Lugar y Jornada de Trabajo');
  _p(state, `EL TRABAJADOR prestara sus servicios en ${np(data.domicilioSucursal || data.domicilioFiscal)} o en el lugar que EL PATRON designe. La jornada ordinaria sera de ${np(data.horaInicio)} a ${np(data.horaFin)} horas, con descanso de ${np(data.horaDescansoInicio)} a ${np(data.horaDescansoFin)} horas, los dias ${data.diasSemana.map(np).join(', ')}. La jornada semanal no excedera las 40 horas (Reforma LFT 2023, Art. 61).`);

  _h(state, 6, 'Descanso Semanal (Art. 69 LFT)');
  _p(state, `EL TRABAJADOR disfrutara de un dia de descanso por cada seis laborados, preferentemente el ${np(data.diaDescanso)}, con salario integro. Si labora en dia de descanso percibirá el doble del salario ademas del ordinario.`);

  _clausulasComunes(state, data, 7);
  _firmas(state, data);
  _addFooters(state, data);
  state.doc.save(`contrato-indeterminado-${np(data.nombre).replace(/\s+/g,'-').toLowerCase()}.pdf`);
}

// ── Generador 2: Tiempo Determinado ─────────────────────────────────────────
function generateContratoDeterminado(data) {
  const state = _initContratoDoc(
    'CONTRATO INDIVIDUAL DE TRABAJO POR TIEMPO DETERMINADO',
    'Articulo 37 — Ley Federal del Trabajo 2026', data);

  _h(state, 1, 'Duracion y Vigencia (Art. 37 LFT)');
  _p(state, `El presente contrato se celebra por TIEMPO DETERMINADO entre ${np(data.razonSocial)} (EL PATRON) y el C. ${np(data.nombre)} (EL TRABAJADOR), con vigencia del ${npDate(data.fechaIngreso+'T00:00:00')} al ${data.fechaVencimiento ? npDate(data.fechaVencimiento+'T00:00:00') : '[FECHA DE VENCIMIENTO]'}, fecha en que concluye automaticamente sin responsabilidad para ninguna parte, salvo renovacion por escrito.`);
  _recuadro(state, 'ADVERTENCIA LEGAL: El contrato por tiempo determinado solo es valido cuando lo exige la naturaleza del trabajo, cuando tiene por objeto sustituir temporalmente a otro trabajador, o cuando lo imponga una circunstancia objetiva determinada (Art. 37 LFT). Su uso indebido convierte la relacion en tiempo indeterminado (Art. 39 LFT).', 'warn');

  _h(state, 2, 'Objeto — Servicio a Prestar');
  _p(state, `EL TRABAJADOR se obliga a prestar sus servicios como ${np(data.puesto)}${data.departamento ? ' en el area de '+np(data.departamento) : ''}, durante la vigencia del contrato. Funciones: ${np(data.funciones)}.`);

  _h(state, 3, 'Salario');
  _p(state, `EL PATRON pagara un salario ${np(data.periodoSalario)} de $${Number(data.salario).toFixed(2)} M.N. (${np(numToWords(data.salario))} PESOS 00/100 M.N.) mediante ${np(data.formaPago)}${data.diasPago ? ', los dias '+np(data.diasPago) : ''}.`);

  _h(state, 4, 'Lugar y Jornada');
  _p(state, `EL TRABAJADOR prestara servicios en ${np(data.domicilioSucursal || data.domicilioFiscal)}. Jornada de ${np(data.horaInicio)} a ${np(data.horaFin)} horas, con descanso de ${np(data.horaDescansoInicio)} a ${np(data.horaDescansoFin)} horas, dias ${data.diasSemana.map(np).join(', ')}.`);

  _h(state, 5, 'Descanso Semanal');
  _p(state, `Un dia de descanso semanal, preferentemente el ${np(data.diaDescanso)}, con salario integro (Art. 69 LFT).`);

  _clausulasComunes(state, data, 6);
  _firmas(state, data);
  _addFooters(state, data);
  state.doc.save(`contrato-determinado-${np(data.nombre).replace(/\s+/g,'-').toLowerCase()}.pdf`);
}

// ── Generador 3: Por Obra ────────────────────────────────────────────────────
function generateContratoObra(data) {
  const state = _initContratoDoc(
    'CONTRATO INDIVIDUAL DE TRABAJO POR OBRA O SERVICIO DETERMINADO',
    'Articulo 36 — Ley Federal del Trabajo 2026', data);

  _h(state, 1, 'Objeto y Duracion (Art. 36 LFT)');
  _p(state, `El presente contrato se celebra para la realizacion de la obra o servicio denominado: "${np(data.nombreProyecto || '[NOMBRE DEL PROYECTO]')}". La relacion laboral inicia el ${npDate(data.fechaIngreso+'T00:00:00')} y concluye automaticamente al termino de la obra, con fecha estimada el ${data.fechaFinProyecto ? npDate(data.fechaFinProyecto+'T00:00:00') : '[FECHA ESTIMADA]'}, sin responsabilidad para EL PATRON.`);
  _recuadro(state, 'Este tipo de contrato aplica unicamente cuando la naturaleza del trabajo consiste en una obra o proyecto con inicio y fin determinados. Al termino del proyecto se generan prestaciones proporcionales (vacaciones, aguinaldo, prima vacacional). Art. 36 LFT.', 'warn');

  _h(state, 2, 'Funciones Especificas del Proyecto');
  _p(state, `EL TRABAJADOR desempenara el cargo de ${np(data.puesto)} participando exclusivamente en el proyecto descrito. Funciones: ${np(data.funciones)}.`);

  _h(state, 3, 'Salario');
  _p(state, `Salario ${np(data.periodoSalario)} de $${Number(data.salario).toFixed(2)} M.N. (${np(numToWords(data.salario))} PESOS 00/100 M.N.) mediante ${np(data.formaPago)}${data.diasPago ? ', dias '+np(data.diasPago) : ''}.`);

  _h(state, 4, 'Lugar de Prestacion del Servicio');
  _p(state, `EL TRABAJADOR prestara servicios en el lugar de ejecucion de la obra, inicialmente en ${np(data.domicilioSucursal || data.domicilioFiscal)}, o en la ubicacion que requieran los trabajos, previo aviso de EL PATRON.`);

  _h(state, 5, 'Jornada de Trabajo');
  _p(state, `Jornada de ${np(data.horaInicio)} a ${np(data.horaFin)} horas, descanso de ${np(data.horaDescansoInicio)} a ${np(data.horaDescansoFin)}, dias ${data.diasSemana.map(np).join(', ')}.`);

  _h(state, 6, 'Descanso Semanal');
  _p(state, `Un dia de descanso semanal, preferentemente el ${np(data.diaDescanso)}, con salario integro (Art. 69 LFT).`);

  _clausulasComunes(state, data, 7);
  _firmas(state, data);
  _addFooters(state, data);
  state.doc.save(`contrato-obra-${np(data.nombre).replace(/\s+/g,'-').toLowerCase()}.pdf`);
}

// ── Generador 4: Por Temporada ───────────────────────────────────────────────
function generateContratoTemporada(data) {
  const state = _initContratoDoc(
    'CONTRATO INDIVIDUAL DE TRABAJO POR TEMPORADA',
    'Articulo 42 Bis — Ley Federal del Trabajo 2026', data);

  _h(state, 1, 'Duracion y Caracter Discontinuo (Art. 42 Bis LFT)');
  _p(state, `El presente contrato es por TIEMPO INDETERMINADO con prestacion de servicios DISCONTINUA. EL TRABAJADOR presta sus servicios unicamente durante los periodos de temporada; fuera de ellos la relacion queda suspendida (no rescindida). Temporadas pactadas:`);
  if (data.temporadas?.length) {
    _table(state,
      [['Temporada','Fecha Inicio','Fecha Fin']],
      data.temporadas.map(t => [np(t.nombre||''), t.inicio ? npDate(t.inicio+'T00:00:00') : '', t.fin ? npDate(t.fin+'T00:00:00') : ''])
    );
  } else {
    _recuadro(state, '[DEFINIR LAS TEMPORADAS CON NOMBRE, FECHA INICIO Y FECHA FIN]', 'warn');
  }
  _recuadro(state, 'SUSPENSION Y CONVOCATORIA: EL PATRON convocara a EL TRABAJADOR con minimo 30 dias de anticipacion al inicio de cada temporada. Si EL TRABAJADOR no se presenta dentro de los 15 dias siguientes sin causa justificada, se entendera rescindida la relacion sin responsabilidad para EL PATRON (Art. 42 Bis LFT).', 'warn');

  _h(state, 2, 'Objeto — Servicio a Prestar');
  _p(state, `Durante cada temporada EL TRABAJADOR se desempenara como ${np(data.puesto)}${data.departamento ? ' en el area de '+np(data.departamento) : ''}. Funciones: ${np(data.funciones)}.`);

  _h(state, 3, 'Salario');
  _p(state, `Salario ${np(data.periodoSalario)} de $${Number(data.salario).toFixed(2)} M.N. (${np(numToWords(data.salario))} PESOS 00/100 M.N.) mediante ${np(data.formaPago)}, pagadero unicamente durante temporada activa. Las prestaciones se calculan proporcionalmente al tiempo efectivamente laborado en cada ejercicio anual.`);

  _h(state, 4, 'Lugar de Prestacion de Servicios');
  _p(state, `EL TRABAJADOR prestara servicios en ${np(data.domicilioSucursal || data.domicilioFiscal)} o el lugar que EL PATRON determine para cada temporada.`);

  _h(state, 5, 'Jornada de Trabajo');
  _p(state, `Durante la temporada activa, jornada de ${np(data.horaInicio)} a ${np(data.horaFin)} horas, descanso de ${np(data.horaDescansoInicio)} a ${np(data.horaDescansoFin)}, dias ${data.diasSemana.map(np).join(', ')}.`);

  _h(state, 6, 'Descanso y Prestaciones Proporcionales');
  _p(state, `Un dia de descanso semanal, preferentemente el ${np(data.diaDescanso)}. Todas las prestaciones (vacaciones, prima vacacional, aguinaldo, prima de antiguedad) se calculan proporcional al tiempo efectivamente laborado en cada ano de calendario (Arts. 76, 80, 87 y 162 LFT).`);

  _clausulasComunes(state, data, 7);
  _firmas(state, data);
  _addFooters(state, data);
  state.doc.save(`contrato-temporada-${np(data.nombre).replace(/\s+/g,'-').toLowerCase()}.pdf`);
}

// ── Generador 5: Por Comisión ────────────────────────────────────────────────
function generateContratoComision(data) {
  const state = _initContratoDoc(
    'CONTRATO INDIVIDUAL DE TRABAJO PARA TRABAJADOR COMISIONISTA',
    'Articulos 285-289 — Ley Federal del Trabajo 2026', data);

  _h(state, 1, 'Duracion (Art. 285 LFT)');
  _p(state, `El presente contrato se celebra por TIEMPO INDETERMINADO entre ${np(data.razonSocial)} (EL PATRON) y el C. ${np(data.nombre)} (EL TRABAJADOR COMISIONISTA), con inicio el ${npDate(data.fechaIngreso+'T00:00:00')}.`);

  _h(state, 2, 'Periodo de Prueba — 60 dias');
  _p(state, `Se establece un periodo de prueba de 60 dias naturales para evaluar desempeno en ventas, zona de trabajo y cumplimiento de objetivos comerciales. Al concluir el periodo sin notificacion en contrario, el contrato queda ratificado.`);

  _h(state, 3, 'Objeto, Zona y Actividades');
  _p(state, `EL TRABAJADOR desempenara el cargo de ${np(data.puesto)} con cobertura en: ${np(data.zonaAsignada || '[ZONA ASIGNADA]')}. Actividades principales: ${np(data.funciones)}.`);

  _h(state, 4, 'Remuneracion por Comision (Art. 289 LFT)');
  _p(state, `La remuneracion se integra por comisiones sobre ventas o servicios concretados, conforme a la siguiente tabla:`);
  if (data.tablaComisiones?.length) {
    _table(state,
      [['Rango / Condicion','Comision Aplicable']],
      data.tablaComisiones.map(c => [np(c.rango||''), np(c.comision||'')])
    );
  } else {
    _recuadro(state, '[DEFINIR RANGOS Y COMISIONES APLICABLES]', 'warn');
  }
  _p(state, `Para efectos del IMSS e INFONAVIT, el SDI se calculara conforme al promedio de comisiones percibidas en los ultimos 30 dias, con minimo equivalente al salario minimo general vigente (Art. 289 LFT). Salario mensual base de referencia: $${Number(data.salario).toFixed(2)} M.N.`);

  _h(state, 5, 'Jornada Autoadministrada y Presentacion en Oficina');
  _p(state, `Dada la naturaleza de la actividad, la jornada es autoadministrada dentro del horario de ${np(data.horaInicio)} a ${np(data.horaFin)} horas. EL TRABAJADOR se presentara en instalaciones de EL PATRON los dias ${(data.diasPresentacion||['[DIAS]']).map(np).join(', ')} en el horario ${np(data.horarioPresentacion || '[HORARIO DE PRESENTACION]')}.`);

  _h(state, 6, 'Descanso Semanal');
  _p(state, `Un dia de descanso semanal, preferentemente el ${np(data.diaDescanso)}, con salario minimo integro (Arts. 69 y 289 LFT).`);

  _clausulasComunes(state, data, 7);
  _firmas(state, data);

  // Hoja adicional: ficha del puesto + datos personales
  _newPage(state);
  _p(state, 'ANEXO A — DATOS DEL PUESTO Y FICHA PERSONAL DEL TRABAJADOR', { bold: true, fontSize: 11, color:[15,36,56] });
  _gap(state, 4);
  _table(state, [['Campo','Dato']], [
    ['Puesto',                np(data.puesto)],
    ['Departamento',          np(data.departamento)],
    ['Zona asignada',         np(data.zonaAsignada)],
    ['Dias presentacion',     (data.diasPresentacion||[]).map(np).join(', ')],
    ['Horario presentacion',  np(data.horarioPresentacion)],
    ['Funciones',             np(data.funciones)],
  ]);
  _table(state, [['Campo','Dato']], [
    ['Nombre completo',       np(data.nombre)],
    ['RFC',                   np(data.rfc)],
    ['CURP',                  np(data.curp)],
    ['NSS',                   np(data.nss)],
    ['Edad',                  data.edad ? data.edad + ' anos' : ''],
    ['Estado civil',          np(data.estadoCivil)],
    ['Nacionalidad',          np(data.nacionalidad)],
    ['Domicilio',             np(data.domicilio)],
    [np(data.tipoIdentificacion || 'Identificacion'), np(data.numIdentificacion)],
  ]);

  _addFooters(state, data);
  state.doc.save(`contrato-comision-${np(data.nombre).replace(/\s+/g,'-').toLowerCase()}.pdf`);
}

// ─── CONTRATO INDIVIDUAL DE TRABAJO (legado — mantener compatibilidad) ────────
/**
 * @param {Object} empresa  { nombre, rfc, representante, domicilio, ciudad }
 * @param {Object} trab     { nombre, rfc, curp, nss, puesto, departamento, fecha_ingreso, salario_mensual, tipo_contrato, smg_zone }
 */
function generateContratoPDF(empresa, trab, sucursal = null) {
  empresa = resolveUbicacion(empresa, sucursal);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  const ml = 22, mr = 22;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const tw = pw - ml - mr;

  const tipoLabel = { indefinido:'Tiempo Indeterminado', determinado:'Tiempo Determinado', obra:'Obra o Servicio Determinado', temporada:'Temporada' }[trab.tipo_contrato] || 'Tiempo Indeterminado';
  let y = pdfHeader(doc, `CONTRATO INDIVIDUAL DE TRABAJO`, `Por ${np(tipoLabel)} — Ley Federal del Trabajo 2026`, ml, mr);

  // Ciudad y fecha
  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(60,60,60);
  doc.text(`${np(empresa.ciudad)}, a ${npDate(new Date())}`, pw - mr, y, { align:'right' }); y += 14;

  function parrafo(titulo, texto, indent = true) {
    doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(20,20,20);
    doc.text(np(titulo), ml, y); y += 5;
    doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(40,40,40);
    const lines = doc.splitTextToSize(np(texto), tw - (indent ? 4 : 0));
    doc.text(lines, ml + (indent ? 2 : 0), y);
    y += lines.length * 5.2 + 6;
    if (y > ph - 30) { doc.addPage(); y = 25; }
  }

  parrafo('PARTES CONTRATANTES:', `El presente contrato se celebra entre ${np(empresa.nombre)}, con RFC ${np(empresa.rfc || 'N/A')}${empresa.representante ? ', representada por ' + np(empresa.representante) : ''}, con domicilio en ${np(empresa.domicilio || empresa.ciudad)}, en adelante denominado "EL PATRON"; y el C. ${np(trab.nombre)}, con RFC ${np(trab.rfc || 'N/A')}, CURP ${np(trab.curp || 'N/A')}, NSS ${np(trab.nss || 'N/A')}, en adelante "EL TRABAJADOR".`);

  parrafo('PRIMERA. — SERVICIO A PRESTAR:', `EL TRABAJADOR se obliga a prestar sus servicios personales y subordinados como ${np(trab.puesto || 'empleado(a)')}${trab.departamento ? ' en el area de ' + np(trab.departamento) : ''}, desarrollando todas las funciones inherentes a dicho puesto conforme a las instrucciones del PATRON y su Reglamento Interior de Trabajo.`);

  parrafo('SEGUNDA. — DURACION:', trab.tipo_contrato === 'indefinido'
    ? `El presente contrato es por TIEMPO INDETERMINADO, a partir del ${npDate(trab.fecha_ingreso)}, con vigencia indefinida, pudiendo concluir por las causas previstas en los articulos 46 a 53 de la Ley Federal del Trabajo.`
    : `El presente contrato es por ${np(tipoLabel)}, con inicio el ${npDate(trab.fecha_ingreso)}, conforme al articulo 37 de la Ley Federal del Trabajo.`);

  parrafo('TERCERA. — JORNADA DE TRABAJO:', `La jornada ordinaria de trabajo sera de 40 horas semanales, conforme a la reforma a la Ley Federal del Trabajo publicada en el DOF en 2026. El PATRON podra autorizar tiempo extraordinario con pago del 200% del salario ordinario (Art. 67 LFT).`);

  parrafo('CUARTA. — LUGAR DE TRABAJO:', `EL TRABAJADOR prestara sus servicios en el domicilio ${np(empresa.domicilio || empresa.ciudad)}, o en cualquier lugar que EL PATRON designe por necesidades del servicio, con previo aviso.`);

  const _perSal   = trab.periodo_salario || 'mensual';
  const _perAdj   = _perSal === 'quincenal' ? 'quincenal' : _perSal === 'semanal' ? 'semanal' : 'mensual';
  const _perFrec  = _perSal === 'quincenal' ? 'de forma quincenal' : _perSal === 'semanal' ? 'de forma semanal' : 'de forma mensual';
  const _salDiarioC = (typeof calcSalarioDiario === 'function' ? calcSalarioDiario(trab.salario_mensual, _perSal) : trab.salario_mensual / 30);
  const _formaPagoC = (trab.forma_pago === 'efectivo') ? 'en efectivo' : 'mediante deposito bancario';
  parrafo('QUINTA. — SALARIO:', `EL TRABAJADOR percibirá un salario ${_perAdj} de $${np(trab.salario_mensual.toFixed(2))} M.N. (${np(numToWords(trab.salario_mensual))} PESOS 00/100 M.N.), equivalente a un salario diario de $${np(_salDiarioC.toFixed(2))} M.N. (Art. 89 LFT), que sera pagado ${_perFrec} ${_formaPagoC}, conforme a los articulos 82, 88 y 89 de la Ley Federal del Trabajo.`);

  const prG = prestacionesEmpresa(empresa);
  parrafo('SEXTA. — PRESTACIONES DE LEY:', `EL TRABAJADOR tendra derecho a: a) Vacaciones conforme al Art. 76 LFT${prG.vacDiasExtra > 0 ? ` mas ${prG.vacDiasExtra} dia(s) adicionales otorgados por EL PATRON` : ''}; b) Prima vacacional del ${(prG.primaVacPct*100).toFixed(0)}% (Art. 80 LFT${prG.primaVacPct > 0.25 ? ', superior al minimo de ley' : ''}); c) Aguinaldo de ${prG.aguinaldoDias} dias de salario (Art. 87 LFT${prG.aguinaldoDias > 15 ? ', superior al minimo de ley' : ''}); d) Seguridad social (IMSS); e) INFONAVIT conforme a la Ley; f) Prima de antiguedad (Art. 162 LFT).`);

  // Prestaciones adicionales (solo si aplican)
  const adicG = [];
  if (trab.fondo_ahorro_activo || prG.fondoAhorro.activo) {
    const pctT = trab.fondo_ahorro_activo ? parseFloat(trab.fondo_ahorro_pct || 0.13) : prG.fondoAhorro.pctTrabajador;
    const pctP = trab.fondo_ahorro_activo ? parseFloat(trab.fondo_ahorro_pct || 0.13) : prG.fondoAhorro.pctPatron;
    adicG.push(`Fondo de ahorro con aportacion del ${(pctT*100).toFixed(1)}% a cargo de EL TRABAJADOR y ${(pctP*100).toFixed(1)}% a cargo de EL PATRON (Art. 110 fr. IV LFT)`);
  }
  if (parseFloat(trab.vales_despensa || 0) > 0) {
    adicG.push(`Vales de despensa por $${parseFloat(trab.vales_despensa).toFixed(2)} M.N. por periodo de pago`);
  } else if (prG.vales.activo && prG.vales.valor > 0) {
    adicG.push(prG.vales.tipo === 'pct'
      ? `Vales de despensa equivalentes al ${(prG.vales.valor*100).toFixed(1)}% del salario del periodo`
      : `Vales de despensa por $${Number(prG.vales.valor).toFixed(2)} M.N. por periodo de pago`);
  }
  if (prG.primaDomPct > 0.25) adicG.push(`Prima dominical del ${(prG.primaDomPct*100).toFixed(0)}% (Art. 71 LFT, superior al minimo)`);
  if (prG.factorHE > 2)       adicG.push(`Pago de horas extraordinarias a ${prG.factorHE} veces el salario por hora (Arts. 67-68 LFT, superior al minimo)`);
  if (prG.festivos.length > 0) {
    adicG.push(`Dias de descanso adicionales con goce de sueldo: ${prG.festivos.map(f => `${f.valor}${f.descripcion ? ' (' + f.descripcion + ')' : ''}`).join('; ')}`);
  }
  if (adicG.length > 0) {
    parrafo('SEXTA BIS. — PRESTACIONES ADICIONALES:', `Ademas de las prestaciones de ley, EL PATRON otorga: ${adicG.map((a,i) => String.fromCharCode(97+i) + ') ' + a).join('; ')}. Estas prestaciones no podran ser inferiores a los minimos de la Ley Federal del Trabajo.`);
  }

  parrafo('SEPTIMA. — OBLIGACIONES DEL TRABAJADOR:', `EL TRABAJADOR se obliga a: cumplir las disposiciones del Reglamento Interior de Trabajo; desempenar el servicio con la intensidad, cuidado y esmero apropiados; observar buenas costumbres; guardar los secretos tecnicos y comerciales de EL PATRON; y acatar las medidas preventivas de seguridad e higiene (Art. 134 LFT).`);

  parrafo('OCTAVA. — CAUSAS DE RESCISION:', `Cualquiera de las partes podra rescindir el contrato sin responsabilidad por las causas establecidas en los articulos 47 y 51 de la Ley Federal del Trabajo respectivamente. EL PATRON realizara la rescision conforme al procedimiento del articulo 47 de la LFT.`);

  parrafo('NOVENA. — DERECHO A LA DESCONEXION DIGITAL:', `Conforme a la reforma a la LFT 2026, EL TRABAJADOR tiene derecho a no atender mensajes, llamadas o correos electronicos fuera de su jornada laboral, en vacaciones o durante licencias, salvo caso de urgencia debidamente justificada.`);

  parrafo('DECIMA. — DISPOSICION GENERAL:', `En todo lo no previsto en el presente contrato se estara a lo dispuesto por la Ley Federal del Trabajo vigente y demas ordenamientos aplicables. Ambas partes declaran leer, entender y aceptar el contenido de este contrato.`);

  // Firmas
  if (y + 60 > ph - 20) { doc.addPage(); y = 25; }
  y += 6;
  pdfSignatures(doc,
    `${np(empresa.nombre)}${empresa.representante ? '\n' + np(empresa.representante) : ''}`,
    `${np(trab.nombre)}\n${np(trab.puesto || '')}`,
    y, ml, mr);

  // Footer
  doc.setFontSize(7); doc.setTextColor(160,160,160);
  doc.text('Documento generado por Capital Humano MX | LFT 2026 | Referencial — no sustituye asesoria legal', pw/2, ph-10, { align:'center' });

  doc.save(`contrato-${np(trab.nombre).replace(/\s+/g,'-').toLowerCase()}.pdf`);
}

// ─── CARTA DE RENUNCIA ────────────────────────────────────────────────────────
function generateCartaRenuncia(empresa, trab, sucursal = null) {
  empresa = resolveUbicacion(empresa, sucursal);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  const ml = 25, mr = 25;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const tw = pw - ml - mr;
  let y = pdfHeader(doc, 'CARTA DE RENUNCIA VOLUNTARIA', 'Ley Federal del Trabajo — Articulo 51', ml, mr);

  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(60,60,60);
  doc.text(`${np(empresa.ciudad)}, a ${npDate(trab.fecha_baja)}`, pw - mr, y, { align:'right' }); y += 12;

  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(20,20,20);
  doc.text(np(empresa.nombre.toUpperCase()), ml, y); y += 6;
  if (empresa.representante) { doc.setFont('helvetica','normal'); doc.text(`Attn.: ${np(empresa.representante)}`, ml, y); y += 6; }
  if (empresa.domicilio) { doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(80,80,80); doc.text(np(empresa.domicilio), ml, y); y += 6; }
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(20,20,20);
  doc.text('P  R  E  S  E  N  T  E', ml, y); y += 12;

  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(40,40,40);
  const p1 = `Por medio del presente escrito, yo ${np(trab.nombre)}, con RFC ${np(trab.rfc || 'N/A')} y CURP ${np(trab.curp || 'N/A')}, quien he prestado mis servicios como ${np(trab.puesto || 'empleado(a)')}${trab.departamento ? ' en el departamento de ' + np(trab.departamento) : ''} en su empresa desde el ${npDate(trab.fecha_ingreso)}, me permito comunicarle mi decision de presentar RENUNCIA VOLUNTARIA e irrevocable al cargo que venia desempenando, con efectos a partir del dia ${npDate(trab.fecha_baja)}.`;
  let l = doc.splitTextToSize(p1, tw); doc.text(l, ml, y); y += l.length * 5.5 + 8;

  const p2 = `Lo anterior de conformidad con lo dispuesto por la Ley Federal del Trabajo vigente, sin que medie presion o condicionamiento alguno de parte de la empresa.`;
  l = doc.splitTextToSize(p2, tw); doc.text(l, ml, y); y += l.length * 5.5 + 8;

  const p3 = `Manifiesto que no tengo adeudo alguno pendiente con la empresa por ningun concepto, y agradezco sinceramente la oportunidad de haber formado parte de su organizacion. Quedo en espera del pago de las prestaciones proporcionales correspondientes conforme a la Ley.`;
  l = doc.splitTextToSize(p3, tw); doc.text(l, ml, y); y += l.length * 5.5 + 12;

  doc.text('Sin otro particular, quedo de usted.', ml, y); y += 8;
  doc.setFont('helvetica','italic'); doc.text('A t e n t a m e n t e,', ml, y); y += 18;

  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  doc.line(ml, y, ml + 100, y); y += 5;
  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(30,30,30);
  doc.text(np(trab.nombre), ml, y); y += 5;
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(80,80,80);
  if (trab.rfc)  { doc.text(`RFC: ${np(trab.rfc)}`, ml, y); y += 4.5; }
  if (trab.curp) { doc.text(`CURP: ${np(trab.curp)}`, ml, y); y += 4.5; }
  if (trab.nss)  { doc.text(`NSS: ${np(trab.nss)}`, ml, y); y += 4.5; }

  doc.setFontSize(7); doc.setTextColor(160,160,160);
  doc.text('Documento generado por Capital Humano MX | Referencial — no sustituye asesoria legal', pw/2, ph-10, { align:'center' });
  doc.save('carta-renuncia.pdf');
}

// ─── AVISO DE RESCISIÓN ───────────────────────────────────────────────────────
function generateAvisoRecision(empresa, trab, result, sucursal = null) {
  empresa = resolveUbicacion(empresa, sucursal);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  const ml = 25, mr = 25;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const tw = pw - ml - mr;
  let y = pdfHeader(doc, 'AVISO DE TERMINACION DE RELACION LABORAL', 'Articulo 53 fraccion I — Ley Federal del Trabajo', ml, mr);

  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(60,60,60);
  doc.text(`${np(empresa.ciudad)}, a ${npDate(trab.fecha_baja)}`, pw - mr, y, { align:'right' }); y += 12;

  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(20,20,20);
  doc.text(`C. ${np(trab.nombre).toUpperCase()}`, ml, y); y += 6;
  if (trab.puesto) { doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(40,40,40); doc.text(`Cargo: ${np(trab.puesto)}`, ml, y); y += 6; }
  doc.setFont('helvetica','bold'); doc.text('P  R  E  S  E  N  T  E', ml, y); y += 12;

  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(40,40,40);
  const rep = empresa.representante ? ` a traves de su Representante Legal ${np(empresa.representante)},` : ',';
  const b1 = `Por medio del presente, ${np(empresa.nombre)}${rep} con RFC ${np(empresa.rfc || 'N/A')}, le comunica formalmente la TERMINACION DE SU RELACION LABORAL, con efectos a partir del dia ${npDate(trab.fecha_baja)}, en terminos de los articulos 49 y 50 de la Ley Federal del Trabajo.`;
  let l = doc.splitTextToSize(b1, tw); doc.text(l, ml, y); y += l.length * 5.5 + 8;
  const b2 = `La empresa procede al pago de la indemnizacion y demas prestaciones legales correspondientes, cuyo desglose se detalla en el Recibo de Liquidacion adjunto.`;
  l = doc.splitTextToSize(b2, tw); doc.text(l, ml, y); y += l.length * 5.5 + 10;

  y = pdfLine(doc, y, ml, mr) + 4;
  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(50,50,50);
  doc.text('DATOS DE LA RELACION LABORAL', ml, y); y += 8;

  doc.autoTable({
    startY: y, margin:{ left:ml, right:mr },
    head:[['Concepto','Dato']],
    body:[
      ['Trabajador',       np(trab.nombre)],
      ['RFC Trabajador',   np(trab.rfc || 'N/A')],
      ['CURP',             np(trab.curp || 'N/A')],
      ['NSS (IMSS)',       np(trab.nss || 'N/A')],
      ['Puesto',           np(trab.puesto || 'N/A')],
      ['Departamento',     np(trab.departamento || 'N/A')],
      ['Fecha de ingreso', npDate(trab.fecha_ingreso)],
      ['Fecha de baja',    npDate(trab.fecha_baja)],
      ['Antiguedad',              `${result.completed} ano${result.completed!==1?'s':''} (${result.frac.toFixed(2)} fraccion)`],
      [`Salario ${(trab.periodo_salario||'mensual')}`, fmt(trab.salario_mensual)],
      ['Salario diario (Art. 89 LFT)', fmt(result.daily || (typeof calcSalarioDiario==='function' ? calcSalarioDiario(trab.salario_mensual, trab.periodo_salario||'mensual') : trab.salario_mensual/30))],
      ['SDI',                     fmt(result.sdi)],
      ['Dias laborados (total)',  `${result.diasLaborados} dias`],
      [`Dias laborados en ${new Date(trab.fecha_baja+'T00:00:00').getFullYear()}`, `${result.diasEnAnio} dias (ano calendario)`],
    ],
    styles:{ fontSize:9, cellPadding:3, textColor:[40,40,40] },
    headStyles:{ fillColor:[21,128,61], textColor:[0,0,0], fontStyle:'bold', fontSize:8 },
    alternateRowStyles:{ fillColor:[248,248,252] },
    columnStyles:{ 0:{ fontStyle:'bold', cellWidth:60 } },
    theme:'grid'
  });
  y = doc.lastAutoTable.finalY + 14;

  const b3 = `Conforme a lo anterior, el Trabajador reconoce haber sido notificado de la terminacion de su relacion laboral.`;
  l = doc.splitTextToSize(b3, tw); doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(40,40,40);
  doc.text(l, ml, y); y += l.length * 5.5 + 10;

  pdfSignatures(doc, `${np(empresa.nombre)}\nRFC: ${np(empresa.rfc||'N/A')}`, `${np(trab.nombre)}\nRFC: ${np(trab.rfc||'N/A')}`, y, ml, mr);

  doc.setFontSize(7); doc.setTextColor(160,160,160);
  doc.text('Capital Humano MX | Referencial — no sustituye asesoria legal', pw/2, ph-10, { align:'center' });
  doc.save('aviso-rescision.pdf');
}

// ─── RECIBO DE LIQUIDACIÓN / FINIQUITO — v2 ──────────────────────────────────
/**
 * @param {Object} empresa   { nombre, rfc, representante, domicilio, ciudad }
 * @param {Object} trab      { nombre, rfc, curp, nss, puesto, departamento,
 *                             fecha_ingreso, fecha_baja, salario_mensual }
 * @param {Object} result    retorno de calcLiquidacion() o calcFiniquito()
 * @param {Object} sucursal  opcional — si tiene sucursal asignada
 */
function generateRecibo(empresa, trab, result, sucursal = null) {
  empresa = resolveUbicacion(empresa, sucursal);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  const ml = 25, mr = 25;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const tw = pw - ml - mr;

  const isLiq  = result.type === 'liquidacion';
  // Gratificación por terminación (migración 38): va en su propio bloque, no
  // mezclada con las prestaciones de ley, para que quede claro qué se paga por
  // obligación y qué por acuerdo. Si no hay, el recibo sale idéntico al de antes.
  const grat       = Math.max(0, parseFloat(result.gratificacion) || 0);
  const totalPagar = result.totalPagar ?? result.total;
  const tipo   = isLiq ? 'LIQUIDACION' : (grat > 0 ? 'FINIQUITO Y GRATIFICACION' : 'FINIQUITO');
  const folio  = `${isLiq ? 'LIQ' : 'FIN'}-${Date.now().toString().slice(-6)}`;
  let y        = 0;

  // ── helper: salto de página si no cabe ──────────────────────────────────
  const ck = (n = 20) => { if (y + n > ph - 16) { doc.addPage(); y = 22; } };

  // ══════════════════════════════════════════════════════════════════════
  // 1. ENCABEZADO
  // ══════════════════════════════════════════════════════════════════════
  // Banda oscura
  doc.setFillColor(15, 20, 40);
  doc.rect(0, 0, pw, 36, 'F');
  // Razón Social dorada
  doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(21,128,61);
  doc.text(np(empresa.nombre), pw/2, 11, { align:'center' });
  // RFC + domicilio
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(180,185,200);
  const subhdr = [empresa.rfc, empresa.domicilio || empresa.ciudad].filter(Boolean).join('  |  ');
  doc.text(np(subhdr), pw/2, 18, { align:'center' });
  // Título del documento
  doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
  doc.text(`RECIBO DE ${tipo}`, pw/2, 30, { align:'center' });
  y = 42;

  // Folio a la derecha
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(120,120,120);
  doc.text(`Folio: ${folio}`, pw - mr, y, { align:'right' });
  y += 8;

  // ══════════════════════════════════════════════════════════════════════
  // 2. BLOQUE DE PARTES (2 columnas con línea divisoria central)
  // ══════════════════════════════════════════════════════════════════════
  const mid  = pw / 2;
  const colW = mid - ml - 4;
  const rowH = 44;

  doc.setFillColor(248, 248, 252);
  doc.rect(ml, y, tw, rowH, 'F');
  doc.setDrawColor(220,220,220); doc.setLineWidth(0.3);
  doc.rect(ml, y, tw, rowH);
  doc.line(mid, y, mid, y + rowH);  // separador vertical

  // Etiquetas
  doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(150,150,150);
  doc.text('EL PATRON', ml + 3, y + 5);
  doc.text('EL TRABAJADOR', mid + 3, y + 5);

  // Patrón
  doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(20,20,20);
  const patronLines = doc.splitTextToSize(np(empresa.nombre), colW - 4);
  doc.text(patronLines, ml + 3, y + 11);
  let yp = y + 11 + patronLines.length * 5;
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(80,80,80);
  if (empresa.rfc)          { doc.text(`RFC: ${np(empresa.rfc)}`,          ml+3, yp); yp += 4.5; }
  if (empresa.representante){ doc.text(`Rep.: ${np(empresa.representante)}`,ml+3, yp); yp += 4.5; }
  if (empresa.domicilio)    { const dl2 = doc.splitTextToSize(np(empresa.domicilio), colW-4); doc.text(dl2, ml+3, yp); }

  // Trabajador
  doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(20,20,20);
  doc.text(np(trab.nombre), mid + 3, y + 11);
  let yw = y + 17;
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(80,80,80);
  if (trab.rfc)        { doc.text(`RFC: ${np(trab.rfc)}`,          mid+3, yw); yw += 4.2; }
  if (trab.curp)       { doc.text(`CURP: ${np(trab.curp)}`,        mid+3, yw); yw += 4.2; }
  if (trab.nss)        { doc.text(`NSS: ${np(trab.nss)}`,          mid+3, yw); yw += 4.2; }
  if (trab.puesto)     { doc.text(`Puesto: ${np(trab.puesto)}`,     mid+3, yw); yw += 4.2; }
  if (trab.departamento){ doc.text(`Area: ${np(trab.departamento)}`, mid+3, yw); }

  y += rowH + 10;

  // ══════════════════════════════════════════════════════════════════════
  // 3. DATOS DE LA RELACIÓN LABORAL
  // ══════════════════════════════════════════════════════════════════════
  const smgLabel    = (result.smg === 419.88) ? 'Frontera Norte ($419.88)' : 'Area General ($315.04)';
  const topeLabel   = fmt(2 * result.smg);
  const periodoMap  = { mensual:'Mensual', quincenal:'Quincenal', semanal:'Semanal' };
  const periodoLbl  = periodoMap[result.periodoSalario] || result.periodoSalario || 'Mensual';
  const centroTrab  = sucursal?.nombre || 'Matriz';
  const ciudadTrab  = sucursal?.ciudad || empresa.ciudad || '';

  doc.autoTable({
    startY: y, margin: { left:ml, right:mr },
    body: [
      ['Fecha de ingreso',          npDate(trab.fecha_ingreso+'T00:00:00'),
       'Fecha de baja',             npDate(trab.fecha_baja+'T00:00:00')],
      ['Antiguedad (anos completos)', String(result.completed),
       'Antiguedad (fraccion)',      result.frac.toFixed(4)],
      [`Salario ${periodoLbl.toLowerCase()}`, fmt(trab.salario_mensual || result.salario),
       'Periodo de pago',           periodoLbl],
      ['Salario diario',            fmt(result.daily),
       'SDI (Sal. Diario Integrado)',fmt(result.sdi)],
      ['Zona SMG',                  smgLabel,
       'Tope prima antiguedad',     topeLabel],
      ['Dias laborados (total)',    `${result.diasLaborados} dias`,
       `Dias laborados en ${new Date(trab.fecha_baja+'T00:00:00').getFullYear()}`, `${result.diasEnAnio} dias`],
      ['Centro de trabajo',         np(centroTrab),
       'Ciudad',                    np(ciudadTrab)],
    ],
    styles:      { fontSize:8, cellPadding:2.8, textColor:[50,50,50] },
    headStyles:  { fillColor:[15,36,56], textColor:[21,128,61] },
    alternateRowStyles: { fillColor:[248,248,252] },
    columnStyles:{ 0:{ fontStyle:'bold', cellWidth:44 }, 1:{ cellWidth:40 },
                   2:{ fontStyle:'bold', cellWidth:44 }, 3:{ cellWidth:40 } },
    theme: 'grid',
  });
  y = doc.lastAutoTable.finalY + 10;

  // ══════════════════════════════════════════════════════════════════════
  // 4. TABLA DE CONCEPTOS
  // ══════════════════════════════════════════════════════════════════════
  if (grat > 0) {
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(50,50,50);
    doc.text('I. PRESTACIONES DE LEY', ml, y); y += 5;
  }

  doc.autoTable({
    startY: y, margin: { left:ml, right:mr },
    head: [['Concepto', 'Calculo', 'Importe']],
    body: result.items.map(item => [np(item.name), np(item.calc), fmt(item.amount)]),
    foot: [['', grat > 0 ? 'SUBTOTAL PRESTACIONES DE LEY' : 'TOTAL', fmt(result.total)]],
    // Solo en la última página: si la tabla se parte, repetir el total en cada
    // hoja hace parecer que hay dos sumas distintas.
    showFoot: 'lastPage',
    styles:      { fontSize:9, cellPadding:3.5, textColor:[40,40,40] },
    headStyles:  { fillColor:[15,36,56], textColor:[21,128,61], fontStyle:'bold', fontSize:8.5 },
    footStyles:  { fillColor:[15,36,56], textColor:[21,128,61], fontStyle:'bold', fontSize:11 },
    alternateRowStyles: { fillColor:[248,248,252] },
    columnStyles:{
      0:{ cellWidth:76, fontStyle:'bold' },
      1:{ cellWidth:66, textColor:[100,100,100], fontSize:8.2 },
      2:{ cellWidth:38, halign:'right', fontStyle:'bold' },
    },
    theme: 'grid',
    didParseCell: (data) => {
      // Resaltar conceptos con importe 0 en gris
      if (data.section === 'body' && data.column.index === 2 && data.cell.raw === fmt(0)) {
        data.cell.styles.textColor = [180,180,180];
      }
    },
  });
  y = doc.lastAutoTable.finalY + 12;

  // ── 4-bis. GRATIFICACIÓN POR TERMINACIÓN (bloque separado) ─────────────
  if (grat > 0) {
    ck(46);
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(50,50,50);
    doc.text('II. GRATIFICACION POR TERMINACION (POR ACUERDO DE LAS PARTES)', ml, y); y += 5;

    const calcGrat = result.gratificacionDias
      ? `${result.gratificacionDias} dias x ${fmt(result.gratificacionBase === 'sdi' ? result.sdi : result.daily)} (${result.gratificacionBase === 'sdi' ? 'SDI' : 'salario diario'})`
      : 'Monto acordado entre las partes';

    doc.autoTable({
      startY: y, margin: { left:ml, right:mr },
      head: [['Concepto', 'Calculo', 'Importe']],
      body: [['Gratificacion por terminacion de la relacion laboral', np(calcGrat), fmt(grat)]],
      foot: [['', 'TOTAL A PAGAR (I + II)', fmt(totalPagar)]],
      styles:      { fontSize:9, cellPadding:3.5, textColor:[40,40,40] },
      headStyles:  { fillColor:[15,36,56], textColor:[21,128,61], fontStyle:'bold', fontSize:8.5 },
      footStyles:  { fillColor:[15,36,56], textColor:[21,128,61], fontStyle:'bold', fontSize:11 },
      columnStyles:{
        0:{ cellWidth:76, fontStyle:'bold' },
        1:{ cellWidth:66, textColor:[100,100,100], fontSize:8.2 },
        2:{ cellWidth:38, halign:'right', fontStyle:'bold' },
      },
      theme: 'grid',
    });
    y = doc.lastAutoTable.finalY + 6;

    const notaGrat = 'Esta gratificacion se otorga por libre voluntad del Patron, por encima de las prestaciones que la Ley Federal del Trabajo establece. No constituye prestacion de ley, no modifica la naturaleza de la terminacion ni crea derecho adquirido alguno para casos futuros.';
    const ngLines = doc.splitTextToSize(np(notaGrat), tw);
    ck(ngLines.length * 4.4 + 6);
    doc.setFont('helvetica','italic'); doc.setFontSize(7.8); doc.setTextColor(110,110,110);
    doc.text(ngLines, ml, y);
    y += ngLines.length * 4.4 + 10;
  }

  // ── 4-ter. DESGLOSE FISCAL ESTIMADO (cuando el módulo lo calculó) ──────
  if (result.fiscal && result.fiscal.conceptos?.length) {
    ck(50);
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(50,50,50);
    doc.text('DESGLOSE FISCAL ESTIMADO (ISR)', ml, y); y += 5;

    doc.autoTable({
      startY: y, margin: { left:ml, right:mr },
      head: [['Concepto', 'Importe', 'Exento', 'Gravado', 'ISR est.']],
      body: result.fiscal.conceptos.map(c => [np(c.name), fmt(c.monto), fmt(c.exento), fmt(c.gravado), fmt(c.isr)]),
      foot: [['NETO ESTIMADO A RECIBIR', fmt(result.fiscal.bruto), fmt(result.fiscal.exentoTotal),
              fmt(result.fiscal.gravadoTotal), fmt(result.fiscal.neto)]],
      styles:      { fontSize:8, cellPadding:2.8, textColor:[40,40,40] },
      headStyles:  { fillColor:[15,36,56], textColor:[21,128,61], fontStyle:'bold', fontSize:7.5 },
      footStyles:  { fillColor:[240,240,245], textColor:[20,20,20], fontStyle:'bold', fontSize:8 },
      alternateRowStyles: { fillColor:[248,248,252] },
      columnStyles:{ 0:{ cellWidth:64 }, 1:{ halign:'right' }, 2:{ halign:'right' },
                     3:{ halign:'right' }, 4:{ halign:'right' } },
      theme: 'grid',
    });
    y = doc.lastAutoTable.finalY + 6;

    const notaISR = `Estimacion informativa: exencion de 90 UMA por ano de servicio sobre indemnizaciones, prima de antiguedad y gratificacion (Art. 93 fr. XIII LISR, ${result.fiscal.aniosServicio} ano(s) reconocido(s)); 30 UMA de aguinaldo y 15 UMA de prima vacacional (fr. XIV). El calculo definitivo y su timbrado los determina el contador de la empresa.`;
    const niLines = doc.splitTextToSize(np(notaISR), tw);
    ck(niLines.length * 4.4 + 6);
    doc.setFont('helvetica','italic'); doc.setFontSize(7.5); doc.setTextColor(110,110,110);
    doc.text(niLines, ml, y);
    y += niLines.length * 4.4 + 10;
  }

  // ══════════════════════════════════════════════════════════════════════
  // 5. RECUADRO ISR (solo liquidación sin desglose fiscal calculado)
  // ══════════════════════════════════════════════════════════════════════
  if (isLiq && !result.fiscal) {
    const montoExento = 90 * result.smg * Math.max(result.completed, 1);
    const isrTxt = `NOTA FISCAL — ART. 93 LISR: Los pagos por concepto de liquidacion pueden estar exentos de ISR hasta por un monto equivalente a 90 veces el SMG por ano de servicio. Para esta relacion laboral la exencion estimada es de ${fmt(montoExento)} (${result.completed} anos × 90 dias × ${fmt(result.smg)} SMG). El excedente, si lo hubiere, esta sujeto a retencion de ISR. Consulte a su contador para el calculo definitivo antes de efectuar el pago.`;
    ck(28);
    const isrLines = doc.splitTextToSize(np(isrTxt), tw - 10);
    const isrH = isrLines.length * 4.8 + 10;
    doc.setFillColor(255, 248, 225); doc.setDrawColor(21,128,61); doc.setLineWidth(0.5);
    doc.roundedRect(ml, y, tw, isrH, 2, 2, 'FD');
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(100,60,0);
    doc.text(isrLines, ml + 5, y + 7);
    y += isrH + 10;
  }

  // ══════════════════════════════════════════════════════════════════════
  // 6. DECLARACIÓN LEGAL
  // ══════════════════════════════════════════════════════════════════════
  ck(36);
  const ciudad    = empresa.ciudad || '[CIUDAD]';
  const fechaBaja = npDate(trab.fecha_baja);
  const totalFmt  = fmt(totalPagar);
  const totalLetr = numToWords(totalPagar);

  let declTxt;
  if (grat > 0 && !isLiq) {
    declTxt = `En la Ciudad de ${np(ciudad)}, a ${fechaBaja}, el C. ${np(trab.nombre)}, con RFC ${np(trab.rfc||'N/A')}, declara haber recibido de ${np(empresa.nombre)} la cantidad total de ${np(totalFmt)} (${np(totalLetr)} PESOS 00/100 M.N.), integrada por ${np(fmt(result.total))} por concepto de FINIQUITO en los terminos de los Articulos 76, 80, 87 y 162 de la Ley Federal del Trabajo, y ${np(fmt(grat))} por concepto de GRATIFICACION otorgada por acuerdo de las partes, en virtud de la terminacion de la relacion laboral ocurrida el dia ${fechaBaja}. Manifiesta que con dicho pago queda completamente liquidado y no tiene reclamacion adicional alguna en contra del Patron por ningun concepto derivado de la relacion laboral que queda extinguida en todos sus efectos.`;
  } else if (isLiq) {
    declTxt = `En la Ciudad de ${np(ciudad)}, a ${fechaBaja}, el C. ${np(trab.nombre)}, con RFC ${np(trab.rfc||'N/A')}, declara haber recibido de ${np(empresa.nombre)} la cantidad total de ${np(totalFmt)} (${np(totalLetr)} PESOS 00/100 M.N.) por concepto de LIQUIDACION, en los terminos de los Articulos 50, 76, 80, 87 y 162 de la Ley Federal del Trabajo, manifestando que con dicho pago no tiene reclamacion adicional alguna en contra del Patron por concepto de salarios, prestaciones, indemnizaciones o cualquier otro concepto derivado de la relacion laboral que existio entre las partes, la cual queda extinguida en todos sus efectos a partir de la fecha indicada.`;
  } else {
    declTxt = `En la Ciudad de ${np(ciudad)}, a ${fechaBaja}, el C. ${np(trab.nombre)}, con RFC ${np(trab.rfc||'N/A')}, declara haber recibido de ${np(empresa.nombre)} la cantidad total de ${np(totalFmt)} (${np(totalLetr)} PESOS 00/100 M.N.) por concepto de FINIQUITO, en los terminos de los Articulos 76, 80, 87 y 162 de la Ley Federal del Trabajo, en virtud de la terminacion de la relacion laboral ocurrida el dia ${fechaBaja}, manifestando que con dicho pago queda completamente liquidado y no tiene reclamacion adicional alguna en contra del Patron por ningun concepto derivado de la relacion laboral que queda extinguida en todos sus efectos.`;
  }

  doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(30,30,30);
  const dLines = doc.splitTextToSize(np(declTxt), tw);
  ck(dLines.length * 5.4 + 6);
  doc.text(dLines, ml, y, { lineHeightFactor:1.5 });
  y += dLines.length * 5.4 + 8;

  // ══════════════════════════════════════════════════════════════════════
  // 7. FIRMAS (3 bloques: Patrón | Trabajador | Testigo)
  // ══════════════════════════════════════════════════════════════════════
  ck(72);
  y += 6;
  const sigW = tw / 3 - 6;
  const c1 = ml, c2 = ml + sigW + 9, c3 = ml + (sigW + 9) * 2;

  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  [c1, c2, c3].forEach(cx => doc.line(cx, y + 22, cx + sigW, y + 22));

  doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(30,30,30);
  doc.text('EL PATRON / REP. LEGAL', c1 + sigW/2, y + 27, {align:'center'});
  doc.text('EL TRABAJADOR',          c2 + sigW/2, y + 27, {align:'center'});
  doc.text('TESTIGO',                c3 + sigW/2, y + 27, {align:'center'});

  doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(100,100,100);
  doc.text(np(empresa.nombre),              c1 + sigW/2, y + 32, {align:'center'});
  if (empresa.representante) doc.text(np(empresa.representante), c1 + sigW/2, y + 36, {align:'center'});
  doc.text(np(trab.nombre),                 c2 + sigW/2, y + 32, {align:'center'});
  if (trab.rfc) doc.text(`RFC: ${np(trab.rfc)}`, c2 + sigW/2, y + 36, {align:'center'});

  y += 50;

  // ══════════════════════════════════════════════════════════════════════
  // 8. PIE DE PÁGINA EN TODAS LAS HOJAS
  // ══════════════════════════════════════════════════════════════════════
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(220,220,220); doc.setLineWidth(0.2);
    doc.line(ml, ph - 11, pw - mr, ph - 11);
    doc.setFontSize(6.5); doc.setFont('helvetica','normal'); doc.setTextColor(160,160,160);
    doc.text(
      np(`Folio ${folio}  |  Pagina ${i} de ${total}  |  Capital Humano MX  |  No sustituye asesoria juridica`),
      pw/2, ph - 7, { align:'center' }
    );
  }

  doc.save(`recibo-${isLiq ? 'liquidacion' : 'finiquito'}-${np(trab.nombre||'').replace(/\s+/g,'-').toLowerCase()}.pdf`);
}

// ─── HOJA DE PROPUESTA DE SALIDA (documento interno) ─────────────────────────
/**
 * Comparativo de escenarios para negociar una salida. NO es un documento que
 * se entregue al trabajador para firmar: es la hoja de trabajo del patrón, y
 * así viene rotulada en el encabezado y en el pie de todas las páginas.
 *
 * @param {Object} empresa
 * @param {Object} trab       Trabajador + fecha_baja estimada
 * @param {Object} propuesta  Retorno de calcPropuestaBaja()
 * @param {Object} [sucursal]
 */
function generatePropuestaBajaPDF(empresa, trab, propuesta, sucursal = null) {
  empresa = resolveUbicacion(empresa, sucursal);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'letter' });
  const ml = 15, mr = 15;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const tw = pw - ml - mr;

  const fin = propuesta.finiquito;
  const liq = propuesta.liquidacionRef;
  const baseLabel = propuesta.baseDias === 'sdi' ? 'SDI' : 'salario diario';
  const modoLabel = propuesta.modo === 'incluye'
    ? 'los dias propuestos son el paquete total'
    : 'los dias propuestos se suman al finiquito de ley';

  let y = pdfHeader(doc, 'PROPUESTA DE TERMINACION LABORAL', 'Documento interno de trabajo', ml, mr);

  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(40,40,40);
  doc.text(np(empresa.nombre || ''), ml, y);
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(120,120,120);
  doc.text(np([empresa.rfc, empresa.ciudad].filter(Boolean).join('  |  ')), pw - mr, y, { align:'right' });
  y += 8;

  // Banda de advertencia — que nadie confunda esto con una oferta firmada.
  // Sin guiones largos ni signos fuera de WinAnsi: jsPDF con helvetica los
  // dibuja en blanco (por eso todo el texto pasa además por np()).
  const aviso = 'DOCUMENTO INTERNO DE TRABAJO - NO ES OFERTA FORMAL NI GENERA OBLIGACION ALGUNA. Uso exclusivo del patron para evaluar escenarios de negociacion. No entregar ni exhibir al trabajador como propuesta en firme.';
  const avLines = doc.splitTextToSize(np(aviso), tw - 10);
  const avH = avLines.length * 4.6 + 8;
  doc.setFillColor(255, 243, 205); doc.setDrawColor(180, 120, 0); doc.setLineWidth(0.5);
  doc.roundedRect(ml, y, tw, avH, 2, 2, 'FD');
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(120, 70, 0);
  doc.text(avLines, ml + 5, y + 6);
  y += avH + 8;

  // Datos de la relación laboral
  doc.autoTable({
    startY: y, margin: { left:ml, right:mr },
    body: [
      ['Trabajador',        np(trab.nombre),            'Puesto',            np(trab.puesto || 'N/A')],
      ['Fecha de ingreso',  npDate(trab.fecha_ingreso), 'Fecha de baja estimada', npDate(trab.fecha_baja)],
      ['Antiguedad',        `${fin.completed} ano(s) (${fin.frac.toFixed(2)} fraccion)`,
       'Salario diario',    fmt(fin.daily)],
      ['SDI',               fmt(fin.sdi),               'Base de los dias',  `${baseLabel} = ${fmt(propuesta.base)}`],
      ['Criterio',          np(modoLabel),              'Elaborada el',      npDate(new Date())],
    ],
    styles:      { fontSize:8, cellPadding:2.6, textColor:[50,50,50] },
    alternateRowStyles: { fillColor:[248,248,252] },
    columnStyles:{ 0:{ fontStyle:'bold', cellWidth:38 }, 1:{ cellWidth:82 },
                   2:{ fontStyle:'bold', cellWidth:44 }, 3:{ cellWidth:82 } },
    theme: 'grid',
  });
  y = doc.lastAutoTable.finalY + 8;

  // Escenarios
  const filas = propuesta.escenarios.map(e => ([
    np(e.etiqueta) + (e.insuficiente ? ' (NO cubre el minimo de ley)' : ''),
    e.dias ? `${e.dias} x ${fmt(e.base)}` : '-',
    fmt(e.finiquito),
    fmt(e.gratificacion),
    fmt(e.total),
    e.isr  != null ? fmt(e.isr)  : '-',
    e.neto != null ? fmt(e.neto) : '-',
    e.pctVsLiquidacion != null ? `${(e.pctVsLiquidacion * 100).toFixed(0)}%` : '-',
  ]));
  filas.push(['Liquidacion completa (referencia Arts. 48 y 50 LFT)', '-', '-', '-',
              fmt(liq.total), '-', '-', '100%']);

  doc.autoTable({
    startY: y, margin: { left:ml, right:mr },
    head: [['Escenario', 'Dias x base', 'Finiquito de ley', 'Gratificacion',
            'Total bruto', 'ISR est.', 'Neto est.', 'vs liq.']],
    body: filas,
    styles:      { fontSize:8, cellPadding:3, textColor:[40,40,40] },
    headStyles:  { fillColor:[15,36,56], textColor:[21,128,61], fontStyle:'bold', fontSize:7.5 },
    alternateRowStyles: { fillColor:[248,248,252] },
    columnStyles:{ 0:{ cellWidth:66, fontStyle:'bold' }, 1:{ cellWidth:32 },
                   2:{ halign:'right' }, 3:{ halign:'right' }, 4:{ halign:'right', fontStyle:'bold' },
                   5:{ halign:'right' }, 6:{ halign:'right' }, 7:{ halign:'right' } },
    theme: 'grid',
    didParseCell: (data) => {
      // Último renglón = referencia de liquidación completa
      if (data.section === 'body' && data.row.index === filas.length - 1) {
        data.cell.styles.fillColor = [255, 248, 225];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  const notas = [
    `El finiquito de ley (${fmt(fin.total)}) es el piso irrenunciable: se debe cualquiera que sea la causa de la baja y cualquiera que sea el documento que se firme.`,
    'La gratificacion es una liberalidad del patron; no es prestacion de ley ni crea derecho adquirido.',
    `La liquidacion completa (${fmt(liq.total)}) es la referencia de lo que costaria si el asunto se litiga y no hay reinstalacion (90 dias + 20 dias por ano + prima de antiguedad).`,
    'El ISR mostrado es una estimacion (exencion de 90 UMA por ano de servicio, Art. 93 fr. XIII LISR). El calculo definitivo lo confirma el contador.',
  ];
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(90,90,90);
  for (const n of notas) {
    const lines = doc.splitTextToSize(np('- ' + n), tw);
    if (y + lines.length * 4.4 > ph - 18) { doc.addPage(); y = 20; }
    doc.text(lines, ml, y);
    y += lines.length * 4.4 + 2;
  }

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(220,220,220); doc.setLineWidth(0.2);
    doc.line(ml, ph - 11, pw - mr, ph - 11);
    doc.setFontSize(6.5); doc.setFont('helvetica','bold'); doc.setTextColor(160,120,0);
    doc.text(
      np(`DOCUMENTO INTERNO - NO ES OFERTA FORMAL  |  Pagina ${i} de ${total}  |  Capital Humano MX  |  No sustituye asesoria juridica`),
      pw/2, ph - 7, { align:'center' }
    );
  }

  doc.save(`propuesta-salida-${np(trab.nombre||'').replace(/\s+/g,'-').toLowerCase()}.pdf`);
}

// ─── ACTA ADMINISTRATIVA ──────────────────────────────────────────────────────
function generateActaPDF(acta, empresa, trab, sucursal = null) {
  empresa = resolveUbicacion(empresa, sucursal);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  const ml = 25, mr = 25;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const tw = pw - ml - mr;

  const titles   = { amonestacion:'ACTA DE AMONESTACION', formal:'ACTA ADMINISTRATIVA', rescisoria:'ACTA DE RESCISION DE CONTRATO DE TRABAJO' };
  const subtitles = { amonestacion:'Documento disciplinario — Ley Federal del Trabajo', formal:'Acta con apercibimiento — Articulo 47 LFT', rescisoria:'Rescision sin responsabilidad patronal — Articulo 47 LFT' };
  const folio = `ACT-${acta.tipo.substring(0,3).toUpperCase()}-${Date.now().toString().slice(-6)}`;
  let y = pdfHeader(doc, titles[acta.tipo], subtitles[acta.tipo], ml, mr);

  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(80,80,80);
  doc.text(`${np(empresa.ciudad)}, a ${npDate(acta.fecha+'T00:00:00')}`, pw-mr, y, { align:'right' });
  doc.text(`Folio: ${folio}`, ml, y); y += 12;

  // Partes
  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(100,100,100);
  doc.text('PATRON / EMPRESA:', ml, y); doc.text('TRABAJADOR:', pw/2+4, y); y += 5;
  doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(20,20,20);
  doc.text(np(empresa.nombre), ml, y); doc.text(np(trab.nombre), pw/2+4, y); y += 5;
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(70,70,70);
  const pl = [empresa.rfc && `RFC: ${np(empresa.rfc)}`, empresa.representante && `Rep.: ${np(empresa.representante)}`].filter(Boolean);
  const wl = [`Puesto: ${np(trab.puesto||'')}`, trab.departamento && `Area: ${np(trab.departamento)}`, trab.rfc && `RFC: ${np(trab.rfc)}`].filter(Boolean);
  const max = Math.max(pl.length, wl.length);
  for (let i = 0; i < max; i++) {
    if (pl[i]) doc.text(pl[i], ml, y);
    if (wl[i]) doc.text(wl[i], pw/2+4, y);
    y += 4.5;
  }
  y += 4; y = pdfLine(doc, y, ml, mr) + 6;

  // Tabla falta
  doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(50,50,50);
  doc.text('DATOS DE LA FALTA', ml, y); y += 6;
  doc.autoTable({
    startY: y, margin:{ left:ml, right:mr },
    body: [
      ['Tipo de falta', np(acta.tipo_falta_label || '')],
      ['Fecha', npDate(acta.fecha+'T00:00:00')],
      acta.hora_falta && ['Hora', acta.hora_falta],
      acta.lugar && ['Lugar', np(acta.lugar)],
      ['Reincidencia', acta.reincidente ? 'Si — ha incurrido en esta falta con anterioridad' : 'No — primer incidente'],
      ['Causal legal', np(acta.causal||'')],
    ].filter(Boolean),
    styles:{ fontSize:8.5, cellPadding:3, textColor:[40,40,40] },
    alternateRowStyles:{ fillColor:[248,248,252] },
    columnStyles:{ 0:{ fontStyle:'bold', cellWidth:44 } },
    theme:'grid'
  });
  y = doc.lastAutoTable.finalY + 10;

  doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(50,50,50);
  doc.text('HECHOS:', ml, y); y += 5;
  doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(30,30,30);
  const dl = doc.splitTextToSize(np(acta.descripcion||''), tw);
  doc.text(dl, ml, y); y += dl.length * 5.2 + 8;

  y = pdfLine(doc, y, ml, mr) + 5;
  let clausula = '';
  if (acta.tipo === 'amonestacion') {
    clausula = `Por medio del presente, ${np(empresa.nombre)} hace constar la AMONESTACION formal al C. ${np(trab.nombre)}, apercibiendole de que de reincidir en la conducta descrita podra ser sujeto de medidas disciplinarias mas severas, incluyendo la rescision sin responsabilidad para el patron.`;
  } else if (acta.tipo === 'formal') {
    clausula = `Por medio del presente, ${np(empresa.nombre)} levanta ACTA ADMINISTRATIVA al C. ${np(trab.nombre)} por incurrir en la conducta antes descrita, la cual contraviene ${np(acta.causal||'')}. Se le APERCIBE que de reincidir, la empresa podra rescindir el contrato sin responsabilidad patronal en terminos del articulo 47 de la LFT.`;
  } else {
    clausula = `Con fundamento en el articulo 47 de la LFT, ${np(empresa.nombre)} notifica al C. ${np(trab.nombre)} la RESCISION DE SU CONTRATO SIN RESPONSABILIDAD PARA EL PATRON. La empresa queda a disposicion del trabajador para el pago de prestaciones proporcionales. NOTA: El trabajador dispone de 30 dias naturales para impugnar ante el Tribunal Laboral (Art. 518 LFT).`;
  }
  doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(30,30,30);
  const cl = doc.splitTextToSize(clausula, tw); doc.text(cl, ml, y); y += cl.length * 5.2 + 8;

  const aceptTxt = { acepta:'El trabajador acepta los hechos y firma de conformidad.', no_acepta:'El trabajador no acepta los hechos pero firma para constancia.', no_firma:'EL TRABAJADOR SE NEGO A FIRMAR. Se hace constar ante testigos.' }[acta.aceptacion||'acepta'];
  doc.setFont('helvetica','italic'); doc.setFontSize(8.5);
  doc.setTextColor(acta.aceptacion === 'no_firma' ? 160 : 80, acta.aceptacion === 'no_firma' ? 50 : 80, acta.aceptacion === 'no_firma' ? 50 : 80);
  const al = doc.splitTextToSize(aceptTxt, tw); doc.text(al, ml, y); y += al.length * 5 + 10;

  if (y + 80 > ph - 20) { doc.addPage(); y = 25; }
  y = pdfSignatures(doc, `${np(empresa.nombre)}${empresa.representante ? '\n' + np(empresa.representante) : ''}`, `${np(trab.nombre)}\n${np(trab.puesto||'')}`, y, ml, mr);

  if (acta.testigo1 || acta.testigo2) {
    y += 10;
    doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(80,80,80);
    doc.text('T E S T I G O S', pw/2, y, { align:'center' }); y += 10;
    const mid = pw/2;
    doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
    if (acta.testigo1) {
      doc.line(ml, y, mid-8, y);
      doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(30,30,30);
      doc.text(np(acta.testigo1), (ml+mid-8)/2, y+5, { align:'center' });
      if (acta.testigo1_puesto) { doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80); doc.text(np(acta.testigo1_puesto), (ml+mid-8)/2, y+10, { align:'center' }); }
    }
    if (acta.testigo2) {
      doc.line(mid+8, y, pw-mr, y);
      doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(30,30,30);
      doc.text(np(acta.testigo2), (mid+8+pw-mr)/2, y+5, { align:'center' });
      if (acta.testigo2_puesto) { doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80); doc.text(np(acta.testigo2_puesto), (mid+8+pw-mr)/2, y+10, { align:'center' }); }
    }
  }

  doc.setFontSize(7); doc.setTextColor(160,160,160);
  doc.text(`Folio ${folio} | Capital Humano MX | Referencial — no sustituye asesoria legal`, pw/2, ph-10, { align:'center' });
  doc.save(`acta-${acta.tipo}.pdf`);
}

// ═══════════════════════════════════════════════════════════════════════════
//  CONSTANCIA DE VACACIONES (Art. 81 LFT)
//  Entrada: generateConstanciaVacacionesPDF(empresa, trab, datos, sucursal)
//  datos = { solicitud, antiguedadAnios, diasCorresponden, diasGozados,
//            saldo, vigenciaIni, vigenciaFin } — ver vacaciones.js
// ═══════════════════════════════════════════════════════════════════════════
function generateConstanciaVacacionesPDF(empresa, trab, datos, sucursal = null) {
  empresa = resolveUbicacion(empresa, sucursal);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  const ml = 25, mr = 25;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const tw = pw - ml - mr;
  const s  = datos.solicitud;

  let y = pdfHeader(doc, 'CONSTANCIA DE VACACIONES', 'Articulo 81 de la Ley Federal del Trabajo', ml, mr);

  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(80,80,80);
  doc.text(`${np(empresa.ciudad)}, a ${npDate(new Date().toISOString())}`, pw-mr, y, { align:'right' });
  y += 10;

  doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(100,100,100);
  doc.text('TRABAJADOR:', ml, y); y += 5;
  doc.setFont('helvetica','bold'); doc.setFontSize(10.5); doc.setTextColor(20,20,20);
  doc.text(np(trab.nombre), ml, y); y += 5;
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(70,70,70);
  [
    trab.puesto && `Puesto: ${np(trab.puesto)}`,
    `Fecha de ingreso: ${npDate(trab.fecha_ingreso + 'T00:00:00')}`,
  ].filter(Boolean).forEach(l => { doc.text(l, ml, y); y += 4.5; });
  y += 4; y = pdfLine(doc, y, ml, mr) + 6;

  doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(50,50,50);
  doc.text('PERIODO VACACIONAL', ml, y); y += 6;
  doc.autoTable({
    startY: y, margin:{ left:ml, right:mr },
    body: [
      ['Antiguedad', `${datos.antiguedadAnios}° año de servicio`],
      ['Vigencia de este periodo', `${npDate(datos.vigenciaIni + 'T00:00:00')} al ${npDate(datos.vigenciaFin + 'T00:00:00')}`],
      ['Dias que corresponden (Art. 76 LFT)', `${datos.diasCorresponden} dias`],
      ['Dias gozados en este periodo', `${datos.diasGozados} dias`],
      ['Saldo pendiente', `${datos.saldo} dias`],
      ['Fechas de este disfrute', `${npDate(s.fecha_inicio + 'T00:00:00')} al ${npDate(s.fecha_fin + 'T00:00:00')} (${s.dias} dias habiles)`],
      parseFloat(s.prima_vacacional || 0) > 0 && ['Prima vacacional (Art. 80 LFT, min. 25%)', fmt(s.prima_vacacional)],
    ].filter(Boolean).map(row => row.map(np)),
    styles:{ fontSize:8.5, cellPadding:3, textColor:[40,40,40] },
    alternateRowStyles:{ fillColor:[248,248,252] },
    columnStyles:{ 0:{ fontStyle:'bold', cellWidth:75 } },
    theme:'grid'
  });
  y = doc.lastAutoTable.finalY + 10;

  doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(30,30,30);
  const texto = `Por medio de la presente, ${np(empresa.nombre)} hace constar al C. ${np(trab.nombre)} su antigüedad y, de acuerdo con ella, el periodo de vacaciones que le corresponde conforme al articulo 76 de la Ley Federal del Trabajo, asi como la fecha en que debera disfrutarlo.`;
  const tl = doc.splitTextToSize(texto, tw); doc.text(tl, ml, y); y += tl.length * 5.2 + 14;

  if (y + 60 > ph - 20) { doc.addPage(); y = 25; }
  y = pdfSignatures(doc, `${np(empresa.nombre)}${empresa.representante ? '\n' + np(empresa.representante) : ''}`, `${np(trab.nombre)}\n${np(trab.puesto||'')}`, y, ml, mr);

  doc.setFontSize(7); doc.setTextColor(160,160,160);
  doc.text('Capital Humano MX | Referencial — no sustituye asesoria legal', pw/2, ph-10, { align:'center' });
  doc.save(`constancia-vacaciones-${np(trab.nombre).replace(/\s+/g,'-').toLowerCase()}.pdf`);
}

// ═══════════════════════════════════════════════════════════════════════════
//  NÓMINA EN EFECTIVO (Fase 6.4 — pago mixto)
//  Entrada: generateNominaEfectivoPDF(empresa, periodo, filas)
//  filas = [{ nombre, puesto, monto }] — solo quien recibe efectivo (total o
//  la parte mixta); ver imprimirNominaEfectivo() en nomina.js.
// ═══════════════════════════════════════════════════════════════════════════
function generateNominaEfectivoPDF(empresa, periodo, filas) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  const ml = 20, mr = 20;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();

  let y = pdfHeader(doc, 'NOMINA EN EFECTIVO', np(empresa.nombre), ml, mr);

  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(80,80,80);
  doc.text(`Periodo: ${np(periodo?.nombre || '')}  (${npDate((periodo?.fecha_inicio||'')+'T00:00:00')} al ${npDate((periodo?.fecha_fin||'')+'T00:00:00')})`, ml, y);
  y += 10;

  const total = filas.reduce((s, f) => s + f.monto, 0);
  doc.autoTable({
    startY: y, margin:{ left:ml, right:mr },
    head: [['Trabajador', 'Puesto', 'Monto en efectivo', 'Firma de recibido']],
    body: filas.map(f => [np(f.nombre), np(f.puesto), fmt(f.monto), '']),
    foot: [['', '', 'TOTAL', fmt(total)]],
    styles:{ fontSize:9, cellPadding:4, textColor:[30,30,30] },
    headStyles:{ fillColor:[15,36,56], textColor:255, fontStyle:'bold' },
    footStyles:{ fillColor:[240,240,244], textColor:[20,20,20], fontStyle:'bold' },
    alternateRowStyles:{ fillColor:[248,248,252] },
    columnStyles:{ 2:{ cellWidth:32, halign:'right' }, 3:{ cellWidth:50, minCellHeight:14 } },
    theme:'grid'
  });
  y = doc.lastAutoTable.finalY + 10;

  doc.setFont('helvetica','italic'); doc.setFontSize(8); doc.setTextColor(100,100,100);
  const nota = doc.splitTextToSize('Cada trabajador firma de conformidad haber recibido el monto en efectivo señalado, como comprobante para el patron.', pw - ml - mr);
  doc.text(nota, ml, y);

  doc.setFontSize(7); doc.setTextColor(160,160,160);
  doc.text('Capital Humano MX', pw/2, ph-10, { align:'center' });
  doc.save(`nomina-efectivo-${(periodo?.nombre||'periodo').replace(/\s+/g,'-').toLowerCase()}.pdf`);
}
