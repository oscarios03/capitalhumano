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
  _registrarFuenteRoboto(doc);
  const ml  = 25, mr = 25;
  const pw  = doc.internal.pageSize.getWidth();
  const ph  = doc.internal.pageSize.getHeight();
  const tw  = pw - ml - mr;
  const t   = recibo.trabajadores || {};
  const p   = recibo.periodos_nomina || {};

  const folio = recibo.folio || `NOM-${reciboId.slice(-6)}`;
  let y = 0;
  const ck = (n=20) => { if (y + n > ph - 20) { doc.addPage(); y = 22; } };

  // ── 1. ENCABEZADO ────────────────────────────────────────────────────────
  doc.setFillColor(15,20,40); doc.rect(0,0,pw,36,'F');
  doc.setFont('Roboto','bold'); doc.setFontSize(12); doc.setTextColor(21,128,61);
  doc.text(empresa.nombre||'', pw/2, 11, { align:'center' });
  doc.setFont('Roboto','normal'); doc.setFontSize(7.5); doc.setTextColor(180,185,200);
  doc.text([empresa.rfc, empresa.domicilio].filter(Boolean).join('  |  '), pw/2, 18, { align:'center' });
  doc.setFont('Roboto','bold'); doc.setFontSize(11); doc.setTextColor(255,255,255);
  doc.text('RECIBO DE NÓMINA', pw/2, 30, { align:'center' });
  y = 42;

  // Folio y período
  doc.setFont('Roboto','normal'); doc.setFontSize(8); doc.setTextColor(120,120,120);
  doc.text(`Folio: ${folio}  |  Período: ${p.nombre||''}`, pw/2, y, { align:'center' });
  y += 10;

  // ── 2. BLOQUE TRABAJADOR ─────────────────────────────────────────────────
  const bH = 40;
  doc.setFillColor(248,248,252);
  doc.rect(ml, y, tw, bH, 'F');
  doc.setDrawColor(220,220,220); doc.setLineWidth(0.3);
  doc.rect(ml, y, tw, bH);
  doc.line(pw/2, y, pw/2, y+bH);

  // Columna izquierda — trabajador
  doc.setFont('Roboto','bold'); doc.setFontSize(10); doc.setTextColor(20,20,20);
  doc.text(t.nombre||'', ml+3, y+8);
  doc.setFont('Roboto','normal'); doc.setFontSize(8); doc.setTextColor(80,80,80);
  let yi = y+14;
  if (t.rfc)  { doc.text(`RFC: ${t.rfc}`,   ml+3, yi); yi+=4.2; }
  if (t.nss)  { doc.text(`NSS: ${t.nss}`,   ml+3, yi); yi+=4.2; }
  if (t.curp) { doc.text(`CURP: ${t.curp}`, ml+3, yi); yi+=4.2; }
  if (t.puesto)     { doc.text(`Puesto: ${t.puesto}`,          ml+3, yi); yi+=4; }
  if (t.departamento){ doc.text(`Área: ${t.departamento}`,     ml+3, yi); }

  // Columna derecha — datos del período
  const daily = calcSalarioDiario(t.salario_mensual||0, t.periodo_salario||'mensual');
  const c2    = pw/2 + 3;
  let yj = y+8;
  doc.setFont('Roboto','normal'); doc.setFontSize(8); doc.setTextColor(80,80,80);
  doc.text(`Período: ${formatDateShort(p.fecha_inicio)} al ${formatDateShort(p.fecha_fin)}`, c2, yj); yj+=4.5;
  // La fecha de pago es independiente del fin del período (Art. 88 LFT)
  if (p.fecha_pago) { doc.text(`Fecha de pago: ${formatDateShort(p.fecha_pago)}`, c2, yj); yj+=4.5; }
  doc.text(`Días laborados: ${recibo.dias_laborados}`,            c2, yj); yj+=4.5;
  doc.text(`Salario diario: ${fmt(daily)}`,                   c2, yj); yj+=4.5;
  doc.text(`Forma de pago: ${recibo.forma_pago||'Depósito'}`, c2, yj); yj+=4.5;
  if (recibo.cuenta_bancaria) doc.text(`CLABE: ${recibo.cuenta_bancaria}`, c2, yj);
  y += bH + 10;

  // ── 3. TABLA PERCEPCIONES ────────────────────────────────────────────────
  const percRows = [
    [`Salario base`, `${recibo.dias_laborados} días × ${fmt(daily)}`, fmt(recibo.salario_base)],
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
    dedRows.push(['Desc. por faltas', `${recibo.dias_falta} días × ${fmt(daily)}`, `-${fmt(recibo.monto_faltas)}`]);
  if (parseFloat(recibo.monto_falta_justif||0) > 0)
    dedRows.push(['Desc. faltas justificadas', `${recibo.dias_falta_justif} días × ${fmt(daily)}`, `-${fmt(recibo.monto_falta_justif)}`]);
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
      dedRows.push([d.descripcion || d.tipo, d.numero_credito ? `Núm. ${d.numero_credito}` : 'Art. 110 LFT', `-${fmt(d.monto)}`]);
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
  doc.setFont('Roboto','bold'); doc.setFontSize(9); doc.setTextColor(180,185,200);
  doc.text('NETO A PAGAR', pw/2, y+7, { align:'center' });
  doc.setFontSize(16); doc.setTextColor(21,128,61);
  doc.text(`${fmt(recibo.neto_pagar)}   (${numToWords(recibo.neto_pagar)} PESOS M.N.)`, pw/2, y+17, { align:'center' });
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
  const decl = `El trabajador declara haber recibido la cantidad señalada como neto a pagar, en conformidad con los conceptos detallados en el presente recibo, conforme a los Artículos 82, 88 y 132 fracción VII de la Ley Federal del Trabajo.`;
  doc.setFont('Roboto','normal'); doc.setFontSize(8); doc.setTextColor(120,120,120);
  const dl = doc.splitTextToSize(decl, tw);
  ck(dl.length * 4.5 + 4);
  doc.text(dl, ml, y); y += dl.length * 4.5 + 8;

  // ── 8. PLACEHOLDER CFDI ─────────────────────────────────────────────────
  ck(22);
  doc.setDrawColor(180,180,180); doc.setLineWidth(0.3);
  doc.setLineDash([2,2]);
  doc.rect(ml, y, tw, 16);
  doc.setLineDash([]);
  doc.setFont('Roboto','italic'); doc.setFontSize(7.5); doc.setTextColor(170,170,170);
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
  doc.setFont('Roboto','bold'); doc.setFontSize(8); doc.setTextColor(30,30,30);
  doc.text('EL PATRON / REPRESENTANTE', cf1+colW/2, y+23, {align:'center'});
  doc.text('EL TRABAJADOR',             cf2+colW/2, y+23, {align:'center'});
  doc.setFont('Roboto','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80);
  doc.text(empresa.nombre||'', cf1+colW/2, y+28, {align:'center'});
  if (empresa.representante) doc.text(empresa.representante, cf1+colW/2, y+32, {align:'center'});
  doc.text(t.nombre||'', cf2+colW/2, y+28, {align:'center'});

  _footerFolio(doc, ml, mr, folio, empresa.nombre);

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

function npDate(d) { return formatDateLong(d); }

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
  doc.setTextColor(21,128,61); doc.setFont('Roboto','bold'); doc.setFontSize(13);
  doc.text(title, pw/2, 13, { align:'center' });
  doc.setFontSize(8); doc.setTextColor(180,185,200); doc.setFont('Roboto','normal');
  doc.text(subtitle, pw/2, 21, { align:'center' });
  return 40;
}

function pdfSignatures(doc, patronStr, trabajadorStr, y, ml, mr) {
  const pw = doc.internal.pageSize.getWidth();
  const mid = pw / 2;
  const sigY = y + 20;
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  doc.line(ml, sigY, mid - 12, sigY);
  doc.line(mid + 12, sigY, pw - mr, sigY);
  doc.setFont('Roboto','bold'); doc.setFontSize(9); doc.setTextColor(30,30,30);
  doc.text('EL PATRON / REPRESENTANTE', (ml + mid - 12)/2, sigY + 5, { align:'center' });
  doc.text('EL TRABAJADOR', (mid + 12 + pw - mr)/2, sigY + 5, { align:'center' });
  doc.setFont('Roboto','normal'); doc.setFontSize(8); doc.setTextColor(100,100,100);
  const pLines = doc.splitTextToSize(patronStr, mid - ml - 20);
  doc.text(pLines, (ml + mid - 12)/2, sigY + 11, { align:'center' });
  const wLines = doc.splitTextToSize(trabajadorStr, pw - mr - mid - 20);
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
    // La ciudad de celebración sigue al ESTABLECIMIENTO al que está adscrito el
    // trabajador (su sucursal), no a la matriz/fiscal de la empresa: el lugar de
    // prestación del servicio es uno de los puntos de conexión de competencia
    // del art. 700 fr. II LFT, y para un trabajador de sucursal ese lugar es la
    // sucursal, no donde esté domiciliada fiscalmente la empresa. Sin fallback
    // a una ciudad ajena a ninguna de las dos: falsearla es peor que fallar.
    ciudadFirma:         sucursal?.ciudad      || empresa.ciudad    || '',
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
    // Sin horario genérico de respaldo: la jornada debe ser la que realmente se
    // capturó al dar de alta al trabajador (copiada del puesto o ajustada a
    // mano). _exigirJornadaCapturada bloquea la generación si falta — imprimir
    // "09:00 a 18:00, lunes a viernes" cuando nadie pactó eso es fabricar el
    // contenido de un documento que se firma.
    horaInicio:          trab.hora_inicio      || '',
    horaFin:             trab.hora_fin         || '',
    horaDescansoInicio:  trab.hora_descanso_inicio || '',
    horaDescansoFin:     trab.hora_descanso_fin    || '',
    diasSemana:          trab.dias_semana      || [],
    diaDescanso:         trab.dia_descanso     || '',
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

/**
 * Falla de forma visible si falta la ciudad del patrón. El lugar en que se
 * suscribe el documento es punto de conexión de competencia (art. 700 fr. II
 * LFT) y consta al calce: no puede inventarse ni dejarse en blanco.
 */
function _exigirCiudad(ciudad) {
  if (String(ciudad || '').trim()) return;
  throw new Error(
    'No está configurada la ciudad de la empresa. El lugar en que se suscribe el ' +
    'documento es uno de los puntos que determinan la autoridad laboral competente ' +
    '(Art. 700 LFT), por lo que no puede omitirse. Captúrala en Empresa → Datos ' +
    'fiscales antes de generar el documento.'
  );
}

/**
 * Falla de forma visible si la jornada no viene de datos realmente capturados
 * (puesto asignado o alta del trabajador). El Art. 25 fr. V LFT exige que el
 * contrato señale la duración de la jornada; un horario genérico impreso por
 * omisión no es la jornada pactada, es una invención que además el propio
 * patrón podría no estar cumpliendo.
 */
function _exigirJornadaCapturada(data) {
  const faltantes = [];
  if (!data.horaInicio) faltantes.push('la hora de inicio');
  if (!data.horaFin) faltantes.push('la hora de fin');
  if (!Array.isArray(data.diasSemana) || !data.diasSemana.length) faltantes.push('los días laborales');
  if (!data.diaDescanso) faltantes.push('el día de descanso semanal');
  if (!faltantes.length) return;
  throw new Error(
    `Falta capturar ${faltantes.join(', ')} de la jornada de este trabajador. ` +
    `El contrato debe imprimir el horario realmente pactado (Art. 25 fr. V LFT), ` +
    `no un horario genérico. Captúralo en la pestaña Jornada del trabajador, o ` +
    `asígnale un puesto que ya tenga su jornada estándar configurada, antes de ` +
    `generar el contrato.`
  );
}

/**
 * Redacción del lugar de trabajo. El Art. 25 fracc. IV LFT exige señalar "el
 * lugar o los lugares donde deba prestarse el trabajo": una cláusula que deja
 * el lugar a la designación futura y unilateral del patrón, sin límite
 * geográfico, sin aviso previo y sin compensación de gastos, no lo señala
 * realmente — lo deja indeterminado, que es justo lo que el artículo exige
 * evitar. Se acota a reubicaciones dentro del mismo municipio o zona
 * metropolitana, con aviso previo y gastos de traslado a cargo del patrón;
 * cualquier cambio fuera de esa zona requiere el consentimiento expreso del
 * trabajador (una reubicación más amplia sin consentimiento sería, en los
 * hechos, una rescisión disfrazada de traslado).
 */
function _textoLugarTrabajo(domicilioBase) {
  return _sustituir(CLAUSULAS.lugarTrabajo, { DOMICILIO: domicilioBase || '' });
}

/**
 * Redacción de la jornada: se imprime la efectivamente pactada y el máximo legal
 * queda sólo como referencia. Pactar la meta legislativa (40 h) antes de que sea
 * exigible la convierte en condición adquirida por irreversibilidad (arts. 31,
 * 56 y 57 LFT) y regala como tiempo extraordinario la diferencia con el máximo
 * vigente.
 */
function _textoJornada(data, anio = new Date().getFullYear()) {
  const max = jornadaMaximaVigente(anio);
  const hrs = horasSemanalesPactadas(data);
  const ref = `conforme al artículo 59 de la Ley Federal del Trabajo y al régimen de transición previsto en la reforma publicada en el Diario Oficial de la Federacion el 1 de mayo de 2026`;
  if (hrs === null) {
    return `La jornada semanal pactada no excedera el máximo legal de ${max} horas aplicable en ${anio} ${ref}.`;
  }
  return `La jornada semanal pactada es de ${hrs} horas, sin exceder el máximo legal de ${max} horas semanales aplicable en ${anio} ${ref}.`;
}

/**
 * Impide emitir un contrato cuyo horario capturado rebase el máximo del
 * ejercicio. Firmarlo obligaría a pagar el excedente como tiempo
 * extraordinario desde el primer día.
 */
function _exigirJornadaLegal(data, anio = new Date().getFullYear()) {
  const hrs = horasSemanalesPactadas(data);
  if (hrs === null) return;
  const max = jornadaMaximaVigente(anio);
  if (hrs <= max) return;
  throw new Error(
    `El horario capturado suma ${hrs} horas semanales y excede el máximo legal ` +
    `de ${max} horas vigente en ${anio} (Art. 59 LFT y Transitorio Segundo del ` +
    `decreto DOF 01-05-2026). Ajusta el horario o los días laborables antes de ` +
    `generar el contrato: todo excedente se considera tiempo extraordinario.`
  );
}

function _initContratoDoc(titulo, subtitulo, data) {
  _exigirCiudad(data.ciudadFirma);
  _exigirJornadaCapturada(data);
  _exigirJornadaLegal(data);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  _registrarFuenteRoboto(doc);
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
  doc.setFont('Roboto','bold'); doc.setFontSize(11); doc.setTextColor(255,255,255);
  doc.text(data.razonSocial, pw/2, 10, { align:'center' });
  doc.setFont('Roboto','normal'); doc.setFontSize(7.5); doc.setTextColor(180,185,200);
  const sub = [data.rfcPatron, data.domicilioSucursal || data.domicilioFiscal].filter(Boolean).join('  |  ');
  doc.text(sub, pw/2, 18, { align:'center' });
  // Barra dorada con título
  doc.setFillColor(21,128,61);
  doc.rect(ml - 2, 24, pw - ml - mr + 4, 12, 'F');
  doc.setFont('Roboto','bold'); doc.setFontSize(9); doc.setTextColor(15, 20, 40);
  doc.text(titulo.toUpperCase(), pw/2, 31.5, { align:'center' });
  return 44;
}

/** Pie estándar de los documentos que se firman: folio, página y razón
 * social de la empresa — sin la nota de "carácter referencial". Esa
 * advertencia sigue viva antes de firmar (modal de descarga, ToS), pero no
 * pertenece al documento que el trabajador firma y que puede acabar ante una
 * Junta: ahí sólo debe leerse lo que las partes están reconociendo.
 *
 * En documentos de más de una página, cada página que NO es la última lleva
 * además una rúbrica marginal (línea en blanco para PATRON y TRABAJADOR):
 * una hoja intermedia sin rúbrica es la más fácil de impugnar como
 * sustituida después de firmado el documento. La última página no la repite
 * porque ahí ya va el bloque de firma completo.
 * `notaExtra` es para una nota puntual que no cabe en razonSocial (p. ej.
 * "Generado con IA" en los documentos del agente). */
function _footerFolio(doc, ml, mr, folio, razonSocial, notaExtra) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    if (i < total) {
      const mid = ml + (pw - ml - mr) / 2;
      doc.setDrawColor(190,190,190); doc.setLineWidth(0.25);
      doc.line(ml, ph - 17, ml + 36, ph - 17);
      doc.line(mid + 6, ph - 17, mid + 42, ph - 17);
      doc.setFontSize(6); doc.setFont('Roboto','normal'); doc.setTextColor(150,150,150);
      doc.text('Rúbrica PATRON', ml, ph - 14.5);
      doc.text('Rúbrica TRABAJADOR', mid + 6, ph - 14.5);
    }
    doc.setDrawColor(220,220,220); doc.setLineWidth(0.2);
    doc.line(ml, ph - 11, pw - mr, ph - 11);
    doc.setFontSize(6.5); doc.setFont('Roboto','normal'); doc.setTextColor(160,160,160);
    doc.text(`Folio ${folio}  |  Página ${i} de ${total}  |  ${razonSocial || ''}${notaExtra ? '  |  ' + notaExtra : ''}`, pw/2, ph - 7, { align:'center' });
  }
}

function _addFooters(state, data) {
  _footerFolio(state.doc, state.ml, state.mr, state.folio, data.razonSocial);
}

function _newPage(state) {
  state.doc.addPage();
  state.y = 22;
}

// Reserva 20mm de margen inferior (no 16) para que quepa, sin encimarse con
// el cuerpo, la rúbrica marginal que _footerFolio() dibuja en cada página
// que no es la última — ver esa función para el porqué.
function _checkY(state, needed = 22) {
  if (state.y + needed > state.ph - 20) _newPage(state);
}

/** Convierte 1..30 al ordinal femenino que exige "CLÁUSULA" (PRIMERA, SEGUNDA…
 * DÉCIMA, DÉCIMA PRIMERA… VIGÉSIMA…), como ya usan plantillas.js y los
 * documentos que llaman a _hOrdinal() con el ordinal escrito a mano. */
function _ordinalFemenino(n) {
  const UNIDADES = ['', 'PRIMERA', 'SEGUNDA', 'TERCERA', 'CUARTA', 'QUINTA',
    'SEXTA', 'SÉPTIMA', 'OCTAVA', 'NOVENA'];
  const DECENAS = ['', 'DÉCIMA', 'VIGÉSIMA', 'TRIGÉSIMA'];
  if (n < 1 || n > 39) return `${n}ª`;
  if (n <= 9) return UNIDADES[n];
  const d = Math.floor(n / 10), u = n % 10;
  return u === 0 ? DECENAS[d] : `${DECENAS[d]} ${UNIDADES[u]}`;
}

function _h(state, num, titulo) {
  _checkY(state, 18);
  const { doc, ml } = state;
  doc.setFillColor(21,128,61);
  doc.rect(ml, state.y, 2.5, 7, 'F');
  doc.setFont('Roboto','bold'); doc.setFontSize(9); doc.setTextColor(21,128,61);
  doc.text(`CLÁUSULA ${_ordinalFemenino(num)} — ${titulo.toUpperCase()}`, ml + 5, state.y + 5);
  state.y += 11;
}

/** Encabezado de cláusula con ordinal en palabras (PRIMERA, SEGUNDA…), para
 * convenios donde así lo exige el uso — a diferencia de _h(), que numera. */
function _hOrdinal(state, ordinal, titulo) {
  _checkY(state, 18);
  const { doc, ml } = state;
  doc.setFillColor(21,128,61);
  doc.rect(ml, state.y, 2.5, 7, 'F');
  doc.setFont('Roboto','bold'); doc.setFontSize(9); doc.setTextColor(21,128,61);
  doc.text(`CLÁUSULA ${ordinal} — ${titulo.toUpperCase()}`, ml + 5, state.y + 5);
  state.y += 11;
}

/** Subtítulo simple para hojas informativas (anexos), sin la barra verde de cláusula. */
function _hSeccion(state, titulo) {
  _checkY(state, 14);
  const { doc, ml } = state;
  doc.setFont('Roboto','bold'); doc.setFontSize(9.5); doc.setTextColor(30,30,30);
  doc.text(titulo, ml, state.y);
  state.y += 8;
}

function _p(state, texto, opts = {}) {
  if (!texto) return;
  const { bold = false, indent = 0, fontSize = 9.5, color = [50,50,50] } = opts;
  const { doc, ml, tw } = state;
  doc.setFont('Roboto', bold ? 'bold' : 'normal');
  doc.setFontSize(fontSize);
  doc.setTextColor(...color);
  const lines = doc.splitTextToSize(texto, tw - indent);
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
  const lines = doc.splitTextToSize(texto, tw - 10);
  const h = lines.length * 5 + 10;
  doc.setFillColor(...bg); doc.setDrawColor(...br); doc.setLineWidth(0.5);
  doc.roundedRect(ml, state.y, tw, h, 2, 2, 'FD');
  doc.setFont('Roboto','normal'); doc.setFontSize(8.2); doc.setTextColor(50,50,50);
  doc.text(lines, ml + 5, state.y + 7);
  state.y += h + 6;
}

// ── Cláusulas comunes 7ª–18ª ────────────────────────────────────────────────
function _clausulasComunes(state, data, start) {
  let n = start;

  const prC = data.prestaciones || prestacionesEmpresa();
  const vacTxt = prC.vacDiasExtra > 0
    ? `Vacaciones conforme al Art. 76 LFT MAS ${prC.vacDiasExtra} día(s) adicionales otorgados por EL PATRON (superior al mínimo de ley)`
    : `Vacaciones conforme al Art. 76 LFT (12 días el primer año, con incrementos bienales)`;
  const pvTxt = prC.primaVacPct > 0.25
    ? `Prima vacacional del ${(prC.primaVacPct*100).toFixed(0)}% (superior al mínimo del 25%, Art. 80 LFT)`
    : `Prima vacacional del 25% (Art. 80 LFT)`;
  const agTxt = prC.aguinaldoDias > 15
    ? `Aguinaldo de ${prC.aguinaldoDias} días de salario, superior al mínimo legal de 15 días, pagadero antes del 20 de diciembre (Art. 87 LFT)`
    : `Aguinaldo mínimo de 15 días de salario antes del 20 de diciembre (Art. 87 LFT)`;

  _h(state, n++, 'Prestaciones de Ley');
  _p(state, `EL TRABAJADOR tendrá derecho a todas las prestaciones mínimas de la Ley Federal del Trabajo: a) ${vacTxt}; b) ${pvTxt}; c) ${agTxt}; d) Participación de Utilidades (Art. 117 LFT); e) Afiliación al IMSS; f) Aportaciones al INFONAVIT (Art. 29 Ley INFONAVIT); g) Prima de antiguedad (Art. 162 LFT).`);

  // ── Prestaciones adicionales (solo si aplican al trabajador/empresa) ──────
  const adics = [];
  if (data.fondoAhorroActivo || prC.fondoAhorro.activo) {
    const pctT = data.fondoAhorroActivo ? data.fondoAhorroPct : prC.fondoAhorro.pctTrabajador;
    const pctP = data.fondoAhorroActivo ? data.fondoAhorroPct : prC.fondoAhorro.pctPatron;
    adics.push(`Fondo de ahorro con aportación del ${(pctT*100).toFixed(1)}% a cargo de EL TRABAJADOR y ${(pctP*100).toFixed(1)}% a cargo de EL PATRON, en términos del Art. 110 fracción IV LFT`);
  }
  if ((data.valesDespensaTrab || 0) > 0) {
    adics.push(`Vales de despensa por $${Number(data.valesDespensaTrab).toFixed(2)} M.N. por periodo de pago`);
  } else if (prC.vales.activo && prC.vales.valor > 0) {
    adics.push(prC.vales.tipo === 'pct'
      ? `Vales de despensa equivalentes al ${(prC.vales.valor*100).toFixed(1)}% del salario del periodo`
      : `Vales de despensa por $${Number(prC.vales.valor).toFixed(2)} M.N. por periodo de pago`);
  }
  if (prC.primaDomPct > 0.25) {
    adics.push(`Prima dominical del ${(prC.primaDomPct*100).toFixed(0)}%, superior al mínimo del 25% (Art. 71 LFT)`);
  }
  if (prC.factorHE > 2) {
    adics.push(`Pago de horas extraordinarias a razón de ${prC.factorHE} veces el salario por hora, superior al mínimo legal (Arts. 67-68 LFT)`);
  }
  if (prC.festivos.length > 0) {
    const listaFest = prC.festivos.map(f =>
      `${f.valor}${f.descripcion ? ' (' + f.descripcion + ')' : ''}${f.tipo === 'recurrente' ? ' de cada año' : ''}`).join('; ');
    adics.push(`Días de descanso con goce de sueldo adicionales a los festivos oficiales del Art. 74 LFT: ${listaFest}`);
  }
  if (adics.length > 0) {
    _h(state, n++, 'Prestaciones Adicionales');
    _p(state, `Además de las prestaciones mínimas de ley, EL PATRON otorga a EL TRABAJADOR las siguientes prestaciones adicionales: ${adics.map((a,i) => String.fromCharCode(97+i) + ') ' + a).join('; ')}. Estas prestaciones se otorgan en beneficio de EL TRABAJADOR y no podrán ser inferiores a los mínimos establecidos en la Ley Federal del Trabajo.`);
  }

  _h(state, n++, 'Instrumentos y Herramientas de Trabajo');
  _p(state, CLAUSULAS.herramientas);

  _h(state, n++, 'Capacitación y Adiestramiento (Arts. 153-A al 153-X LFT)');
  _p(state, CLAUSULAS.capacitacion);

  _h(state, n++, 'Obligaciones del Trabajador (Art. 134 LFT)');
  _p(state, CLAUSULAS.obligacionesTrabajador);

  _h(state, n++, 'Deducciones de Ley (Art. 110 LFT)');
  _p(state, CLAUSULAS.deducciones);

  // Confidencialidad: el deber de guardar los secretos técnicos y comerciales
  // ya lo impone el Art. 134 fracc. III LFT. Lo que no puede hacer el contrato
  // es imponer un deber de silencio perpetuo sobre CUALQUIER información: sólo
  // el secreto industrial —el que reúne los requisitos del art. 163 fr. I
  // LFPPI— justifica protección indefinida; el resto se acota temporalmente.
  // Texto y fundamento viven en cláusulas.js — ver CLÁUSULAS.confidencialidad.
  _h(state, n++, 'Confidencialidad y Secretos Industriales');
  CLAUSULAS.confidencialidad.forEach(p => _p(state, p));

  // Propiedad intelectual: la versión anterior hacía que el trabajador
  // "cediera en este acto todos los derechos patrimoniales de autor". Una
  // cesión global y anticipada de obra futura e indeterminada no es exigible;
  // el Art. 163 LFT (invenciones) reserva al trabajador derechos
  // irrenunciables que esa cláusula pretendía borrar. Texto en cláusulas.js.
  _h(state, n++, 'Propiedad Intelectual e Invenciones (Art. 163 LFT)');
  CLAUSULAS.propiedadIntelectual.forEach(p => _p(state, p));

  // Art. 110 LFT es limitativo: sólo admite las deducciones que enumera. La LFT no
  // impone al trabajador obligación de preaviso ni autoriza descuento por omitirlo;
  // el preaviso se conserva como buena práctica, sin consecuencia económica.
  _h(state, n++, 'Causas de Rescisión y Aviso de Renuncia');
  _p(state, CLAUSULAS.rescisionAviso);

  _h(state, n++, 'Beneficiarios (Art. 25 fracc. X LFT)');
  _p(state, CLAUSULAS.beneficiariosIntro);
  const bRows = [];
  if (data.beneficiario1Nombre) bRows.push([data.beneficiario1Nombre, data.beneficiario1Parentesco, data.beneficiario1Telefono]);
  else bRows.push(['[NOMBRE BENEFICIARIO 1]','[PARENTESCO]','[TELEFONO]']);
  if (data.beneficiario2Nombre) bRows.push([data.beneficiario2Nombre, data.beneficiario2Parentesco, data.beneficiario2Telefono]);
  else bRows.push(['[NOMBRE BENEFICIARIO 2 — OPCIONAL]','','']);
  _table(state, [['Nombre Completo','Parentesco','Telefono']], bRows);
  // La designación del Art. 25 fr. X no autoriza al patrón a pagar directamente:
  // el Art. 503 LFT somete el pago a un procedimiento especial ante el Tribunal,
  // y sólo el pago hecho en cumplimiento de su resolución libera al patrón
  // (Art. 503 fr. VII). Pagar "al beneficiario designado" sin resolución deja al
  // patrón expuesto a volver a pagar a quien el Tribunal reconozca después.
  _p(state, CLAUSULAS.beneficiariosAdvertencia);

  _h(state, n++, 'Reconocimiento de Antiguedad');
  _p(state, _sustituir(CLAUSULAS.antiguedad, {
    FECHA_ANTIGUEDAD: npDate((data.fechaIngresoReconocida || data.fechaIngreso) + 'T00:00:00'),
  }));

  _h(state, n++, 'Trabajadores Menores de Edad (Arts. 22-23 LFT)');
  _p(state, CLAUSULAS.menoresEdad);

  // Art. 700 fr. II LFT — la competencia territorial la elige el trabajador entre el
  // lugar de celebración, el domicilio del demandado y el lugar de prestación del
  // servicio. Es improrrogable: una sumisión expresa con renuncia de fuero es nula
  // (art. 5 fr. XIII LFT) y proyecta mala fe procesal.
  _h(state, n++, 'Ley Aplicable y Autoridad Competente');
  _p(state, CLAUSULAS.jurisdiccion);

  _h(state, n++, 'Supletoriedad');
  _p(state, CLAUSULAS.supletoriedad);
}

// ── Bloque de firmas ─────────────────────────────────────────────────────────
function _firmas(state, data) {
  _checkY(state, 78);
  const { doc, ml, mr, pw } = state;
  const tw = pw - ml - mr;
  const colW = tw / 2 - 5;
  _gap(state, 6); _line(state);
  _p(state, `En la ciudad de ${data.ciudadFirma}, siendo las ___:___ horas del día ${npDate(new Date().toISOString())}, se firma el presente contrato en dos tantos originales quedando uno en poder de cada parte, previa lectura y ratificación de su contenido.`, { fontSize: 8.5, color:[80,80,80] });
  _gap(state, 12);
  const y0 = state.y;
  const c1 = ml, c2 = ml + colW + 10;
  // Firma 1 y 2
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  doc.line(c1, y0+20, c1+colW, y0+20);
  doc.line(c2, y0+20, c2+colW, y0+20);
  doc.line(c1, y0+50, c1+colW, y0+50);
  doc.line(c2, y0+50, c2+colW, y0+50);
  doc.setFont('Roboto','bold'); doc.setFontSize(8); doc.setTextColor(30,30,30);
  doc.text('EL PATRON / REPRESENTANTE', c1+colW/2, y0+25, {align:'center'});
  doc.text('EL TRABAJADOR',             c2+colW/2, y0+25, {align:'center'});
  doc.text('TESTIGO 1',                 c1+colW/2, y0+55, {align:'center'});
  doc.text('TESTIGO 2',                 c2+colW/2, y0+55, {align:'center'});
  doc.setFont('Roboto','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80);
  doc.text(data.razonSocial,         c1+colW/2, y0+30, {align:'center'});
  if (data.representanteLegal) doc.text(data.representanteLegal, c1+colW/2, y0+34, {align:'center'});
  doc.text(data.nombre,              c2+colW/2, y0+30, {align:'center'});
  if (data.rfc) doc.text(`RFC: ${data.rfc}`, c2+colW/2, y0+34, {align:'center'});
  state.y = y0 + 68;
}

// ── Generador 1: Tiempo Indeterminado ────────────────────────────────────────
function generateContratoIndeterminado(data) {
  const state = _initContratoDoc(
    'CONTRATO INDIVIDUAL DE TRABAJO POR TIEMPO INDETERMINADO',
    'Artículo 35 — Ley Federal del Trabajo 2026', data);

  _h(state, 1, 'Duración (Art. 35 LFT)');
  _p(state, `El presente contrato se celebra por TIEMPO INDETERMINADO entre ${data.razonSocial}, con RFC ${data.rfcPatron}, representada por ${data.representanteLegal || '[REPRESENTANTE]'}, con domicilio en ${data.domicilioSucursal || data.domicilioFiscal}, en adelante "EL PATRON"; y el C. ${data.nombre}, con RFC ${data.rfc}, CURP ${data.curp}, NSS ${data.nss}, en adelante "EL TRABAJADOR". La relación laboral inicia el ${npDate(data.fechaIngreso+'T00:00:00')} con vigencia indefinida.`);

  _h(state, 2, `Periodo de Prueba — ${data.tipoPruebaDias} días (Art. 39-A LFT)`);
  _p(state, `Las partes convienen un periodo de prueba de ${data.tipoPruebaDias} días naturales contados desde el inicio de la relación. Durante este lapso EL PATRON evaluara el desempeno y aptitudes de EL TRABAJADOR. Si al término no se notifica rescisión, el contrato queda ratificado de pleno derecho.`);
  if (Number(data.tipoPruebaDias) > 30) _recuadro(state, 'El periodo de 180 días aplica exclusivamente para puestos de dirección, gerencia o que requieran conocimientos o habilidades especiales (Art. 39-A, párrafo segundo, LFT).', 'warn');

  _h(state, 3, 'Objeto — Servicio a Prestar');
  _p(state, `EL TRABAJADOR se obliga a prestar sus servicios personales y subordinados como ${data.puesto}${data.departamento ? ', en el area de '+data.departamento : ''}. Funciones principales:`);
  _p(state, data.funciones, { indent: 4, color:[70,70,70] });

  _h(state, 4, 'Salario (Art. 82-88 LFT)');
  _p(state, `EL PATRON pagara a EL TRABAJADOR un salario ${data.periodoSalario} de $${Number(data.salario).toFixed(2)} M.N. (${numToWords(data.salario)} PESOS 00/100 M.N.) mediante ${data.formaPago}${data.diasPago ? ', los días '+data.diasPago : ''}. El salario cubre la jornada ordinaria y no será inferior al salario mínimo vigente.`);

  _h(state, 5, 'Lugar y Jornada de Trabajo');
  _p(state, `${_textoLugarTrabajo(data.domicilioSucursal || data.domicilioFiscal)} La jornada ordinaria será de ${data.horaInicio} a ${data.horaFin} horas, con descanso de ${data.horaDescansoInicio} a ${data.horaDescansoFin} horas, los días ${data.diasSemana.join(', ')}. ${_textoJornada(data)}`);

  _h(state, 6, 'Descanso Semanal (Art. 69 LFT)');
  _p(state, `EL TRABAJADOR disfrutara de un día de descanso por cada seis laborados, preferentemente el ${data.diaDescanso}, con salario integro. Si labora en día de descanso percibirá el doble del salario además del ordinario.`);

  _clausulasComunes(state, data, 7);
  _firmas(state, data);
  _addFooters(state, data);
  state.doc.save(`contrato-indeterminado-${data.nombre.replace(/\s+/g,'-').toLowerCase()}.pdf`);
}

// ── Generador 2: Tiempo Determinado ─────────────────────────────────────────
function generateContratoDeterminado(data) {
  const state = _initContratoDoc(
    'CONTRATO INDIVIDUAL DE TRABAJO POR TIEMPO DETERMINADO',
    'Artículo 37 — Ley Federal del Trabajo 2026', data);

  _h(state, 1, 'Duración y Vigencia (Art. 37 LFT)');
  _p(state, `El presente contrato se celebra por TIEMPO DETERMINADO entre ${data.razonSocial} (EL PATRON) y el C. ${data.nombre} (EL TRABAJADOR), con vigencia del ${npDate(data.fechaIngreso+'T00:00:00')} al ${data.fechaVencimiento ? npDate(data.fechaVencimiento+'T00:00:00') : '[FECHA DE VENCIMIENTO]'}.`);
  // Art. 39 LFT: si vencido el término subsiste la materia del trabajo, la
  // relación queda prorrogada por todo el tiempo que perdure esa circunstancia.
  // Decir sólo que "concluye automáticamente" omite esa regla y crea la falsa
  // expectativa de que basta con dejar pasar la fecha: si el trabajador sigue
  // laborando, la relación continúa por ministerio de ley, no por acuerdo.
  _p(state, `Al vencimiento del término, si subsiste la materia del trabajo la relación quedara PRORROGADA por todo el tiempo que perdure dicha circunstancia, en términos del artículo 39 de la Ley Federal del Trabajo. La conclusión de la relación al vencimiento requiere que la materia del trabajo se haya agotado; en caso contrario, la continuación de los servicios prorroga la relación por disposición de la ley, con independencia de lo pactado en esta cláusula.`);
  _recuadro(state, 'ADVERTENCIA LEGAL: El contrato por tiempo determinado solo es válido cuando lo exige la naturaleza del trabajo, cuando tiene por objeto sustituir temporalmente a otro trabajador, o cuando lo imponga una circunstancia objetiva determinada (Art. 37 LFT). Su uso indebido convierte la relación en tiempo indeterminado (Art. 39 LFT). Renovar sucesivamente un contrato determinado sin una causa objetiva que subsista en cada renovación es uno de los supuestos que con mayor frecuencia se declaran relación por tiempo indeterminado.', 'warn');

  _h(state, 2, 'Objeto — Servicio a Prestar');
  _p(state, `EL TRABAJADOR se obliga a prestar sus servicios como ${data.puesto}${data.departamento ? ' en el area de '+data.departamento : ''}, durante la vigencia del contrato. Funciones: ${data.funciones}.`);

  _h(state, 3, 'Salario');
  _p(state, `EL PATRON pagara un salario ${data.periodoSalario} de $${Number(data.salario).toFixed(2)} M.N. (${numToWords(data.salario)} PESOS 00/100 M.N.) mediante ${data.formaPago}${data.diasPago ? ', los días '+data.diasPago : ''}.`);

  _h(state, 4, 'Lugar y Jornada');
  _p(state, `EL TRABAJADOR prestara servicios en ${data.domicilioSucursal || data.domicilioFiscal}. Jornada de ${data.horaInicio} a ${data.horaFin} horas, con descanso de ${data.horaDescansoInicio} a ${data.horaDescansoFin} horas, días ${data.diasSemana.join(', ')}.`);

  _h(state, 5, 'Descanso Semanal');
  _p(state, `Un día de descanso semanal, preferentemente el ${data.diaDescanso}, con salario integro (Art. 69 LFT).`);

  _clausulasComunes(state, data, 6);
  _firmas(state, data);
  _addFooters(state, data);
  state.doc.save(`contrato-determinado-${data.nombre.replace(/\s+/g,'-').toLowerCase()}.pdf`);
}

// ── Generador 3: Por Obra ────────────────────────────────────────────────────
function generateContratoObra(data) {
  const state = _initContratoDoc(
    'CONTRATO INDIVIDUAL DE TRABAJO POR OBRA O SERVICIO DETERMINADO',
    'Artículo 36 — Ley Federal del Trabajo 2026', data);

  _h(state, 1, 'Objeto y Duración (Art. 36 LFT)');
  _p(state, `El presente contrato se celebra para la realización de la obra o servicio denominado: "${data.nombreProyecto || '[NOMBRE DEL PROYECTO]'}". La relación laboral inicia el ${npDate(data.fechaIngreso+'T00:00:00')} y concluye automaticamente al término de la obra, con fecha estimada el ${data.fechaFinProyecto ? npDate(data.fechaFinProyecto+'T00:00:00') : '[FECHA ESTIMADA]'}, sin responsabilidad para EL PATRON.`);
  _recuadro(state, 'Este tipo de contrato aplica unicamente cuando la naturaleza del trabajo consiste en una obra o proyecto con inicio y fin determinados. Al término del proyecto se generan prestaciones proporcionales (vacaciones, aguinaldo, prima vacacional). Art. 36 LFT.', 'warn');

  _h(state, 2, 'Funciones Especificas del Proyecto');
  _p(state, `EL TRABAJADOR desempenara el cargo de ${data.puesto} participando exclusivamente en el proyecto descrito. Funciones: ${data.funciones}.`);

  _h(state, 3, 'Salario');
  _p(state, `Salario ${data.periodoSalario} de $${Number(data.salario).toFixed(2)} M.N. (${numToWords(data.salario)} PESOS 00/100 M.N.) mediante ${data.formaPago}${data.diasPago ? ', días '+data.diasPago : ''}.`);

  _h(state, 4, 'Lugar de Prestación del Servicio');
  _p(state, `EL TRABAJADOR prestara servicios en el lugar de ejecución de la obra, inicialmente en ${data.domicilioSucursal || data.domicilioFiscal}, o en la ubicación que requieran los trabajos, previo aviso de EL PATRON.`);

  _h(state, 5, 'Jornada de Trabajo');
  _p(state, `Jornada de ${data.horaInicio} a ${data.horaFin} horas, descanso de ${data.horaDescansoInicio} a ${data.horaDescansoFin}, días ${data.diasSemana.join(', ')}.`);

  _h(state, 6, 'Descanso Semanal');
  _p(state, `Un día de descanso semanal, preferentemente el ${data.diaDescanso}, con salario integro (Art. 69 LFT).`);

  _clausulasComunes(state, data, 7);
  _firmas(state, data);
  _addFooters(state, data);
  state.doc.save(`contrato-obra-${data.nombre.replace(/\s+/g,'-').toLowerCase()}.pdf`);
}

// ── Generador 4: Por Temporada ───────────────────────────────────────────────
// El Art. 42 Bis LFT NO regula el trabajo por temporada: es la suspensión por
// contingencia sanitaria declarada por autoridad (verificado contra el texto
// oficial DOF 14-05-2026). La conclusión de cada temporada es causal de
// SUSPENSIÓN — no de rescisión — prevista en el Art. 42 fracc. VIII LFT, y su
// duración (hasta el inicio de la siguiente temporada) la fija el Art. 43
// fracc. V LFT. La cláusula anterior también inventaba una rescisión
// automática a los 15 días de inasistencia sin causa: esa hipótesis no existe;
// la inasistencia prolongada se rige por las reglas ordinarias de rescisión
// (Art. 47 fracc. X LFT — más de tres faltas en 30 días —, con su propio aviso
// y sujeta al plazo de prescripción del Art. 517 fracc. I LFT).
function generateContratoTemporada(data) {
  const state = _initContratoDoc(
    'CONTRATO INDIVIDUAL DE TRABAJO POR TEMPORADA',
    'Artículos 35, 42 fracción VIII y 43 fracción V — Ley Federal del Trabajo 2026', data);

  _h(state, 1, 'Duración y Carácter Discontinuo (Art. 35, 42 fracc. VIII y 43 fracc. V LFT)');
  _p(state, `El presente contrato es por TIEMPO INDETERMINADO con prestación de servicios DISCONTINUA, en términos del artículo 35 de la Ley Federal del Trabajo. Concluida cada temporada, la relación de trabajo queda SUSPENDIDA —no rescindida— en términos del artículo 42, fracción VIII, y 43, fracción V, de la Ley Federal del Trabajo, desde la fecha de conclusión de la temporada hasta el inicio de la siguiente. Temporadas pactadas:`);
  if (data.temporadas?.length) {
    _table(state,
      [['Temporada','Fecha Inicio','Fecha Fin']],
      data.temporadas.map(t => [t.nombre||'', t.inicio ? npDate(t.inicio+'T00:00:00') : '', t.fin ? npDate(t.fin+'T00:00:00') : ''])
    );
  } else {
    _recuadro(state, '[DEFINIR LAS TEMPORADAS CON NOMBRE, FECHA INICIO Y FECHA FIN]', 'warn');
  }
  _recuadro(state, CLAUSULAS.temporadaSuspension, 'warn');

  _h(state, 2, 'Objeto — Servicio a Prestar');
  _p(state, `Durante cada temporada EL TRABAJADOR se desempenara como ${data.puesto}${data.departamento ? ' en el area de '+data.departamento : ''}. Funciones: ${data.funciones}.`);

  _h(state, 3, 'Salario');
  _p(state, `Salario ${data.periodoSalario} de $${Number(data.salario).toFixed(2)} M.N. (${numToWords(data.salario)} PESOS 00/100 M.N.) mediante ${data.formaPago}, pagadero unicamente durante temporada activa. Las prestaciones se calculan proporcionalmente al tiempo efectivamente laborado en cada ejercicio anual.`);

  _h(state, 4, 'Lugar de Prestación de Servicios (Art. 25 fracc. IV LFT)');
  _p(state, `EL TRABAJADOR prestara servicios en ${data.domicilioSucursal || data.domicilioFiscal}. Si una temporada especifica requiere prestar el servicio en una ubicación distinta, EL PATRON lo notificara al convocar dicha temporada (Art. 25 fracc. IV LFT) y cubrira los gastos de traslado que se originen.`);

  _h(state, 5, 'Jornada de Trabajo');
  _p(state, `Durante la temporada activa, jornada de ${data.horaInicio} a ${data.horaFin} horas, descanso de ${data.horaDescansoInicio} a ${data.horaDescansoFin}, días ${data.diasSemana.join(', ')}.`);

  _h(state, 6, 'Descanso y Prestaciones Proporcionales');
  _p(state, `Un día de descanso semanal, preferentemente el ${data.diaDescanso}. Todas las prestaciones (vacaciones, prima vacacional, aguinaldo, prima de antiguedad) se calculan proporcional al tiempo efectivamente laborado en cada año de calendario (Arts. 76, 80, 87 y 162 LFT).`);

  _clausulasComunes(state, data, 7);
  _firmas(state, data);
  _addFooters(state, data);
  state.doc.save(`contrato-temporada-${data.nombre.replace(/\s+/g,'-').toLowerCase()}.pdf`);
}

// ── Generador 5: Por Comisión ────────────────────────────────────────────────
function generateContratoComision(data) {
  const state = _initContratoDoc(
    'CONTRATO INDIVIDUAL DE TRABAJO PARA TRABAJADOR COMISIONISTA',
    'Artículos 285-289 — Ley Federal del Trabajo 2026', data);

  _h(state, 1, 'Duración (Art. 285 LFT)');
  _p(state, `El presente contrato se celebra por TIEMPO INDETERMINADO entre ${data.razonSocial} (EL PATRON) y el C. ${data.nombre} (EL TRABAJADOR COMISIONISTA), con inicio el ${npDate(data.fechaIngreso+'T00:00:00')}.`);

  // El art. 39-A sólo admite 30 días como regla general y 180 exclusivamente
  // para dirección, gerencia y labores técnicas o profesionales especializadas.
  // 60 días no es un valor previsto por la ley: pactarlo excede el tope y el
  // excedente es nulo, de modo que la terminación en ese lapso es despido.
  _h(state, 2, `Periodo de Prueba — ${data.tipoPruebaDias} días (Art. 39-A LFT)`);
  _p(state, `Se establece un periodo de prueba de ${data.tipoPruebaDias} días naturales para evaluar el desempeno en ventas, la zona de trabajo y el cumplimiento de objetivos comerciales. Al concluir el periodo sin notificación en contrario, el contrato queda ratificado de pleno derecho.`);

  _h(state, 3, 'Objeto, Zona y Actividades');
  _p(state, `EL TRABAJADOR desempenara el cargo de ${data.puesto} con cobertura en: ${data.zonaAsignada || '[ZONA ASIGNADA]'}. Actividades principales: ${data.funciones}.`);

  _h(state, 4, 'Remuneración por Comisión (Art. 289 LFT)');
  _p(state, `La remuneración se integra por comisiones sobre ventas o servicios concretados, conforme a la siguiente tabla:`);
  if (data.tablaComisiones?.length) {
    _table(state,
      [['Rango / Condición','Comisión Aplicable']],
      data.tablaComisiones.map(c => [c.rango||'', c.comision||''])
    );
  } else {
    _recuadro(state, '[DEFINIR RANGOS Y COMISIONES APLICABLES]', 'warn');
  }
  // El "promedio de los últimos 30 días" no es la regla del salario variable:
  // la Ley del Seguro Social la fija en el bimestre inmediato anterior, con
  // avisos de modificación en meses determinados. Cotizar sobre un promedio
  // de 30 días produce un SBC distinto del legal y expone al patrón a
  // diferencias, actualizaciones y multas del IMSS.
  _p(state, _sustituir(CLAUSULAS.comisionSDI, { SALARIO: Number(data.salario).toFixed(2) }));

  _h(state, 5, 'Jornada Autoadministrada y Presentación en Oficina');
  _p(state, `Dada la naturaleza de la actividad, la jornada es autoadministrada dentro del horario de ${data.horaInicio} a ${data.horaFin} horas. EL TRABAJADOR se presentara en instalaciones de EL PATRON los días ${(data.diasPresentacion||['[DÍAS]']).join(', ')} en el horario ${data.horarioPresentacion || '[HORARIO DE PRESENTACIÓN]'}.`);

  _h(state, 6, 'Descanso Semanal');
  _p(state, `Un día de descanso semanal, preferentemente el ${data.diaDescanso}, con salario mínimo integro (Arts. 69 y 289 LFT).`);

  _clausulasComunes(state, data, 7);
  _firmas(state, data);

  // Hoja adicional: ficha del puesto + datos personales
  _newPage(state);
  _p(state, 'ANEXO A — DATOS DEL PUESTO Y FICHA PERSONAL DEL TRABAJADOR', { bold: true, fontSize: 11, color:[15,36,56] });
  _gap(state, 4);
  _table(state, [['Campo','Dato']], [
    ['Puesto',                data.puesto],
    ['Departamento',          data.departamento],
    ['Zona asignada',         data.zonaAsignada],
    ['Días presentación',     (data.diasPresentacion||[]).join(', ')],
    ['Horario presentación',  data.horarioPresentacion],
    ['Funciones',             data.funciones],
  ]);
  _table(state, [['Campo','Dato']], [
    ['Nombre completo',       data.nombre],
    ['RFC',                   data.rfc],
    ['CURP',                  data.curp],
    ['NSS',                   data.nss],
    ['Edad',                  data.edad ? data.edad + ' anos' : ''],
    ['Estado civil',          data.estadoCivil],
    ['Nacionalidad',          data.nacionalidad],
    ['Domicilio',             data.domicilio],
    [data.tipoIdentificacion || 'Identificacion', data.numIdentificacion],
  ]);

  _addFooters(state, data);
  state.doc.save(`contrato-comisión-${data.nombre.replace(/\s+/g,'-').toLowerCase()}.pdf`);
}

// ─── CONTRATO INDIVIDUAL DE TRABAJO (legado — mantener compatibilidad) ────────
/**
 * @param {Object} empresa  { nombre, rfc, representante, domicilio, ciudad }
 * @param {Object} trab     { nombre, rfc, curp, nss, puesto, departamento, fecha_ingreso, salario_mensual, tipo_contrato, smg_zone }
 */
function generateContratoPDF(empresa, trab, sucursal = null, opts = {}) {
  empresa = resolveUbicacion(empresa, sucursal);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  _registrarFuenteRoboto(doc);
  const ml = 22, mr = 22;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const tw = pw - ml - mr;
  const folio = `CONT-${Date.now().toString().slice(-7)}`;

  const tipoLabel = { indefinido:'Tiempo Indeterminado', determinado:'Tiempo Determinado', obra:'Obra o Servicio Determinado', temporada:'Temporada' }[trab.tipo_contrato] || 'Tiempo Indeterminado';
  let y = pdfHeader(doc, `CONTRATO INDIVIDUAL DE TRABAJO`, `Por ${tipoLabel} — Ley Federal del Trabajo 2026`, ml, mr);

  // Ciudad y fecha
  doc.setFont('Roboto','normal'); doc.setFontSize(10); doc.setTextColor(60,60,60);
  doc.text(`${empresa.ciudad}, a ${npDate(new Date())}`, pw - mr, y, { align:'right' }); y += 14;

  function parrafo(titulo, texto, indent = true) {
    doc.setFont('Roboto','bold'); doc.setFontSize(9.5); doc.setTextColor(20,20,20);
    doc.text(titulo, ml, y); y += 5;
    doc.setFont('Roboto','normal'); doc.setFontSize(9.5); doc.setTextColor(40,40,40);
    const lines = doc.splitTextToSize(texto, tw - (indent ? 4 : 0));
    doc.text(lines, ml + (indent ? 2 : 0), y);
    y += lines.length * 5.2 + 6;
    if (y > ph - 30) { doc.addPage(); y = 25; }
  }

  parrafo('PARTES CONTRATANTES:', `El presente contrato se celebra entre ${empresa.nombre}, con RFC ${empresa.rfc || 'N/A'}${empresa.representante ? ', representada por ' + empresa.representante : ''}, con domicilio en ${empresa.domicilio || empresa.ciudad}, en adelante denominado "EL PATRON"; y el C. ${trab.nombre}, con RFC ${trab.rfc || 'N/A'}, CURP ${trab.curp || 'N/A'}, NSS ${trab.nss || 'N/A'}, en adelante "EL TRABAJADOR".`);

  parrafo('PRIMERA. — SERVICIO A PRESTAR:', `EL TRABAJADOR se obliga a prestar sus servicios personales y subordinados como ${trab.puesto || 'empleado(a)'}${trab.departamento ? ' en el area de ' + trab.departamento : ''}, desarrollando todas las funciones inherentes a dicho puesto conforme a las instrucciones del PATRON y su Reglamento Interior de Trabajo.`);

  parrafo('SEGUNDA. — DURACIÓN:', trab.tipo_contrato === 'indefinido'
    ? `El presente contrato es por TIEMPO INDETERMINADO, a partir del ${npDate(trab.fecha_ingreso)}, con vigencia indefinida, pudiendo concluir por las causas previstas en los artículos 46 a 53 de la Ley Federal del Trabajo.`
    : `El presente contrato es por ${tipoLabel}, con inicio el ${npDate(trab.fecha_ingreso)}, conforme al artículo 37 de la Ley Federal del Trabajo.`);

  // Art. 59 LFT fija el máximo semanal (el 61 es la jornada diaria) y el 66, tras
  // la reforma DOF 01-05-2026, es el que ordena pagar el tiempo extraordinario
  // con un cien por ciento más; el antiguo párrafo segundo del 67 fue derogado.
  const _anioC   = new Date().getFullYear();
  const _jorLeg  = { horaInicio: trab.hora_inicio, horaFin: trab.hora_fin,
                     horaDescansoInicio: trab.hora_descanso_inicio,
                     horaDescansoFin: trab.hora_descanso_fin,
                     diasSemana: trab.dias_semana };
  const _hrsLeg  = horasSemanalesPactadas(_jorLeg);
  const _maxLeg  = jornadaMaximaVigente(_anioC);
  parrafo('TERCERA. — JORNADA DE TRABAJO:', `${_hrsLeg !== null ? `La jornada ordinaria pactada es de ${_hrsLeg} horas semanales, sin exceder` : 'La jornada ordinaria de trabajo no excedera'} el máximo legal de ${_maxLeg} horas semanales aplicable en ${_anioC}, conforme al artículo 59 de la Ley Federal del Trabajo y al régimen de transición previsto en la reforma publicada en el Diario Oficial de la Federacion el 1 de mayo de 2026. El PATRON podrá autorizar tiempo extraordinario, que se abonara con un cien por ciento mas de lo fijado para las horas ordinarias (Art. 66 LFT), sin exceder de ${horasExtraMaxVigente(_anioC)} horas a la semana en ${_anioC}.`);

  parrafo('CUARTA. — LUGAR DE TRABAJO:', _textoLugarTrabajo(empresa.domicilio || empresa.ciudad));

  const _perSal   = trab.periodo_salario || 'mensual';
  const _perAdj   = _perSal === 'quincenal' ? 'quincenal' : _perSal === 'semanal' ? 'semanal' : 'mensual';
  const _perFrec  = _perSal === 'quincenal' ? 'de forma quincenal' : _perSal === 'semanal' ? 'de forma semanal' : 'de forma mensual';
  const _salDiarioC = (typeof calcSalarioDiario === 'function' ? calcSalarioDiario(trab.salario_mensual, _perSal) : trab.salario_mensual / 30);
  const _formaPagoC = (trab.forma_pago === 'efectivo') ? 'en efectivo' : 'mediante deposito bancario';
  parrafo('QUINTA. — SALARIO:', `EL TRABAJADOR percibirá un salario ${_perAdj} de $${trab.salario_mensual.toFixed(2)} M.N. (${numToWords(trab.salario_mensual)} PESOS 00/100 M.N.), equivalente a un salario diario de $${_salDiarioC.toFixed(2)} M.N. (Art. 89 LFT), que será pagado ${_perFrec} ${_formaPagoC}, conforme a los artículos 82, 88 y 89 de la Ley Federal del Trabajo.`);

  const prG = prestacionesEmpresa(empresa);
  parrafo('SEXTA. — PRESTACIONES DE LEY:', `EL TRABAJADOR tendrá derecho a: a) Vacaciones conforme al Art. 76 LFT${prG.vacDiasExtra > 0 ? ` mas ${prG.vacDiasExtra} día(s) adicionales otorgados por EL PATRON` : ''}; b) Prima vacacional del ${(prG.primaVacPct*100).toFixed(0)}% (Art. 80 LFT${prG.primaVacPct > 0.25 ? ', superior al mínimo de ley' : ''}); c) Aguinaldo de ${prG.aguinaldoDias} días de salario (Art. 87 LFT${prG.aguinaldoDias > 15 ? ', superior al mínimo de ley' : ''}); d) Seguridad social (IMSS); e) INFONAVIT conforme a la Ley; f) Prima de antiguedad (Art. 162 LFT).`);

  // Prestaciones adicionales (solo si aplican)
  const adicG = [];
  if (trab.fondo_ahorro_activo || prG.fondoAhorro.activo) {
    const pctT = trab.fondo_ahorro_activo ? parseFloat(trab.fondo_ahorro_pct || 0.13) : prG.fondoAhorro.pctTrabajador;
    const pctP = trab.fondo_ahorro_activo ? parseFloat(trab.fondo_ahorro_pct || 0.13) : prG.fondoAhorro.pctPatron;
    adicG.push(`Fondo de ahorro con aportación del ${(pctT*100).toFixed(1)}% a cargo de EL TRABAJADOR y ${(pctP*100).toFixed(1)}% a cargo de EL PATRON (Art. 110 fr. IV LFT)`);
  }
  if (parseFloat(trab.vales_despensa || 0) > 0) {
    adicG.push(`Vales de despensa por $${parseFloat(trab.vales_despensa).toFixed(2)} M.N. por periodo de pago`);
  } else if (prG.vales.activo && prG.vales.valor > 0) {
    adicG.push(prG.vales.tipo === 'pct'
      ? `Vales de despensa equivalentes al ${(prG.vales.valor*100).toFixed(1)}% del salario del periodo`
      : `Vales de despensa por $${Number(prG.vales.valor).toFixed(2)} M.N. por periodo de pago`);
  }
  if (prG.primaDomPct > 0.25) adicG.push(`Prima dominical del ${(prG.primaDomPct*100).toFixed(0)}% (Art. 71 LFT, superior al mínimo)`);
  if (prG.factorHE > 2)       adicG.push(`Pago de horas extraordinarias a ${prG.factorHE} veces el salario por hora (Arts. 67-68 LFT, superior al mínimo)`);
  if (prG.festivos.length > 0) {
    adicG.push(`Días de descanso adicionales con goce de sueldo: ${prG.festivos.map(f => `${f.valor}${f.descripcion ? ' (' + f.descripcion + ')' : ''}`).join('; ')}`);
  }
  if (adicG.length > 0) {
    parrafo('SEXTA BIS. — PRESTACIONES ADICIONALES:', `Además de las prestaciones de ley, EL PATRON otorga: ${adicG.map((a,i) => String.fromCharCode(97+i) + ') ' + a).join('; ')}. Estas prestaciones no podrán ser inferiores a los mínimos de la Ley Federal del Trabajo.`);
  }

  parrafo('SEPTIMA. — OBLIGACIONES DEL TRABAJADOR:', `EL TRABAJADOR se obliga a: cumplir las disposiciones del Reglamento Interior de Trabajo; desempenar el servicio con la intensidad, cuidado y esmero apropiados; observar buenas costumbres; guardar los secretos técnicos y comerciales de EL PATRON; y acatar las medidas preventivas de seguridad e higiene (Art. 134 LFT).`);

  parrafo('OCTAVA. — CAUSAS DE RESCISIÓN:', `Cualquiera de las partes podrá rescindir el contrato sin responsabilidad por las causas establecidas en los artículos 47 y 51 de la Ley Federal del Trabajo respectivamente. EL PATRON realizara la rescisión conforme al procedimiento del artículo 47 de la LFT.`);

  parrafo('NOVENA. — DERECHO A LA DESCONEXION DIGITAL:', `Conforme a la reforma a la LFT 2026, EL TRABAJADOR tiene derecho a no atender mensajes, llamadas o correos electronicos fuera de su jornada laboral, en vacaciones o durante licencias, salvo caso de urgencia debidamente justificada.`);

  parrafo('DECIMA. — DISPOSICIÓN GENERAL:', `En todo lo no previsto en el presente contrato se estará a lo dispuesto por la Ley Federal del Trabajo vigente y demas ordenamientos aplicables. Ambas partes declaran leer, entender y aceptar el contenido de este contrato.`);

  // Firmas
  if (y + 60 > ph - 20) { doc.addPage(); y = 25; }
  y += 6;
  pdfSignatures(doc,
    `${empresa.nombre}${empresa.representante ? '\n' + empresa.representante : ''}`,
    `${trab.nombre}\n${trab.puesto || ''}`,
    y, ml, mr);

  _footerFolio(doc, ml, mr, folio, empresa.nombre);

  if (opts.asBlob) return doc.output('blob');
  doc.save(`contrato-${trab.nombre.replace(/\s+/g,'-').toLowerCase()}.pdf`);
  return doc;
}

// ─── CARTA DE RENUNCIA ────────────────────────────────────────────────────────
/**
 * Carta de renuncia — documento UNILATERAL del trabajador.
 *
 * No cita el Art. 51 LFT (la versión anterior sí lo hacía): ese artículo
 * regula la rescisión CON causa imputable al patrón por parte del
 * trabajador (el espejo del art. 47), no la renuncia simple — citarlo aquí
 * sugeriría, al revés de lo que el documento busca acreditar, que hubo una
 * causa atribuible a la empresa. Una renuncia sin causa no necesita
 * fundamento de rescisión: es el ejercicio ordinario de la libertad de
 * trabajo. Si ambas partes quieren dejar constancia firmada del cierre,
 * ese es el Convenio de Terminación (Art. 53 fracc. I y 33 LFT), no esta
 * carta.
 *
 * Ciudad, fecha y motivo se dejan en blanco para llenarse de puño y letra:
 * una renuncia con fecha y lugar ya impresos por el sistema de la empresa
 * antes de que el trabajador la firme sugiere que fue preparada por la
 * empresa, no redactada por decisión propia del trabajador — exactamente
 * lo contrario de lo que el documento pretende acreditar.
 */
function generateCartaRenuncia(empresa, trab, sucursal = null) {
  empresa = resolveUbicacion(empresa, sucursal);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  _registrarFuenteRoboto(doc);
  const ml = 25, mr = 25;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const tw = pw - ml - mr;
  const folio = `RENU-${Date.now().toString().slice(-7)}`;
  let y = pdfHeader(doc, 'CARTA DE RENUNCIA VOLUNTARIA', 'Documento unilateral del trabajador', ml, mr);

  doc.setFont('Roboto','normal'); doc.setFontSize(10); doc.setTextColor(60,60,60);
  doc.text('_______________________________, a _____ de _______________________ de __________', pw - mr, y, { align:'right' });
  y += 6;
  doc.setFontSize(7); doc.setTextColor(140,140,140);
  doc.text('(lugar y fecha — a llenar de puño y letra por el trabajador al momento de firmar)', pw - mr, y, { align:'right' });
  y += 10;

  doc.setFont('Roboto','bold'); doc.setFontSize(10); doc.setTextColor(20,20,20);
  doc.text(empresa.nombre.toUpperCase(), ml, y); y += 6;
  if (empresa.representante) { doc.setFont('Roboto','normal'); doc.text(`Attn.: ${empresa.representante}`, ml, y); y += 6; }
  if (empresa.domicilio) { doc.setFont('Roboto','normal'); doc.setFontSize(9); doc.setTextColor(80,80,80); doc.text(empresa.domicilio, ml, y); y += 6; }
  doc.setFont('Roboto','bold'); doc.setFontSize(10); doc.setTextColor(20,20,20);
  doc.text('P  R  E  S  E  N  T  E', ml, y); y += 12;

  doc.setFont('Roboto','normal'); doc.setFontSize(10); doc.setTextColor(40,40,40);
  const p1 = `Por medio del presente escrito, yo ${trab.nombre}, con RFC ${trab.rfc || 'N/A'} y CURP ${trab.curp || 'N/A'}, quien he prestado mis servicios como ${trab.puesto || 'empleado(a)'}${trab.departamento ? ' en el departamento de ' + trab.departamento : ''} en su empresa desde el ${npDate(trab.fecha_ingreso)}, me permito comunicarle mi decisión de presentar RENUNCIA VOLUNTARIA e irrevocable al cargo que venia desempenando, con efectos a partir del día ${npDate(trab.fecha_baja)}.`;
  let l = doc.splitTextToSize(p1, tw); doc.text(l, ml, y); y += l.length * 5.5 + 8;

  const p3 = `Manifiesto que no tengo adeudo alguno pendiente con la empresa por ningún concepto, y agradezco sinceramente la oportunidad de haber formado parte de su organización. Quedo en espera del pago de las prestaciones proporcionales correspondientes conforme a la Ley.`;
  l = doc.splitTextToSize(p3, tw); doc.text(l, ml, y); y += l.length * 5.5 + 10;

  // Espacio para el motivo, de puño y letra: un motivo escrito a mano por el
  // propio trabajador pesa mucho más como evidencia de voluntariedad que
  // cualquier texto impreso por el sistema de la empresa.
  if (y + 34 > ph - 20) { doc.addPage(); y = 25; }
  doc.setFont('Roboto','bold'); doc.setFontSize(9); doc.setTextColor(50,50,50);
  doc.text('Motivo de la separación (escribir de puno y letra):', ml, y); y += 8;
  doc.setDrawColor(190,190,190); doc.setLineWidth(0.3);
  for (let i = 0; i < 3; i++) { doc.line(ml, y, pw - mr, y); y += 8; }
  y += 4;

  doc.setFont('Roboto','normal'); doc.setFontSize(10); doc.setTextColor(40,40,40);
  doc.text('Sin otro particular, quedo de usted.', ml, y); y += 8;
  doc.setFont('Roboto','italic'); doc.text('A t e n t a m e n t e,', ml, y); y += 18;

  if (y + 40 > ph - 24) { doc.addPage(); y = 25; }
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  doc.line(ml, y, ml + 100, y); y += 5;
  doc.setFont('Roboto','bold'); doc.setFontSize(9); doc.setTextColor(30,30,30);
  doc.text(trab.nombre, ml, y); y += 5;
  doc.setFont('Roboto','normal'); doc.setFontSize(8); doc.setTextColor(80,80,80);
  if (trab.rfc)  { doc.text(`RFC: ${trab.rfc}`, ml, y); y += 4.5; }
  if (trab.curp) { doc.text(`CURP: ${trab.curp}`, ml, y); y += 4.5; }
  if (trab.nss)  { doc.text(`NSS: ${trab.nss}`, ml, y); y += 4.5; }
  y += 6;

  // Recomendación — no obligatoria, pero fortalece el valor probatorio de
  // un documento cuya autenticidad se puede impugnar después.
  const rec = 'Se recomienda firmar con huella digital y ante dos testigos identificados, y ratificar el finiquito correspondiente ante el Centro de Conciliacion competente (Art. 33 LFT) para dar mayor certeza jurídica a ambas partes.';
  if (y + 18 > ph - 20) { doc.addPage(); y = 25; }
  doc.setFillColor(248,248,252); doc.setDrawColor(210,210,215); doc.setLineWidth(0.3);
  const recLines = doc.splitTextToSize(rec, tw - 10);
  const recH = recLines.length * 4.4 + 8;
  doc.roundedRect(ml, y, tw, recH, 2, 2, 'FD');
  doc.setFont('Roboto','italic'); doc.setFontSize(7.8); doc.setTextColor(90,90,90);
  doc.text(recLines, ml + 5, y + 6);
  y += recH;

  _footerFolio(doc, ml, mr, folio, empresa.nombre);
  doc.save('carta-renuncia.pdf');
}

// ═══════════════════════════════════════════════════════════════════════════
//  AVISOS DE RESCISIÓN Y DE TERMINACIÓN
//
//  Sustituyen a generateAvisoRecision(), que mezclaba tres figuras jurídicas
//  incompatibles: se titulaba "TERMINACIÓN", se subtitulaba con el art. 53
//  fr. I (mutuo consentimiento) y en el cuerpo invocaba los arts. 49 y 50
//  anunciando el pago de una "indemnización". Los arts. 49 y 50 sólo operan
//  cuando el patrón YA PERDIÓ el juicio: son la regla de cuantificación de la
//  indemnización constitucional. Emitir un aviso invocándolos es confesar por
//  escrito, antes de todo litigio, que se despidió sin causa.
//
//  Cada figura tiene ahora su documento y su fundamento:
//    · Rescisión con causa imputable ......... art. 47      → A
//    · Negativa a recibir el aviso ........... art. 47 p.f. → B
//    · Aviso al Tribunal (5 días hábiles) .... art. 47 p.f. → C
//    · Terminación por agotarse la materia ... art. 53      → D
// ═══════════════════════════════════════════════════════════════════════════

/** Documento legal genérico (mismo marco visual que los contratos). */
function _initDocLegal(titulo, subtitulo, empresa, prefijoFolio) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  _registrarFuenteRoboto(doc);
  const ml = 25, mr = 25;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const tw = pw - ml - mr;
  const folio = `${prefijoFolio}-${Date.now().toString().slice(-7)}`;
  const state = { doc, ml, mr, pw, ph, tw, y: 0, folio };

  doc.setFillColor(15, 20, 40);
  doc.rect(0, 0, pw, 30, 'F');
  doc.setFont('Roboto','bold'); doc.setFontSize(11); doc.setTextColor(255,255,255);
  doc.text(empresa.nombre || '', pw/2, 10, { align:'center' });
  doc.setFont('Roboto','normal'); doc.setFontSize(7.5); doc.setTextColor(180,185,200);
  doc.text([empresa.rfc, empresa.domicilio].filter(Boolean).join('  |  '), pw/2, 18, { align:'center' });
  doc.setFillColor(21,128,61);
  doc.rect(ml - 2, 24, pw - ml - mr + 4, 12, 'F');
  doc.setFont('Roboto','bold'); doc.setFontSize(9); doc.setTextColor(15, 20, 40);
  doc.text(titulo.toUpperCase(), pw/2, 31.5, { align:'center' });
  state.y = 42;

  doc.setFont('Roboto','normal'); doc.setFontSize(8); doc.setTextColor(110,110,110);
  doc.text(subtitulo, pw/2, state.y, { align:'center' });
  state.y += 10;
  return state;
}

/** Encabezado "Ciudad, a fecha" alineado a la derecha. */
function _ciudadFecha(state, ciudad, fechaISO) {
  const { doc, pw, mr } = state;
  doc.setFont('Roboto','normal'); doc.setFontSize(9.5); doc.setTextColor(60,60,60);
  doc.text(`${ciudad}, a ${formatDateLong(fechaISO)}`, pw - mr, state.y, { align:'right' });
  state.y += 12;
}

/** Bloque de firma con nombre, identificación y domicilio (para testigos). */
function _firmaConIdentificacion(state, rotulo, nombre, ine, domicilio, x, ancho) {
  const { doc } = state;
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  doc.line(x, state.y, x + ancho, state.y);
  let yy = state.y + 4.5;
  doc.setFont('Roboto','bold'); doc.setFontSize(7.5); doc.setTextColor(30,30,30);
  doc.text(rotulo, x, yy); yy += 4.2;
  doc.setFont('Roboto','normal'); doc.setFontSize(7.5); doc.setTextColor(70,70,70);
  const lineas = doc.splitTextToSize(nombre || '_______________________________', ancho);
  doc.text(lineas, x, yy); yy += lineas.length * 3.8;
  doc.setFontSize(6.8); doc.setTextColor(110,110,110);
  doc.text(`INE / Identificación: ${ine || '_____________________'}`, x, yy); yy += 3.6;
  const dl = doc.splitTextToSize(`Domicilio: ${domicilio || '_______________________________________'}`, ancho);
  doc.text(dl, x, yy);
  return yy + dl.length * 3.4;
}

/**
 * Dos testigos con nombre, INE y domicilio. Sin domicilio no se les puede citar
 * en juicio dos años después, que es cuando suele desahogarse la testimonial.
 */
function _bloqueTestigos(state, d) {
  _checkY(state, 46);
  const { doc, ml, tw } = state;
  doc.setFont('Roboto','bold'); doc.setFontSize(8); doc.setTextColor(80,80,80);
  doc.text('TESTIGOS DE ASISTENCIA', ml, state.y);
  state.y += 12;
  const colW = tw / 2 - 6;
  const y0 = state.y;
  const y1 = _firmaConIdentificacion(state, 'TESTIGO 1', d.testigo1_nombre, d.testigo1_ine, d.testigo1_domicilio, ml, colW);
  state.y = y0;
  const y2 = _firmaConIdentificacion(state, 'TESTIGO 2', d.testigo2_nombre, d.testigo2_ine, d.testigo2_domicilio, ml + colW + 12, colW);
  state.y = Math.max(y1, y2) + 8;
}

/** Pie con folio, página y razón social. Sin la nota de "carácter referencial". */
function _pieLegal(state, empresa) {
  _footerFolio(state.doc, state.ml, state.mr, state.folio, empresa.nombre);
}

function _nombreArchivo(base, trab) {
  return `${base}-${trab.nombre || ''.replace(/\s+/g,'-').toLowerCase()}.pdf`;
}

/** Salida uniforme: descarga o Blob, para que el Kit de defensa pueda empaquetar. */
function _salidaDoc(state, empresa, nombreArchivo, opts = {}) {
  _pieLegal(state, empresa);
  if (opts.asBlob) return state.doc.output('blob');
  state.doc.save(nombreArchivo);
  return state.doc;
}

// ─── A. AVISO DE RESCISIÓN — ART. 47 LFT ─────────────────────────────────────
/**
 * Aviso de rescisión con causa imputable al trabajador.
 *
 * El art. 47 exige que el aviso refiera CLARAMENTE la conducta o conductas que
 * motivan la rescisión y la fecha o fechas en que se cometieron. Por eso la
 * descripción circunstanciada y la fracción invocada son obligatorias: un aviso
 * genérico equivale a no darlo, y su falta presume la separación injustificada.
 *
 * @param {Object} datos  { fraccion_art47, descripcion_circunstanciada, evidencia,
 *                          fecha_efectos, domicilio_trabajador, testigo1_*, testigo2_* }
 */
function generateAvisoRescisionArt47(empresa, trab, datos = {}, sucursal = null, opts = {}) {
  empresa = resolveUbicacion(empresa, sucursal);
  _exigirCiudad(empresa.ciudad);

  const fraccion = String(datos.fraccion_art47 || '').trim();
  const literal  = typeof textoFraccionArt47 === 'function' ? textoFraccionArt47(fraccion) : null;
  if (!literal) {
    throw new Error(
      `Falta indicar la fracción del artículo 47 LFT que motiva la rescisión, o la ` +
      `capturada ("${fraccion || 'vacía'}") no existe. El aviso debe citar la fracción ` +
      `exacta y reproducir su texto: sin ella, la rescisión no se sostiene en juicio.`
    );
  }
  if (!String(datos.descripcion_circunstanciada || '').trim()) {
    throw new Error(
      'Falta la descripción circunstanciada de los hechos. El artículo 47 LFT exige ' +
      'que el aviso refiera claramente la conducta que motiva la rescisión y la fecha ' +
      'en que se cometió, con circunstancias de modo, tiempo y lugar.'
    );
  }

  const fechaEfectos = datos.fecha_efectos || trab.fecha_baja;
  const state = _initDocLegal(
    'Aviso de rescisión de la relación de trabajo',
    'Artículo 47 de la Ley Federal del Trabajo',
    empresa, 'AVR');

  _ciudadFecha(state, empresa.ciudad, fechaEfectos);

  // Destinatario — el domicilio es indispensable: si el trabajador se niega a
  // recibir, hay que proporcionárselo al Tribunal (art. 47, párrafo tercero).
  const { doc, ml } = state;
  doc.setFont('Roboto','bold'); doc.setFontSize(10); doc.setTextColor(20,20,20);
  doc.text(`C. ${(trab.nombre || '').toUpperCase()}`, ml, state.y); state.y += 5.5;
  doc.setFont('Roboto','normal'); doc.setFontSize(9); doc.setTextColor(60,60,60);
  if (trab.puesto) { doc.text(`Puesto: ${trab.puesto}`, ml, state.y); state.y += 4.6; }
  const domTrab = datos.domicilio_trabajador || trab.domicilio || '';
  const domLines = doc.splitTextToSize(`Domicilio: ${domTrab || '[NO REGISTRADO]'}`, state.tw);
  doc.text(domLines, ml, state.y); state.y += domLines.length * 4.6 + 2;
  doc.setFont('Roboto','bold'); doc.setFontSize(10); doc.setTextColor(20,20,20);
  doc.text('P R E S E N T E', ml, state.y); state.y += 10;

  _p(state, `Por medio del presente y con fundamento en el artículo 47, fracción ${fraccion}, de la Ley Federal del Trabajo, ${empresa.nombre} le comunica la RESCISIÓN DE LA RELACIÓN DE TRABAJO que nos vincula, SIN RESPONSABILIDAD PARA EL PATRON, con efectos a partir del ${npDate(fechaEfectos)}.`);

  _gap(state, 2);
  _p(state, 'CAUSA O CAUSAS QUE MOTIVAN LA RESCISIÓN:', { bold: true, fontSize: 9 });
  _p(state, datos.descripcion_circunstanciada, { indent: 3 });

  if (String(datos.evidencia || '').trim()) {
    _p(state, `Los hechos anteriores se acreditan con: ${datos.evidencia}`, { indent: 3 });
  }

  _p(state, `Dichos hechos actualizan la hipotesis prevista en el artículo 47, fracción ${fraccion}, de la Ley Federal del Trabajo, consistente en: "${literal}"`);

  _p(state, `Quedan a su disposición, en el domicilio de la empresa, las cantidades que le correspondan por concepto de partes proporcionales de las prestaciones generadas hasta la fecha de la separación.`);

  // Acuse — la prescripción de las acciones del trabajador no corre sino hasta
  // que recibe personalmente el aviso (art. 47, párrafo cuarto).
  _gap(state, 4);
  _checkY(state, 44);
  doc.setDrawColor(180,180,180); doc.setLineWidth(0.4);
  doc.setFillColor(250,250,252);
  doc.roundedRect(ml, state.y, state.tw, 36, 2, 2, 'FD');
  doc.setFont('Roboto','bold'); doc.setFontSize(8); doc.setTextColor(50,50,50);
  doc.text('ACUSE DE RECIBO', ml + 5, state.y + 7);
  doc.setFont('Roboto','normal'); doc.setFontSize(8.5); doc.setTextColor(40,40,40);
  doc.text('Recibi original del presente aviso el día ____ de ______________ de ______',
    ml + 5, state.y + 15);
  doc.text('a las ____:____ horas.', ml + 5, state.y + 21);
  doc.setDrawColor(150,150,150);
  doc.line(ml + 5, state.y + 31, ml + 78, state.y + 31);
  doc.setFontSize(7); doc.setTextColor(90,90,90);
  doc.text('Firma de EL TRABAJADOR', ml + 5, state.y + 34.5);
  doc.rect(state.tw - 24, state.y + 12, 26, 20);
  doc.setFontSize(6.5); doc.setTextColor(140,140,140);
  doc.text('Huella digital', state.tw - 23 + 13, state.y + 34.5, { align:'center' });
  state.y += 44;

  // Firma del patrón
  _checkY(state, 30);
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  doc.line(ml, state.y + 16, ml + 90, state.y + 16);
  doc.setFont('Roboto','bold'); doc.setFontSize(8); doc.setTextColor(30,30,30);
  doc.text('EL PATRON / REPRESENTANTE LEGAL', ml, state.y + 20.5);
  doc.setFont('Roboto','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80);
  doc.text(empresa.representante || empresa.nombre, ml, state.y + 25);
  state.y += 34;

  _bloqueTestigos(state, datos);

  return _salidaDoc(state, empresa, _nombreArchivo('aviso-rescisión-art47', trab), opts);
}

// ─── B. ACTA DE NEGATIVA A RECIBIR EL AVISO ──────────────────────────────────
/**
 * Se levanta cuando el trabajador se niega a recibir el aviso de rescisión.
 * Es el soporte del aviso al Tribunal del art. 47: sin ella, la negativa es un
 * dicho del patrón sin respaldo.
 */
function generateActaNegativaRecibirAviso(empresa, trab, datos = {}, sucursal = null, opts = {}) {
  empresa = resolveUbicacion(empresa, sucursal);
  _exigirCiudad(empresa.ciudad);

  const fecha = datos.fecha_negativa || datos.fecha_efectos || trab.fecha_baja;
  const state = _initDocLegal(
    'Acta circunstanciada de negativa a recibir el aviso de rescisión',
    'Artículo 47 de la Ley Federal del Trabajo',
    empresa, 'ANR');

  const { doc, ml } = state;
  const lugar = datos.lugar_exacto || empresa.domicilio || '';

  _p(state, `En ${lugar}, siendo las ${datos.hora_inicio || '____:____'} horas del día ${npDate(fecha)}, el suscrito ${empresa.representante || '[REPRESENTANTE]'}, en representación de ${empresa.nombre}, hace constar los hechos que a continuación se relacionan.`);

  _p(state, 'PERSONAS QUE INTERVIENEN:', { bold: true, fontSize: 9 });
  _table(state,
    [['Carácter','Nombre','INE / Identificación','Domicilio']],
    [
      ['Representante del patrón', empresa.representante || '', datos.representante_ine || '', datos.representante_domicilio || empresa.domicilio || ''],
      ['Trabajador',               trab.nombre || '',           trab.num_identificacion || '', datos.domicilio_trabajador || trab.domicilio || ''],
      ['Testigo 1',                datos.testigo1_nombre || '', datos.testigo1_ine || '',      datos.testigo1_domicilio || ''],
      ['Testigo 2',                datos.testigo2_nombre || '', datos.testigo2_ine || '',      datos.testigo2_domicilio || ''],
    ],
    { columnStyles: { 0:{ cellWidth:32, fontStyle:'bold' }, 1:{ cellWidth:44 }, 2:{ cellWidth:34 }, 3:{ cellWidth:52 } } }
  );

  _p(state, 'HECHOS:', { bold: true, fontSize: 9 });
  _p(state, `Encontrandose presente el C. ${trab.nombre}, quien se desempena como ${trab.puesto || ''}, se le hizo entrega material del AVISO DE RESCISIÓN DE LA RELACIÓN DE TRABAJO de esta misma fecha, fundado en el artículo 47, fracción ${datos.fraccion_art47 || '____'}, de la Ley Federal del Trabajo, dandole lectura integra a su contenido.`, { indent: 3 });

  _p(state, datos.narracion_negativa || 'Acto seguido, EL TRABAJADOR se NEGO a recibir el documento y a firmar el acuse correspondiente.', { indent: 3 });

  _p(state, 'MANIFESTACIÓN TEXTUAL DE EL TRABAJADOR:', { bold: true, fontSize: 9 });
  _p(state, `Se concede el uso de la voz a EL TRABAJADOR, quien manifiesta textualmente: "${datos.manifestacion_trabajador || '[EL TRABAJADOR NO MANIFESTO NADA]'}"`, { indent: 3 });

  _p(state, `Se hace constar que el ejemplar del aviso quedo a disposición de EL TRABAJADOR en el domicilio de la empresa, y que ${empresa.nombre} procedera a hacer del conocimiento del Tribunal Laboral competente la presente negativa, dentro de los cinco días habiles siguientes, proporcionando el último domicilio registrado de EL TRABAJADOR, en términos del artículo 47 de la Ley Federal del Trabajo.`);

  _p(state, `No habiendo mas hechos que hacer constar, se da por concluida la presente diligencia siendo las ${datos.hora_cierre || '____:____'} horas del día ${npDate(fecha)}, leyendose integramente la presente acta a los que en ella intervinieron, quienes manifiestan estar conformes con su contenido y firman al margen y al calce para constancia.`);

  _gap(state, 6);
  _checkY(state, 34);
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  const colW = state.tw / 2 - 6;
  doc.line(ml, state.y + 16, ml + colW, state.y + 16);
  doc.line(ml + colW + 12, state.y + 16, ml + colW + 12 + colW, state.y + 16);
  doc.setFont('Roboto','bold'); doc.setFontSize(8); doc.setTextColor(30,30,30);
  doc.text('EL PATRON / REPRESENTANTE', ml, state.y + 20.5);
  doc.text('EL TRABAJADOR (se nego a firmar)', ml + colW + 12, state.y + 20.5);
  doc.setFont('Roboto','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80);
  doc.text(empresa.representante || empresa.nombre, ml, state.y + 25);
  doc.text(trab.nombre || '', ml + colW + 12, state.y + 25);
  state.y += 34;

  _bloqueTestigos(state, datos);

  return _salidaDoc(state, empresa, _nombreArchivo('acta-negativa-aviso', trab), opts);
}

// ─── C. AVISO DE RESCISIÓN AL TRIBUNAL LABORAL ───────────────────────────────
/**
 * Escrito para hacer del conocimiento del Tribunal la rescisión cuando el
 * trabajador se negó a recibir el aviso.
 *
 * PLAZO FATAL: cinco días hábiles siguientes (art. 47). Vencido, la falta de
 * aviso presume la separación injustificada.
 */
function generateAvisoTribunalArt47(empresa, trab, datos = {}, sucursal = null, opts = {}) {
  empresa = resolveUbicacion(empresa, sucursal);
  _exigirCiudad(empresa.ciudad);

  const domTrab = datos.domicilio_trabajador || trab.domicilio || '';
  if (!String(domTrab).trim()) {
    throw new Error(
      'Falta el último domicilio registrado del trabajador. El artículo 47 LFT exige ' +
      'proporcionarlo al Tribunal para que la autoridad pueda notificar el aviso en ' +
      'forma personal; sin él, el escrito no cumple su finalidad.'
    );
  }

  const fechaResc = datos.fecha_efectos || trab.fecha_baja;
  const fraccion  = String(datos.fraccion_art47 || '').trim();
  const state = _initDocLegal(
    'Aviso de rescisión al Tribunal Laboral',
    'Artículo 47 de la Ley Federal del Trabajo',
    empresa, 'ATL');

  _ciudadFecha(state, empresa.ciudad, datos.fecha_presentacion_tribunal || new Date().toISOString().slice(0,10));

  const { doc, ml } = state;
  doc.setFont('Roboto','bold'); doc.setFontSize(10); doc.setTextColor(20,20,20);
  doc.text('C. JUEZ DEL TRIBUNAL LABORAL EN TURNO', ml, state.y); state.y += 5.5;
  doc.text('P R E S E N T E', ml, state.y); state.y += 10;

  _p(state, `${empresa.representante || '[REPRESENTANTE LEGAL]'}, en mi carácter de representante legal de ${empresa.nombre}, con Registro Federal de Contribuyentes ${empresa.rfc || '[RFC]'} y domicilio en ${empresa.domicilio || ''}, personalidad que acredito con ${datos.documento_personalidad || '[DOCUMENTO QUE ACREDITA LA PERSONALIDAD]'}, ante ese H. Tribunal comparezco y expongo:`);

  _p(state, `Que por medio del presente escrito, y con fundamento en el artículo 47 de la Ley Federal del Trabajo, vengo a hacer del conocimiento de ese H. Tribunal la RESCISIÓN DE LA RELACIÓN DE TRABAJO que mi representada sostenia con el C. ${trab.nombre}, así como la NEGATIVA de dicho trabajador a recibir el aviso correspondiente, para los efectos legales a que haya lugar.`);

  _p(state, 'DATOS DE LA RELACIÓN DE TRABAJO:', { bold: true, fontSize: 9 });
  _table(state, [['Concepto','Dato']], [
    ['Trabajador',                      trab.nombre || ''],
    ['CURP',                            trab.curp || ''],
    ['Número de Seguridad Social',      trab.nss || ''],
    ['Puesto',                          trab.puesto || ''],
    ['Fecha de ingreso',                trab.fecha_ingreso ? npDate(trab.fecha_ingreso) : ''],
    ['Fecha de la rescisión',           fechaResc ? npDate(fechaResc) : ''],
    ['Fracción del art. 47 invocada',   fraccion ? `Fracción ${fraccion}` : ''],
    ['ÚLTIMO DOMICILIO REGISTRADO',     domTrab],
  ], { columnStyles: { 0:{ cellWidth:62, fontStyle:'bold' } } });

  _p(state, `El último domicilio que mi representada tiene registrado del trabajador es el senalado en el cuadro que antecede, y se proporciona a fin de que ese H. Tribunal se sirva notificarle el aviso de rescisión en forma personal, conforme a lo dispuesto por el artículo 47 de la Ley Federal del Trabajo.`);

  _p(state, 'CAUSA DE LA RESCISIÓN:', { bold: true, fontSize: 9 });
  _p(state, datos.descripcion_circunstanciada || '[DESCRIPCIÓN CIRCUNSTANCIADA DE LOS HECHOS]', { indent: 3 });

  _p(state, 'ANEXOS:', { bold: true, fontSize: 9 });
  _p(state, '1. Copia del aviso de rescisión de la relación de trabajo.\n2. Acta circunstanciada de negativa a recibir el aviso.\n3. Documento con el que se acredita la personalidad del suscrito.', { indent: 3 });

  _p(state, 'Por lo anteriormente expuesto, a ese H. Tribunal atentamente pido se sirva:', { bold: true, fontSize: 9 });
  _p(state, `ÚNICO. Tener por presentado en tiempo y forma el aviso de rescisión a que se refiere el artículo 47 de la Ley Federal del Trabajo, y ordenar la notificación personal al trabajador en el domicilio senalado.`, { indent: 3 });

  _gap(state, 8);
  _p(state, 'PROTESTO LO NECESARIO', { bold: true, fontSize: 9 });
  _gap(state, 14);
  _checkY(state, 26);
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  doc.line(ml, state.y, ml + 95, state.y);
  doc.setFont('Roboto','bold'); doc.setFontSize(8); doc.setTextColor(30,30,30);
  doc.text(empresa.representante || '[REPRESENTANTE LEGAL]', ml, state.y + 5);
  doc.setFont('Roboto','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80);
  doc.text(`Representante legal de ${empresa.nombre}`, ml, state.y + 9.5);
  state.y += 20;

  // Acuse de la autoridad
  _checkY(state, 34);
  doc.setDrawColor(180,180,180); doc.setLineWidth(0.4);
  doc.setLineDash([2,2]);
  doc.rect(state.pw - state.mr - 70, state.y, 70, 28);
  doc.setLineDash([]);
  doc.setFontSize(6.8); doc.setTextColor(150,150,150);
  doc.text('Sello de recepción del Tribunal', state.pw - state.mr - 35, state.y + 15, { align:'center' });
  state.y += 34;

  return _salidaDoc(state, empresa, _nombreArchivo('aviso-tribunal-art47', trab), opts);
}

// ─── D. AVISO DE TERMINACIÓN — ART. 53 LFT ───────────────────────────────────
/**
 * Terminación por agotarse la materia del contrato. NO es una rescisión: no hay
 * conducta imputable al trabajador, y por eso este documento sí menciona el pago
 * de partes proporcionales. Nunca los arts. 49 ni 50.
 *
 * @param {Object} datos { fraccion_art53: 'III' | 'IV', ... }
 */
function generateAvisoTerminacionArt53(empresa, trab, datos = {}, sucursal = null, opts = {}) {
  empresa = resolveUbicacion(empresa, sucursal);
  _exigirCiudad(empresa.ciudad);

  const fr = String(datos.fraccion_art53 || 'III').trim().toUpperCase();
  const SUPUESTOS = {
    'III': {
      sub: 'Artículo 53 fracción III de la Ley Federal del Trabajo',
      txt: 'la conclusión de la obra o el vencimiento del término o inversión del capital, conforme a los artículos 36, 37 y 38 de la Ley Federal del Trabajo',
    },
    'IV': {
      sub: 'Artículo 53 fracción IV de la Ley Federal del Trabajo',
      txt: 'la incapacidad física o mental o inhabilidad manifiesta de EL TRABAJADOR que hace imposible la prestación del trabajo',
    },
  };
  const sup = SUPUESTOS[fr];
  if (!sup) {
    throw new Error(
      `La fracción del artículo 53 capturada ("${fr}") no corresponde a un supuesto ` +
      `de terminación documentable por aviso. Usa la fracción III (conclusión de la ` +
      `obra o vencimiento del término) o la IV (incapacidad física o mental). Si la ` +
      `separación obedece a una conducta del trabajador, el documento aplicable es el ` +
      `aviso de rescisión del artículo 47, no éste.`
    );
  }

  const fechaEfectos = datos.fecha_efectos || trab.fecha_baja;
  const state = _initDocLegal(
    'Aviso de terminación de la relación de trabajo',
    sup.sub, empresa, 'ATM');

  _ciudadFecha(state, empresa.ciudad, fechaEfectos);

  const { doc, ml } = state;
  doc.setFont('Roboto','bold'); doc.setFontSize(10); doc.setTextColor(20,20,20);
  doc.text(`C. ${(trab.nombre || '').toUpperCase()}`, ml, state.y); state.y += 5.5;
  doc.setFont('Roboto','normal'); doc.setFontSize(9); doc.setTextColor(60,60,60);
  if (trab.puesto) { doc.text(`Puesto: ${trab.puesto}`, ml, state.y); state.y += 4.6; }
  doc.setFont('Roboto','bold'); doc.setFontSize(10); doc.setTextColor(20,20,20);
  doc.text('P R E S E N T E', ml, state.y); state.y += 10;

  _p(state, `Por medio del presente, ${empresa.nombre} le comunica que la relación de trabajo que nos vincula concluye con efectos a partir del ${npDate(fechaEfectos)}, por actualizarse el supuesto previsto en el artículo 53, fracción ${fr}, de la Ley Federal del Trabajo, consistente en ${sup.txt}.`);

  if (String(datos.motivo_detalle || '').trim()) {
    _p(state, datos.motivo_detalle, { indent: 3 });
  }

  _p(state, `La presente conclusión no obedece a causa imputable a usted ni constituye sanción alguna. Quedan a su disposición, en el domicilio de la empresa, las cantidades que le corresponden por concepto de partes proporcionales de aguinaldo, vacaciones y prima vacacional generadas hasta la fecha senalada, así como la prima de antiguedad en los términos del artículo 162 de la Ley Federal del Trabajo.`);

  _p(state, `Se agradece a usted el desempeno prestado durante la vigencia de la relación de trabajo.`);

  _gap(state, 4);
  _checkY(state, 40);
  doc.setDrawColor(180,180,180); doc.setLineWidth(0.4);
  doc.setFillColor(250,250,252);
  doc.roundedRect(ml, state.y, state.tw, 32, 2, 2, 'FD');
  doc.setFont('Roboto','bold'); doc.setFontSize(8); doc.setTextColor(50,50,50);
  doc.text('ACUSE DE RECIBO', ml + 5, state.y + 7);
  doc.setFont('Roboto','normal'); doc.setFontSize(8.5); doc.setTextColor(40,40,40);
  doc.text('Recibi original del presente aviso el día ____ de ______________ de ______',
    ml + 5, state.y + 15);
  doc.setDrawColor(150,150,150);
  doc.line(ml + 5, state.y + 26, ml + 78, state.y + 26);
  doc.setFontSize(7); doc.setTextColor(90,90,90);
  doc.text('Firma de EL TRABAJADOR', ml + 5, state.y + 29.5);
  state.y += 40;

  _checkY(state, 30);
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  doc.line(ml, state.y + 16, ml + 90, state.y + 16);
  doc.setFont('Roboto','bold'); doc.setFontSize(8); doc.setTextColor(30,30,30);
  doc.text('EL PATRON / REPRESENTANTE LEGAL', ml, state.y + 20.5);
  doc.setFont('Roboto','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80);
  doc.text(empresa.representante || empresa.nombre, ml, state.y + 25);
  state.y += 34;

  _bloqueTestigos(state, datos);

  return _salidaDoc(state, empresa, _nombreArchivo('aviso-terminación-art53', trab), opts);
}

/**
 * @deprecated Eliminada. Mezclaba rescisión (art. 47), terminación (art. 53) e
 * indemnización por despido injustificado (arts. 49-50) en un solo documento.
 * No se conserva un alias funcional a propósito: seguir emitiendo aquel PDF es
 * peor que fallar, porque equivale a confesar un despido injustificado.
 */
function generateAvisoRecision() {
  throw new Error(
    'El "Aviso de Rescisión" anterior fue retirado porque invocaba los artículos 49 ' +
    'y 50 de la LFT, que sólo operan cuando el patrón ya perdió el juicio, y anunciaba ' +
    'el pago de una indemnización. Usa el documento que corresponda: ' +
    'generateAvisoRescisionArt47 (causa imputable al trabajador), ' +
    'generateAvisoTerminacionArt53 (conclusión de obra, vencimiento del término o ' +
    'incapacidad), generateActaNegativaRecibirAviso o generateAvisoTribunalArt47.'
  );
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
  _registrarFuenteRoboto(doc);
  const ml = 25, mr = 25;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const tw = pw - ml - mr;

  const isLiq  = result.type === 'liquidacion';
  const tipo   = isLiq ? 'LIQUIDACION' : 'FINIQUITO';
  const folio  = `${isLiq ? 'LIQ' : 'FIN'}-${Date.now().toString().slice(-6)}`;
  let y        = 0;

  // ── helper: salto de página si no cabe ──────────────────────────────────
  const ck = (n = 20) => { if (y + n > ph - 20) { doc.addPage(); y = 22; } };

  // ══════════════════════════════════════════════════════════════════════
  // 1. ENCABEZADO
  // ══════════════════════════════════════════════════════════════════════
  // Banda oscura
  doc.setFillColor(15, 20, 40);
  doc.rect(0, 0, pw, 36, 'F');
  // Razón Social dorada
  doc.setFont('Roboto','bold'); doc.setFontSize(12); doc.setTextColor(21,128,61);
  doc.text(empresa.nombre, pw/2, 11, { align:'center' });
  // RFC + domicilio
  doc.setFont('Roboto','normal'); doc.setFontSize(7.5); doc.setTextColor(180,185,200);
  const subhdr = [empresa.rfc, empresa.domicilio || empresa.ciudad].filter(Boolean).join('  |  ');
  doc.text(subhdr, pw/2, 18, { align:'center' });
  // Título del documento
  doc.setFontSize(11); doc.setFont('Roboto','bold'); doc.setTextColor(255,255,255);
  doc.text(`RECIBO DE ${tipo}`, pw/2, 30, { align:'center' });
  y = 42;

  // Folio a la derecha
  doc.setFont('Roboto','normal'); doc.setFontSize(8); doc.setTextColor(120,120,120);
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
  doc.setFont('Roboto','bold'); doc.setFontSize(7); doc.setTextColor(150,150,150);
  doc.text('EL PATRON', ml + 3, y + 5);
  doc.text('EL TRABAJADOR', mid + 3, y + 5);

  // Patrón
  doc.setFont('Roboto','bold'); doc.setFontSize(9.5); doc.setTextColor(20,20,20);
  const patronLines = doc.splitTextToSize(empresa.nombre, colW - 4);
  doc.text(patronLines, ml + 3, y + 11);
  let yp = y + 11 + patronLines.length * 5;
  doc.setFont('Roboto','normal'); doc.setFontSize(8); doc.setTextColor(80,80,80);
  if (empresa.rfc)          { doc.text(`RFC: ${empresa.rfc}`,          ml+3, yp); yp += 4.5; }
  if (empresa.representante){ doc.text(`Rep.: ${empresa.representante}`,ml+3, yp); yp += 4.5; }
  if (empresa.domicilio)    { const dl2 = doc.splitTextToSize(empresa.domicilio, colW-4); doc.text(dl2, ml+3, yp); }

  // Trabajador
  doc.setFont('Roboto','bold'); doc.setFontSize(9.5); doc.setTextColor(20,20,20);
  doc.text(trab.nombre, mid + 3, y + 11);
  let yw = y + 17;
  doc.setFont('Roboto','normal'); doc.setFontSize(8); doc.setTextColor(80,80,80);
  if (trab.rfc)        { doc.text(`RFC: ${trab.rfc}`,          mid+3, yw); yw += 4.2; }
  if (trab.curp)       { doc.text(`CURP: ${trab.curp}`,        mid+3, yw); yw += 4.2; }
  if (trab.nss)        { doc.text(`NSS: ${trab.nss}`,          mid+3, yw); yw += 4.2; }
  if (trab.puesto)     { doc.text(`Puesto: ${trab.puesto}`,     mid+3, yw); yw += 4.2; }
  if (trab.departamento){ doc.text(`Area: ${trab.departamento}`, mid+3, yw); }

  y += rowH + 10;

  // ══════════════════════════════════════════════════════════════════════
  // 3. DATOS DE LA RELACIÓN LABORAL
  // ══════════════════════════════════════════════════════════════════════
  // La zona y el importe salen del salario mínimo con que REALMENTE se calculó,
  // no de literales: el recibo se firma y antes imprimía cifras de 2025.
  const smgFrontera = (() => { try { return _smgVigente('frontera'); } catch { return null; } })();
  const smgLabel    = (smgFrontera !== null && result.smg === smgFrontera)
    ? `Frontera Norte (${fmt(result.smg)})`
    : `Area General (${fmt(result.smg)})`;
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
      ['Antiguedad (años completos)', String(result.completed),
       'Antiguedad (fracción)',      result.frac.toFixed(4)],
      [`Salario ${periodoLbl.toLowerCase()}`, fmt(trab.salario_mensual || result.salario),
       'Periodo de pago',           periodoLbl],
      ['Salario diario',            fmt(result.daily),
       'SDI (Sal. Diario Integrado)',fmt(result.sdi)],
      ['Zona SMG',                  smgLabel,
       'Tope prima antiguedad',     topeLabel],
      ['Días laborados (total)',    `${result.diasLaborados} dias`,
       `Días laborados en ${new Date(trab.fecha_baja+'T00:00:00').getFullYear()}`, `${result.diasEnAnio} dias`],
      ['Centro de trabajo',         centroTrab,
       'Ciudad',                    ciudadTrab],
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
  // 4. TABLA DE CONCEPTOS — con fundamento y periodo de devengo de cada uno
  // ══════════════════════════════════════════════════════════════════════
  doc.autoTable({
    startY: y, margin: { left:ml, right:mr },
    head: [['Concepto', 'Periodo', 'Calculo', 'Importe']],
    body: result.items.map(item => [
      item.fundamento ? `${item.name} (${item.fundamento})` : item.name,
      item.periodo || '',
      item.calc,
      fmt(item.amount),
    ]),
    foot: [['', '', 'TOTAL', fmt(result.total)]],
    styles:      { fontSize:8.3, cellPadding:3, textColor:[40,40,40] },
    headStyles:  { fillColor:[15,36,56], textColor:[21,128,61], fontStyle:'bold', fontSize:8.5 },
    footStyles:  { fillColor:[15,36,56], textColor:[21,128,61], fontStyle:'bold', fontSize:11 },
    alternateRowStyles: { fillColor:[248,248,252] },
    columnStyles:{
      0:{ cellWidth:52, fontStyle:'bold' },
      1:{ cellWidth:34, textColor:[100,100,100], fontSize:7.3 },
      2:{ cellWidth:50, textColor:[100,100,100], fontSize:7.8 },
      3:{ cellWidth:30, halign:'right', fontStyle:'bold' },
    },
    theme: 'grid',
    didParseCell: (data) => {
      // Resaltar conceptos con importe 0 en gris
      if (data.section === 'body' && data.column.index === 3 && data.cell.raw === fmt(0)) {
        data.cell.styles.textColor = [180,180,180];
      }
    },
  });
  y = doc.lastAutoTable.finalY + 12;

  // ══════════════════════════════════════════════════════════════════════
  // 5. RECUADRO ISR — conceptos indemnizatorios (indemnización constitucional,
  // 20 días por año y/o prima de antigüedad), en finiquito o en liquidación
  // ══════════════════════════════════════════════════════════════════════
  const montoIndemnizatorio = result.items
    .filter(it => it.tratoFiscal && it.tratoFiscal.startsWith('Exento'))
    .reduce((s, it) => s + it.amount, 0);
  if (montoIndemnizatorio > 0) {
    // Art. 93 fr. XIII LISR — la exención equivale a 90 veces la UMA (no el
    // salario mínimo: desde el desindexamiento de 2016 el SM dejó de ser unidad
    // de referencia fiscal) por cada año de servicio, y toda fracción mayor a
    // seis meses se computa como año completo.
    const uma            = _umaVigente();
    const anioUma        = new Date().getFullYear();
    const aniosComputables = result.frac - result.completed > 0.5
      ? result.completed + 1
      : result.completed;
    const aniosExencion  = Math.max(aniosComputables, 1);
    const topeExencion   = 90 * uma * aniosExencion;
    const montoExento    = Math.min(montoIndemnizatorio, topeExencion);
    const isrTxt = `NOTA FISCAL — ART. 93 FRACC. XIII LISR: Los pagos por concepto de indemnización, prima de antiguedad y retiro pueden estar exentos de ISR hasta por el equivalente a 90 veces la UMA por cada año de servicio, computandose como año completo toda fracción mayor a seis meses. De los ${fmt(montoIndemnizatorio)} pagados por estos conceptos en el presente recibo, la exención estimada es de ${fmt(montoExento)} (tope: ${aniosExencion} año(s) computable(s) × 90 × ${fmt(uma)} UMA diaria vigente ${anioUma}). El excedente, si lo hubiere, esta sujeto a retención de ISR. Consulte a su contador para el calculo definitivo antes de efectuar el pago.`;
    ck(28);
    const isrLines = doc.splitTextToSize(isrTxt, tw - 10);
    const isrH = isrLines.length * 4.8 + 10;
    doc.setFillColor(255, 248, 225); doc.setDrawColor(21,128,61); doc.setLineWidth(0.5);
    doc.roundedRect(ml, y, tw, isrH, 2, 2, 'FD');
    doc.setFont('Roboto','normal'); doc.setFontSize(8); doc.setTextColor(100,60,0);
    doc.text(isrLines, ml + 5, y + 7);
    y += isrH + 10;
  }

  // ══════════════════════════════════════════════════════════════════════
  // 6. DECLARACIÓN LEGAL
  //
  // El recibo acredita el PAGO de los conceptos desglosados en la tabla; no
  // es un finiquito "total y absoluto" ni una renuncia a reclamar conceptos
  // NO incluidos aquí (esa renuncia sería nula de pleno derecho: Art. 5o.
  // fracc. XIII LFT). Citar los Arts. 50, 76, 80, 87 y 162 en la declaración
  // — como hacía la versión anterior — no aporta nada (esos artículos ya
  // fundamentan cada concepto en la tabla) y en el caso del Art. 50 sugiere
  // indebidamente que el trabajador declara aceptar una indemnización
  // constitucional también en el FINIQUITO, donde no existe tal concepto.
  // Si las partes quieren cerrar el asunto con efecto de cosa juzgada, el
  // vehículo correcto es el Convenio de Terminación ratificado ante el
  // Centro de Conciliación (Art. 33 LFT), no esta declaración de pago.
  // ══════════════════════════════════════════════════════════════════════
  ck(36);
  const ciudad    = empresa.ciudad || '[CIUDAD]';
  const fechaBaja = npDate(trab.fecha_baja);
  const totalFmt  = fmt(result.total);
  // Redondear primero a centavos evita que el error de punto flotante empuje
  // valores como 99.995 a un "100/100" de tres dígitos.
  const totalRedondeado = Math.round(result.total * 100) / 100;
  const totalEntero = Math.floor(totalRedondeado + 1e-9);
  const centavosNum = Math.round((totalRedondeado - totalEntero) * 100);
  const centavos  = String(centavosNum === 100 ? 0 : centavosNum).padStart(2, '0');
  const totalLetr = numToWords(centavosNum === 100 ? totalEntero + 1 : totalEntero);

  const declTxt1 = `En la Ciudad de ${ciudad}, a ${fechaBaja}, el C. ${trab.nombre}, con RFC ${trab.rfc||'N/A'}, declara haber recibido de ${empresa.nombre} la cantidad de ${totalFmt} (${totalLetr} PESOS ${centavos}/100 M.N.) por los conceptos desglosados en el presente recibo, correspondientes a las prestaciones generadas durante la relación de trabajo que concluyo el ${fechaBaja}.`;
  const declTxt2 = `El presente documento acredita el pago de los conceptos que en el se detallan. No constituye renuncia de derechos, la cual seria nula en términos del artículo 5o. fracción XIII de la Ley Federal del Trabajo.`;

  doc.setFont('Roboto','normal'); doc.setFontSize(9.5); doc.setTextColor(30,30,30);
  const dLines1 = doc.splitTextToSize(declTxt1, tw);
  const dLines2 = doc.splitTextToSize(declTxt2, tw);
  ck(dLines1.length * 5.4 + dLines2.length * 5.4 + 12);
  doc.text(dLines1, ml, y, { lineHeightFactor:1.5 });
  y += dLines1.length * 5.4 + 6;
  doc.text(dLines2, ml, y, { lineHeightFactor:1.5 });
  y += dLines2.length * 5.4 + 8;

  // ══════════════════════════════════════════════════════════════════════
  // 7. FIRMAS (3 bloques: Patrón | Trabajador | Testigo)
  // ══════════════════════════════════════════════════════════════════════
  ck(72);
  y += 6;
  const sigW = tw / 3 - 6;
  const c1 = ml, c2 = ml + sigW + 9, c3 = ml + (sigW + 9) * 2;

  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  [c1, c2, c3].forEach(cx => doc.line(cx, y + 22, cx + sigW, y + 22));

  doc.setFont('Roboto','bold'); doc.setFontSize(7.5); doc.setTextColor(30,30,30);
  doc.text('EL PATRON / REP. LEGAL', c1 + sigW/2, y + 27, {align:'center'});
  doc.text('EL TRABAJADOR',          c2 + sigW/2, y + 27, {align:'center'});
  doc.text('TESTIGO',                c3 + sigW/2, y + 27, {align:'center'});

  doc.setFont('Roboto','normal'); doc.setFontSize(7); doc.setTextColor(100,100,100);
  doc.text(empresa.nombre,              c1 + sigW/2, y + 32, {align:'center'});
  if (empresa.representante) doc.text(empresa.representante, c1 + sigW/2, y + 36, {align:'center'});
  doc.text(trab.nombre,                 c2 + sigW/2, y + 32, {align:'center'});
  if (trab.rfc) doc.text(`RFC: ${trab.rfc}`, c2 + sigW/2, y + 36, {align:'center'});

  y += 50;

  // ══════════════════════════════════════════════════════════════════════
  // 8. PIE DE PÁGINA EN TODAS LAS HOJAS
  // ══════════════════════════════════════════════════════════════════════
  _footerFolio(doc, ml, mr, folio, empresa.nombre);

  doc.save(`recibo-${isLiq ? 'liquidacion' : 'finiquito'}-${trab.nombre||''.replace(/\s+/g,'-').toLowerCase()}.pdf`);
}

// ─── CONVENIO DE TERMINACIÓN — ART. 33 LFT ───────────────────────────────────
/**
 * El recibo de finiquito/liquidación (generateRecibo) acredita el PAGO; no
 * cierra el asunto con efecto de cosa juzgada porque un documento firmado
 * sólo por las partes puede ser impugnado en cuanto contenga renuncia de
 * derechos (Art. 33, párrafo tercero, LFT). Este convenio es el instrumento
 * que sí lo hace: contiene la "relación circunstanciada de los hechos que lo
 * motiven y de los derechos comprendidos en él" que exige el Art. 33, párrafo
 * segundo, LFT, para poder ser RATIFICADO ante el Centro de Conciliación —
 * momento en el que adquiere el efecto de cosa juzgada que el recibo, por sí
 * solo, no tiene.
 *
 * @param {Object} datos
 * @param {'injustificada'|'renuncia'|'justificada'} datos.motivo
 * @param {string} [datos.fraccion_art47]        Obligatoria si motivo === 'justificada'
 * @param {string} [datos.fecha_aviso]            Fecha del aviso de rescisión ya emitido
 * @param {string} [datos.fecha_efectos]          Default: trab.fecha_baja
 * @param {string} [datos.forma_pago]
 * @param {string} [datos.fecha_pago]             Default: fecha_efectos
 * @param {string} [datos.representante_documento] Poder con el que se ostenta el representante
 * @param {string} [datos.trabajador_identificacion]
 * @param {string} [datos.testigo1_nombre|_ine|_domicilio]
 * @param {string} [datos.testigo2_nombre|_ine|_domicilio]
 */
function generateConvenioTerminacion(empresa, trab, result, datos = {}, sucursal = null, opts = {}) {
  empresa = resolveUbicacion(empresa, sucursal);
  _exigirCiudad(empresa.ciudad);

  const motivo = String(datos.motivo || '').trim();
  if (!['injustificada','renuncia','justificada'].includes(motivo)) {
    throw new Error(
      'Falta indicar el motivo de la terminación (injustificada, renuncia o ' +
      'justificada) para redactar la cláusula PRIMERA del convenio: el fundamento ' +
      'legal de la terminación cambia según el motivo y no puede aproximarse.'
    );
  }
  if (motivo === 'justificada' && !String(datos.fraccion_art47 || '').trim()) {
    throw new Error(
      'Falta la fracción del artículo 47 LFT invocada en el aviso de rescisión. ' +
      'El convenio debe referirse a la misma causa ya notificada al trabajador.'
    );
  }

  const fechaEfectos = datos.fecha_efectos || trab.fecha_baja;
  const fechaPago     = datos.fecha_pago || fechaEfectos;

  const state = _initDocLegal(
    'Convenio de Terminación de la Relación de Trabajo',
    'Para ratificación ante el Centro de Conciliación — Artículo 33 de la Ley Federal del Trabajo',
    empresa, 'CVT');

  _ciudadFecha(state, empresa.ciudad, fechaEfectos);

  // ── COMPARECIENTES ──────────────────────────────────────────────────────
  const { doc, ml, tw } = state;
  doc.setFont('Roboto','bold'); doc.setFontSize(9); doc.setTextColor(21,128,61);
  doc.text('COMPARECIENTES', ml, state.y); state.y += 7;
  _p(state, `EL PATRÓN: ${empresa.nombre}, representada en este acto por ${empresa.representante || '_______________________________'}.`, { indent: 3 });
  _p(state, `EL TRABAJADOR: ${trab.nombre}${trab.rfc ? `, RFC ${trab.rfc}` : ''}${trab.curp ? `, CURP ${trab.curp}` : ''}.`, { indent: 3 });
  _gap(state, 2);

  // ── DECLARACIONES — relación circunstanciada que exige el Art. 33 LFT ──
  doc.setFont('Roboto','bold'); doc.setFontSize(9); doc.setTextColor(21,128,61);
  doc.text('DECLARACIONES', ml, state.y); state.y += 7;

  _p(state, 'I. DECLARA "EL PATRÓN":', { bold: true, fontSize: 9 });
  _p(state, `Que es la parte patronal de la relación de trabajo que por este medio se da por terminada, con Registro Federal de Contribuyentes ${empresa.rfc || 'N/A'} y domicilio en ${empresa.domicilio || '[DOMICILIO]'}, y que para efectos de este acto se encuentra representada por ${empresa.representante || '_______________________________'}, según consta en ${datos.representante_documento || '_______________________________'}.`, { indent: 3 });

  const periodoMap = { mensual:'mensual', quincenal:'quincenal', semanal:'semanal' };
  const periodoLbl = periodoMap[result?.periodoSalario] || 'mensual';
  const centroTrabajo = sucursal?.nombre ? `${sucursal.nombre} (${empresa.ciudad})` : `Matriz (${empresa.ciudad})`;
  const jornadaTexto = (trab.hora_inicio && trab.hora_fin && Array.isArray(trab.dias_semana) && trab.dias_semana.length)
    ? `de ${trab.hora_inicio} a ${trab.hora_fin} horas, los días ${trab.dias_semana.join(', ')}${trab.dia_descanso ? `, con descanso semanal el ${trab.dia_descanso}` : ''}`
    : 'la pactada en su contrato individual de trabajo';

  _p(state, 'II. DECLARA "EL TRABAJADOR":', { bold: true, fontSize: 9 });
  _p(state, `Que prestó sus servicios personales subordinados a favor de EL PATRÓN desde el ${npDate(trab.fecha_ingreso)} hasta el ${npDate(fechaEfectos)}, desempeñando el puesto de ${trab.puesto || '_______________'}, con un salario ${periodoLbl} de ${fmt(result?.salario || 0)}${result?.sdi ? ` y un Salario Diario Integrado de ${fmt(result.sdi)}` : ''}, dentro de una jornada ${jornadaTexto}, en el centro de trabajo ubicado en ${centroTrabajo}. Que se identifica con ${datos.trabajador_identificacion || '_______________________________'}.`, { indent: 3 });

  _p(state, 'III. DECLARAN AMBAS PARTES:', { bold: true, fontSize: 9 });
  _p(state, 'Que es su voluntad dar por terminada la relación de trabajo en los términos precisados en la cláusula PRIMERA siguiente, sujetarse a las demás cláusulas de este convenio, y solicitar su ratificación ante el Centro de Conciliación competente, en términos del artículo 33 de la Ley Federal del Trabajo.', { indent: 3 });
  _gap(state, 3);

  doc.setFont('Roboto','bold'); doc.setFontSize(9); doc.setTextColor(21,128,61);
  _checkY(state, 12);
  doc.text('CLAUSULAS', ml, state.y); state.y += 8;

  // ── PRIMERA — motivo y fecha, redactado según lo que realmente ocurrió ──
  const textosMotivo = {
    injustificada: `Las partes convienen en dar por terminada la relación de trabajo que las vinculó, por decisión unilateral de EL PATRÓN y sin que medie causa imputable a EL TRABAJADOR, en los términos del artículo 50 de la Ley Federal del Trabajo, con efectos a partir del ${npDate(fechaEfectos)}.`,
    renuncia: `Las partes convienen en dar por terminada la relación de trabajo que las vinculó por mutuo consentimiento, en términos del artículo 53, fracción I, de la Ley Federal del Trabajo, en virtud de que EL TRABAJADOR manifestó su voluntad de separarse del empleo y EL PATRÓN la acepta, con efectos a partir del ${npDate(fechaEfectos)}.`,
    justificada: `Las partes reconocen que la relación de trabajo concluyó por rescisión sin responsabilidad para EL PATRÓN, con fundamento en el artículo 47, fracción ${String(datos.fraccion_art47)}, de la Ley Federal del Trabajo${datos.fecha_aviso ? `, conforme al aviso de rescisión de fecha ${npDate(datos.fecha_aviso)}` : ''}, con efectos a partir del ${npDate(fechaEfectos)}. El presente convenio no modifica ni sustituye la causa de la rescisión ya notificada; tiene por único objeto dejar constancia de los montos que se cubren a EL TRABAJADOR y solicitar la ratificación de este instrumento.`,
  };
  _hOrdinal(state, 'PRIMERA', 'Terminación de la relación de trabajo');
  _p(state, textosMotivo[motivo]);

  // ── SEGUNDA — tabla de conceptos, con $0 incluidos para dejar constancia ──
  _hOrdinal(state, 'SEGUNDA', 'Monto y conceptos');
  _p(state, 'Como consecuencia de la terminación de la relación de trabajo, EL PATRÓN cubre a EL TRABAJADOR las prestaciones que se detallan a continuación, incluyendo aquellos conceptos que no generaron importe, a efecto de dejar constancia de que fueron revisados:');
  const items = Array.isArray(result?.items) ? result.items : [];
  _table(state,
    [['Concepto', 'Fundamento', 'Periodo', 'Importe']],
    items.map(it => [it.name, it.fundamento || '', it.periodo || '', fmt(it.amount)]),
    {
      foot: [['', '', 'TOTAL', fmt(result?.total || 0)]],
      footStyles: { fillColor:[15,36,56], textColor:[21,128,61], fontStyle:'bold', fontSize:9.5 },
      columnStyles: { 0:{cellWidth:48,fontStyle:'bold'}, 1:{cellWidth:34,fontSize:7.3}, 2:{cellWidth:44,fontSize:7.3}, 3:{cellWidth:26,halign:'right',fontStyle:'bold'} },
    }
  );

  // ── TERCERA — forma y fecha de pago ─────────────────────────────────────
  _hOrdinal(state, 'TERCERA', 'Forma y fecha de pago');
  _p(state, `El pago de la cantidad señalada en la cláusula anterior se realiza mediante ${datos.forma_pago || '_______________________________'}, con fecha ${npDate(fechaPago)}.`);

  // ── CUARTA — voluntariedad y alcance de la renuncia (limitado, Art. 33) ──
  _hOrdinal(state, 'CUARTA', 'Voluntariedad y alcance');
  _p(state, 'Ambas partes manifiestan que el contenido del presente convenio les fue leído y explicado en su totalidad, que lo celebran libres de dolo, mala fe, violencia o cualquier otro vicio del consentimiento, y que comprenden su alcance. El presente convenio comprende única y exclusivamente los conceptos y montos detallados en la cláusula SEGUNDA; no implica renuncia de EL TRABAJADOR a derechos, prestaciones o acciones distintas de las aquí expresamente comprendidas, en términos del artículo 33 de la Ley Federal del Trabajo.');

  // ── QUINTA — solicitud de ratificación ──────────────────────────────────
  _hOrdinal(state, 'QUINTA', 'Ratificación ante el Centro de Conciliación');
  _p(state, 'Las partes solicitan expresamente que el presente convenio sea ratificado ante el Centro de Conciliación competente, a elección de EL TRABAJADOR entre el correspondiente al lugar de celebración del contrato, al domicilio de cualquiera de las partes o al lugar de prestación de los servicios, en términos del artículo 700, fracción II, de la Ley Federal del Trabajo, a efecto de que este convenio surta los efectos de cosa juzgada previstos en el artículo 33, párrafo segundo, de la misma Ley.');

  // ── Espacio reservado para el Centro de Conciliación ────────────────────
  _recuadro(state, 'PARA USO EXCLUSIVO DEL CENTRO DE CONCILIACIÓN O TRIBUNAL — Sello, número de expediente, fecha de ratificación y firma del funcionario que ratifica:');
  _gap(state, 14);

  // ── FIRMAS ───────────────────────────────────────────────────────────────
  _checkY(state, 40);
  const sigW = tw / 2 - 8;
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  doc.line(ml, state.y + 16, ml + sigW, state.y + 16);
  doc.line(ml + sigW + 16, state.y + 16, ml + sigW + 16 + sigW, state.y + 16);
  doc.setFont('Roboto','bold'); doc.setFontSize(8); doc.setTextColor(30,30,30);
  doc.text('EL PATRON / REPRESENTANTE LEGAL', ml, state.y + 20.5);
  doc.text('EL TRABAJADOR', ml + sigW + 16, state.y + 20.5);
  doc.setFont('Roboto','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80);
  doc.text(empresa.representante || empresa.nombre, ml, state.y + 25);
  doc.text(trab.nombre, ml + sigW + 16, state.y + 25);
  state.y += 34;

  _bloqueTestigos(state, datos);

  return _salidaDoc(state, empresa, _nombreArchivo('convenio-terminación', trab), opts);
}

// ═══════════════════════════════════════════════════════════════════════════
//  PERIODO A PRUEBA — COMISIÓN MIXTA DE PRODUCTIVIDAD (Arts. 39-A y 39-B LFT)
//
//  Los arts. 39-A y 39-B condicionan la terminación al término del periodo a
//  prueba o de la capacitación inicial a que se haga "a juicio del patrón,
//  tomando en cuenta la opinión de la Comisión Mixta de Productividad,
//  Capacitación y Adiestramiento". Terminar sin esa opinión deja la
//  terminación sin el soporte que la ley exige, y en juicio se traduce en
//  despido injustificado.
//
//  Los tres documentos se emiten en este orden y cada uno se apoya en el
//  anterior — un dictamen fechado DESPUÉS de la notificación de terminación
//  evidencia que la opinión se fabricó para justificar una decisión ya tomada:
//    1. Acta de sesión de la Comisión Mixta ..... emite la opinión
//    2. Dictamen del periodo a prueba .......... la recoge y resuelve
//    3. Notificación de no acreditación ........ comunica al trabajador
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Acta de la sesión en que la Comisión Mixta emite su opinión.
 * @param {Object} datos { fecha_sesion, hora_inicio, hora_cierre, lugar,
 *   trabajador_nombre, trabajador_puesto, tipo_periodo, opinion,
 *   representantes_patron[], representantes_trabajadores[] }
 */
function generateActaComisionMixtaProductividad(empresa, datos = {}, sucursal = null, opts = {}) {
  empresa = resolveUbicacion(empresa, sucursal);
  _exigirCiudad(empresa.ciudad);

  if (!String(datos.opinion || '').trim()) {
    throw new Error(
      'Falta la opinión de la Comisión Mixta de Productividad, Capacitación y ' +
      'Adiestramiento. Los artículos 39-A y 39-B LFT condicionan la terminación al ' +
      'término del periodo a que se tome en cuenta esa opinión: un acta sin ella no ' +
      'sirve para sostener la terminación.'
    );
  }
  const repP = Array.isArray(datos.representantes_patron) ? datos.representantes_patron.filter(Boolean) : [];
  const repT = Array.isArray(datos.representantes_trabajadores) ? datos.representantes_trabajadores.filter(Boolean) : [];
  if (!repP.length || !repT.length) {
    throw new Error(
      'La Comisión Mixta debe integrarse con representantes de AMBAS partes: ' +
      'captura al menos un representante del patrón y uno de los trabajadores. ' +
      'Una comisión integrada sólo por la empresa no es mixta y su opinión no ' +
      'cumple lo previsto en los artículos 39-A y 39-B LFT.'
    );
  }

  const fecha = datos.fecha_sesion || new Date().toISOString().slice(0, 10);
  const tipoPeriodo = datos.tipo_periodo === 'capacitacion'
    ? { etiqueta: 'capacitación inicial', articulo: '39-B' }
    : { etiqueta: 'periodo a prueba',     articulo: '39-A' };

  const state = _initDocLegal(
    'Acta de la Comisión Mixta de Productividad, Capacitación y Adiestramiento',
    `Opinión prevista en el artículo ${tipoPeriodo.articulo} de la Ley Federal del Trabajo`,
    empresa, 'ACM');

  _ciudadFecha(state, empresa.ciudad, fecha);

  const { doc, ml } = state;
  _p(state, `En ${datos.lugar || empresa.domicilio || empresa.ciudad}, siendo las ${datos.hora_inicio || '____:____'} horas del ${npDate(fecha)}, se reunieron los integrantes de la Comisión Mixta de Productividad, Capacitación y Adiestramiento de ${empresa.nombre}, para emitir la opinión a que se refiere el artículo ${tipoPeriodo.articulo} de la Ley Federal del Trabajo respecto del ${tipoPeriodo.etiqueta} del C. ${datos.trabajador_nombre || '_______________________________'}, quien desempeña el puesto de ${datos.trabajador_puesto || '_______________'}.`);

  doc.setFont('Roboto','bold'); doc.setFontSize(9); doc.setTextColor(21,128,61);
  _checkY(state, 12);
  doc.text('INTEGRANTES PRESENTES', ml, state.y); state.y += 7;
  _table(state,
    [['Representación', 'Nombre']],
    [
      ...repP.map(r => ['Del patrón', r]),
      ...repT.map(r => ['De los trabajadores', r]),
    ],
    { columnStyles: { 0:{ cellWidth:52, fontStyle:'bold' } } }
  );

  doc.setFont('Roboto','bold'); doc.setFontSize(9); doc.setTextColor(21,128,61);
  _checkY(state, 12);
  doc.text('OPINION DE LA COMISIÓN', ml, state.y); state.y += 7;
  _p(state, datos.opinion, { indent: 3 });

  _p(state, `No habiendo mas asuntos que tratar, se da por concluida la presente sesión siendo las ${datos.hora_cierre || '____:____'} horas del ${npDate(fecha)}, firmando al calce quienes en ella intervinieron.`);

  // Firmas de todos los integrantes, en dos columnas
  _gap(state, 6);
  _checkY(state, 30);
  const colW = state.tw / 2 - 8;
  const todos = [...repP.map(r => ['Representante del patron', r]), ...repT.map(r => ['Representante de los trabajadores', r])];
  todos.forEach(([rotulo, nombre], i) => {
    const x = ml + (i % 2) * (colW + 16);
    if (i % 2 === 0) _checkY(state, 26);
    doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
    doc.line(x, state.y + 14, x + colW, state.y + 14);
    doc.setFont('Roboto','bold'); doc.setFontSize(7.5); doc.setTextColor(30,30,30);
    doc.text(rotulo, x, state.y + 18);
    doc.setFont('Roboto','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80);
    doc.text(nombre, x, state.y + 22);
    if (i % 2 === 1 || i === todos.length - 1) state.y += 28;
  });

  return _salidaDoc(state, empresa, `acta-comisión-mixta-${datos.trabajador_nombre || ''.replace(/\s+/g,'-').toLowerCase() || 'sesion'}.pdf`, opts);
}

/**
 * Dictamen del patrón que recoge la opinión de la Comisión Mixta y resuelve.
 * Debe emitirse ANTES de notificar la terminación al trabajador.
 * @param {Object} datos { tipo_periodo, fecha_dictamen, fecha_inicio_periodo,
 *   fecha_fin_periodo, fecha_acta_comision, opinion_comision, resultado,
 *   requisitos_evaluados, fundamentación }
 */
function generateDictamenPeriodoPrueba(empresa, trab, datos = {}, sucursal = null, opts = {}) {
  empresa = resolveUbicacion(empresa, sucursal);
  _exigirCiudad(empresa.ciudad);

  if (!String(datos.opinion_comision || '').trim()) {
    throw new Error(
      'El dictamen debe recoger la opinión de la Comisión Mixta de Productividad, ' +
      'Capacitación y Adiestramiento (Arts. 39-A y 39-B LFT). Genera primero el acta ' +
      'de la sesión de la Comisión y captura aquí su opinión.'
    );
  }
  if (!String(datos.fundamentacion || '').trim()) {
    throw new Error(
      'Falta la fundamentación del dictamen: qué requisitos y conocimientos ' +
      'necesarios para el puesto no se acreditaron y con qué elementos se evaluó. ' +
      'Un dictamen sin motivos es una decisión sin sustento.'
    );
  }

  const tipoPeriodo = datos.tipo_periodo === 'capacitacion'
    ? { etiqueta: 'capacitación inicial', articulo: '39-B', verbo: 'acreditar competencia' }
    : { etiqueta: 'periodo a prueba',     articulo: '39-A', verbo: 'acreditar que satisface los requisitos y conocimientos necesarios para desarrollar las labores' };
  const fecha    = datos.fecha_dictamen || new Date().toISOString().slice(0, 10);
  const acredita = datos.resultado === 'acredita';

  const state = _initDocLegal(
    `Dictamen del ${tipoPeriodo.etiqueta}`,
    `Artículo ${tipoPeriodo.articulo} de la Ley Federal del Trabajo`,
    empresa, 'DIC');

  _ciudadFecha(state, empresa.ciudad, fecha);

  _p(state, `${empresa.nombre}, por conducto de ${empresa.representante || '_______________________________'}, emite el presente dictamen respecto del ${tipoPeriodo.etiqueta} del C. ${trab.nombre}, quien desempena el puesto de ${trab.puesto || '_______________'}, comprendido del ${datos.fecha_inicio_periodo ? npDate(datos.fecha_inicio_periodo) : '____________'} al ${datos.fecha_fin_periodo ? npDate(datos.fecha_fin_periodo) : '____________'}.`);

  _hSeccion(state, 'I. Requisitos y conocimientos evaluados');
  _p(state, datos.requisitos_evaluados || 'Los inherentes al puesto conforme al contrato individual de trabajo.', { indent: 3 });

  _hSeccion(state, 'II. Opinión de la Comisión Mixta de Productividad, Capacitación y Adiestramiento');
  _p(state, `Recabada en sesión de fecha ${datos.fecha_acta_comision ? npDate(datos.fecha_acta_comision) : '____________'}, en los siguientes términos:`, { indent: 3 });
  _p(state, `"${datos.opinion_comision}"`, { indent: 6 });

  _hSeccion(state, 'III. Fundamentación y motivación');
  _p(state, datos.fundamentacion, { indent: 3 });

  _hSeccion(state, 'IV. Resolución');
  _p(state, acredita
    ? `Tomando en cuenta la opinion de la Comisión Mixta de Productividad, Capacitación y Adiestramiento y la naturaleza de la categoría o puesto, se resuelve que EL TRABAJADOR SI ACREDITO ${tipoPeriodo.verbo.toUpperCase()}, por lo que la relación de trabajo continua por tiempo indeterminado, computandose la antiguedad desde el inicio del periodo (Art. 39-E LFT).`
    : `Tomando en cuenta la opinion de la Comisión Mixta de Productividad, Capacitación y Adiestramiento y la naturaleza de la categoría o puesto, se resuelve que EL TRABAJADOR NO ACREDITO ${tipoPeriodo.verbo.toUpperCase()}, por lo que se dará por terminada la relación de trabajo sin responsabilidad para EL PATRON, en términos del artículo ${tipoPeriodo.articulo} de la Ley Federal del Trabajo. Esta resolución se notificara por escrito a EL TRABAJADOR.`);

  _gap(state, 8);
  _checkY(state, 30);
  const { doc, ml } = state;
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  doc.line(ml, state.y + 16, ml + 90, state.y + 16);
  doc.setFont('Roboto','bold'); doc.setFontSize(8); doc.setTextColor(30,30,30);
  doc.text('EL PATRON / REPRESENTANTE LEGAL', ml, state.y + 20.5);
  doc.setFont('Roboto','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80);
  doc.text(empresa.representante || empresa.nombre, ml, state.y + 25);
  state.y += 32;

  return _salidaDoc(state, empresa, _nombreArchivo('dictamen-periodo-prueba', trab), opts);
}

/**
 * Notificación al trabajador de que no acreditó el periodo. Se apoya en el
 * dictamen, cuya fecha debe ser anterior o igual a la de esta notificación.
 * @param {Object} datos { tipo_periodo, fecha_dictamen, fecha_efectos, fecha_fin_periodo }
 */
function generateNotificacionNoAcreditacionPrueba(empresa, trab, datos = {}, sucursal = null, opts = {}) {
  empresa = resolveUbicacion(empresa, sucursal);
  _exigirCiudad(empresa.ciudad);

  if (!datos.fecha_dictamen) {
    throw new Error(
      'Falta la fecha del dictamen que sustenta esta notificación. Genera primero el ' +
      'Dictamen del periodo a prueba: la notificación debe apoyarse en él, no al revés.'
    );
  }
  const fechaEfectos = datos.fecha_efectos || trab.fecha_baja || new Date().toISOString().slice(0, 10);
  // Un dictamen firmado después de notificar la terminación evidencia que la
  // opinión de la Comisión se recabó para justificar una decisión ya tomada.
  if (String(datos.fecha_dictamen) > String(fechaEfectos)) {
    throw new Error(
      `El dictamen (${datos.fecha_dictamen}) es posterior a la fecha de efectos de la ` +
      `terminación (${fechaEfectos}). El dictamen y la opinión de la Comisión Mixta deben ` +
      `preceder a la terminación: fechados después, evidencian que se recabaron para ` +
      `justificar una decisión ya tomada.`
    );
  }

  const tipoPeriodo = datos.tipo_periodo === 'capacitacion'
    ? { etiqueta: 'capacitación inicial', articulo: '39-B' }
    : { etiqueta: 'periodo a prueba',     articulo: '39-A' };

  const state = _initDocLegal(
    `Notificación de terminación al concluir el ${tipoPeriodo.etiqueta}`,
    `Artículo ${tipoPeriodo.articulo} de la Ley Federal del Trabajo`,
    empresa, 'NNA');

  _ciudadFecha(state, empresa.ciudad, fechaEfectos);

  const { doc, ml } = state;
  doc.setFont('Roboto','bold'); doc.setFontSize(10); doc.setTextColor(20,20,20);
  doc.text(`C. ${(trab.nombre || '').toUpperCase()}`, ml, state.y); state.y += 5.5;
  doc.setFont('Roboto','normal'); doc.setFontSize(9); doc.setTextColor(60,60,60);
  if (trab.puesto) { doc.text(`Puesto: ${trab.puesto}`, ml, state.y); state.y += 4.6; }
  doc.setFont('Roboto','bold'); doc.setFontSize(10); doc.setTextColor(20,20,20);
  doc.text('P R E S E N T E', ml, state.y); state.y += 10;

  _p(state, `Por medio del presente se le comunica que, concluido el ${tipoPeriodo.etiqueta} pactado en su contrato individual de trabajo${datos.fecha_fin_periodo ? `, el ${npDate(datos.fecha_fin_periodo)}` : ''}, y tomando en cuenta la opinion de la Comisión Mixta de Productividad, Capacitación y Adiestramiento así como la naturaleza de la categoría o puesto, ${empresa.nombre} ha determinado que no se acreditaron los requisitos y conocimientos necesarios para desarrollar las labores contratadas, según consta en el dictamen de fecha ${npDate(datos.fecha_dictamen)}, del que se le entrega copia.`);

  _p(state, `En consecuencia, con fundamento en el artículo ${tipoPeriodo.articulo} de la Ley Federal del Trabajo, se da por terminada la relación de trabajo SIN RESPONSABILIDAD PARA EL PATRON, con efectos a partir del ${npDate(fechaEfectos)}.`);

  _p(state, `Quedan a su disposición, en el domicilio de la empresa, las cantidades que le correspondan por concepto de partes proporcionales de las prestaciones generadas durante el periodo laborado.`);

  // Acuse — mismo criterio que el aviso del art. 47: sin constancia de
  // entrega, la notificación es un dicho del patrón sin respaldo.
  _gap(state, 4);
  _checkY(state, 44);
  doc.setDrawColor(180,180,180); doc.setLineWidth(0.4);
  doc.setFillColor(250,250,252);
  doc.roundedRect(ml, state.y, state.tw, 36, 2, 2, 'FD');
  doc.setFont('Roboto','bold'); doc.setFontSize(8); doc.setTextColor(50,50,50);
  doc.text('ACUSE DE RECIBO', ml + 5, state.y + 7);
  doc.setFont('Roboto','normal'); doc.setFontSize(8.5); doc.setTextColor(40,40,40);
  doc.text('Recibi original de la presente notificación y copia del dictamen el día ____', ml + 5, state.y + 15);
  doc.text('de ______________ de ______ a las ____:____ horas.', ml + 5, state.y + 21);
  doc.setDrawColor(150,150,150);
  doc.line(ml + 5, state.y + 31, ml + 78, state.y + 31);
  doc.setFontSize(7); doc.setTextColor(90,90,90);
  doc.text('Firma de EL TRABAJADOR', ml + 5, state.y + 34.5);
  state.y += 44;

  _checkY(state, 30);
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  doc.line(ml, state.y + 16, ml + 90, state.y + 16);
  doc.setFont('Roboto','bold'); doc.setFontSize(8); doc.setTextColor(30,30,30);
  doc.text('EL PATRON / REPRESENTANTE LEGAL', ml, state.y + 20.5);
  doc.setFont('Roboto','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80);
  doc.text(empresa.representante || empresa.nombre, ml, state.y + 25);
  state.y += 34;

  _bloqueTestigos(state, datos);

  return _salidaDoc(state, empresa, _nombreArchivo('notificación-no-acreditación', trab), opts);
}

// ─── ANEXO — INSTRUCTIVO DE RATIFICACIÓN ─────────────────────────────────────
/**
 * Hoja separada del convenio (no forma parte del cuerpo que se firma): explica
 * el trámite de ratificación y qué pasa si no se hace. Va aparte para que el
 * convenio en sí no se cargue de contenido informativo ajeno a lo que las
 * partes están declarando y firmando.
 */
function generateAnexoInstructivoRatificacion(empresa, trab, sucursal = null, opts = {}) {
  empresa = resolveUbicacion(empresa, sucursal);
  _exigirCiudad(empresa.ciudad);

  const state = _initDocLegal(
    'Anexo — Instructivo de Ratificación del Convenio',
    'Información para las partes — no forma parte del convenio que se firma',
    empresa, 'ANX');

  _p(state, `Este instructivo acompaña al Convenio de Terminación de la Relación de Trabajo celebrado entre ${empresa.nombre} y ${trab.nombre}. No es parte del convenio ni requiere firma: su único objeto es explicar el trámite de ratificación.`);

  _hSeccion(state, '1. ¿Qué es ratificar el convenio?');
  _p(state, 'El artículo 33, párrafo segundo, de la Ley Federal del Trabajo establece que todo convenio, para ser válido, debe hacerse por escrito y contener una relación circunstanciada de los hechos que lo motiven y de los derechos comprendidos en él, y que será ratificado ante los Centros de Conciliación o ante el Tribunal según corresponda, que lo aprobará siempre que no contenga renuncia de los derechos del trabajador.');

  _hSeccion(state, '2. Qué llevar a la comparecencia');
  _p(state, '- Identificación oficial vigente de EL TRABAJADOR (INE, pasaporte o cédula profesional).', { indent: 3 });
  _p(state, '- Identificación oficial vigente de quien comparezca por EL PATRÓN, y el documento con el que acredite su representación (poder notarial o el instrumento correspondiente).', { indent: 3 });
  _p(state, '- El convenio firmado, por triplicado.', { indent: 3 });
  _p(state, '- Comprobante del pago realizado, si ya se efectuó.', { indent: 3 });

  _hSeccion(state, '3. Qué pasa si NO se ratifica');
  _p(state, 'El artículo 33, párrafo tercero, de la Ley Federal del Trabajo dispone que cuando el convenio se celebra sin la intervención de las autoridades, puede reclamarse su nulidad ante el Tribunal únicamente respecto de aquello que contenga renuncia de derechos del trabajador, conservando su validez el resto de las cláusulas convenidas. En otras palabras: sin ratificar, el convenio sigue obligando a las partes, pero no tiene el efecto de cosa juzgada que impide a EL TRABAJADOR reclamar después algo que considere una renuncia de derechos no comprendida válidamente en él.');

  _hSeccion(state, '4. Dónde ratificarlo');
  _p(state, 'Ante el Centro de Conciliación competente, a elección de EL TRABAJADOR entre el del lugar de celebración del contrato, el del domicilio de cualquiera de las partes, o el del lugar de prestación de los servicios (artículo 700, fracción II, LFT).');

  return _salidaDoc(state, empresa, _nombreArchivo('anexo-instructivo-ratificación', trab), opts);
}

// ─── ACTA ADMINISTRATIVA ──────────────────────────────────────────────────────
function generateActaPDF(acta, empresa, trab, sucursal = null, opts = {}) {
  empresa = resolveUbicacion(empresa, sucursal);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  _registrarFuenteRoboto(doc);
  const ml = 25, mr = 25;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const tw = pw - ml - mr;

  const titles   = { amonestacion:'ACTA DE AMONESTACION', formal:'ACTA ADMINISTRATIVA', rescisoria:'ACTA DE RESCISIÓN DE CONTRATO DE TRABAJO' };
  const subtitles = { amonestacion:'Documento disciplinario — Ley Federal del Trabajo', formal:'Acta con apercibimiento — Artículo 47 LFT', rescisoria:'Rescisión sin responsabilidad patronal — Artículo 47 LFT' };
  const folio = `ACT-${acta.tipo.substring(0,3).toUpperCase()}-${Date.now().toString().slice(-6)}`;
  let y = pdfHeader(doc, titles[acta.tipo], subtitles[acta.tipo], ml, mr);

  doc.setFont('Roboto','normal'); doc.setFontSize(9); doc.setTextColor(80,80,80);
  doc.text(`${empresa.ciudad}, a ${npDate(acta.fecha+'T00:00:00')}`, pw-mr, y, { align:'right' });
  doc.text(`Folio: ${folio}`, ml, y); y += 12;

  // Partes
  doc.setFont('Roboto','bold'); doc.setFontSize(8); doc.setTextColor(100,100,100);
  doc.text('PATRON / EMPRESA:', ml, y); doc.text('TRABAJADOR:', pw/2+4, y); y += 5;
  doc.setFont('Roboto','bold'); doc.setFontSize(9.5); doc.setTextColor(20,20,20);
  doc.text(empresa.nombre, ml, y); doc.text(trab.nombre, pw/2+4, y); y += 5;
  doc.setFont('Roboto','normal'); doc.setFontSize(8.5); doc.setTextColor(70,70,70);
  const pl = [empresa.rfc && `RFC: ${empresa.rfc}`, empresa.representante && `Rep.: ${empresa.representante}`].filter(Boolean);
  const wl = [`Puesto: ${trab.puesto||''}`, trab.departamento && `Area: ${trab.departamento}`, trab.rfc && `RFC: ${trab.rfc}`].filter(Boolean);
  const max = Math.max(pl.length, wl.length);
  for (let i = 0; i < max; i++) {
    if (pl[i]) doc.text(pl[i], ml, y);
    if (wl[i]) doc.text(wl[i], pw/2+4, y);
    y += 4.5;
  }
  y += 4; y = pdfLine(doc, y, ml, mr) + 6;

  // Tabla falta
  doc.setFont('Roboto','bold'); doc.setFontSize(8.5); doc.setTextColor(50,50,50);
  doc.text('DATOS DE LA FALTA', ml, y); y += 6;
  doc.autoTable({
    startY: y, margin:{ left:ml, right:mr },
    body: [
      ['Tipo de falta', acta.tipo_falta_label || ''],
      ['Fecha', npDate(acta.fecha+'T00:00:00')],
      acta.hora_falta && ['Hora', acta.hora_falta],
      acta.lugar && ['Lugar', acta.lugar],
      ['Reincidencia', acta.reincidente ? 'Si — ha incurrido en esta falta con anterioridad' : 'No — primer incidente'],
      ['Causal legal', acta.causal||''],
    ].filter(Boolean),
    styles:{ fontSize:8.5, cellPadding:3, textColor:[40,40,40] },
    alternateRowStyles:{ fillColor:[248,248,252] },
    columnStyles:{ 0:{ fontStyle:'bold', cellWidth:44 } },
    theme:'grid'
  });
  y = doc.lastAutoTable.finalY + 10;

  doc.setFont('Roboto','bold'); doc.setFontSize(8.5); doc.setTextColor(50,50,50);
  doc.text('HECHOS:', ml, y); y += 5;
  doc.setFont('Roboto','normal'); doc.setFontSize(9.5); doc.setTextColor(30,30,30);
  const dl = doc.splitTextToSize(acta.descripcion||'', tw);
  doc.text(dl, ml, y); y += dl.length * 5.2 + 8;

  // Derecho de audiencia — sólo se imprime si se capturó (actas anteriores a
  // esta migración no lo tienen y deben poder regenerarse sin fabricarlo).
  if (String(acta.manifestacion_trabajador || '').trim()) {
    if (y + 24 > ph - 20) { doc.addPage(); y = 25; }
    doc.setFont('Roboto','bold'); doc.setFontSize(8.5); doc.setTextColor(50,50,50);
    doc.text('Se concede el uso de la voz al trabajador, quien manifiesta textualmente:', ml, y);
    y += 5.5;
    doc.setFont('Roboto','normal'); doc.setFontSize(9.5); doc.setTextColor(30,30,30);
    const ml_ = doc.splitTextToSize(acta.manifestacion_trabajador, tw);
    doc.text(ml_, ml, y); y += ml_.length * 5.2 + 8;
  }

  y = pdfLine(doc, y, ml, mr) + 5;
  let clausula = '';
  if (acta.tipo === 'amonestacion') {
    clausula = `Por medio del presente, ${empresa.nombre} hace constar la AMONESTACION formal al C. ${trab.nombre}, apercibiendole de que de reincidir en la conducta descrita podrá ser sujeto de medidas disciplinarias mas severas, incluyendo la rescisión sin responsabilidad para el patron.`;
  } else if (acta.tipo === 'formal') {
    clausula = `Por medio del presente, ${empresa.nombre} levanta ACTA ADMINISTRATIVA al C. ${trab.nombre} por incurrir en la conducta antes descrita, la cual contraviene ${acta.causal||''}. Se le APERCIBE que de reincidir, la empresa podrá rescindir el contrato sin responsabilidad patronal en términos del artículo 47 de la LFT.`;
  } else {
    // No se informan plazos de impugnación: no es obligación del patrón asesorar
    // al trabajador, y el art. 518 LFT concede dos meses (no 30 días) desde el día
    // siguiente a la separación. Consignar un plazo más corto acredita mala fe.
    clausula = `Con fundamento en el artículo 47 de la LFT, ${empresa.nombre} notifica al C. ${trab.nombre} la RESCISIÓN DE SU CONTRATO SIN RESPONSABILIDAD PARA EL PATRON. La empresa queda a disposición del trabajador para el pago de prestaciones proporcionales.`;
  }
  doc.setFont('Roboto','normal'); doc.setFontSize(9.5); doc.setTextColor(30,30,30);
  const cl = doc.splitTextToSize(clausula, tw); doc.text(cl, ml, y); y += cl.length * 5.2 + 8;

  const aceptTxt = { acepta:'El trabajador acepta los hechos y firma de conformidad.', no_acepta:'El trabajador no acepta los hechos pero firma para constancia.', no_firma:'EL TRABAJADOR SE NEGO A FIRMAR. Se hace constar ante testigos.' }[acta.aceptacion||'acepta'];
  doc.setFont('Roboto','italic'); doc.setFontSize(8.5);
  doc.setTextColor(acta.aceptacion === 'no_firma' ? 160 : 80, acta.aceptacion === 'no_firma' ? 50 : 80, acta.aceptacion === 'no_firma' ? 50 : 80);
  const al = doc.splitTextToSize(aceptTxt, tw); doc.text(al, ml, y); y += al.length * 5 + 10;

  // Constancia de lectura y cierre — sólo si se capturó la hora de cierre
  // (obligatoria para actas nuevas; las anteriores a esta migración no la
  // tienen y deben poder regenerarse sin fabricarla).
  if (String(acta.hora_cierre || '').trim()) {
    if (y + 30 > ph - 20) { doc.addPage(); y = 25; }
    const constancia = `No habiendo mas hechos que hacer constar, se da por concluida la presente diligencia siendo las ${acta.hora_cierre} horas del día ${npDate(acta.fecha+'T00:00:00')}, leyendose integramente la presente acta a los que en ella intervinieron, quienes manifiestan estar conformes con su contenido y firman al margen y al calce para constancia.`;
    doc.setFont('Roboto','normal'); doc.setFontSize(9); doc.setTextColor(30,30,30);
    const cn = doc.splitTextToSize(constancia, tw);
    doc.text(cn, ml, y); y += cn.length * 5 + 10;
  }

  if (y + 80 > ph - 20) { doc.addPage(); y = 25; }
  y = pdfSignatures(doc, `${empresa.nombre}${empresa.representante ? '\n' + empresa.representante : ''}`, `${trab.nombre}\n${trab.puesto||''}`, y, ml, mr);

  if (acta.testigo1 || acta.testigo2) {
    y += 10;
    doc.setFont('Roboto','bold'); doc.setFontSize(8.5); doc.setTextColor(80,80,80);
    doc.text('T E S T I G O S', pw/2, y, { align:'center' }); y += 10;
    const mid = pw/2;
    doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
    if (acta.testigo1) {
      doc.line(ml, y, mid-8, y);
      doc.setFont('Roboto','bold'); doc.setFontSize(8.5); doc.setTextColor(30,30,30);
      doc.text(acta.testigo1, (ml+mid-8)/2, y+5, { align:'center' });
      let yy1 = y + 10;
      doc.setFont('Roboto','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80);
      if (acta.testigo1_puesto) { doc.text(acta.testigo1_puesto, (ml+mid-8)/2, yy1, { align:'center' }); yy1 += 4; }
      // INE y domicilio: sin ellos no hay forma de citar al testigo si la
      // testimonial se desahoga años después de levantada el acta.
      if (acta.testigo1_ine) { doc.setFontSize(6.8); doc.text(`INE: ${acta.testigo1_ine}`, (ml+mid-8)/2, yy1, { align:'center' }); yy1 += 3.6; }
      if (acta.testigo1_domicilio) { doc.setFontSize(6.8); doc.text(`Domicilio: ${acta.testigo1_domicilio}`, (ml+mid-8)/2, yy1, { align:'center', maxWidth: mid-ml-16 }); }
    }
    if (acta.testigo2) {
      doc.line(mid+8, y, pw-mr, y);
      doc.setFont('Roboto','bold'); doc.setFontSize(8.5); doc.setTextColor(30,30,30);
      doc.text(acta.testigo2, (mid+8+pw-mr)/2, y+5, { align:'center' });
      let yy2 = y + 10;
      doc.setFont('Roboto','normal'); doc.setFontSize(7.5); doc.setTextColor(80,80,80);
      if (acta.testigo2_puesto) { doc.text(acta.testigo2_puesto, (mid+8+pw-mr)/2, yy2, { align:'center' }); yy2 += 4; }
      if (acta.testigo2_ine) { doc.setFontSize(6.8); doc.text(`INE: ${acta.testigo2_ine}`, (mid+8+pw-mr)/2, yy2, { align:'center' }); yy2 += 3.6; }
      if (acta.testigo2_domicilio) { doc.setFontSize(6.8); doc.text(`Domicilio: ${acta.testigo2_domicilio}`, (mid+8+pw-mr)/2, yy2, { align:'center', maxWidth: pw-mr-mid-16 }); }
    }
  }

  _footerFolio(doc, ml, mr, folio, empresa.nombre);
  if (opts.asBlob) return doc.output('blob');
  doc.save(`acta-${acta.tipo}.pdf`);
  return doc;
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
  _registrarFuenteRoboto(doc);
  const ml = 25, mr = 25;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const tw = pw - ml - mr;
  const s  = datos.solicitud;
  const folio = `VAC-${Date.now().toString().slice(-7)}`;

  let y = pdfHeader(doc, 'CONSTANCIA DE VACACIONES', 'Artículo 81 de la Ley Federal del Trabajo', ml, mr);

  doc.setFont('Roboto','normal'); doc.setFontSize(9); doc.setTextColor(80,80,80);
  doc.text(`${empresa.ciudad}, a ${npDate(new Date().toISOString())}`, pw-mr, y, { align:'right' });
  y += 10;

  doc.setFont('Roboto','bold'); doc.setFontSize(8); doc.setTextColor(100,100,100);
  doc.text('TRABAJADOR:', ml, y); y += 5;
  doc.setFont('Roboto','bold'); doc.setFontSize(10.5); doc.setTextColor(20,20,20);
  doc.text(trab.nombre, ml, y); y += 5;
  doc.setFont('Roboto','normal'); doc.setFontSize(8.5); doc.setTextColor(70,70,70);
  [
    trab.puesto && `Puesto: ${trab.puesto}`,
    `Fecha de ingreso: ${npDate(trab.fecha_ingreso + 'T00:00:00')}`,
  ].filter(Boolean).forEach(l => { doc.text(l, ml, y); y += 4.5; });
  y += 4; y = pdfLine(doc, y, ml, mr) + 6;

  doc.setFont('Roboto','bold'); doc.setFontSize(8.5); doc.setTextColor(50,50,50);
  doc.text('PERIODO VACACIONAL', ml, y); y += 6;
  doc.autoTable({
    startY: y, margin:{ left:ml, right:mr },
    body: [
      ['Antiguedad', `${datos.antiguedadAnios}° año de servicio`],
      ['Vigencia de este periodo', `${npDate(datos.vigenciaIni + 'T00:00:00')} al ${npDate(datos.vigenciaFin + 'T00:00:00')}`],
      ['Días que corresponden (Art. 76 LFT)', `${datos.diasCorresponden} dias`],
      ['Días gozados en este periodo', `${datos.diasGozados} dias`],
      ['Saldo pendiente', `${datos.saldo} dias`],
      ['Fechas de este disfrute', `${npDate(s.fecha_inicio + 'T00:00:00')} al ${npDate(s.fecha_fin + 'T00:00:00')} (${s.dias} días habiles)`],
      parseFloat(s.prima_vacacional || 0) > 0 && ['Prima vacacional (Art. 80 LFT, min. 25%)', fmt(s.prima_vacacional)],
    ].filter(Boolean),
    styles:{ fontSize:8.5, cellPadding:3, textColor:[40,40,40] },
    alternateRowStyles:{ fillColor:[248,248,252] },
    columnStyles:{ 0:{ fontStyle:'bold', cellWidth:75 } },
    theme:'grid'
  });
  y = doc.lastAutoTable.finalY + 10;

  doc.setFont('Roboto','normal'); doc.setFontSize(9.5); doc.setTextColor(30,30,30);
  const texto = `Por medio de la presente, ${empresa.nombre} hace constar al C. ${trab.nombre} su antigüedad y, de acuerdo con ella, el periodo de vacaciones que le corresponde conforme al artículo 76 de la Ley Federal del Trabajo, así como la fecha en que deberá disfrutarlo.`;
  const tl = doc.splitTextToSize(texto, tw); doc.text(tl, ml, y); y += tl.length * 5.2 + 14;

  if (y + 60 > ph - 20) { doc.addPage(); y = 25; }
  y = pdfSignatures(doc, `${empresa.nombre}${empresa.representante ? '\n' + empresa.representante : ''}`, `${trab.nombre}\n${trab.puesto||''}`, y, ml, mr);

  _footerFolio(doc, ml, mr, folio, empresa.nombre);
  doc.save(`constancia-vacaciones-${trab.nombre.replace(/\s+/g,'-').toLowerCase()}.pdf`);
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
  _registrarFuenteRoboto(doc);
  const ml = 20, mr = 20;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();

  let y = pdfHeader(doc, 'NOMINA EN EFECTIVO', empresa.nombre, ml, mr);

  doc.setFont('Roboto','normal'); doc.setFontSize(9); doc.setTextColor(80,80,80);
  doc.text(`Periodo: ${periodo?.nombre || ''}  (${npDate((periodo?.fecha_inicio||'')+'T00:00:00')} al ${npDate((periodo?.fecha_fin||'')+'T00:00:00')})`, ml, y);
  y += 10;

  const total = filas.reduce((s, f) => s + f.monto, 0);
  doc.autoTable({
    startY: y, margin:{ left:ml, right:mr },
    head: [['Trabajador', 'Puesto', 'Monto en efectivo', 'Firma de recibido']],
    body: filas.map(f => [f.nombre, f.puesto, fmt(f.monto), '']),
    foot: [['', '', 'TOTAL', fmt(total)]],
    styles:{ fontSize:9, cellPadding:4, textColor:[30,30,30] },
    headStyles:{ fillColor:[15,36,56], textColor:255, fontStyle:'bold' },
    footStyles:{ fillColor:[240,240,244], textColor:[20,20,20], fontStyle:'bold' },
    alternateRowStyles:{ fillColor:[248,248,252] },
    columnStyles:{ 2:{ cellWidth:32, halign:'right' }, 3:{ cellWidth:50, minCellHeight:14 } },
    theme:'grid'
  });
  y = doc.lastAutoTable.finalY + 10;

  doc.setFont('Roboto','italic'); doc.setFontSize(8); doc.setTextColor(100,100,100);
  const nota = doc.splitTextToSize('Cada trabajador firma de conformidad haber recibido el monto en efectivo señalado, como comprobante para el patron.', pw - ml - mr);
  doc.text(nota, ml, y);

  doc.setFontSize(7); doc.setTextColor(160,160,160);
  doc.text('Capital Humano MX', pw/2, ph-10, { align:'center' });
  doc.save(`nomina-efectivo-${(periodo?.nombre||'periodo').replace(/\s+/g,'-').toLowerCase()}.pdf`);
}
