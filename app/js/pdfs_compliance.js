/**
 * Capital Humano MX — Documentos de cumplimiento
 *
 * Reglamento Interior de Trabajo, protección de datos personales, protocolo de
 * violencia laboral, NOM-035, comisiones mixtas y constancias de capacitación.
 *
 * Vive aparte de `pdfs.js` sólo por tamaño: reutiliza su infraestructura
 * (_initDocLegal, _h*, _p, _table, _recuadro, _bloqueTestigos, _salidaDoc, np,
 * formatDateLong), por lo que debe cargarse DESPUÉS de pdfs.js.
 *
 * Fundamento de cada documento, verificado contra el texto oficial:
 *
 *   · RIT ................. arts. 422-425 LFT (DOF 14-05-2026)
 *   · Datos personales .... arts. 3, 7, 8, 15, 16, 18, 20-26 LFPDPPP
 *                           (DOF 14-11-2025)
 *   · Protocolo ........... art. 132 fr. XXXI LFT
 *   · Seguridad e higiene . art. 509 LFT
 *   · Capacitación ........ arts. 153-A a 153-V LFT
 */

// ═══════════════════════════════════════════════════════════════════════════
//  3.1 — REGLAMENTO INTERIOR DE TRABAJO (arts. 422-425 LFT)
//
//  Por qué es lo primero de esta fase: el catálogo de faltas del sistema
//  funda dos causales de amonestación en el "Reglamento Interior de Trabajo".
//  El art. 425 dice que el reglamento "surtirá efectos a partir de la fecha
//  de su depósito"; el art. 424 fr. II exige depositarlo ante el Centro
//  Federal de Conciliación y Registro Laboral dentro de los ocho días
//  siguientes a su firma. Sin depósito no hay norma que invocar, y el acta
//  administrativa que la invoca se queda sin sustento.
// ═══════════════════════════════════════════════════════════════════════════

/** Línea para rellenar a mano cuando el dato no viene capturado. */
const _RIT_LINEA = '_________________________________________________';

/**
 * Reglamento Interior de Trabajo parametrizable.
 *
 * Exige los datos que el art. 423 vuelve indispensables y que no se pueden
 * deducir: horario, comidas, días y lugar de pago, y los integrantes de la
 * comisión mixta que lo formula (art. 424 fr. I). Un reglamento con esos
 * campos en blanco no es depositable, y depositarlo es lo único que lo hace
 * exigible.
 */
function generateReglamentoInteriorTrabajo(empresa, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);

  const faltantes = [];
  if (!d.hora_entrada)  faltantes.push('hora de entrada (art. 423 fr. I)');
  if (!d.hora_salida)   faltantes.push('hora de salida (art. 423 fr. I)');
  if (!d.comida_inicio) faltantes.push('inicio del tiempo de comida (art. 423 fr. I)');
  if (!d.comida_fin)    faltantes.push('fin del tiempo de comida (art. 423 fr. I)');
  if (!d.dias_pago)     faltantes.push('días de pago (art. 423 fr. IV)');
  if (!d.lugar_pago)    faltantes.push('lugar de pago (art. 423 fr. IV)');
  if (faltantes.length) {
    throw new Error(
      'Faltan datos que el artículo 423 de la LFT exige que el reglamento contenga: ' +
      faltantes.join('; ') + '. Un reglamento incompleto no se puede depositar, y sin ' +
      'depósito no surte efectos (art. 425 LFT).'
    );
  }

  const repsP = (d.representantes_patron || []).filter(Boolean);
  const repsT = (d.representantes_trabajadores || []).filter(Boolean);
  if (!repsP.length || !repsT.length) {
    throw new Error(
      'El artículo 424 fracción I de la LFT exige que el reglamento se formule por una ' +
      'comisión mixta de representantes de los trabajadores y del patrón. Captura al menos ' +
      'un representante de cada parte.'
    );
  }

  const fechaFirma = d.fecha_firma || new Date().toISOString().split('T')[0];
  const state = _initDocLegal(
    'Reglamento Interior de Trabajo',
    'Articulos 422 a 425 de la Ley Federal del Trabajo',
    u, 'RIT'
  );

  _p(state, `Reglamento Interior de Trabajo que rige en ${np(u.nombre)}${u.rfc ? `, R.F.C. ${np(u.rfc)}` : ''}, con domicilio en ${np(u.domicilio || _RIT_LINEA)}, formulado por la comision mixta a que se refiere el articulo 424 fraccion I de la Ley Federal del Trabajo y firmado el ${formatDateLong(fechaFirma)}.`);

  _recuadro(state,
    'Conforme al articulo 422 de la Ley Federal del Trabajo, este reglamento es el conjunto de disposiciones obligatorias para personas trabajadoras y empleadoras en el desarrollo de los trabajos. No son materia del reglamento las normas de orden tecnico y administrativo que la empresa formule directamente para la ejecucion de los trabajos.',
    'info');

  // ── Art. 423 fr. I y II ──
  _hOrdinal(state, 'PRIMERA', 'Horas de entrada y salida, comidas y reposo');
  _p(state, `La jornada ordinaria inicia a las ${np(d.hora_entrada)} horas y concluye a las ${np(d.hora_salida)} horas. Durante la jornada se destinara de las ${np(d.comida_inicio)} a las ${np(d.comida_fin)} horas para tomar alimentos y reposar. ${d.reposo_adicional ? np(d.reposo_adicional) + ' ' : ''}Cuando la jornada sea continua se concedera un reposo de al menos media hora (articulo 63 de la Ley Federal del Trabajo).`);
  _p(state, `Las jornadas comienzan y terminan en ${np(d.lugar_jornada || u.domicilio || _RIT_LINEA)}. El personal debera encontrarse en su puesto a la hora de entrada; el registro de asistencia se realiza ${np(d.medio_registro || 'en el sistema de control de asistencia que la empresa tenga habilitado')}.`);

  // ── Art. 423 fr. III ──
  _hOrdinal(state, 'SEGUNDA', 'Limpieza de los establecimientos y equipos');
  _p(state, `La limpieza de las instalaciones, maquinaria, aparatos y utiles de trabajo se efectuara ${np(d.limpieza_dias || 'diariamente')}, en el horario de ${np(d.limpieza_horas || _RIT_LINEA)}. Cada persona trabajadora es responsable del orden y aseo de su area y del equipo asignado.`);

  // ── Art. 423 fr. IV ──
  _hOrdinal(state, 'TERCERA', 'Dias y lugares de pago');
  _p(state, `El salario se paga ${np(d.dias_pago)}, en ${np(d.lugar_pago)}, en dia laborable y dentro de las horas de trabajo o inmediatamente despues de su terminacion (articulos 108 y 109 de la Ley Federal del Trabajo). Cuando el pago se realice por transferencia electronica, el recibo correspondiente se pondra a disposicion de la persona trabajadora.`);
  _p(state, `Esta prohibida la imposicion de multas, cualquiera que sea su causa o concepto (articulo 107 de la Ley Federal del Trabajo). Los descuentos al salario solo proceden en los casos y con los requisitos del articulo 110 de la misma Ley.`);

  // ── Art. 423 fr. V ──
  _hOrdinal(state, 'CUARTA', 'Uso de asientos con respaldo');
  _p(state, `La empresa mantiene a disposicion del personal el numero suficiente de asientos o sillas con respaldo, conforme al articulo 132 fraccion V de la Ley Federal del Trabajo. ${np(d.asientos_reglas || 'Las personas trabajadoras podran usarlos durante la jornada siempre que la naturaleza del trabajo lo permita, incluidos los periodos de espera o de baja afluencia, sin que ello se considere abandono de labores.')}`);

  // ── Art. 423 fr. VI ──
  _hOrdinal(state, 'QUINTA', 'Prevencion de riesgos y primeros auxilios');
  _p(state, np(d.riesgos_medidas || 'El personal debe usar el equipo de proteccion que se le proporcione, acatar la senalizacion, reportar de inmediato cualquier condicion insegura y participar en los simulacros. Queda prohibido operar maquinaria o equipo para el que no se cuente con autorizacion y adiestramiento.'));
  _p(state, `El botiquin de primeros auxilios se ubica en ${np(d.ubicacion_botiquin || _RIT_LINEA)}. Todo accidente, por leve que parezca, debe reportarse de inmediato a ${np(d.responsable_seguridad || 'la persona responsable de seguridad e higiene')} para su atencion y para dar el aviso que corresponda al Instituto Mexicano del Seguro Social.`);

  // ── Art. 423 fr. VII ──
  _hOrdinal(state, 'SEXTA', 'Labores restringidas y proteccion a trabajadoras embarazadas');
  _p(state, `Las personas menores de dieciocho anos no desempenaran las labores insalubres o peligrosas que senalan los articulos 175 y 176 de la Ley Federal del Trabajo. Las trabajadoras embarazadas o en periodo de lactancia no realizaran labores que pongan en peligro su salud o la del producto, ni esfuerzos considerables, y podran solicitar el cambio temporal de actividad conforme al articulo 170 de la misma Ley.`);

  // ── Art. 423 fr. VIII ──
  _hOrdinal(state, 'SEPTIMA', 'Examenes medicos y medidas profilacticas');
  _p(state, np(d.examenes_medicos || 'El personal se sometera a los examenes medicos de ingreso y periodicos que la empresa indique, asi como a las medidas profilacticas que dicten las autoridades sanitarias. Los examenes se practican por cuenta de la empresa y sus resultados se tratan como datos personales sensibles.'));

  // ── Art. 423 fr. IX ──
  _hOrdinal(state, 'OCTAVA', 'Permisos y licencias');
  _p(state, np(d.permisos_procedimiento || 'Toda solicitud de permiso o licencia debera presentarse por escrito ante el jefe inmediato con al menos veinticuatro horas de anticipacion, salvo caso fortuito o fuerza mayor debidamente justificado. El permiso solo se entiende concedido cuando consta la autorizacion por escrito.'));
  _p(state, `Las incapacidades expedidas por el Instituto Mexicano del Seguro Social deberan entregarse dentro de las veinticuatro horas siguientes a su expedicion. Se respetan integramente los permisos y licencias que la Ley concede, entre ellos los de los articulos 132 fracciones XXVII Bis y siguientes, 170 y 172.`);

  // ── Art. 423 fr. X — la fracción que habilita todo el módulo disciplinario ──
  //
  // Se transcriben los dos límites que el propio art. 423 fr. X impone, porque
  // son los que un abogado del trabajador va a buscar primero: la suspensión
  // no puede pasar de ocho días, y hay derecho de audiencia PREVIO a la
  // sanción. Un reglamento que los omita hace nulas sus propias sanciones.
  _hOrdinal(state, 'NOVENA', 'Disposiciones disciplinarias y procedimiento para su aplicacion');
  _p(state, `El incumplimiento de las obligaciones a cargo de la persona trabajadora dara lugar, segun su gravedad y reincidencia, a las siguientes medidas: I) amonestacion verbal; II) amonestacion por escrito con copia al expediente; y III) suspension en el trabajo sin goce de salario.`);
  _p(state, `La suspension en el trabajo como medida disciplinaria NO PODRA EXCEDER DE OCHO DIAS. La persona trabajadora tendra derecho a SER OIDA ANTES de que se aplique la sancion (articulo 423 fraccion X de la Ley Federal del Trabajo).`, { bold: true });
  _p(state, `Procedimiento: 1) se hara del conocimiento de la persona trabajadora el hecho que se le atribuye y la fecha en que ocurrio; 2) se le concedera el uso de la palabra para que manifieste lo que a su derecho convenga y ofrezca las pruebas de que disponga; 3) las manifestaciones se asentaran en un acta circunstanciada firmada por quienes intervengan y por dos testigos de asistencia; 4) la sancion se impondra por escrito, fundada y motivada. La negativa a firmar el acta se hara constar en ella y no afecta su validez.`);
  _p(state, `Estas medidas son independientes de la facultad de rescindir la relacion de trabajo sin responsabilidad para el patron en los casos del articulo 47 de la Ley Federal del Trabajo, la cual se ejerce con el aviso que ese mismo articulo exige. Las acciones del patron para disciplinar las faltas prescriben en un mes (articulo 517 fraccion I).`);

  // ── Art. 330-D: si no hay contrato colectivo, el teletrabajo va en el RIT ──
  if (d.incluye_teletrabajo) {
    _hOrdinal(state, 'DECIMA', 'Teletrabajo');
    _p(state, `Las personas que presten mas del cuarenta por ciento de su tiempo en su domicilio o en el lugar por ellas elegido quedan sujetas al Capitulo XII Bis de la Ley Federal del Trabajo. ${np(d.teletrabajo_reglas || 'La empresa proporciona y da mantenimiento a los equipos necesarios, lleva registro de los insumos entregados, asume el pago de los servicios de telecomunicacion y la parte proporcional de electricidad, y respeta el derecho a la desconexion al termino de la jornada. El cambio de modalidad presencial a teletrabajo es voluntario y reversible.')}`);
    _p(state, `Los mecanismos de contacto y supervision son ${np(d.teletrabajo_contacto || _RIT_LINEA)}. La supervision sera proporcional a su objetivo y respetara el derecho a la intimidad; solo se usaran camaras y microfonos de manera extraordinaria o cuando la naturaleza de las funciones lo requiera (articulo 330-I de la Ley Federal del Trabajo).`);
  }

  // ── Art. 423 fr. XI ──
  _hOrdinal(state, d.incluye_teletrabajo ? 'DECIMA PRIMERA' : 'DECIMA', 'Disposiciones complementarias');
  _p(state, np(d.disposiciones_adicionales || 'Queda prohibido introducir o consumir bebidas alcoholicas o narcoticos en el centro de trabajo, portar armas, realizar actos de hostigamiento o acoso, y usar los bienes de la empresa para fines ajenos al trabajo. La empresa cuenta con un protocolo para prevenir la discriminacion y atender los casos de violencia y acoso u hostigamiento sexual, cuya consulta y denuncia son confidenciales.'));
  _p(state, `No producen ningun efecto legal las disposiciones de este reglamento que resulten contrarias a la Ley Federal del Trabajo, a sus reglamentos o a los contratos colectivos y contratos-ley aplicables (articulo 424 fraccion III de la Ley Federal del Trabajo). Las personas trabajadoras y el patron pueden solicitar en cualquier tiempo a los Tribunales federales que se subsanen las omisiones del reglamento o se revisen sus disposiciones contrarias a la Ley (articulo 424 fraccion IV).`);

  _hSeccion(state, 'VIGENCIA Y DIFUSION');
  _p(state, `Este reglamento surtira efectos a partir de la fecha de su deposito ante el Centro Federal de Conciliacion y Registro Laboral. Debera imprimirse y repartirse entre las personas trabajadoras y fijarse en los lugares mas visibles del establecimiento (articulo 425 de la Ley Federal del Trabajo).`);

  _gap(state, 4);
  _hSeccion(state, 'COMISION MIXTA QUE FORMULA EL REGLAMENTO');
  _table(state,
    [['Representantes del patron', 'Representantes de las personas trabajadoras']],
    Array.from({ length: Math.max(repsP.length, repsT.length) }, (_, i) =>
      [np(repsP[i] || ''), np(repsT[i] || '')])
  );

  _p(state, `${np(u.ciudad || '')}, a ${formatDateLong(fechaFirma)}.`);
  _gap(state, 6);
  _pdfcFirmasMixtas(state, repsP, repsT);

  return _salidaDoc(state, u, 'reglamento-interior-de-trabajo.pdf', opts);
}

/**
 * Acta de integración de la comisión mixta que formula el RIT (art. 424 fr. I).
 *
 * Sin esta acta el reglamento aparece formulado unilateralmente por el patrón,
 * que es exactamente el vicio que el art. 424 fr. I busca evitar.
 */
function generateActaComisionMixtaRIT(empresa, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);

  const repsP = (d.representantes_patron || []).filter(Boolean);
  const repsT = (d.representantes_trabajadores || []).filter(Boolean);
  if (!repsP.length || !repsT.length) {
    throw new Error(
      'El artículo 424 fracción I de la LFT exige una comisión mixta con representantes de ' +
      'AMBAS partes. Captura al menos un representante del patrón y uno de las personas ' +
      'trabajadoras: una comisión de una sola parte no es mixta.'
    );
  }

  const fecha = d.fecha_sesion || new Date().toISOString().split('T')[0];
  const state = _initDocLegal(
    'Acta de la Comision Mixta que formula el Reglamento Interior de Trabajo',
    'Articulo 424 fraccion I de la Ley Federal del Trabajo',
    u, 'ACMR'
  );

  _p(state, `En ${np(d.lugar || u.domicilio || u.ciudad || _RIT_LINEA)}, siendo las ${np(d.hora_inicio || _RIT_LINEA)} horas del ${formatDateLong(fecha)}, se reunieron las personas que al final firman con el objeto de integrar la comision mixta a que se refiere el articulo 424 fraccion I de la Ley Federal del Trabajo y formular el Reglamento Interior de Trabajo de ${np(u.nombre)}.`);

  _hSeccion(state, 'PRIMERO. INTEGRACION');
  _p(state, `La comision queda integrada por igual numero de representantes de cada parte, en los terminos siguientes:`);
  _table(state,
    [['Representantes del patron', 'Representantes de las personas trabajadoras']],
    Array.from({ length: Math.max(repsP.length, repsT.length) }, (_, i) =>
      [np(repsP[i] || ''), np(repsT[i] || '')])
  );

  _hSeccion(state, 'SEGUNDO. FORMULACION DEL REGLAMENTO');
  _p(state, np(d.acuerdos || 'Los integrantes revisaron el proyecto de Reglamento Interior de Trabajo, discutieron su contenido conforme a las fracciones I a XI del articulo 423 de la Ley Federal del Trabajo y manifestaron su conformidad con el texto que se anexa a la presente acta y que forma parte integrante de la misma.'));

  _hSeccion(state, 'TERCERO. DEPOSITO');
  _p(state, `Las partes acuerdan que, dentro de los OCHO DIAS siguientes a la firma de esta acta y del reglamento, cualquiera de ellas lo depositara ante el Centro Federal de Conciliacion y Registro Laboral (articulo 424 fraccion II de la Ley Federal del Trabajo). El reglamento surtira efectos a partir de la fecha de ese deposito (articulo 425).`);

  _hSeccion(state, 'CUARTO. DIFUSION');
  _p(state, `Se acuerda imprimir el reglamento, repartirlo entre las personas trabajadoras recabando su acuse de recibo, y fijarlo en los lugares mas visibles del establecimiento.`);

  if (d.hora_cierre) {
    _p(state, `No habiendo otro asunto que tratar, se cierra la presente acta siendo las ${np(d.hora_cierre)} horas del dia de su fecha, firmando al margen y al calce quienes en ella intervinieron.`);
  }

  _gap(state, 6);
  _pdfcFirmasMixtas(state, repsP, repsT);

  return _salidaDoc(state, u, 'acta-comision-mixta-rit.pdf', opts);
}

/**
 * Constancia de entrega del RIT (art. 425 LFT).
 *
 * Es el documento que convierte al reglamento en exigible frente a UNA persona
 * concreta: sin acuse no se puede sancionar por incumplir algo que no se
 * acredita haber entregado. Se niega a emitirse si el reglamento aún no está
 * depositado, porque antes del depósito no hay nada que entregar que surta
 * efectos (art. 425).
 */
function generateConstanciaEntregaRIT(empresa, trab, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);

  if (!empresa.rit_depositado || !empresa.rit_fecha_deposito) {
    throw new Error(
      'El Reglamento Interior de Trabajo no está registrado como depositado ante el Centro ' +
      'Federal de Conciliación y Registro Laboral. El art. 425 LFT establece que el ' +
      'reglamento surte efectos a partir de la fecha de su depósito: entregar un acuse de ' +
      'un reglamento no depositado documenta la entrega de algo que todavía no obliga. ' +
      'Registra la fecha de depósito en los datos de la empresa.'
    );
  }

  const fecha = d.fecha_entrega || new Date().toISOString().split('T')[0];
  const state = _initDocLegal(
    'Constancia de entrega del Reglamento Interior de Trabajo',
    'Articulo 425 de la Ley Federal del Trabajo',
    u, 'AERIT'
  );
  _ciudadFecha(state, np(u.ciudad || ''), fecha);

  _p(state, `Yo, ${np(trab.nombre)}${trab.curp ? `, con CURP ${np(trab.curp)}` : ''}, quien presta sus servicios para ${np(u.nombre)} con el puesto de ${np(trab.puesto || _RIT_LINEA)}, hago constar por mi propio derecho lo siguiente:`);

  _p(state, `PRIMERO. Que en esta fecha recibi un ejemplar impreso del Reglamento Interior de Trabajo de la empresa, depositado ante el Centro Federal de Conciliacion y Registro Laboral el ${formatDateLong(empresa.rit_fecha_deposito)}${empresa.rit_folio_deposito ? ` bajo el folio ${np(empresa.rit_folio_deposito)}` : ''}.`);
  _p(state, `SEGUNDO. Que se me explico su contenido, que tuve oportunidad de leerlo y de formular preguntas, y que se me indico el lugar visible del establecimiento donde permanece fijado para su consulta.`);
  _p(state, `TERCERO. Que conozco en particular las disposiciones disciplinarias del reglamento y el procedimiento para su aplicacion, incluido mi derecho a ser oido antes de que se aplique cualquier sancion.`);
  _p(state, `CUARTO. Que me obligo a cumplir las disposiciones del reglamento en los terminos del articulo 422 de la Ley Federal del Trabajo.`);

  if (d.version) {
    _p(state, `Version del reglamento entregada: ${np(d.version)}.`);
  }

  _recuadro(state,
    'Esta constancia acredita unicamente la entrega del reglamento. No implica renuncia de derecho alguno ni conformidad con sanciones futuras: cualquier medida disciplinaria requiere el procedimiento previo de audiencia que el propio reglamento y el articulo 423 fraccion X de la Ley Federal del Trabajo establecen.',
    'info');

  _gap(state, 10);
  const { ml, tw } = state;
  const colW = tw / 2 - 8;
  const y0 = state.y;
  const y1 = _firmaConIdentificacion(state, 'RECIBE — LA PERSONA TRABAJADORA', trab.nombre,
    trab.num_identificacion, trab.domicilio, ml, colW);
  state.y = y0;
  const y2 = _firmaConIdentificacion(state, 'ENTREGA — POR EL PATRON',
    d.entrega_nombre || u.representante, d.entrega_ine, u.domicilio, ml + colW + 16, colW);
  state.y = Math.max(y1, y2) + 10;

  if (d.testigo1_nombre || d.testigo2_nombre) _bloqueTestigos(state, d);

  return _salidaDoc(state, u, _nombreArchivo('acuse-rit', trab), opts);
}

/**
 * Casilla de aceptación individual, para marcar a mano.
 *
 * El art. 8 de la LFPDPPP exige consentimiento expreso y por escrito para los
 * datos sensibles. Una sola firma al pie de una lista no acredita la voluntad
 * respecto de CADA tratamiento: por eso cada finalidad lleva su propia casilla.
 */
function _pdfcCasilla(state, texto) {
  const { doc, ml, tw } = state;
  const lineas = doc.splitTextToSize(np(texto), tw - 26);
  _checkY(state, lineas.length * 5 + 8);
  doc.setDrawColor(90, 90, 90); doc.setLineWidth(0.4);
  doc.rect(ml + 2, state.y - 3.2, 4.2, 4.2);
  doc.rect(ml + 12, state.y - 3.2, 4.2, 4.2);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6);  doc.setTextColor(110, 110, 110);
  doc.text('SI', ml + 2.6, state.y + 4.6);
  doc.text('NO', ml + 12.2, state.y + 4.6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(50, 50, 50);
  doc.text(lineas, ml + 22, state.y, { lineHeightFactor: 1.4 });
  state.y += Math.max(lineas.length * 5.2, 9) + 4;
}

/** Dos columnas de firmas: patrón a la izquierda, trabajadores a la derecha. */
function _pdfcFirmasMixtas(state, repsP, repsT) {
  const { doc, ml, tw } = state;
  const colW = tw / 2 - 8;
  const filas = Math.max(repsP.length, repsT.length);
  for (let i = 0; i < filas; i++) {
    _checkY(state, 26);
    const y0 = state.y + 14;
    doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.4);
    if (repsP[i]) doc.line(ml, y0, ml + colW, y0);
    if (repsT[i]) doc.line(ml + colW + 16, y0, ml + colW + 16 + colW, y0);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(60, 60, 60);
    if (repsP[i]) doc.text(np(repsP[i]), ml + colW / 2, y0 + 4.5, { align: 'center' });
    if (repsT[i]) doc.text(np(repsT[i]), ml + colW + 16 + colW / 2, y0 + 4.5, { align: 'center' });
    doc.setFontSize(6.8); doc.setTextColor(130, 130, 130);
    if (repsP[i]) doc.text('POR EL PATRON', ml + colW / 2, y0 + 8.5, { align: 'center' });
    if (repsT[i]) doc.text(np('POR LAS PERSONAS TRABAJADORAS'), ml + colW + 16 + colW / 2, y0 + 8.5, { align: 'center' });
    state.y = y0 + 16;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  3.2 — PROTECCIÓN DE DATOS PERSONALES (LFPDPPP, DOF 14-11-2025)
//
//  La aplicación trata incapacidades —datos de salud, sensibles conforme al
//  art. 3 fr. VI— y, si hay checador, huella o rostro. El art. 8 exige para
//  los sensibles consentimiento EXPRESO Y POR ESCRITO, mediante firma
//  autógrafa, firma electrónica o cualquier mecanismo de autenticación.
//
//  Ojo con la autoridad: desde la reforma DOF 14-11-2025 el art. 3 fr. XV
//  define a la "Secretaría" como la Secretaría Anticorrupción y Buen
//  Gobierno. Ya no es el INAI, y un aviso que siga nombrando al INAI se
//  delata como copiado de una plantilla vieja.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aviso de privacidad integral para el personal (art. 15 LFPDPPP).
 *
 * Exige el domicilio del responsable y el medio de contacto para los derechos
 * ARCO porque son dos de las seis fracciones del art. 15: un aviso sin ellas
 * no cumple, y ponerle una línea en blanco sería fingir que sí.
 */
function generateAvisoPrivacidadTrabajador(empresa, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);

  if (!u.domicilio) {
    throw new Error(
      'El aviso de privacidad debe contener el domicilio del responsable (art. 15 fr. I LFPDPPP). ' +
      'Captura el domicilio de la empresa antes de generarlo.'
    );
  }
  const contactoArco = d.contacto_arco || u.notif_email_destino;
  if (!contactoArco) {
    throw new Error(
      'Falta el medio de contacto para ejercer los derechos ARCO (art. 15 fr. V LFPDPPP). ' +
      'El art. 29 obliga además a designar a una persona o departamento que dé trámite a las ' +
      'solicitudes: captura el correo o el domicilio donde se recibirán.'
    );
  }

  const version = d.version || new Date().toISOString().split('T')[0];
  const state = _initDocLegal(
    'Aviso de Privacidad Integral para el Personal',
    'Ley Federal de Proteccion de Datos Personales en Posesion de los Particulares',
    u, 'AVPRIV'
  );

  _hSeccion(state, 'I. IDENTIDAD Y DOMICILIO DEL RESPONSABLE');
  _p(state, `${np(u.nombre)}${u.rfc ? `, R.F.C. ${np(u.rfc)}` : ''}, con domicilio en ${np(u.domicilio)}${u.ciudad ? `, ${np(u.ciudad)}` : ''}, es responsable del tratamiento de sus datos personales (articulo 15 fraccion I de la Ley).`);

  _hSeccion(state, 'II. DATOS PERSONALES QUE SE TRATAN');
  _p(state, `De identificacion y contacto: nombre, domicilio, telefono, correo electronico, fecha y lugar de nacimiento, sexo, estado civil, nacionalidad, firma y fotografia.`);
  _p(state, `De identificacion oficial y fiscal: CURP, R.F.C., numero de seguridad social, credencial para votar u otra identificacion oficial.`);
  _p(state, `Laborales: puesto, area, fecha de ingreso, jornada, asistencia, incidencias, evaluaciones, capacitacion, medidas disciplinarias, historial salarial y datos de la relacion de trabajo.`);
  _p(state, `Patrimoniales o financieros: salario, prestaciones, cuenta bancaria y CLABE, creditos INFONAVIT o FONACOT, pensiones alimenticias y descuentos. El articulo 7 de la Ley requiere para estos datos su consentimiento expreso, salvo las excepciones de los articulos 9 y 36.`);
  _p(state, `SENSIBLES: estado de salud presente o futuro, incapacidades expedidas por el Instituto Mexicano del Seguro Social, resultados de examenes medicos de ingreso y periodicos, tipo de sangre, enfermedades cronicas y, en su caso, condicion de embarazo. Son sensibles conforme al articulo 3 fraccion VI de la Ley.`, { bold: true });
  _p(state, `BIOMETRICOS, unicamente si la empresa opera control de asistencia con huella o reconocimiento facial: la plantilla o el identificador derivado de su huella o de su rostro. La lista del articulo 3 fraccion VI es enunciativa, no limitativa; por prudencia estos datos reciben el mismo trato reforzado que los sensibles y se recaban con su consentimiento expreso y por escrito.`, { bold: true });

  _hSeccion(state, 'III. FINALIDADES DEL TRATAMIENTO');
  _p(state, `Finalidades primarias, necesarias para la relacion de trabajo y que no requieren consentimiento por derivar de una obligacion legal o del propio contrato (articulos 9 fraccion I y 36 fracciones I, IV y VII de la Ley):`);
  _p(state, `1) Integrar y conservar su expediente laboral, incluidos los documentos que el articulo 804 de la Ley Federal del Trabajo obliga al patron a conservar y exhibir en juicio. 2) Calcular y pagar salario, prestaciones y finiquitos. 3) Cumplir obligaciones ante el Instituto Mexicano del Seguro Social, el INFONAVIT, el Servicio de Administracion Tributaria y las autoridades laborales. 4) Controlar asistencia, jornada e incidencias. 5) Administrar la seguridad y salud en el trabajo, incluidas incapacidades y examenes medicos. 6) Ejercer o defender derechos en procedimientos administrativos o judiciales.`, { indent: 6 });
  _p(state, `Finalidades secundarias, que NO son necesarias para la relacion de trabajo y a las que usted puede oponerse sin que ello afecte su contratacion ni sus condiciones de trabajo: ${np(d.finalidades_secundarias || 'difusion interna de felicitaciones y aniversarios; uso de su imagen en materiales internos o de comunicacion institucional; encuestas de clima laboral identificadas')}.`);
  _p(state, `Si la empresa pretende tratar sus datos para una finalidad distinta de las aqui previstas, debera obtener nuevamente su consentimiento (articulo 11 de la Ley).`);

  _hSeccion(state, 'IV. LIMITAR EL USO O DIVULGACION DE SUS DATOS');
  _p(state, `Puede solicitar en cualquier momento que se limite el uso o la divulgacion de sus datos, y oponerse a las finalidades secundarias, escribiendo a ${np(contactoArco)}. La negativa a las finalidades secundarias no tendra consecuencia alguna sobre su relacion de trabajo.`);

  _hSeccion(state, 'V. TRANSFERENCIAS Y ENCARGADOS');
  _p(state, `Sus datos se transfieren al Instituto Mexicano del Seguro Social, al INFONAVIT, al Servicio de Administracion Tributaria y a las autoridades laborales y judiciales que los requieran. Estas transferencias no requieren su consentimiento porque estan previstas en la Ley y son necesarias para el mantenimiento de la relacion juridica (articulo 36 fracciones I, V, VI y VII).`);
  _p(state, `${np(d.encargados || 'El despacho contable, el proveedor de nomina y el proveedor del sistema de administracion de personal')} tratan sus datos POR CUENTA de la empresa: son personas encargadas en terminos del articulo 3 fraccion XII de la Ley, no terceros receptores, y estan obligadas a guardar confidencialidad conforme al articulo 20, obligacion que subsiste aun despues de terminada su relacion con la empresa.`);
  _p(state, `Cualquier otra transferencia a un tercero distinto de las anteriores requerira su consentimiento, y al tercero se le comunicara este aviso y las finalidades a las que usted sujeto el tratamiento (articulo 35 de la Ley).`);

  _hSeccion(state, 'VI. DERECHOS ARCO Y REVOCACION DEL CONSENTIMIENTO');
  _p(state, `Usted puede Acceder a sus datos, solicitar su Rectificacion cuando sean inexactos o incompletos, su Cancelacion, u Oponerse a su tratamiento (articulos 21 a 26 de la Ley). La solicitud debe presentarse en ${np(contactoArco)} y contener su nombre y domicilio o medio para recibir notificaciones, los documentos que acrediten su identidad, la descripcion clara de los datos y del derecho que pretende ejercer (articulo 28).`);
  _p(state, `La empresa comunicara su determinacion en un plazo maximo de VEINTE DIAS y, de resultar procedente, la hara efectiva dentro de los QUINCE DIAS siguientes; ambos plazos pueden ampliarse una sola vez por un periodo igual cuando las circunstancias lo justifiquen (articulo 31). El ejercicio de los derechos ARCO es gratuito: solo pueden cobrarse los costos de reproduccion, copias o envio (articulo 34).`);
  _p(state, `Puede revocar su consentimiento en cualquier momento, sin efectos retroactivos, por el mismo medio (articulo 7). La revocacion no procede respecto de los datos cuyo tratamiento la empresa deba mantener por disposicion legal o para el cumplimiento de la propia relacion de trabajo (articulo 25 fracciones I y II).`);

  _hSeccion(state, 'VII. CONSERVACION, BLOQUEO Y SUPRESION');
  _p(state, `Sus datos se conservan mientras dure la relacion de trabajo y despues por los plazos que fija el articulo 804 de la Ley Federal del Trabajo: el contrato individual mientras dure la relacion y hasta un ano despues; las listas de raya, controles de asistencia y comprobantes de utilidades, vacaciones, aguinaldos, primas y cuotas de seguridad social, durante el ultimo ano y un ano despues de extinguida la relacion. Los plazos fiscales y de seguridad social pueden ser mayores.`);
  _p(state, `Cumplida la finalidad y vencidos los plazos, los datos se bloquean y despues se suprimen (articulos 3 fraccion III y 10 de la Ley).`);

  _hSeccion(state, 'VIII. MEDIDAS DE SEGURIDAD');
  _p(state, `La empresa mantiene medidas de seguridad administrativas, tecnicas y fisicas para proteger sus datos contra dano, perdida, alteracion, destruccion o uso, acceso o tratamiento no autorizado (articulo 18). Si ocurre una vulneracion que afecte de forma significativa sus derechos patrimoniales o morales, se le informara de forma inmediata (articulo 19).`);

  _hSeccion(state, 'IX. CAMBIOS AL AVISO Y AUTORIDAD');
  _p(state, `Cualquier cambio a este aviso se le comunicara mediante ${np(d.medio_cambios || 'aviso fijado en los lugares de mayor afluencia del centro de trabajo y, en su caso, por correo electronico institucional')} (articulo 15 fraccion VI). Version vigente: ${np(version)}.`);
  _p(state, `Si considera que su derecho a la proteccion de datos personales ha sido lesionado, puede acudir ante la Secretaria Anticorrupcion y Buen Gobierno, autoridad competente conforme al articulo 3 fraccion XV de la Ley.`);

  _recuadro(state,
    'Este aviso se pone a su disposicion en el momento en que se recaban sus datos, conforme al articulo 16 de la Ley. Para los datos sensibles y biometricos se recaba ademas un consentimiento expreso y por escrito, en documento separado (articulo 8).',
    'info');

  return _salidaDoc(state, u, 'aviso-de-privacidad-personal.pdf', opts);
}

/**
 * Consentimiento expreso y por escrito para datos sensibles y biométricos.
 *
 * Va en documento separado a propósito: el art. 8 pide una manifestación de
 * voluntad específica para estos datos, y una casilla escondida al pie del
 * contrato no lo es. Cada finalidad lleva su propia casilla porque el
 * consentimiento del art. 3 fr. IV debe ser "específico".
 */
function generateConsentimientoDatosSensibles(empresa, trab, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);
  const fecha = d.fecha || new Date().toISOString().split('T')[0];

  const state = _initDocLegal(
    'Consentimiento Expreso para el Tratamiento de Datos Sensibles',
    'Articulo 8 de la Ley Federal de Proteccion de Datos Personales en Posesion de los Particulares',
    u, 'CONSEN'
  );
  _ciudadFecha(state, np(u.ciudad || ''), fecha);

  _p(state, `Yo, ${np(trab.nombre)}${trab.curp ? `, con CURP ${np(trab.curp)}` : ''}, manifiesto que recibi y lei el Aviso de Privacidad de ${np(u.nombre)}, que se me explico su contenido y que tuve oportunidad de preguntar lo que considere necesario.`);

  _p(state, `Sabiendo que el articulo 8 de la Ley exige para los datos personales sensibles mi consentimiento EXPRESO Y POR ESCRITO, y que puedo otorgarlo o negarlo libremente respecto de cada finalidad, manifiesto lo siguiente marcando la casilla que corresponda:`);

  _gap(state, 3);
  _pdfcCasilla(state, 'Consiento el tratamiento de mis datos de SALUD (incapacidades expedidas por el IMSS, diagnosticos que consten en ellas y ausencias por enfermedad) para el pago de subsidios y prestaciones, el control de incidencias y el cumplimiento de las obligaciones del patron ante el IMSS.');
  _pdfcCasilla(state, 'Consiento el tratamiento de los resultados de los EXAMENES MEDICOS de ingreso y periodicos, para determinar mi aptitud para el puesto y cumplir las obligaciones de seguridad y salud en el trabajo.');
  _pdfcCasilla(state, 'Consiento el tratamiento de mi TIPO DE SANGRE, alergias, enfermedades cronicas y datos de contacto de emergencia, para poder auxiliarme en caso de accidente o urgencia medica.');
  _pdfcCasilla(state, 'Consiento el tratamiento de mis DATOS BIOMETRICOS (huella dactilar o reconocimiento facial) con la unica finalidad de registrar mi asistencia. Se me informo que puedo negarlo y usar en su lugar el metodo alterno de registro que la empresa tenga habilitado, sin consecuencia alguna.');

  if (Array.isArray(d.casillas_adicionales)) {
    for (const c of d.casillas_adicionales.filter(Boolean)) _pdfcCasilla(state, c);
  }

  _gap(state, 2);
  _p(state, `Se me informo que: a) el tratamiento se limitara al minimo indispensable y por el periodo minimo necesario (articulo 12 de la Ley); b) puedo revocar este consentimiento en cualquier momento, sin efectos retroactivos, por el medio senalado en el Aviso de Privacidad (articulo 7); c) la negativa a cualquiera de los tratamientos anteriores no puede ser causa de que se me niegue la contratacion, se modifiquen mis condiciones de trabajo o se me sancione; y d) aun revocado el consentimiento, la empresa conservara los datos que deba mantener por disposicion legal o para acreditar el cumplimiento de sus obligaciones (articulo 25 fracciones I y II).`);

  _recuadro(state,
    'Si marcas NO en la casilla de datos biometricos, la empresa debe habilitarte un metodo alterno de registro de asistencia. Condicionar el empleo a la entrega de la huella no es un consentimiento libre, y un consentimiento que no es libre no cumple el articulo 3 fraccion IV de la Ley.',
    'warn');

  _gap(state, 8);
  const { ml, tw } = state;
  const colW = tw / 2 - 8;
  const y0 = state.y;
  const y1 = _firmaConIdentificacion(state, 'LA PERSONA TRABAJADORA', trab.nombre,
    trab.num_identificacion, trab.domicilio, ml, colW);
  state.y = y0;
  const y2 = _firmaConIdentificacion(state, 'POR EL RESPONSABLE',
    d.recibe_nombre || u.representante, d.recibe_ine, u.domicilio, ml + colW + 16, colW);
  state.y = Math.max(y1, y2) + 8;

  return _salidaDoc(state, u, _nombreArchivo('consentimiento-datos-sensibles', trab), opts);
}

/**
 * Consentimiento para monitoreo: correo corporativo, GPS, videovigilancia e
 * imagen.
 *
 * Se niega a emitir un consentimiento en blanco: sin decir QUÉ se monitorea no
 * hay consentimiento "específico e informado" (art. 3 fr. IV LFPDPPP), y un
 * consentimiento genérico no legitima nada.
 */
function generateConsentimientoMonitoreo(empresa, trab, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);
  const medios = (d.medios || []).filter(Boolean);

  if (!medios.length) {
    throw new Error(
      'Indica al menos un medio de monitoreo (correo corporativo, GPS, videovigilancia, uso de imagen). ' +
      'El art. 3 fr. IV de la LFPDPPP define el consentimiento como una manifestación "específica e ' +
      'informada": un consentimiento genérico de monitoreo no legitima ninguno en particular.'
    );
  }

  const fecha = d.fecha || new Date().toISOString().split('T')[0];
  const state = _initDocLegal(
    'Consentimiento Informado de Monitoreo y Uso de Imagen',
    'Ley Federal de Proteccion de Datos Personales en Posesion de los Particulares',
    u, 'CONMON'
  );
  _ciudadFecha(state, np(u.ciudad || ''), fecha);

  _p(state, `Yo, ${np(trab.nombre)}, en mi caracter de persona trabajadora de ${np(u.nombre)}, manifiesto que se me informo de forma previa y expresa lo siguiente respecto de los medios de supervision que la empresa utiliza:`);

  const CATALOGO = {
    correo: {
      titulo: 'Correo electronico y equipos corporativos',
      texto: 'La cuenta de correo, los equipos y los sistemas que la empresa me proporciona son herramientas de trabajo y su uso debe ser laboral. La empresa puede revisar la informacion contenida en ellos con fines de seguridad de la informacion, auditoria y cumplimiento normativo. Se me recomienda no almacenar informacion personal en ellos: si lo hago, debo identificarla como tal.',
      casilla: 'Consiento la revision del correo y los equipos corporativos en los terminos descritos.',
    },
    gps: {
      titulo: 'Geolocalizacion de vehiculos y dispositivos',
      texto: 'Los vehiculos y dispositivos asignados cuentan con geolocalizacion, que opera unicamente durante la jornada de trabajo y con la finalidad de coordinar rutas, acreditar visitas y proteger los bienes de la empresa. No se utiliza para seguirme fuera de la jornada.',
      casilla: 'Consiento la geolocalizacion del vehiculo o dispositivo asignado durante la jornada.',
    },
    video: {
      titulo: 'Videovigilancia',
      texto: 'El centro de trabajo cuenta con camaras en las areas comunes y operativas, senalizadas, con fines de seguridad de las personas y los bienes. No hay camaras en sanitarios, vestidores ni areas de descanso. Las grabaciones se conservan por el periodo minimo necesario y solo acceden a ellas las personas autorizadas.',
      casilla: 'Me doy por enterado de la videovigilancia en las areas senalizadas del centro de trabajo.',
    },
    imagen: {
      titulo: 'Uso de imagen',
      texto: 'La empresa desea utilizar mi fotografia o video en materiales internos, institucionales o de difusion. Esta finalidad es SECUNDARIA: no es necesaria para la relacion de trabajo y puedo negarla o revocarla en cualquier momento sin consecuencia alguna.',
      casilla: 'Consiento el uso de mi imagen en los materiales descritos.',
    },
  };

  for (const m of medios) {
    const c = CATALOGO[m];
    if (!c) continue;
    _hSeccion(state, c.titulo.toUpperCase());
    _p(state, c.texto);
    _pdfcCasilla(state, c.casilla);
  }

  _hSeccion(state, 'PROPORCIONALIDAD Y LIMITES');
  _p(state, `La supervision se limita a lo necesario para su objetivo y no invade mi vida privada. Tratandose de teletrabajo, los mecanismos y tecnologias de supervision deben ser proporcionales a su objetivo, garantizar mi derecho a la intimidad y respetar la normativa de proteccion de datos; las camaras y microfonos solo pueden usarse de manera extraordinaria o cuando la naturaleza de mis funciones lo requiera (articulo 330-I de la Ley Federal del Trabajo).`);
  _p(state, `Puedo revocar este consentimiento en cualquier momento, sin efectos retroactivos, por el medio senalado en el Aviso de Privacidad (articulo 7 de la Ley). La revocacion no alcanza a los tratamientos que la empresa deba mantener por disposicion legal o por seguridad de las personas.`);

  _gap(state, 8);
  const { ml, tw } = state;
  const colW = tw / 2 - 8;
  const y0 = state.y;
  const y1 = _firmaConIdentificacion(state, 'LA PERSONA TRABAJADORA', trab.nombre,
    trab.num_identificacion, trab.domicilio, ml, colW);
  state.y = y0;
  const y2 = _firmaConIdentificacion(state, 'POR EL RESPONSABLE',
    d.recibe_nombre || u.representante, d.recibe_ine, u.domicilio, ml + colW + 16, colW);
  state.y = Math.max(y1, y2) + 8;

  return _salidaDoc(state, u, _nombreArchivo('consentimiento-monitoreo', trab), opts);
}

// ═══════════════════════════════════════════════════════════════════════════
//  3.3 — PROTOCOLO DE VIOLENCIA LABORAL Y HOSTIGAMIENTO
//
//  Art. 132 fr. XXXI LFT, texto vigente: "Implementar, en acuerdo con los
//  trabajadores, un protocolo para prevenir la discriminación por razones de
//  género y atención de casos de violencia y acoso u hostigamiento sexual,
//  así como erradicar el trabajo forzoso e infantil".
//
//  Dos cosas que el prompt de remediación traía mal y aquí se corrigen:
//
//   1. El protocolo se implementa EN ACUERDO CON LOS TRABAJADORES. No es un
//      documento que el patrón redacte solo, igual que el reglamento interior.
//   2. La rescisión por acoso NO es el art. 47 fr. XI Bis —esa fracción no
//      existe—. Los actos inmorales y el hostigamiento o acoso sexual son la
//      fracción VIII del art. 47. Verificado en el texto oficial.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Protocolo para prevenir la discriminación y atender la violencia laboral.
 *
 * Exige representantes de las personas trabajadoras porque el art. 132
 * fr. XXXI condiciona el protocolo a que se implemente "en acuerdo con los
 * trabajadores": uno redactado unilateralmente no cumple la obligación, por
 * bien escrito que esté.
 */
function generateProtocoloViolenciaLaboral(empresa, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);

  const repsT = (d.representantes_trabajadores || []).filter(Boolean);
  if (!repsT.length) {
    throw new Error(
      'El art. 132 fr. XXXI de la LFT obliga a implementar el protocolo "en acuerdo con los ' +
      'trabajadores". Captura al menos un representante de las personas trabajadoras: un protocolo ' +
      'redactado unilateralmente por el patrón no cumple la obligación.'
    );
  }
  if (!d.responsable_recepcion) {
    throw new Error(
      'Indica quién recibe las denuncias y por qué medio. Un protocolo sin una vía de denuncia ' +
      'identificable no atiende nada: es el punto que primero revisa la inspección y el primero ' +
      'que se cuestiona en juicio.'
    );
  }

  const fecha = d.fecha || new Date().toISOString().split('T')[0];
  const state = _initDocLegal(
    'Protocolo para Prevenir la Discriminacion y Atender la Violencia Laboral',
    'Articulo 132 fraccion XXXI de la Ley Federal del Trabajo',
    u, 'PROTVL'
  );

  _p(state, `Protocolo de ${np(u.nombre)}, implementado en acuerdo con las personas trabajadoras el ${formatDateLong(fecha)}, para prevenir la discriminacion por razones de genero, atender los casos de violencia y acoso u hostigamiento sexual, y erradicar el trabajo forzoso e infantil.`);

  _recuadro(state,
    'El articulo 3o. de la Ley Federal del Trabajo declara de interes social garantizar un ambiente laboral libre de discriminacion y de violencia. Este protocolo aplica a todas las personas que laboran en el centro de trabajo, cualquiera que sea su jerarquia, y a quienes acuden a el por razones de trabajo.',
    'info');

  _hSeccion(state, '1. DEFINICIONES (ARTICULO 3o. BIS LFT)');
  _p(state, `Hostigamiento: el ejercicio del poder en una relacion de subordinacion real de la victima frente al agresor en el ambito laboral, que se expresa en conductas verbales, fisicas o ambas.`);
  _p(state, `Acoso sexual: una forma de violencia en la que, si bien no existe la subordinacion, hay un ejercicio abusivo del poder que conlleva a un estado de indefension y de riesgo para la victima, independientemente de que se realice en uno o varios eventos.`);
  _p(state, `Discriminacion: cualquier distincion, exclusion o preferencia por origen etnico o nacional, genero, edad, discapacidad, condicion social, condiciones de salud, religion, condicion migratoria, opiniones, preferencias sexuales, estado civil o cualquier otra que atente contra la dignidad humana (articulo 3o. de la Ley). No se consideran discriminatorias las distinciones que se sustenten en las calificaciones particulares que exija una labor determinada.`);

  _hSeccion(state, '2. PROHIBICIONES A CARGO DE LA EMPRESA');
  _p(state, `Queda prohibido a la empresa y a sus representantes realizar actos de hostigamiento o acoso sexual contra cualquier persona en el lugar de trabajo, asi como PERMITIR O TOLERAR esos actos en el centro de trabajo (articulo 133 fracciones XII y XIII de la Ley Federal del Trabajo). La tolerancia es por si misma una infraccion: no basta con no ser el agresor.`);
  _p(state, `Queda igualmente prohibido exigir certificados medicos de no embarazo para el ingreso, permanencia o ascenso, y despedir o coaccionar a una trabajadora para que renuncie por estar embarazada, por cambio de estado civil o por tener el cuidado de hijos menores (articulo 133 fracciones XIV y XV).`);

  _hSeccion(state, '3. COMO SE DENUNCIA');
  _p(state, `Las denuncias se presentan ante ${np(d.responsable_recepcion)}${d.medio_denuncia ? `, por ${np(d.medio_denuncia)}` : ''}. Pueden presentarlas la persona afectada o cualquiera que tenga conocimiento de los hechos. Se admiten denuncias verbales, que se asentaran por escrito y se leeran a quien las formula antes de firmarlas.`);
  _p(state, `Si la persona senalada como agresora es precisamente quien recibe las denuncias, o su superior jerarquico, la denuncia se presenta ante ${np(d.responsable_alterno || 'la persona que ocupe la representacion legal de la empresa o, en su defecto, ante la Procuraduria de la Defensa del Trabajo')}. Una via de denuncia que pasa por el denunciado no es una via de denuncia.`);
  _p(state, `La denuncia debe contener, en la medida de lo posible: nombre de quien denuncia y datos para contactarle, descripcion de los hechos con fecha, hora y lugar, nombre de la persona senalada y de quienes presenciaron los hechos, y las pruebas de que se disponga. La falta de alguno de estos datos no impide iniciar la investigacion.`);

  _hSeccion(state, '4. MEDIDAS DE PROTECCION INMEDIATAS');
  _p(state, `Recibida la denuncia, la empresa adoptara de inmediato las medidas necesarias para evitar el contacto entre las personas involucradas y prevenir represalias: cambio temporal de area, horario o linea de reporte de la PERSONA SENALADA —no de quien denuncia—, suspension del ejercicio de facultades disciplinarias sobre la persona denunciante, y cualquier otra proporcional al caso.`);
  _p(state, `Las medidas de proteccion son cautelares y no prejuzgan sobre la responsabilidad. Trasladar o cambiar de turno a quien denuncia, en lugar de a quien fue senalado, constituye una represalia.`, { bold: true });

  _hSeccion(state, '5. INVESTIGACION Y DEBIDO PROCESO');
  _p(state, `La investigacion se conduce por ${np(d.responsable_investigacion || d.responsable_recepcion)} y observa las garantias siguientes:`);
  _p(state, `a) Se hace saber a la persona senalada, por escrito, los hechos que se le atribuyen y la fecha en que habrian ocurrido. b) Se le concede audiencia para que manifieste lo que a su derecho convenga y ofrezca pruebas. c) Se recaban las declaraciones de quienes presenciaron los hechos y las demas pruebas conducentes. d) Todas las actuaciones se asientan en acta circunstanciada. e) La investigacion concluye en un plazo de ${np(d.plazo_investigacion || 'quince dias habiles')}, prorrogable por una sola vez cuando la complejidad del caso lo justifique.`, { indent: 6 });
  _p(state, `Sin audiencia de la persona senalada no hay investigacion valida: una sancion impuesta sin oirla se cae, y con ella se cae la defensa de la empresa frente a la persona denunciante.`);

  _hSeccion(state, '6. CONFIDENCIALIDAD Y PROHIBICION DE REPRESALIAS');
  _p(state, `La identidad de quien denuncia, de quien es senalado y de quienes declaran, asi como el contenido del expediente, son confidenciales. Solo acceden a el quienes intervienen en la investigacion y las autoridades que legalmente lo requieran. Los datos de la investigacion son datos personales y se tratan conforme al Aviso de Privacidad de la empresa.`);
  _p(state, `Queda prohibida toda represalia contra quien denuncia, declara o participa en la investigacion. Las represalias se sancionan conforme a este protocolo, con independencia de que la denuncia original resulte o no fundada.`);

  _hSeccion(state, '7. RESOLUCION Y CONSECUENCIAS');
  _p(state, `Concluida la investigacion se emite una resolucion escrita, fundada y motivada, que se notifica a ambas partes. Segun la gravedad, puede dar lugar a medidas de restauracion del ambiente laboral, capacitacion, amonestacion, suspension —que no puede exceder de ocho dias (articulo 423 fraccion X de la Ley)— o rescision de la relacion de trabajo.`);
  _p(state, `La rescision sin responsabilidad para el patron procede por los actos inmorales o el hostigamiento y/o acoso sexual del trabajador, previstos en el ARTICULO 47 FRACCION VIII de la Ley Federal del Trabajo, y se ejerce con el aviso que ese mismo articulo exige. La accion prescribe en un mes contado desde el dia siguiente a aquel en que la empresa tuvo conocimiento de la causa (articulo 517 fraccion I).`, { bold: true });
  _p(state, `Cuando la persona agresora sea el patron, sus familiares o cualquiera de sus representantes, la persona trabajadora puede rescindir la relacion sin responsabilidad para ella, conforme al articulo 51 fracciones II y III de la Ley, separandose dentro de los treinta dias siguientes (articulo 52), con derecho a la indemnizacion del articulo 50.`);
  _p(state, `Este protocolo no sustituye ni limita el derecho de la persona afectada a denunciar los hechos ante el Ministerio Publico o cualquier otra autoridad. La empresa no puede condicionar la atencion interna a que la persona se abstenga de acudir a ellas.`);

  _hSeccion(state, '8. TRABAJO FORZOSO E INFANTIL');
  _p(state, `La empresa no admite ninguna forma de trabajo forzoso ni de trabajo infantil. Verifica la edad de toda persona antes de contratarla, no emplea a menores de quince anos, y respecto de las personas mayores de quince y menores de dieciocho observa las restricciones de los articulos 175 y 176 de la Ley Federal del Trabajo en labores insalubres o peligrosas. Cualquier indicio de estas practicas, en la empresa o en su cadena de proveedores, debe denunciarse por la via prevista en este protocolo.`);

  _hSeccion(state, '9. DIFUSION Y VIGENCIA');
  _p(state, `Este protocolo se entrega a cada persona trabajadora recabando su acuse, se fija en los lugares de mayor afluencia del centro de trabajo y se revisa al menos cada ${np(d.periodicidad_revision || 'dos anos')} o cuando cambien las circunstancias que lo motivaron.`);

  _gap(state, 6);
  _hSeccion(state, 'IMPLEMENTADO EN ACUERDO CON LAS PERSONAS TRABAJADORAS');
  _pdfcFirmasMixtas(state,
    (d.representantes_patron || []).filter(Boolean).length
      ? d.representantes_patron.filter(Boolean)
      : [u.representante || ''],
    repsT);

  return _salidaDoc(state, u, 'protocolo-violencia-laboral.pdf', opts);
}

/**
 * Acta de investigación de hostigamiento o acoso.
 *
 * Se niega a emitirse sin la manifestación de la persona señalada. No es una
 * formalidad: una sanción impuesta sin haberla oído se anula, y al anularse
 * deja a la empresa sin haber atendido la denuncia — expuesta por partida
 * doble, frente a quien denunció y frente a quien fue sancionado.
 */
function generateActaInvestigacionAcoso(empresa, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);

  if (!d.hechos_denunciados) {
    throw new Error(
      'Falta la descripción de los hechos denunciados, con fecha y lugar. Un acta que no precisa ' +
      'qué se investiga no permite a la persona señalada defenderse ni a la empresa acreditar que ' +
      'atendió la denuncia.'
    );
  }
  if (!d.manifestacion_senalado) {
    throw new Error(
      'Falta la manifestación de la persona señalada. El derecho de audiencia es el requisito que ' +
      'sostiene toda la investigación: sin él, la sanción que derive de ella se anula y la empresa ' +
      'queda como si no hubiera atendido la denuncia.'
    );
  }

  const fecha = d.fecha || new Date().toISOString().split('T')[0];
  const state = _initDocLegal(
    'Acta de Investigacion de Violencia Laboral',
    'Protocolo del articulo 132 fraccion XXXI de la Ley Federal del Trabajo',
    u, 'ACTINV'
  );

  _p(state, `En ${np(d.lugar || u.domicilio || u.ciudad)}, siendo las ${np(d.hora_inicio || '____')} horas del ${formatDateLong(fecha)}, se hace constar el desarrollo de la investigacion iniciada con motivo de la denuncia recibida el ${d.fecha_denuncia ? formatDateLong(d.fecha_denuncia) : '____________'}, ante ${np(d.responsable_investigacion || u.representante || '____________')}.`);

  _recuadro(state,
    'Las actuaciones de esta acta son confidenciales. Su divulgacion fuera de las personas que intervienen en la investigacion y de las autoridades que legalmente la requieran constituye una falta en si misma, y puede exponer a la empresa frente a ambas partes.',
    'warn');

  _hSeccion(state, 'I. PERSONAS QUE INTERVIENEN');
  _table(state, [['Calidad', 'Nombre', 'Puesto']], [
    ['Persona denunciante', np(d.denunciante_nombre || '(se reserva)'), np(d.denunciante_puesto || '')],
    ['Persona senalada',    np(d.senalado_nombre || ''),                np(d.senalado_puesto || '')],
    ['Conduce la investigacion', np(d.responsable_investigacion || u.representante || ''), np(d.responsable_puesto || '')],
  ]);

  _hSeccion(state, 'II. HECHOS DENUNCIADOS');
  _p(state, np(d.hechos_denunciados));

  _hSeccion(state, 'III. MEDIDAS DE PROTECCION ADOPTADAS');
  _p(state, np(d.medidas_proteccion || 'No se adoptaron medidas de proteccion. Se hace constar la razon: ______________________________.'));

  _hSeccion(state, 'IV. AUDIENCIA DE LA PERSONA SENALADA');
  _p(state, `Se hizo saber a la persona senalada, en forma clara, los hechos que se le atribuyen y la fecha en que habrian ocurrido, y se le concedio el uso de la palabra para manifestar lo que a su derecho conviniera y ofrecer pruebas. Manifesto lo siguiente:`);
  _p(state, `"${np(d.manifestacion_senalado)}"`, { indent: 6 });
  if (d.pruebas_senalado) {
    _p(state, `Pruebas ofrecidas por la persona senalada: ${np(d.pruebas_senalado)}.`);
  }

  if (d.declaraciones) {
    _hSeccion(state, 'V. OTRAS DECLARACIONES Y PRUEBAS');
    _p(state, np(d.declaraciones));
  }

  _hSeccion(state, d.declaraciones ? 'VI. CIERRE' : 'V. CIERRE');
  _p(state, `${d.hora_cierre ? `Siendo las ${np(d.hora_cierre)} horas del dia de su fecha se cierra la presente acta. ` : ''}Se hace constar que la investigacion continua abierta hasta la emision de la resolucion escrita, que se notificara a ambas partes. Ninguna manifestacion contenida en esta acta prejuzga sobre la responsabilidad de persona alguna.`);
  _p(state, `Se apercibe a todos los intervinientes de la prohibicion de ejercer represalias contra quien denuncio, declaro o participo en la investigacion, con independencia del resultado de esta.`);

  _gap(state, 8);
  const { ml, tw } = state;
  const colW = tw / 2 - 8;
  const y0 = state.y;
  const y1 = _firmaConIdentificacion(state, 'PERSONA SENALADA', d.senalado_nombre, d.senalado_ine, null, ml, colW);
  state.y = y0;
  const y2 = _firmaConIdentificacion(state, 'CONDUCE LA INVESTIGACION',
    d.responsable_investigacion || u.representante, d.responsable_ine, null, ml + colW + 16, colW);
  state.y = Math.max(y1, y2) + 10;

  if (d.testigo1_nombre || d.testigo2_nombre) _bloqueTestigos(state, d);

  return _salidaDoc(state, u, 'acta-investigacion-violencia-laboral.pdf', opts);
}

/** Constancia de difusión y entrega del protocolo a una persona trabajadora. */
function generateConstanciaDifusionProtocolo(empresa, trab, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);
  const fecha = d.fecha_entrega || new Date().toISOString().split('T')[0];

  const state = _initDocLegal(
    'Constancia de Difusion del Protocolo de Violencia Laboral',
    'Articulo 132 fraccion XXXI de la Ley Federal del Trabajo',
    u, 'ACPROT'
  );
  _ciudadFecha(state, np(u.ciudad || ''), fecha);

  _p(state, `Yo, ${np(trab.nombre)}${trab.puesto ? `, con el puesto de ${np(trab.puesto)}` : ''}, hago constar que en esta fecha:`);
  _p(state, `PRIMERO. Recibi un ejemplar del Protocolo para prevenir la discriminacion y atender los casos de violencia y acoso u hostigamiento sexual de ${np(u.nombre)}, y se me explico su contenido.`);
  _p(state, `SEGUNDO. Se me informo la via para presentar denuncias: ${np(d.responsable_recepcion || '____________________________')}, y la via alterna aplicable cuando la persona senalada sea quien recibe las denuncias o su superior.`);
  _p(state, `TERCERO. Se me informo que la denuncia es confidencial, que estan prohibidas las represalias contra quien denuncia o declara, y que puedo acudir en todo momento ante las autoridades que correspondan sin que la empresa pueda condicionar por ello la atencion interna.`);
  _p(state, `CUARTO. Se me informo que la empresa no admite ninguna forma de trabajo forzoso ni de trabajo infantil.`);

  _recuadro(state,
    'Esta constancia acredita la difusion del protocolo. No implica que quien la firma acepte hecho alguno ni renuncie a derecho alguno, y no puede usarse en su contra.',
    'info');

  _gap(state, 10);
  const { ml, tw } = state;
  const colW = tw / 2 - 8;
  const y0 = state.y;
  const y1 = _firmaConIdentificacion(state, 'RECIBE — LA PERSONA TRABAJADORA', trab.nombre,
    trab.num_identificacion, trab.domicilio, ml, colW);
  state.y = y0;
  const y2 = _firmaConIdentificacion(state, 'ENTREGA — POR LA EMPRESA',
    d.entrega_nombre || u.representante, d.entrega_ine, u.domicilio, ml + colW + 16, colW);
  state.y = Math.max(y1, y2) + 8;

  return _salidaDoc(state, u, _nombreArchivo('acuse-protocolo-violencia', trab), opts);
}
