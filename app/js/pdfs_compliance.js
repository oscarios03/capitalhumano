/**
 * Capital Humano MX — Documentos de cumplimiento
 *
 * Reglamento Interior de Trabajo, protección de datos personales, protocolo de
 * violencia laboral, NOM-035, comisiones mixtas y constancias de capacitación.
 *
 * Vive aparte de `pdfs.js` sólo por tamaño: reutiliza su infraestructura
 * (_initDocLegal, _h*, _p, _table, _recuadro, _bloqueTestigos, _salidaDoc,
 * npDate, formatDateLong), por lo que debe cargarse DESPUÉS de pdfs.js.
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
    'Artículos 422 a 425 de la Ley Federal del Trabajo',
    u, 'RIT'
  );

  _p(state, `Reglamento Interior de Trabajo que rige en ${u.nombre}${u.rfc ? `, R.F.C. ${u.rfc}` : ''}, con domicilio en ${u.domicilio || _RIT_LINEA}, formulado por la comisión mixta a que se refiere el artículo 424 fracción I de la Ley Federal del Trabajo y firmado el ${formatDateLong(fechaFirma)}.`);

  _recuadro(state,
    'Conforme al artículo 422 de la Ley Federal del Trabajo, este reglamento es el conjunto de disposiciones obligatorias para personas trabajadoras y empleadoras en el desarrollo de los trabajos. No son materia del reglamento las normas de orden técnico y administrativo que la empresa formule directamente para la ejecución de los trabajos.',
    'info');

  // ── Art. 423 fr. I y II ──
  _hOrdinal(state, 'PRIMERA', 'Horas de entrada y salida, comidas y reposo');
  _p(state, `La jornada ordinaria inicia a las ${d.hora_entrada} horas y concluye a las ${d.hora_salida} horas. Durante la jornada se destinara de las ${d.comida_inicio} a las ${d.comida_fin} horas para tomar alimentos y reposar. ${d.reposo_adicional ? d.reposo_adicional + ' ' : ''}Cuando la jornada sea continua se concedera un reposo de al menos media hora (artículo 63 de la Ley Federal del Trabajo).`);
  _p(state, `Las jornadas comienzan y terminan en ${d.lugar_jornada || u.domicilio || _RIT_LINEA}. El personal deberá encontrarse en su puesto a la hora de entrada; el registro de asistencia se realiza ${d.medio_registro || 'en el sistema de control de asistencia que la empresa tenga habilitado'}.`);

  // ── Art. 423 fr. III ──
  _hOrdinal(state, 'SEGUNDA', 'Limpieza de los establecimientos y equipos');
  _p(state, `La limpieza de las instalaciones, maquinaria, aparatos y utiles de trabajo se efectuara ${d.limpieza_dias || 'diariamente'}, en el horario de ${d.limpieza_horas || _RIT_LINEA}. Cada persona trabajadora es responsable del orden y aseo de su area y del equipo asignado.`);

  // ── Art. 423 fr. IV ──
  _hOrdinal(state, 'TERCERA', 'Días y lugares de pago');
  _p(state, `El salario se paga ${d.dias_pago}, en ${d.lugar_pago}, en día laborable y dentro de las horas de trabajo o inmediatamente despues de su terminación (artículos 108 y 109 de la Ley Federal del Trabajo). Cuando el pago se realice por transferencia electrónica, el recibo correspondiente se pondra a disposición de la persona trabajadora.`);
  _p(state, `Esta prohibida la imposición de multas, cualquiera que sea su causa o concepto (artículo 107 de la Ley Federal del Trabajo). Los descuentos al salario solo proceden en los casos y con los requisitos del artículo 110 de la misma Ley.`);

  // ── Art. 423 fr. V ──
  _hOrdinal(state, 'CUARTA', 'Uso de asientos con respaldo');
  _p(state, `La empresa mantiene a disposición del personal el número suficiente de asientos o sillas con respaldo, conforme al artículo 132 fracción V de la Ley Federal del Trabajo. ${d.asientos_reglas || 'Las personas trabajadoras podrán usarlos durante la jornada siempre que la naturaleza del trabajo lo permita, incluidos los periodos de espera o de baja afluencia, sin que ello se considere abandono de labores.'}`);

  // ── Art. 423 fr. VI ──
  _hOrdinal(state, 'QUINTA', 'Prevención de riesgos y primeros auxilios');
  _p(state, d.riesgos_medidas || 'El personal debe usar el equipo de protección que se le proporcione, acatar la senalización, reportar de inmediato cualquier condición insegura y participar en los simulacros. Queda prohibido operar maquinaria o equipo para el que no se cuente con autorización y adiestramiento.');
  _p(state, `El botiquin de primeros auxilios se ubica en ${d.ubicacion_botiquin || _RIT_LINEA}. Todo accidente, por leve que parezca, debe reportarse de inmediato a ${d.responsable_seguridad || 'la persona responsable de seguridad e higiene'} para su atención y para dar el aviso que corresponda al Instituto Mexicano del Seguro Social.`);

  // ── Art. 423 fr. VII ──
  _hOrdinal(state, 'SEXTA', 'Labores restringidas y protección a trabajadoras embarazadas');
  _p(state, `Las personas menores de dieciocho años no desempenaran las labores insalubres o peligrosas que senalan los artículos 175 y 176 de la Ley Federal del Trabajo. Las trabajadoras embarazadas o en periodo de lactancia no realizaran labores que pongan en peligro su salud o la del producto, ni esfuerzos considerables, y podrán solicitar el cambio temporal de actividad conforme al artículo 170 de la misma Ley.`);

  // ── Art. 423 fr. VIII ──
  _hOrdinal(state, 'SEPTIMA', 'Examenes médicos y medidas profilacticas');
  _p(state, d.examenes_medicos || 'El personal se sometera a los examenes médicos de ingreso y periodicos que la empresa indique, así como a las medidas profilacticas que dicten las autoridades sanitarias. Los examenes se practican por cuenta de la empresa y sus resultados se tratan como datos personales sensibles.');

  // ── Art. 423 fr. IX ──
  _hOrdinal(state, 'OCTAVA', 'Permisos y licencias');
  _p(state, d.permisos_procedimiento || 'Toda solicitud de permiso o licencia deberá presentarse por escrito ante el jefe inmediato con al menos veinticuatro horas de anticipación, salvo caso fortuito o fuerza mayor debidamente justificado. El permiso solo se entiende concedido cuando consta la autorización por escrito.');
  _p(state, `Las incapacidades expedidas por el Instituto Mexicano del Seguro Social deberán entregarse dentro de las veinticuatro horas siguientes a su expedición. Se respetan integramente los permisos y licencias que la Ley concede, entre ellos los de los artículos 132 fracciones XXVII Bis y siguientes, 170 y 172.`);

  // ── Art. 423 fr. X — la fracción que habilita todo el módulo disciplinario ──
  //
  // Se transcriben los dos límites que el propio art. 423 fr. X impone, porque
  // son los que un abogado del trabajador va a buscar primero: la suspensión
  // no puede pasar de ocho días, y hay derecho de audiencia PREVIO a la
  // sanción. Un reglamento que los omita hace nulas sus propias sanciones.
  _hOrdinal(state, 'NOVENA', 'Disposiciones disciplinarias y procedimiento para su aplicación');
  _p(state, `El incumplimiento de las obligaciones a cargo de la persona trabajadora dará lugar, según su gravedad y reincidencia, a las siguientes medidas: I) amonestacion verbal; II) amonestacion por escrito con copia al expediente; y III) suspensión en el trabajo sin goce de salario.`);
  _p(state, `La suspensión en el trabajo como medida disciplinaria NO PODRÁ EXCEDER DE OCHO DÍAS. La persona trabajadora tendrá derecho a SER OIDA ANTES de que se aplique la sanción (artículo 423 fracción X de la Ley Federal del Trabajo).`, { bold: true });
  _p(state, `Procedimiento: 1) se hará del conocimiento de la persona trabajadora el hecho que se le atribuye y la fecha en que ocurrio; 2) se le concedera el uso de la palabra para que manifieste lo que a su derecho convenga y ofrezca las pruebas de que disponga; 3) las manifestaciones se asentaran en un acta circunstanciada firmada por quienes intervengan y por dos testigos de asistencia; 4) la sanción se impondra por escrito, fundada y motivada. La negativa a firmar el acta se hará constar en ella y no afecta su validez.`);
  _p(state, `Estas medidas son independientes de la facultad de rescindir la relación de trabajo sin responsabilidad para el patron en los casos del artículo 47 de la Ley Federal del Trabajo, la cual se ejerce con el aviso que ese mismo artículo exige. Las acciones del patron para disciplinar las faltas prescriben en un mes (artículo 517 fracción I).`);

  // ── Art. 330-D: si no hay contrato colectivo, el teletrabajo va en el RIT ──
  if (d.incluye_teletrabajo) {
    _hOrdinal(state, 'DECIMA', 'Teletrabajo');
    _p(state, `Las personas que presten mas del cuarenta por ciento de su tiempo en su domicilio o en el lugar por ellas elegido quedan sujetas al Capítulo XII Bis de la Ley Federal del Trabajo. ${d.teletrabajo_reglas || 'La empresa proporciona y da mantenimiento a los equipos necesarios, lleva registro de los insumos entregados, asume el pago de los servicios de telecomunicación y la parte proporcional de electricidad, y respeta el derecho a la desconexion al término de la jornada. El cambio de modalidad presencial a teletrabajo es voluntario y reversible.'}`);
    _p(state, `Los mecanismos de contacto y supervisión son ${d.teletrabajo_contacto || _RIT_LINEA}. La supervisión será proporcional a su objetivo y respetara el derecho a la intimidad; solo se usaran camaras y microfonos de manera extraordinaria o cuando la naturaleza de las funciones lo requiera (artículo 330-I de la Ley Federal del Trabajo).`);
  }

  // ── Art. 423 fr. XI ──
  _hOrdinal(state, d.incluye_teletrabajo ? 'DECIMA PRIMERA' : 'DECIMA', 'Disposiciones complementarias');
  _p(state, d.disposiciones_adicionales || 'Queda prohibido introducir o consumir bebidas alcoholicas o narcoticos en el centro de trabajo, portar armas, realizar actos de hostigamiento o acoso, y usar los bienes de la empresa para fines ajenos al trabajo. La empresa cuenta con un protocolo para prevenir la discriminación y atender los casos de violencia y acoso u hostigamiento sexual, cuya consulta y denuncia son confidenciales.');
  _p(state, `No producen ningún efecto legal las disposiciones de este reglamento que resulten contrarias a la Ley Federal del Trabajo, a sus reglamentos o a los contratos colectivos y contratos-ley aplicables (artículo 424 fracción III de la Ley Federal del Trabajo). Las personas trabajadoras y el patron pueden solicitar en cualquier tiempo a los Tribunales federales que se subsanen las omisiones del reglamento o se revisen sus disposiciones contrarias a la Ley (artículo 424 fracción IV).`);

  _hSeccion(state, 'VIGENCIA Y DIFUSIÓN');
  _p(state, `Este reglamento surtira efectos a partir de la fecha de su deposito ante el Centro Federal de Conciliacion y Registro Laboral. Deberá imprimirse y repartirse entre las personas trabajadoras y fijarse en los lugares mas visibles del establecimiento (artículo 425 de la Ley Federal del Trabajo).`);

  _gap(state, 4);
  _hSeccion(state, 'COMISIÓN MIXTA QUE FORMULA EL REGLAMENTO');
  _table(state,
    [['Representantes del patron', 'Representantes de las personas trabajadoras']],
    Array.from({ length: Math.max(repsP.length, repsT.length) }, (_, i) =>
      [repsP[i] || '', repsT[i] || ''])
  );

  _p(state, `${u.ciudad || ''}, a ${formatDateLong(fechaFirma)}.`);
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
    'Acta de la Comisión Mixta que formula el Reglamento Interior de Trabajo',
    'Artículo 424 fracción I de la Ley Federal del Trabajo',
    u, 'ACMR'
  );

  _p(state, `En ${d.lugar || u.domicilio || u.ciudad || _RIT_LINEA}, siendo las ${d.hora_inicio || _RIT_LINEA} horas del ${formatDateLong(fecha)}, se reunieron las personas que al final firman con el objeto de integrar la comisión mixta a que se refiere el artículo 424 fracción I de la Ley Federal del Trabajo y formular el Reglamento Interior de Trabajo de ${u.nombre}.`);

  _hSeccion(state, 'PRIMERO. INTEGRACIÓN');
  _p(state, `La comisión queda integrada por igual número de representantes de cada parte, en los términos siguientes:`);
  _table(state,
    [['Representantes del patron', 'Representantes de las personas trabajadoras']],
    Array.from({ length: Math.max(repsP.length, repsT.length) }, (_, i) =>
      [repsP[i] || '', repsT[i] || ''])
  );

  _hSeccion(state, 'SEGUNDO. FORMULACION DEL REGLAMENTO');
  _p(state, d.acuerdos || 'Los integrantes revisaron el proyecto de Reglamento Interior de Trabajo, discutieron su contenido conforme a las fracciones I a XI del artículo 423 de la Ley Federal del Trabajo y manifestaron su conformidad con el texto que se anexa a la presente acta y que forma parte integrante de la misma.');

  _hSeccion(state, 'TERCERO. DEPOSITO');
  _p(state, `Las partes acuerdan que, dentro de los OCHO DÍAS siguientes a la firma de esta acta y del reglamento, cualquiera de ellas lo depositara ante el Centro Federal de Conciliacion y Registro Laboral (artículo 424 fracción II de la Ley Federal del Trabajo). El reglamento surtira efectos a partir de la fecha de ese deposito (artículo 425).`);

  _hSeccion(state, 'CUARTO. DIFUSIÓN');
  _p(state, `Se acuerda imprimir el reglamento, repartirlo entre las personas trabajadoras recabando su acuse de recibo, y fijarlo en los lugares mas visibles del establecimiento.`);

  if (d.hora_cierre) {
    _p(state, `No habiendo otro asunto que tratar, se cierra la presente acta siendo las ${d.hora_cierre} horas del día de su fecha, firmando al margen y al calce quienes en ella intervinieron.`);
  }

  _gap(state, 6);
  _pdfcFirmasMixtas(state, repsP, repsT);

  return _salidaDoc(state, u, 'acta-comisión-mixta-rit.pdf', opts);
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
    'Artículo 425 de la Ley Federal del Trabajo',
    u, 'AERIT'
  );
  _ciudadFecha(state, u.ciudad || '', fecha);

  _p(state, `Yo, ${trab.nombre}${trab.curp ? `, con CURP ${trab.curp}` : ''}, quien presta sus servicios para ${u.nombre} con el puesto de ${trab.puesto || _RIT_LINEA}, hago constar por mi propio derecho lo siguiente:`);

  _p(state, `PRIMERO. Que en esta fecha recibi un ejemplar impreso del Reglamento Interior de Trabajo de la empresa, depositado ante el Centro Federal de Conciliacion y Registro Laboral el ${formatDateLong(empresa.rit_fecha_deposito)}${empresa.rit_folio_deposito ? ` bajo el folio ${empresa.rit_folio_deposito}` : ''}.`);
  _p(state, `SEGUNDO. Que se me explico su contenido, que tuve oportunidad de leerlo y de formular preguntas, y que se me indico el lugar visible del establecimiento donde permanece fijado para su consulta.`);
  _p(state, `TERCERO. Que conozco en particular las disposiciones disciplinarias del reglamento y el procedimiento para su aplicación, incluido mi derecho a ser oido antes de que se aplique cualquier sanción.`);
  _p(state, `CUARTO. Que me obligo a cumplir las disposiciones del reglamento en los términos del artículo 422 de la Ley Federal del Trabajo.`);

  if (d.version) {
    _p(state, `Versión del reglamento entregada: ${d.version}.`);
  }

  _recuadro(state,
    'Esta constancia acredita unicamente la entrega del reglamento. No implica renuncia de derecho alguno ni conformidad con sanciones futuras: cualquier medida disciplinaria requiere el procedimiento previo de audiencia que el propio reglamento y el artículo 423 fracción X de la Ley Federal del Trabajo establecen.',
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
  const lineas = doc.splitTextToSize(texto, tw - 26);
  _checkY(state, lineas.length * 5 + 8);
  doc.setDrawColor(90, 90, 90); doc.setLineWidth(0.4);
  doc.rect(ml + 2, state.y - 3.2, 4.2, 4.2);
  doc.rect(ml + 12, state.y - 3.2, 4.2, 4.2);
  doc.setFont('Roboto', 'bold'); doc.setFontSize(6);  doc.setTextColor(110, 110, 110);
  doc.text('SI', ml + 2.6, state.y + 4.6);
  doc.text('NO', ml + 12.2, state.y + 4.6);
  doc.setFont('Roboto', 'normal'); doc.setFontSize(9); doc.setTextColor(50, 50, 50);
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
    doc.setFont('Roboto', 'normal'); doc.setFontSize(8); doc.setTextColor(60, 60, 60);
    if (repsP[i]) doc.text(repsP[i], ml + colW / 2, y0 + 4.5, { align: 'center' });
    if (repsT[i]) doc.text(repsT[i], ml + colW + 16 + colW / 2, y0 + 4.5, { align: 'center' });
    doc.setFontSize(6.8); doc.setTextColor(130, 130, 130);
    if (repsP[i]) doc.text('POR EL PATRON', ml + colW / 2, y0 + 8.5, { align: 'center' });
    if (repsT[i]) doc.text('POR LAS PERSONAS TRABAJADORAS', ml + colW + 16 + colW / 2, y0 + 8.5, { align: 'center' });
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
    'Ley Federal de Protección de Datos Personales en Posesion de los Particulares',
    u, 'AVPRIV'
  );

  _hSeccion(state, 'I. IDENTIDAD Y DOMICILIO DEL RESPONSABLE');
  _p(state, `${u.nombre}${u.rfc ? `, R.F.C. ${u.rfc}` : ''}, con domicilio en ${u.domicilio}${u.ciudad ? `, ${u.ciudad}` : ''}, es responsable del tratamiento de sus datos personales (artículo 15 fracción I de la Ley).`);

  _hSeccion(state, 'II. DATOS PERSONALES QUE SE TRATAN');
  _p(state, `De identificación y contacto: nombre, domicilio, telefono, correo electrónico, fecha y lugar de nacimiento, sexo, estado civil, nacionalidad, firma y fotografía.`);
  _p(state, `De identificación oficial y fiscal: CURP, R.F.C., número de seguridad social, credencial para votar u otra identificación oficial.`);
  _p(state, `Laborales: puesto, area, fecha de ingreso, jornada, asistencia, incidencias, evaluaciones, capacitación, medidas disciplinarias, historial salarial y datos de la relación de trabajo.`);
  _p(state, `Patrimoniales o financieros: salario, prestaciones, cuenta bancaria y CLABE, creditos INFONAVIT o FONACOT, pensiones alimenticias y descuentos. El artículo 7 de la Ley requiere para estos datos su consentimiento expreso, salvo las excepciones de los artículos 9 y 36.`);
  _p(state, `SENSIBLES: estado de salud presente o futuro, incapacidades expedidas por el Instituto Mexicano del Seguro Social, resultados de examenes médicos de ingreso y periodicos, tipo de sangre, enfermedades cronicas y, en su caso, condición de embarazo. Son sensibles conforme al artículo 3 fracción VI de la Ley.`, { bold: true });
  _p(state, `BIOMETRICOS, unicamente si la empresa opera control de asistencia con huella o reconocimiento facial: la plantilla o el identificador derivado de su huella o de su rostro. La lista del artículo 3 fracción VI es enunciativa, no limitativa; por prudencia estos datos reciben el mismo trato reforzado que los sensibles y se recaban con su consentimiento expreso y por escrito.`, { bold: true });

  _hSeccion(state, 'III. FINALIDADES DEL TRATAMIENTO');
  _p(state, `Finalidades primarias, necesarias para la relación de trabajo y que no requieren consentimiento por derivar de una obligación legal o del propio contrato (artículos 9 fracción I y 36 fracciones I, IV y VII de la Ley):`);
  _p(state, `1) Integrar y conservar su expediente laboral, incluidos los documentos que el artículo 804 de la Ley Federal del Trabajo obliga al patron a conservar y exhibir en juicio. 2) Calcular y pagar salario, prestaciones y finiquitos. 3) Cumplir obligaciones ante el Instituto Mexicano del Seguro Social, el INFONAVIT, el Servicio de Administración Tributaria y las autoridades laborales. 4) Controlar asistencia, jornada e incidencias. 5) Administrar la seguridad y salud en el trabajo, incluidas incapacidades y examenes médicos. 6) Ejercer o defender derechos en procedimientos administrativos o judiciales.`, { indent: 6 });
  _p(state, `Finalidades secundarias, que NO son necesarias para la relación de trabajo y a las que usted puede oponerse sin que ello afecte su contratación ni sus condiciones de trabajo: ${d.finalidades_secundarias || 'difusión interna de felicitaciones y aniversarios; uso de su imagen en materiales internos o de comunicación institucional; encuestas de clima laboral identificadas'}.`);
  _p(state, `Si la empresa pretende tratar sus datos para una finalidad distinta de las aquí previstas, deberá obtener nuevamente su consentimiento (artículo 11 de la Ley).`);

  _hSeccion(state, 'IV. LIMITAR EL USO O DIVULGACIÓN DE SUS DATOS');
  _p(state, `Puede solicitar en cualquier momento que se límite el uso o la divulgación de sus datos, y oponerse a las finalidades secundarias, escribiendo a ${contactoArco}. La negativa a las finalidades secundarias no tendrá consecuencia alguna sobre su relación de trabajo.`);

  _hSeccion(state, 'V. TRANSFERENCIAS Y ENCARGADOS');
  _p(state, `Sus datos se transfieren al Instituto Mexicano del Seguro Social, al INFONAVIT, al Servicio de Administración Tributaria y a las autoridades laborales y judiciales que los requieran. Estas transferencias no requieren su consentimiento porque están previstas en la Ley y son necesarias para el mantenimiento de la relación jurídica (artículo 36 fracciones I, V, VI y VII).`);
  _p(state, `${d.encargados || 'El despacho contable, el proveedor de nomina y el proveedor del sistema de administración de personal'} tratan sus datos POR CUENTA de la empresa: son personas encargadas en términos del artículo 3 fracción XII de la Ley, no terceros receptores, y están obligadas a guardar confidencialidad conforme al artículo 20, obligación que subsiste aun despues de terminada su relación con la empresa.`);
  _p(state, `Cualquier otra transferencia a un tercero distinto de las anteriores requerira su consentimiento, y al tercero se le comunicara este aviso y las finalidades a las que usted sujeto el tratamiento (artículo 35 de la Ley).`);

  _hSeccion(state, 'VI. DERECHOS ARCO Y REVOCACIÓN DEL CONSENTIMIENTO');
  _p(state, `Usted puede Acceder a sus datos, solicitar su Rectificación cuando sean inexactos o incompletos, su Cancelación, u Oponerse a su tratamiento (artículos 21 a 26 de la Ley). La solicitud debe presentarse en ${contactoArco} y contener su nombre y domicilio o medio para recibir notificaciones, los documentos que acrediten su identidad, la descripción clara de los datos y del derecho que pretende ejercer (artículo 28).`);
  _p(state, `La empresa comunicara su determinación en un plazo máximo de VEINTE DÍAS y, de resultar procedente, la hará efectiva dentro de los QUINCE DÍAS siguientes; ambos plazos pueden ampliarse una sola vez por un periodo igual cuando las circunstancias lo justifiquen (artículo 31). El ejercicio de los derechos ARCO es gratuito: solo pueden cobrarse los costos de reproducción, copias o envio (artículo 34).`);
  _p(state, `Puede revocar su consentimiento en cualquier momento, sin efectos retroactivos, por el mismo medio (artículo 7). La revocación no procede respecto de los datos cuyo tratamiento la empresa deba mantener por disposición legal o para el cumplimiento de la propia relación de trabajo (artículo 25 fracciones I y II).`);

  _hSeccion(state, 'VII. CONSERVACIÓN, BLOQUEO Y SUPRESION');
  _p(state, `Sus datos se conservan mientras dure la relación de trabajo y despues por los plazos que fija el artículo 804 de la Ley Federal del Trabajo: el contrato individual mientras dure la relación y hasta un año despues; las listas de raya, controles de asistencia y comprobantes de utilidades, vacaciones, aguinaldos, primas y cuotas de seguridad social, durante el último año y un año despues de extinguida la relación. Los plazos fiscales y de seguridad social pueden ser mayores.`);
  _p(state, `Cumplida la finalidad y vencidos los plazos, los datos se bloquean y despues se suprimen (artículos 3 fracción III y 10 de la Ley).`);

  _hSeccion(state, 'VIII. MEDIDAS DE SEGURIDAD');
  _p(state, `La empresa mantiene medidas de seguridad administrativas, técnicas y fisicas para proteger sus datos contra dano, perdida, alteración, destrucción o uso, acceso o tratamiento no autorizado (artículo 18). Si ocurre una vulneración que afecte de forma significativa sus derechos patrimoniales o morales, se le informara de forma inmediata (artículo 19).`);

  _hSeccion(state, 'IX. CAMBIOS AL AVISO Y AUTORIDAD');
  _p(state, `Cualquier cambio a este aviso se le comunicara mediante ${d.medio_cambios || 'aviso fijado en los lugares de mayor afluencia del centro de trabajo y, en su caso, por correo electrónico institucional'} (artículo 15 fracción VI). Versión vigente: ${version}.`);
  _p(state, `Si considera que su derecho a la protección de datos personales ha sido lesionado, puede acudir ante la Secretaria Anticorrupcion y Buen Gobierno, autoridad competente conforme al artículo 3 fracción XV de la Ley.`);

  _recuadro(state,
    'Este aviso se pone a su disposición en el momento en que se recaban sus datos, conforme al artículo 16 de la Ley. Para los datos sensibles y biometricos se recaba además un consentimiento expreso y por escrito, en documento separado (artículo 8).',
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
    'Artículo 8 de la Ley Federal de Protección de Datos Personales en Posesion de los Particulares',
    u, 'CONSEN'
  );
  _ciudadFecha(state, u.ciudad || '', fecha);

  _p(state, `Yo, ${trab.nombre}${trab.curp ? `, con CURP ${trab.curp}` : ''}, manifiesto que recibi y lei el Aviso de Privacidad de ${u.nombre}, que se me explico su contenido y que tuve oportunidad de preguntar lo que considere necesario.`);

  _p(state, `Sabiendo que el artículo 8 de la Ley exige para los datos personales sensibles mi consentimiento EXPRESO Y POR ESCRITO, y que puedo otorgarlo o negarlo libremente respecto de cada finalidad, manifiesto lo siguiente marcando la casilla que corresponda:`);

  _gap(state, 3);
  _pdfcCasilla(state, 'Consiento el tratamiento de mis datos de SALUD (incapacidades expedidas por el IMSS, diagnosticos que consten en ellas y ausencias por enfermedad) para el pago de subsidios y prestaciones, el control de incidencias y el cumplimiento de las obligaciones del patron ante el IMSS.');
  _pdfcCasilla(state, 'Consiento el tratamiento de los resultados de los EXAMENES MÉDICOS de ingreso y periodicos, para determinar mi aptitud para el puesto y cumplir las obligaciones de seguridad y salud en el trabajo.');
  _pdfcCasilla(state, 'Consiento el tratamiento de mi TIPO DE SANGRE, alergias, enfermedades cronicas y datos de contacto de emergencia, para poder auxiliarme en caso de accidente o urgencia médica.');
  _pdfcCasilla(state, 'Consiento el tratamiento de mis DATOS BIOMETRICOS (huella dactilar o reconocimiento facial) con la única finalidad de registrar mi asistencia. Se me informo que puedo negarlo y usar en su lugar el metodo alterno de registro que la empresa tenga habilitado, sin consecuencia alguna.');

  if (Array.isArray(d.casillas_adicionales)) {
    for (const c of d.casillas_adicionales.filter(Boolean)) _pdfcCasilla(state, c);
  }

  _gap(state, 2);
  _p(state, `Se me informo que: a) el tratamiento se limitara al mínimo indispensable y por el periodo mínimo necesario (artículo 12 de la Ley); b) puedo revocar este consentimiento en cualquier momento, sin efectos retroactivos, por el medio senalado en el Aviso de Privacidad (artículo 7); c) la negativa a cualquiera de los tratamientos anteriores no puede ser causa de que se me niegue la contratación, se modifiquen mis condiciones de trabajo o se me sancione; y d) aun revocado el consentimiento, la empresa conservara los datos que deba mantener por disposición legal o para acreditar el cumplimiento de sus obligaciones (artículo 25 fracciones I y II).`);

  _recuadro(state,
    'Si marcas NO en la casilla de datos biometricos, la empresa debe habilitarte un metodo alterno de registro de asistencia. Condicionar el empleo a la entrega de la huella no es un consentimiento libre, y un consentimiento que no es libre no cumple el artículo 3 fracción IV de la Ley.',
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
 * consentimiento genérico no legítima nada.
 */
function generateConsentimientoMonitoreo(empresa, trab, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);
  const medios = (d.medios || []).filter(Boolean);

  if (!medios.length) {
    throw new Error(
      'Indica al menos un medio de monitoreo (correo corporativo, GPS, videovigilancia, uso de imagen). ' +
      'El art. 3 fr. IV de la LFPDPPP define el consentimiento como una manifestación "específica e ' +
      'informada": un consentimiento genérico de monitoreo no legítima ninguno en particular.'
    );
  }

  const fecha = d.fecha || new Date().toISOString().split('T')[0];
  const state = _initDocLegal(
    'Consentimiento Informado de Monitoreo y Uso de Imagen',
    'Ley Federal de Protección de Datos Personales en Posesion de los Particulares',
    u, 'CONMON'
  );
  _ciudadFecha(state, u.ciudad || '', fecha);

  _p(state, `Yo, ${trab.nombre}, en mi carácter de persona trabajadora de ${u.nombre}, manifiesto que se me informo de forma previa y expresa lo siguiente respecto de los medios de supervisión que la empresa utiliza:`);

  const CATALOGO = {
    correo: {
      titulo: 'Correo electrónico y equipos corporativos',
      texto: 'La cuenta de correo, los equipos y los sistemas que la empresa me proporciona son herramientas de trabajo y su uso debe ser laboral. La empresa puede revisar la información contenida en ellos con fines de seguridad de la información, auditoria y cumplimiento normativo. Se me recomienda no almacenar información personal en ellos: si lo hago, debo identificarla como tal.',
      casilla: 'Consiento la revisión del correo y los equipos corporativos en los términos descritos.',
    },
    gps: {
      titulo: 'Geolocalización de vehiculos y dispositivos',
      texto: 'Los vehiculos y dispositivos asignados cuentan con geolocalización, que opera unicamente durante la jornada de trabajo y con la finalidad de coordinar rutas, acreditar visitas y proteger los bienes de la empresa. No se utiliza para seguirme fuera de la jornada.',
      casilla: 'Consiento la geolocalización del vehiculo o dispositivo asignado durante la jornada.',
    },
    video: {
      titulo: 'Videovigilancia',
      texto: 'El centro de trabajo cuenta con camaras en las areas comunes y operativas, senalizadas, con fines de seguridad de las personas y los bienes. No hay camaras en sanitarios, vestidores ni areas de descanso. Las grabaciones se conservan por el periodo mínimo necesario y solo acceden a ellas las personas autorizadas.',
      casilla: 'Me doy por enterado de la videovigilancia en las areas senalizadas del centro de trabajo.',
    },
    imagen: {
      titulo: 'Uso de imagen',
      texto: 'La empresa desea utilizar mi fotografía o video en materiales internos, institucionales o de difusión. Esta finalidad es SECUNDARIA: no es necesaria para la relación de trabajo y puedo negarla o revocarla en cualquier momento sin consecuencia alguna.',
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

  _hSeccion(state, 'PROPORCIONALIDAD Y LÍMITES');
  _p(state, `La supervisión se limita a lo necesario para su objetivo y no invade mi vida privada. Tratandose de teletrabajo, los mecanismos y tecnologias de supervisión deben ser proporcionales a su objetivo, garantizar mi derecho a la intimidad y respetar la normativa de protección de datos; las camaras y microfonos solo pueden usarse de manera extraordinaria o cuando la naturaleza de mis funciones lo requiera (artículo 330-I de la Ley Federal del Trabajo).`);
  _p(state, `Puedo revocar este consentimiento en cualquier momento, sin efectos retroactivos, por el medio senalado en el Aviso de Privacidad (artículo 7 de la Ley). La revocación no alcanza a los tratamientos que la empresa deba mantener por disposición legal o por seguridad de las personas.`);

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
    'Protocolo para Prevenir la Discriminación y Atender la Violencia Laboral',
    'Artículo 132 fracción XXXI de la Ley Federal del Trabajo',
    u, 'PROTVL'
  );

  _p(state, `Protocolo de ${u.nombre}, implementado en acuerdo con las personas trabajadoras el ${formatDateLong(fecha)}, para prevenir la discriminación por razones de género, atender los casos de violencia y acoso u hostigamiento sexual, y erradicar el trabajo forzoso e infantil.`);

  _recuadro(state,
    'El artículo 3o. de la Ley Federal del Trabajo declara de interes social garantizar un ambiente laboral libre de discriminación y de violencia. Este protocolo aplica a todas las personas que laboran en el centro de trabajo, cualquiera que sea su jerarquia, y a quienes acuden a el por razones de trabajo.',
    'info');

  _hSeccion(state, '1. DEFINICIONES (ARTÍCULO 3o. BIS LFT)');
  _p(state, `Hostigamiento: el ejercicio del poder en una relación de subordinación real de la victima frente al agresor en el ambito laboral, que se expresa en conductas verbales, fisicas o ambas.`);
  _p(state, `Acoso sexual: una forma de violencia en la que, si bien no existe la subordinación, hay un ejercicio abusivo del poder que conlleva a un estado de indefensión y de riesgo para la victima, independientemente de que se realice en uno o varios eventos.`);
  _p(state, `Discriminación: cualquier distinción, exclusión o preferencia por origen etnico o nacional, género, edad, discapacidad, condición social, condiciones de salud, religion, condición migratoria, opiniones, preferencias sexuales, estado civil o cualquier otra que atente contra la dignidad humana (artículo 3o. de la Ley). No se consideran discriminatorias las distinciones que se sustenten en las calificaciones particulares que exija una labor determinada.`);

  _hSeccion(state, '2. PROHIBICIONES A CARGO DE LA EMPRESA');
  _p(state, `Queda prohibido a la empresa y a sus representantes realizar actos de hostigamiento o acoso sexual contra cualquier persona en el lugar de trabajo, así como PERMITIR O TOLERAR esos actos en el centro de trabajo (artículo 133 fracciones XII y XIII de la Ley Federal del Trabajo). La tolerancia es por si misma una infracción: no basta con no ser el agresor.`);
  _p(state, `Queda igualmente prohibido exigir certificados médicos de no embarazo para el ingreso, permanencia o ascenso, y despedir o coaccionar a una trabajadora para que renuncie por estar embarazada, por cambio de estado civil o por tener el cuidado de hijos menores (artículo 133 fracciones XIV y XV).`);

  _hSeccion(state, '3. COMO SE DENUNCIA');
  _p(state, `Las denuncias se presentan ante ${d.responsable_recepcion}${d.medio_denuncia ? `, por ${d.medio_denuncia}` : ''}. Pueden presentarlas la persona afectada o cualquiera que tenga conocimiento de los hechos. Se admiten denuncias verbales, que se asentaran por escrito y se leeran a quien las formula antes de firmarlas.`);
  _p(state, `Si la persona senalada como agresora es precisamente quien recibe las denuncias, o su superior jerarquico, la denuncia se presenta ante ${d.responsable_alterno || 'la persona que ocupe la representación legal de la empresa o, en su defecto, ante la Procuraduria de la Defensa del Trabajo'}. Una via de denuncia que pasa por el denunciado no es una via de denuncia.`);
  _p(state, `La denuncia debe contener, en la medida de lo posible: nombre de quien denuncia y datos para contactarle, descripción de los hechos con fecha, hora y lugar, nombre de la persona senalada y de quienes presenciaron los hechos, y las pruebas de que se disponga. La falta de alguno de estos datos no impide iniciar la investigación.`);

  _hSeccion(state, '4. MEDIDAS DE PROTECCIÓN INMEDIATAS');
  _p(state, `Recibida la denuncia, la empresa adoptara de inmediato las medidas necesarias para evitar el contacto entre las personas involucradas y prevenir represalias: cambio temporal de area, horario o linea de reporte de la PERSONA SENALADA —no de quien denuncia—, suspensión del ejercicio de facultades disciplinarias sobre la persona denunciante, y cualquier otra proporcional al caso.`);
  _p(state, `Las medidas de protección son cautelares y no prejuzgan sobre la responsabilidad. Trasladar o cambiar de turno a quien denuncia, en lugar de a quien fue senalado, constituye una represalia.`, { bold: true });

  _hSeccion(state, '5. INVESTIGACIÓN Y DEBIDO PROCESO');
  _p(state, `La investigación se conduce por ${d.responsable_investigacion || d.responsable_recepcion} y observa las garantías siguientes:`);
  _p(state, `a) Se hace saber a la persona senalada, por escrito, los hechos que se le atribuyen y la fecha en que habrian ocurrido. b) Se le concede audiencia para que manifieste lo que a su derecho convenga y ofrezca pruebas. c) Se recaban las declaraciones de quienes presenciaron los hechos y las demas pruebas conducentes. d) Todas las actuaciones se asientan en acta circunstanciada. e) La investigación concluye en un plazo de ${d.plazo_investigacion || 'quince días habiles'}, prorrogable por una sola vez cuando la complejidad del caso lo justifique.`, { indent: 6 });
  _p(state, `Sin audiencia de la persona senalada no hay investigación válida: una sanción impuesta sin oirla se cae, y con ella se cae la defensa de la empresa frente a la persona denunciante.`);

  _hSeccion(state, '6. CONFIDENCIALIDAD Y PROHIBICIÓN DE REPRESALIAS');
  _p(state, `La identidad de quien denuncia, de quien es senalado y de quienes declaran, así como el contenido del expediente, son confidenciales. Solo acceden a el quienes intervienen en la investigación y las autoridades que legalmente lo requieran. Los datos de la investigación son datos personales y se tratan conforme al Aviso de Privacidad de la empresa.`);
  _p(state, `Queda prohibida toda represalia contra quien denuncia, declara o participa en la investigación. Las represalias se sancionan conforme a este protocolo, con independencia de que la denuncia original resulte o no fundada.`);

  _hSeccion(state, '7. RESOLUCIÓN Y CONSECUENCIAS');
  _p(state, `Concluida la investigación se emite una resolución escrita, fundada y motivada, que se notifica a ambas partes. Según la gravedad, puede dar lugar a medidas de restauración del ambiente laboral, capacitación, amonestacion, suspensión —que no puede exceder de ocho días (artículo 423 fracción X de la Ley)— o rescisión de la relación de trabajo.`);
  _p(state, `La rescisión sin responsabilidad para el patron procede por los actos inmorales o el hostigamiento y/o acoso sexual del trabajador, previstos en el ARTÍCULO 47 FRACCIÓN VIII de la Ley Federal del Trabajo, y se ejerce con el aviso que ese mismo artículo exige. La acción prescribe en un mes contado desde el día siguiente a aquel en que la empresa tuvo conocimiento de la causa (artículo 517 fracción I).`, { bold: true });
  _p(state, `Cuando la persona agresora sea el patron, sus familiares o cualquiera de sus representantes, la persona trabajadora puede rescindir la relación sin responsabilidad para ella, conforme al artículo 51 fracciones II y III de la Ley, separandose dentro de los treinta días siguientes (artículo 52), con derecho a la indemnización del artículo 50.`);
  _p(state, `Este protocolo no sustituye ni limita el derecho de la persona afectada a denunciar los hechos ante el Ministerio Público o cualquier otra autoridad. La empresa no puede condicionar la atención interna a que la persona se abstenga de acudir a ellas.`);

  _hSeccion(state, '8. TRABAJO FORZOSO E INFANTIL');
  _p(state, `La empresa no admite ninguna forma de trabajo forzoso ni de trabajo infantil. Verifica la edad de toda persona antes de contratarla, no emplea a menores de quince años, y respecto de las personas mayores de quince y menores de dieciocho observa las restricciones de los artículos 175 y 176 de la Ley Federal del Trabajo en labores insalubres o peligrosas. Cualquier indicio de estas practicas, en la empresa o en su cadena de proveedores, debe denunciarse por la via prevista en este protocolo.`);

  _hSeccion(state, '9. DIFUSIÓN Y VIGENCIA');
  _p(state, `Este protocolo se entrega a cada persona trabajadora recabando su acuse, se fija en los lugares de mayor afluencia del centro de trabajo y se revisa al menos cada ${d.periodicidad_revision || 'dos años'} o cuando cambien las circunstancias que lo motivaron.`);

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
    'Acta de Investigación de Violencia Laboral',
    'Protocolo del artículo 132 fracción XXXI de la Ley Federal del Trabajo',
    u, 'ACTINV'
  );

  _p(state, `En ${d.lugar || u.domicilio || u.ciudad}, siendo las ${d.hora_inicio || '____'} horas del ${formatDateLong(fecha)}, se hace constar el desarrollo de la investigación iniciada con motivo de la denuncia recibida el ${d.fecha_denuncia ? formatDateLong(d.fecha_denuncia) : '____________'}, ante ${d.responsable_investigacion || u.representante || '____________'}.`);

  _recuadro(state,
    'Las actuaciones de esta acta son confidenciales. Su divulgación fuera de las personas que intervienen en la investigación y de las autoridades que legalmente la requieran constituye una falta en si misma, y puede exponer a la empresa frente a ambas partes.',
    'warn');

  _hSeccion(state, 'I. PERSONAS QUE INTERVIENEN');
  _table(state, [['Calidad', 'Nombre', 'Puesto']], [
    ['Persona denunciante', d.denunciante_nombre || '(se reserva)', d.denunciante_puesto || ''],
    ['Persona senalada',    d.senalado_nombre || '',                d.senalado_puesto || ''],
    ['Conduce la investigación', d.responsable_investigacion || u.representante || '', d.responsable_puesto || ''],
  ]);

  _hSeccion(state, 'II. HECHOS DENUNCIADOS');
  _p(state, d.hechos_denunciados);

  _hSeccion(state, 'III. MEDIDAS DE PROTECCIÓN ADOPTADAS');
  _p(state, d.medidas_proteccion || 'No se adoptaron medidas de protección. Se hace constar la razón: ______________________________.');

  _hSeccion(state, 'IV. AUDIENCIA DE LA PERSONA SENALADA');
  _p(state, `Se hizo saber a la persona senalada, en forma clara, los hechos que se le atribuyen y la fecha en que habrian ocurrido, y se le concedio el uso de la palabra para manifestar lo que a su derecho conviniera y ofrecer pruebas. Manifesto lo siguiente:`);
  _p(state, `"${d.manifestacion_senalado}"`, { indent: 6 });
  if (d.pruebas_senalado) {
    _p(state, `Pruebas ofrecidas por la persona senalada: ${d.pruebas_senalado}.`);
  }

  if (d.declaraciones) {
    _hSeccion(state, 'V. OTRAS DECLARACIONES Y PRUEBAS');
    _p(state, d.declaraciones);
  }

  _hSeccion(state, d.declaraciones ? 'VI. CIERRE' : 'V. CIERRE');
  _p(state, `${d.hora_cierre ? `Siendo las ${d.hora_cierre} horas del día de su fecha se cierra la presente acta. ` : ''}Se hace constar que la investigación continua abierta hasta la emisión de la resolución escrita, que se notificara a ambas partes. Ninguna manifestación contenida en esta acta prejuzga sobre la responsabilidad de persona alguna.`);
  _p(state, `Se apercibe a todos los intervinientes de la prohibición de ejercer represalias contra quien denuncio, declaro o participo en la investigación, con independencia del resultado de esta.`);

  _gap(state, 8);
  const { ml, tw } = state;
  const colW = tw / 2 - 8;
  const y0 = state.y;
  const y1 = _firmaConIdentificacion(state, 'PERSONA SENALADA', d.senalado_nombre, d.senalado_ine, null, ml, colW);
  state.y = y0;
  const y2 = _firmaConIdentificacion(state, 'CONDUCE LA INVESTIGACIÓN',
    d.responsable_investigacion || u.representante, d.responsable_ine, null, ml + colW + 16, colW);
  state.y = Math.max(y1, y2) + 10;

  if (d.testigo1_nombre || d.testigo2_nombre) _bloqueTestigos(state, d);

  return _salidaDoc(state, u, 'acta-investigación-violencia-laboral.pdf', opts);
}

/** Constancia de difusión y entrega del protocolo a una persona trabajadora. */
function generateConstanciaDifusionProtocolo(empresa, trab, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);
  const fecha = d.fecha_entrega || new Date().toISOString().split('T')[0];

  const state = _initDocLegal(
    'Constancia de Difusión del Protocolo de Violencia Laboral',
    'Artículo 132 fracción XXXI de la Ley Federal del Trabajo',
    u, 'ACPROT'
  );
  _ciudadFecha(state, u.ciudad || '', fecha);

  _p(state, `Yo, ${trab.nombre}${trab.puesto ? `, con el puesto de ${trab.puesto}` : ''}, hago constar que en esta fecha:`);
  _p(state, `PRIMERO. Recibi un ejemplar del Protocolo para prevenir la discriminación y atender los casos de violencia y acoso u hostigamiento sexual de ${u.nombre}, y se me explico su contenido.`);
  _p(state, `SEGUNDO. Se me informo la via para presentar denuncias: ${d.responsable_recepcion || '____________________________'}, y la via alterna aplicable cuando la persona senalada sea quien recibe las denuncias o su superior.`);
  _p(state, `TERCERO. Se me informo que la denuncia es confidencial, que están prohibidas las represalias contra quien denuncia o declara, y que puedo acudir en todo momento ante las autoridades que correspondan sin que la empresa pueda condicionar por ello la atención interna.`);
  _p(state, `CUARTO. Se me informo que la empresa no admite ninguna forma de trabajo forzoso ni de trabajo infantil.`);

  _recuadro(state,
    'Esta constancia acredita la difusión del protocolo. No implica que quien la firma acepte hecho alguno ni renuncie a derecho alguno, y no puede usarse en su contra.',
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

// ═══════════════════════════════════════════════════════════════════════════
//  3.4 — NOM-035, COMISIONES MIXTAS Y CONSTANCIAS DE CAPACITACIÓN
//
//  Base legal en la LFT (DOF 14-05-2026):
//
//   · Art. 132 fr. XVI, XVII y XVIII — instalar y operar los centros de
//     trabajo conforme a las normas oficiales mexicanas de seguridad, salud
//     y medio ambiente; cumplirlas; y FIJARLAS VISIBLEMENTE y difundirlas,
//     junto con la información sobre los riesgos a los que se está expuesto.
//     Es lo que obliga a tener una política escrita y difundida.
//   · Art. 509 — comisiones de seguridad e higiene, "compuestas por IGUAL
//     NÚMERO de representantes de los trabajadores y del patrón".
//   · Art. 510 — se desempeñan gratuitamente dentro de las horas de trabajo.
//   · Art. 153-E — Comisiones Mixtas de Capacitación, Adiestramiento y
//     Productividad, "integradas por igual número" de representantes, en las
//     empresas que tengan MÁS DE 50 TRABAJADORES.
//   · Art. 153-V — la constancia de competencias o de habilidades laborales
//     acredita haber llevado Y APROBADO un curso.
//
//  Dos precisiones frente a lo que pedía la auditoría:
//
//   1. No son dos comisiones distintas. La LFT reconoce una sola Comisión
//      Mixta de Capacitación, Adiestramiento y Productividad (arts. 153-E y
//      153-F), que es la misma cuya opinión exige el art. 39-A para el
//      período de prueba.
//   2. La constancia del art. 153-V no es el formato DC-3. El DC-3 es un
//      formato oficial de la STPS; esta constancia acredita el curso entre
//      las partes y sirve de base para llenarlo, y así lo dice en su cuerpo
//      en vez de hacerse pasar por él.
// ═══════════════════════════════════════════════════════════════════════════

/** Las comisiones de los arts. 509 y 153-E exigen IGUAL número por parte. */
function _pdfcExigirParidad(repsP, repsT, articulo) {
  if (!repsP.length || !repsT.length) {
    throw new Error(
      `El ${articulo} de la LFT exige una comisión con representantes de ambas partes. ` +
      'Captura al menos un representante del patrón y uno de las personas trabajadoras.'
    );
  }
  if (repsP.length !== repsT.length) {
    throw new Error(
      `El ${articulo} de la LFT exige que la comisión se componga por IGUAL NÚMERO de ` +
      `representantes de los trabajadores y del patrón. Capturaste ${repsP.length} del patrón y ` +
      `${repsT.length} de las personas trabajadoras: una comisión desequilibrada no cumple el ` +
      'requisito y es de lo primero que revisa la inspección.'
    );
  }
}

/**
 * Política de prevención de riesgos psicosociales (NOM-035-STPS-2018).
 *
 * Se apoya en el art. 132 fr. XVI-XVIII LFT, que es lo que hace exigible una
 * NOM frente al patrón y lo que obliga a fijarla visiblemente. La política no
 * enuncia las obligaciones que la NOM escalona por número de personas: eso
 * depende del centro de trabajo y afirmarlo aquí sería inventar.
 */
function generatePoliticaNOM035(empresa, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);

  if (!d.responsable) {
    throw new Error(
      'Indica quién es responsable de aplicar la política y de recibir las denuncias. ' +
      'Una política sin responsable identificable no se puede acreditar como implementada.'
    );
  }

  const fecha = d.fecha || new Date().toISOString().split('T')[0];
  const state = _initDocLegal(
    'Politica de Prevención de Riesgos Psicosociales',
    'NOM-035-STPS-2018 y artículo 132 fracciones XVI a XVIII de la Ley Federal del Trabajo',
    u, 'NOM035'
  );

  _p(state, `${u.nombre} adopta la presente politica, vigente a partir del ${formatDateLong(fecha)}, en cumplimiento de la Norma Oficial Mexicana NOM-035-STPS-2018, Factores de riesgo psicosocial en el trabajo. Identificación, análisis y prevención, y de las obligaciones que el artículo 132 fracciones XVI, XVII y XVIII de la Ley Federal del Trabajo impone al patron de operar el centro de trabajo conforme a las normas oficiales mexicanas, cumplirlas, y fijarlas visiblemente y difundirlas junto con la información sobre los riesgos a los que el personal esta expuesto.`);

  _hSeccion(state, 'COMPROMISOS');
  _p(state, `1. PREVENIR LOS FACTORES DE RIESGO PSICOSOCIAL. La empresa identifica y analiza los factores de riesgo psicosocial derivados de las condiciones en el ambiente de trabajo, las cargas de trabajo, la falta de control sobre el trabajo, las jornadas y la rotación de turnos que exceden lo previsto en la Ley, la interferencia en la relación trabajo-familia y el liderazgo y las relaciones negativas en el trabajo, y adopta medidas para prevenirlos y controlarlos.`);
  _p(state, `2. PREVENIR LA VIOLENCIA LABORAL. Quedan prohibidos los actos de hostigamiento, acoso, malos tratos y cualquier forma de violencia laboral. Esta politica opera de forma conjunta con el Protocolo de la empresa previsto en el artículo 132 fracción XXXI de la Ley Federal del Trabajo, que fija la via de denuncia y el procedimiento de investigación.`);
  _p(state, `3. PROMOVER UN ENTORNO ORGANIZACIONAL FAVORABLE. La empresa promueve el sentido de pertenencia, la definición clara de responsabilidades, la distribución adecuada de cargas de trabajo, la evaluación y el reconocimiento del desempeno, la participación del personal y la difusión de la información necesaria para desempenar el trabajo.`);
  _p(state, `4. ATENDER LOS ACONTECIMIENTOS TRAUMATICOS SEVEROS. Cuando una persona trabajadora experimente o presencie un acontecimiento traumatico severo con motivo del trabajo, la empresa facilitara su canalización para la atención clinica que corresponda y adoptara las medidas necesarias durante su recuperación.`);

  _hSeccion(state, 'RESPONSABLE Y VIA DE ATENCIÓN');
  _p(state, `Corresponde a ${d.responsable} aplicar esta politica, recibir las quejas y denuncias relacionadas con ella y dar seguimiento a las medidas que se adopten. Las denuncias pueden presentarse ${d.via_denuncia || 'por escrito o de forma verbal, en cuyo caso se asentaran por escrito y se leeran a quien las formula antes de firmarlas'}.`);
  _p(state, `La información que las personas trabajadoras proporcionen con motivo de la identificación y análisis de los factores de riesgo psicosocial y de la evaluación del entorno organizacional se trata de manera confidencial y unicamente con fines de prevención. Los datos de salud que llegaran a recabarse son datos personales sensibles y se tratan conforme al Aviso de Privacidad de la empresa.`);

  _hSeccion(state, 'DIFUSIÓN Y REVISIÓN');
  _p(state, `Esta politica se fija en los lugares mas visibles del centro de trabajo, se entrega a cada persona trabajadora recabando su acuse y se revisa al menos cada ${d.periodicidad || 'dos años'} o cuando cambien las condiciones que la motivaron. Los registros de su aplicación se conservan a disposición de la autoridad laboral.`);

  _gap(state, 10);
  const { ml, tw } = state;
  const anchoFirma = Math.min(tw * 0.6, 110);
  const { doc } = state;
  doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.4);
  doc.line(ml, state.y + 16, ml + anchoFirma, state.y + 16);
  doc.setFont('Roboto', 'bold'); doc.setFontSize(8); doc.setTextColor(30, 30, 30);
  doc.text('POR LA MÁXIMA AUTORIDAD DEL CENTRO DE TRABAJO', ml, state.y + 21);
  doc.setFont('Roboto', 'normal'); doc.setFontSize(8); doc.setTextColor(80, 80, 80);
  doc.text(d.firma_nombre || u.representante || '', ml, state.y + 26);
  state.y += 34;

  return _salidaDoc(state, u, 'politica-nom-035.pdf', opts);
}

/**
 * Acta de integración de la Comisión de Seguridad e Higiene (art. 509 LFT).
 *
 * Punto fijo de inspección de la STPS. Exige paridad porque el art. 509 la
 * describe literalmente como compuesta "por igual número de representantes".
 */
function generateActaComisionSeguridadHigiene(empresa, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);
  const repsP = (d.representantes_patron || []).filter(Boolean);
  const repsT = (d.representantes_trabajadores || []).filter(Boolean);
  _pdfcExigirParidad(repsP, repsT, 'artículo 509');

  const fecha = d.fecha_sesion || new Date().toISOString().split('T')[0];
  const state = _initDocLegal(
    'Acta de Integración de la Comisión de Seguridad e Higiene',
    'Artículos 509 y 510 de la Ley Federal del Trabajo',
    u, 'ACSH'
  );

  _p(state, `En ${d.lugar || u.domicilio || u.ciudad}, siendo las ${d.hora_inicio || '____'} horas del ${formatDateLong(fecha)}, se reunieron las personas que al final firman para integrar la Comisión de Seguridad e Higiene del centro de trabajo de ${u.nombre}, conforme al artículo 509 de la Ley Federal del Trabajo.`);

  _hSeccion(state, 'PRIMERO. INTEGRACIÓN');
  _p(state, `La comisión se integra por igual número de representantes de las personas trabajadoras y del patron, como sigue:`);
  _table(state,
    [['Representantes del patron', 'Representantes de las personas trabajadoras']],
    repsP.map((r, i) => [r, repsT[i] || '']));
  _p(state, `Coordina la comisión ${d.coordinador || repsP[0]} y funge como secretario ${d.secretario || repsT[0]}.`);

  _hSeccion(state, 'SEGUNDO. OBJETO');
  _p(state, `Conforme al artículo 509 de la Ley, la comisión tiene por objeto INVESTIGAR LAS CAUSAS DE LOS ACCIDENTES Y ENFERMEDADES, PROPONER MEDIDAS PARA PREVENIRLOS Y VIGILAR QUE SE CUMPLAN. Para ello realizara recorridos de verificación ${d.periodicidad_recorridos || 'al menos cada tres meses'} y levantara acta de cada uno con las condiciones inseguras detectadas y las medidas propuestas.`);

  _hSeccion(state, 'TERCERO. GRATUIDAD Y HORARIO');
  _p(state, `Las funciones de la comisión se desempenan GRATUITAMENTE Y DENTRO DE LAS HORAS DE TRABAJO (artículo 510 de la Ley Federal del Trabajo). El tiempo dedicado a ellas se considera tiempo efectivamente laborado y no puede descontarse ni compensarse fuera de la jornada.`, { bold: true });

  _hSeccion(state, 'CUARTO. VIGENCIA');
  _p(state, `La comisión entra en funciones a partir de esta fecha y se mantiene vigente hasta su renovación. Cualquier cambio en su integración se hará constar en acta y se comunicara al personal.`);

  if (d.acuerdos) {
    _hSeccion(state, 'QUINTO. ACUERDOS');
    _p(state, d.acuerdos);
  }

  if (d.hora_cierre) {
    _p(state, `No habiendo otro asunto que tratar, se cierra la presente acta siendo las ${d.hora_cierre} horas del día de su fecha.`);
  }

  _gap(state, 6);
  _pdfcFirmasMixtas(state, repsP, repsT);

  return _salidaDoc(state, u, 'acta-comisión-seguridad-higiene.pdf', opts);
}

/**
 * Acta de integración de la Comisión Mixta de Capacitación, Adiestramiento y
 * Productividad (art. 153-E LFT).
 *
 * Es la MISMA comisión cuya opinión exige el art. 39-A para dar por terminada
 * una relación al concluir el período de prueba. El art. 153-E la vuelve
 * obligatoria en empresas de más de 50 trabajadores; por debajo de ese número
 * se puede constituir voluntariamente, y conviene hacerlo justo por el 39-A.
 */
function generateActaComisionCapacitacion(empresa, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);
  const repsP = (d.representantes_patron || []).filter(Boolean);
  const repsT = (d.representantes_trabajadores || []).filter(Boolean);
  _pdfcExigirParidad(repsP, repsT, 'artículo 153-E');

  const fecha = d.fecha_sesion || new Date().toISOString().split('T')[0];
  const state = _initDocLegal(
    'Acta de Integración de la Comisión Mixta de Capacitación, Adiestramiento y Productividad',
    'Artículos 153-E y 153-F de la Ley Federal del Trabajo',
    u, 'ACMCAP'
  );

  _p(state, `En ${d.lugar || u.domicilio || u.ciudad}, siendo las ${d.hora_inicio || '____'} horas del ${formatDateLong(fecha)}, se reunieron las personas que al final firman para integrar la Comisión Mixta de Capacitación, Adiestramiento y Productividad de ${u.nombre}.`);

  // El art. 153-E la impone a partir de más de 50 trabajadores. Constituirla
  // con menos no sobra: el art. 39-A pide su opinión para terminar en período
  // de prueba, sin importar el tamaño de la empresa.
  if (typeof d.num_trabajadores === 'number' && d.num_trabajadores <= 50) {
    _recuadro(state,
      `El artículo 153-E de la Ley Federal del Trabajo obliga a constituir esta comisión en las empresas que tengan MAS DE 50 TRABAJADORES; esta empresa declara ${d.num_trabajadores}. La comisión se constituye de forma voluntaria, y su integración resulta igualmente útil: el artículo 39-A exige tomar en cuenta la opinion de esta comisión para dar por terminada la relación al concluir el periodo de prueba, sin importar el tamano de la empresa.`,
      'info');
  }

  _hSeccion(state, 'PRIMERO. INTEGRACIÓN');
  _table(state,
    [['Representantes del patron', 'Representantes de las personas trabajadoras']],
    repsP.map((r, i) => [r, repsT[i] || '']));

  _hSeccion(state, 'SEGUNDO. FUNCIONES (ARTÍCULO 153-E)');
  _p(state, `I. Vigilar, instrumentar, operar y mejorar los sistemas y los programas de capacitación y adiestramiento. II. Proponer los cambios necesarios en la maquinaria, los equipos, la organización del trabajo y las relaciones laborales que incrementen la productividad. III. Proponer las medidas acordadas por el Comite Nacional y los Comites Estatales de Productividad. IV. Vigilar el cumplimiento de los acuerdos de productividad. V. Resolver las objeciones que presenten las personas trabajadoras con motivo de la distribución de los beneficios de la productividad.`, { indent: 6 });
  _p(state, `Adicionalmente, corresponde a esta comisión emitir la opinion que el artículo 39-A de la Ley exige para dar por terminada la relación de trabajo al concluir el periodo de prueba, y la del artículo 39-B tratandose de la capacitación inicial.`);

  _hSeccion(state, 'TERCERO. PLANES Y PROGRAMAS');
  _p(state, `La comisión elaborara y revisara los planes y programas de capacitación, adiestramiento y productividad, que deberán referirse a periodos no mayores de dos años y comprender todos los puestos y niveles existentes en la empresa (artículo 153-H). La empresa los conservara a disposición de la Secretaria del Trabajo y Prevision Social y de la Secretaria de Economia (artículo 153-F Bis).`);

  if (d.acuerdos) {
    _hSeccion(state, 'CUARTO. ACUERDOS');
    _p(state, d.acuerdos);
  }

  if (d.hora_cierre) {
    _p(state, `No habiendo otro asunto que tratar, se cierra la presente acta siendo las ${d.hora_cierre} horas del día de su fecha.`);
  }

  _gap(state, 6);
  _pdfcFirmasMixtas(state, repsP, repsT);

  return _salidaDoc(state, u, 'acta-comisión-capacitación.pdf', opts);
}

/**
 * Constancia de competencias o de habilidades laborales (art. 153-V LFT).
 *
 * El art. 153-V la define como el documento con el cual el trabajador acredita
 * haber llevado Y APROBADO un curso: por eso se niega a emitirla cuando el
 * curso no se aprobó. Y dice en su cuerpo que no es el formato DC-3, en vez de
 * hacerse pasar por él.
 */
function generateConstanciaDC3(empresa, trab, curso = {}, sucursal = null, opts = {}) {
  const c = curso || {};
  const u = resolveUbicacion(empresa, sucursal);

  if (!c.nombre_curso) {
    throw new Error('Indica el nombre del curso: la constancia del art. 153-V LFT acredita un curso concreto.');
  }
  if (!c.fecha_inicio) {
    throw new Error('Indica la fecha de inicio del curso.');
  }
  if (c.aprobado === false) {
    throw new Error(
      'El artículo 153-V de la LFT define la constancia como el documento con el cual el trabajador ' +
      'acredita haber llevado Y APROBADO un curso. No puede expedirse por un curso no aprobado: ' +
      'registra el resultado como aprobado o no expidas la constancia.'
    );
  }

  const state = _initDocLegal(
    'Constancia de Competencias o de Habilidades Laborales',
    'Artículo 153-V de la Ley Federal del Trabajo',
    u, 'CONSTCAP'
  );

  _p(state, `${u.nombre}${u.rfc ? `, R.F.C. ${u.rfc}` : ''}, hace constar que:`);
  _gap(state, 2);

  _table(state, [['Concepto', 'Dato']], [
    ['Nombre de la persona trabajadora', trab.nombre || ''],
    ['CURP',    trab.curp || ''],
    ['Puesto',  trab.puesto || ''],
    ['Nombre del curso', c.nombre_curso],
    ['Area tematica',    c.area_tematica || ''],
    ['Duración en horas', c.horas != null ? String(c.horas) : ''],
    ['Periodo', `${formatDateShort(c.fecha_inicio)}${c.fecha_fin ? ' – ' + formatDateShort(c.fecha_fin) : ''}`],
    ['Instructor', c.instructor_nombre || ''],
    ['Registro del agente capacitador ante la STPS', c.instructor_registro_stps || 'No aplica'],
  ]);

  _p(state, `Llevo y APROBO el curso senalado, por lo que se expide la presente constancia con fundamento en el artículo 153-V de la Ley Federal del Trabajo.`);
  _p(state, `Esta constancia surte plenos efectos para fines de ascenso dentro de esta empresa. La empresa remitira a la Secretaria del Trabajo y Prevision Social, para su registro y control, la lista de las constancias expedidas a su personal (artículo 153-V, segundo y tercer párrafos).`);

  _recuadro(state,
    'Esta constancia acredita el curso entre las partes y sirve de base para llenar el formato oficial DC-3 que expide la Secretaria del Trabajo y Prevision Social. No sustituye a ese formato: para los tramites que lo requieran debe presentarse el DC-3 vigente.',
    'warn');

  _gap(state, 8);
  const { ml, tw } = state;
  const colW = tw / 2 - 8;
  const y0 = state.y;
  const y1 = _firmaConIdentificacion(state, 'INSTRUCTOR', c.instructor_nombre, null, null, ml, colW);
  state.y = y0;
  const y2 = _firmaConIdentificacion(state, 'POR LA EMPRESA',
    c.firma_nombre || u.representante, null, null, ml + colW + 16, colW);
  state.y = Math.max(y1, y2) + 10;

  const y3 = state.y;
  _firmaConIdentificacion(state, 'RECIBE — LA PERSONA TRABAJADORA', trab.nombre,
    trab.num_identificacion, null, ml, colW);
  state.y = Math.max(state.y, y3) + 4;

  return _salidaDoc(state, u, _nombreArchivo('constancia-capacitación', trab), opts);
}

// ═══════════════════════════════════════════════════════════════════════════
//  3.7 — ANEXO DE TELETRABAJO (Capítulo XII Bis LFT, arts. 330-A a 330-K)
//
//  Art. 330-A: se rigen por el capítulo las relaciones que se desarrollan
//  MÁS DEL CUARENTA POR CIENTO del tiempo en el domicilio de la persona
//  trabajadora o en el que ésta elija. No es teletrabajo el ocasional o
//  esporádico.
//
//  Art. 330-B: las condiciones se hacen constar POR ESCRITO y cada parte
//  conserva un ejemplar. Además de lo del art. 25, el contrato debe contener
//  el equipo e insumos entregados (fr. IV), la descripción y MONTO que el
//  patrón pagará por los servicios en el domicilio (fr. V) y los mecanismos
//  de contacto y supervisión (fr. VI).
//
//  Por eso el generador exige inventario, monto y mecanismos: un anexo sin
//  ellos deja fuera justamente lo que el capítulo vino a regular.
// ═══════════════════════════════════════════════════════════════════════════

function generateAnexoTeletrabajo(empresa, trab, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);

  const equipos = (d.equipos || []).filter(e => e && (e.descripcion || e.marca || e.serie));
  if (!equipos.length) {
    throw new Error(
      'Captura el inventario de equipo e insumos entregados. El art. 330-B fr. IV LFT exige que el ' +
      'contrato lo contenga, y el art. 330-E fr. IV obliga al patrón a llevar ese registro: es lo ' +
      'primero que comprueba el inspector (art. 330-K fr. I) y lo que evita discutir después quién ' +
      'se quedó con qué.'
    );
  }
  if (d.monto_servicios == null || d.monto_servicios === '') {
    throw new Error(
      'Indica el monto que la empresa pagará por los servicios en el domicilio. El art. 330-B fr. V ' +
      'LFT exige "la descripción y monto", y el art. 330-E fr. III obliga a asumir el pago de las ' +
      'telecomunicaciones y la parte proporcional de electricidad. Un anexo que lo deja abierto no ' +
      'documenta la obligación que la ley impone.'
    );
  }
  if (!d.mecanismos_contacto) {
    throw new Error(
      'Describe los mecanismos de contacto y supervisión. El art. 330-B fr. VI LFT los exige, y sin ' +
      'ellos tampoco se puede delimitar el derecho a la desconexión del art. 330-E fr. VI.'
    );
  }

  const fecha = d.fecha || new Date().toISOString().split('T')[0];
  const pct = d.pct_tiempo_remoto != null ? Number(d.pct_tiempo_remoto) : null;

  const state = _initDocLegal(
    'Anexo de Teletrabajo al Contrato Individual de Trabajo',
    'Capítulo XII Bis de la Ley Federal del Trabajo, artículos 330-A a 330-K',
    u, 'ANXTEL'
  );
  _ciudadFecha(state, u.ciudad || '', fecha);

  _p(state, `Anexo que forma parte integrante del contrato individual de trabajo celebrado entre ${u.nombre}${u.rfc ? `, R.F.C. ${u.rfc}` : ''}, en adelante EL PATRON, y ${trab.nombre}${trab.curp ? `, CURP ${trab.curp}` : ''}, en adelante LA PERSONA TRABAJADORA, con el puesto de ${trab.puesto || '____________'}.`);

  // El capítulo se activa por encima del 40%. Decirlo cuando NO se rebasa es
  // tan importante como decirlo cuando sí: firmar un anexo de teletrabajo por
  // trabajo ocasional confunde el régimen aplicable.
  if (pct != null && pct <= 40) {
    _recuadro(state,
      `Se declara que LA PERSONA TRABAJADORA presta el ${pct}% de su tiempo fuera del centro de trabajo. El artículo 330-A de la Ley Federal del Trabajo sujeta al Capítulo XII Bis a las relaciones que se desarrollan MAS DEL CUARENTA POR CIENTO del tiempo en el domicilio de la persona trabajadora, y expresamente NO considera teletrabajo el que se realiza de forma ocasional o esporadica. Este anexo se suscribe como acuerdo entre las partes; las obligaciones especiales del capítulo son exigibles cuando se rebase ese porcentaje.`,
      'warn');
  }

  _hOrdinal(state, 'PRIMERA', 'Modalidad y porcentaje de tiempo');
  _p(state, `LA PERSONA TRABAJADORA prestara sus servicios bajo la modalidad de teletrabajo${pct != null ? `, durante aproximadamente el ${pct}% de su tiempo` : ''}, en ${d.domicilio_teletrabajo || 'su domicilio'}${d.domicilio_teletrabajo ? '' : ', o en el lugar que ella elija'}. Las funciones, el puesto, el salario y la jornada son los pactados en el contrato individual y no se modifican por este anexo.`);
  _p(state, `La jornada se distribuye conforme a ${d.distribucion_jornada || 'el horario pactado en el contrato individual'}, sin exceder los máximos legales (artículo 330-B fracción VI de la Ley Federal del Trabajo).`);

  _hOrdinal(state, 'SEGUNDA', 'Equipo e insumos entregados');
  _p(state, `EL PATRON proporciona, instala y se encarga del mantenimiento de los equipos necesarios para el teletrabajo (artículo 330-E fracción I). Se entregan los siguientes bienes, que son propiedad de EL PATRON y deben devolverse al concluir la modalidad o la relación de trabajo:`);
  _table(state,
    [['Descripcion', 'Marca y modelo', 'Número de serie', 'Estado']],
    equipos.map(e => [e.descripcion || '', e.marca || '', e.serie || '', e.estado || 'Bueno']));
  _p(state, `LA PERSONA TRABAJADORA se obliga a tener el mayor cuidado en la guarda y conservación de los equipos, materiales y utiles que reciba (artículo 330-F fracción I). El deterioro por el uso normal no le es imputable.`);

  _hOrdinal(state, 'TERCERA', 'Pago de los servicios en el domicilio');
  _p(state, `EL PATRON asume los costos derivados del teletrabajo, incluido el pago de los servicios de telecomunicación y la parte proporcional de electricidad (artículo 330-E fracción III). Para tal efecto cubrira a LA PERSONA TRABAJADORA la cantidad de ${fmt(Number(d.monto_servicios))} ${d.periodicidad_servicios || 'por mes'}${d.desglose_servicios ? `, correspondiente a ${d.desglose_servicios}` : ''}.`);
  _p(state, `Este pago tiene naturaleza de reembolso de gastos derivados del trabajo y no forma parte del salario. Cuando el costo real exceda de manera significativa el monto pactado, las partes lo revisaran. LA PERSONA TRABAJADORA se obliga a informar con oportunidad sobre los costos pactados para el uso de los servicios de telecomunicaciones y del consumo de electricidad (artículo 330-F fracción II).`);

  _hOrdinal(state, 'CUARTA', 'Mecanismos de contacto y supervisión');
  _p(state, d.mecanismos_contacto);
  _p(state, `Los mecanismos, sistemas operativos y cualquier tecnología utilizada para supervisar el teletrabajo serán PROPORCIONALES A SU OBJETIVO, garantizaran el derecho a la intimidad de LA PERSONA TRABAJADORA y respetaran el marco jurídico de protección de datos personales. Solo podrán utilizarse camaras de video y microfonos de manera extraordinaria, o cuando la naturaleza de las funciones lo requiera (artículo 330-I de la Ley Federal del Trabajo).`);

  _hOrdinal(state, 'QUINTA', 'Derecho a la desconexion');
  _p(state, `EL PATRON respeta el DERECHO A LA DESCONEXION de LA PERSONA TRABAJADORA al término de la jornada laboral (artículo 330-E fracción VI). Fuera del horario pactado, en días de descanso, vacaciones e incapacidades, no esta obligada a responder llamadas, mensajes ni correos, y su falta de respuesta no puede considerarse falta ni ser motivo de sanción alguna.`, { bold: true });
  _p(state, `El trabajo efectivamente prestado fuera de la jornada, cuando sea autorizado previamente por EL PATRON, se paga como tiempo extraordinario en los términos de los artículos 66 a 68 de la Ley Federal del Trabajo.`);

  _hOrdinal(state, 'SEXTA', 'Seguridad y salud en el trabajo');
  _p(state, `Las condiciones especiales de seguridad y salud del teletrabajo se rigen por la Norma Oficial Mexicana que expida la Secretaria del Trabajo y Prevision Social, que considera los factores ergonomicos, psicosociales y demas riesgos aplicables (artículo 330-J de la Ley Federal del Trabajo). LA PERSONA TRABAJADORA se obliga a obedecer y conducirse con apego a las disposiciones que en la materia establezca EL PATRON (artículo 330-F fracción III), y EL PATRON a proporcionarle la información y los medios necesarios para cumplirlas.`);
  _p(state, `Los accidentes que ocurran con motivo del teletrabajo, en el lugar y durante el horario convenidos, se consideran riesgos de trabajo y deben reportarse de inmediato para dar el aviso correspondiente al Instituto Mexicano del Seguro Social. EL PATRON mantiene inscrita a LA PERSONA TRABAJADORA en el régimen obligatorio de la seguridad social (artículo 330-E fracción VII).`);

  _hOrdinal(state, 'SEPTIMA', 'Seguridad de la información y datos personales');
  _p(state, `EL PATRON implementa los mecanismos que preserven la seguridad de la información y de los datos utilizados en la modalidad de teletrabajo (artículo 330-E fracción V). LA PERSONA TRABAJADORA se obliga a atender las politicas y mecanismos de protección de datos, así como las restricciones sobre su uso y almacenamiento (artículo 330-F fracción V), y a no instalar programas ajenos al trabajo en el equipo proporcionado.`);

  _hOrdinal(state, 'OCTAVA', 'Voluntariedad y reversibilidad');
  _p(state, `El cambio de la modalidad presencial a teletrabajo es VOLUNTARIO y consta por escrito en este anexo, salvo casos de fuerza mayor debidamente acreditada. Ambas partes tienen DERECHO DE REVERSIBILIDAD a la modalidad presencial (artículo 330-G de la Ley Federal del Trabajo).`, { bold: true });
  _p(state, `Para ejercerlo, la parte interesada lo notificara por escrito a la otra con al menos ${d.aviso_reversibilidad || 'quince días naturales'} de anticipación. Durante ese plazo se acordaran la devolución del equipo y la reincorporación al centro de trabajo. El ejercicio de la reversibilidad no constituye modificación de las demas condiciones de trabajo ni causa de rescisión.`);

  _hOrdinal(state, 'NOVENA', 'Igualdad de trato y capacitación');
  _p(state, `LA PERSONA TRABAJADORA goza de los mismos derechos que el personal presencial en cuanto a remuneración, capacitación, formación, seguridad social, acceso a mejores oportunidades laborales y demas condiciones que ampara el artículo 2o. de la Ley (artículo 330-H). EL PATRON establecera los mecanismos de capacitación y asesoria necesarios para garantizar la adaptación y el uso adecuado de las tecnologias de la información, con especial enfasis en el cambio de modalidad presencial a teletrabajo (artículo 330-E fracción VIII).`);
  _p(state, `EL PATRON facilitara los mecanismos de comunicación y difusión a distancia con que cuente el centro de trabajo, a fin de garantizar que LA PERSONA TRABAJADORA tenga conocimiento de los procedimientos de libertad sindical y negociación colectiva (artículo 330-C, último párrafo).`);

  _recuadro(state,
    'Si la empresa no cuenta con contrato colectivo de trabajo, debe además incluir el teletrabajo en su Reglamento Interior de Trabajo y establecer mecanismos que garanticen la vinculación y el contacto del personal que labora bajo esta modalidad (artículo 330-D de la Ley Federal del Trabajo).',
    'info');

  _p(state, `Leido que fue por ambas partes y enteradas de su contenido y alcance, lo firman por duplicado, conservando cada una un ejemplar (artículo 330-B, primer párrafo).`);

  _gap(state, 8);
  const { ml, tw } = state;
  const colW = tw / 2 - 8;
  const y0 = state.y;
  const y1 = _firmaConIdentificacion(state, 'EL PATRON', d.firma_patron || u.representante,
    d.firma_patron_ine, u.domicilio, ml, colW);
  state.y = y0;
  const y2 = _firmaConIdentificacion(state, 'LA PERSONA TRABAJADORA', trab.nombre,
    trab.num_identificacion, d.domicilio_teletrabajo || trab.domicilio, ml + colW + 16, colW);
  state.y = Math.max(y1, y2) + 8;

  if (d.testigo1_nombre || d.testigo2_nombre) _bloqueTestigos(state, d);

  return _salidaDoc(state, u, _nombreArchivo('anexo-teletrabajo', trab), opts);
}
