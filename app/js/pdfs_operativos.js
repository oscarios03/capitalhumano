/**
 * Capital Humano MX — Documentos operativos de alto valor probatorio
 *
 * Ordenados por lo que más se pelea en juicio. No son documentos "de
 * cumplimiento" —nadie los revisa en una inspección— pero son los que
 * desactivan las reclamaciones más difíciles de desvirtuar, porque invierten
 * la dinámica probatoria del art. 784 LFT: cuando existe un papel firmado por
 * el trabajador, la afirmación deja de bastar.
 *
 * Reutiliza la infraestructura de pdfs.js (_initDocLegal, _hOrdinal, _hSeccion,
 * _p, _table, _recuadro, _bloqueTestigos, _firmaConIdentificacion, _salidaDoc,
 * np, fmt, formatDateLong), así que debe cargarse DESPUÉS de pdfs.js, y de
 * calculo.js por horasExtraMaxVigente() y _smgVigente().
 *
 * Fundamento verificado contra el texto oficial (DOF 14-05-2026):
 *
 *   · Horas extra ......... arts. 66, 67 y 68 + Transitorio Cuarto del
 *                           decreto DOF 01-05-2026
 *   · Descuentos .......... art. 110 fr. I
 *   · Suspensión .......... arts. 42, 43 y 45
 *   · Modificación ........ arts. 5º fr. XIII, 33, 56 y 51 fr. IV
 *   · Solicitud de empleo . art. 47 fr. I
 */

const _OP_LINEA = '_______________________________________________';

// ═══════════════════════════════════════════════════════════════════════════
//  1. AUTORIZACIÓN PREVIA DE TIEMPO EXTRAORDINARIO (arts. 66-68 LFT)
//
//  Las horas extra son la reclamación número uno y la más difícil de
//  desvirtuar: el art. 784 pone en el patrón la carga de probar la jornada, y
//  frente a una afirmación de "trabajé tres horas diarias durante dos años"
//  sin papeles, el patrón discute contra el vacío.
//
//  Una autorización PREVIA y firmada cambia la conversación: acredita cuántas
//  horas se autorizaron, cuándo, y quién las autorizó. Lo no autorizado queda,
//  por escrito, fuera del acuerdo.
//
//  Topes verificados:
//   · Art. 66 — el trabajo extraordinario no excede de doce horas a la semana,
//     distribuidas en hasta CUATRO HORAS DIARIAS, máximo CUATRO DÍAS. El
//     Transitorio Cuarto del decreto DOF 01-05-2026 escalona ese total: 9 en
//     2026 y 2027, 10 en 2028, 11 en 2029 y 12 en 2030. Se lee de
//     horasExtraMaxVigente(), nunca hardcodeado.
//   · Art. 66 — se abona un cien por ciento más (doble).
//   · Art. 68 — el excedente sobre el art. 66 no puede ser mayor de cuatro
//     horas a la semana y se paga con un doscientos por ciento más (triple).
//   · Art. 68 último párrafo — la suma de jornada ordinaria y extraordinaria
//     NO puede superar doce horas diarias. Esto no admite pacto.
// ═══════════════════════════════════════════════════════════════════════════

function generateAutorizacionHorasExtra(empresa, trab, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);

  const jornadas = (d.jornadas || []).filter(j => j && j.fecha && j.horas);
  if (!jornadas.length) {
    throw new Error(
      'Captura al menos una fecha con las horas autorizadas. Una autorización genérica de tiempo ' +
      'extraordinario no acredita nada: lo que sirve en juicio es saber cuántas horas se autorizaron ' +
      'y qué día.'
    );
  }
  if (!d.motivo) {
    throw new Error(
      'Indica la circunstancia extraordinaria que motiva el tiempo extra. El art. 66 LFT sólo permite ' +
      'prolongar la jornada "por circunstancias extraordinarias": sin decir cuál, la autorización ' +
      'documenta una jornada extraordinaria permanente, que es lo contrario de lo que la ley admite.'
    );
  }

  const anio = parseInt(String(jornadas[0].fecha).slice(0, 4), 10) || new Date().getFullYear();
  const topeSemanal = horasExtraMaxVigente(anio);

  // Prohibición absoluta del art. 68, último párrafo. No se advierte: se
  // bloquea, porque ninguna autorización la puede salvar.
  const jornadaDiaria = Number(d.horas_jornada_ordinaria) || 8;
  const excedeDia = jornadas.find(j => (jornadaDiaria + Number(j.horas)) > 12);
  if (excedeDia) {
    throw new Error(
      `El ${excedeDia.fecha} la suma de la jornada ordinaria (${jornadaDiaria} h) y las ` +
      `${excedeDia.horas} horas extra da ${jornadaDiaria + Number(excedeDia.horas)} horas. ` +
      'El art. 68, último párrafo, de la LFT prohíbe que la suma de ambas jornadas supere DOCE HORAS ' +
      'DIARIAS en ningún caso. Ese límite no se puede pactar ni autorizar.'
    );
  }

  const totalHoras = jornadas.reduce((s, j) => s + Number(j.horas), 0);
  const excedeCuatroDiarias = jornadas.filter(j => Number(j.horas) > 4);

  const state = _initDocLegal(
    'Autorizacion Previa de Tiempo Extraordinario',
    'Articulos 66, 67 y 68 de la Ley Federal del Trabajo',
    u, 'AUTHE'
  );
  _ciudadFecha(state, np(u.ciudad || ''), d.fecha || new Date().toISOString().split('T')[0]);

  _p(state, `${np(u.nombre)} autoriza a ${np(trab.nombre)}${trab.puesto ? `, ${np(trab.puesto)}` : ''}, a laborar tiempo extraordinario en las fechas y por las horas que a continuacion se detallan, por la siguiente circunstancia extraordinaria: ${np(d.motivo)}.`);

  _table(state,
    [['Fecha', 'Horas autorizadas', 'De', 'A', 'Autoriza']],
    jornadas.map(j => [
      formatDateShort(j.fecha), String(j.horas),
      np(j.hora_inicio || ''), np(j.hora_fin || ''),
      np(j.autoriza || d.autoriza || u.representante || ''),
    ]));

  _p(state, `Total de horas autorizadas en el periodo: ${totalHoras}.`, { bold: true });

  _hSeccion(state, 'COMO SE PAGA');
  _p(state, `El tiempo extraordinario se abona con un CIEN POR CIENTO MAS de lo fijado para las horas ordinarias (articulo 66 de la Ley Federal del Trabajo). La prolongacion que supere el limite de ese articulo no puede ser mayor de cuatro horas a la semana y obliga a pagar un DOSCIENTOS POR CIENTO MAS del salario de las horas ordinarias (articulo 68, segundo parrafo).`);
  _p(state, `Para ${anio}, el limite semanal del articulo 66 es de ${topeSemanal} HORAS, conforme al Transitorio Cuarto del decreto de reduccion de la jornada laboral publicado el 1 de mayo de 2026. Ese tiempo puede distribuirse en hasta cuatro horas diarias, en un maximo de cuatro dias por semana.`);
  _p(state, `La suma de la jornada ordinaria y la extraordinaria no puede exceder de doce horas diarias en ningun caso (articulo 68, ultimo parrafo).`);

  if (totalHoras > topeSemanal) {
    _recuadro(state,
      `Las horas autorizadas suman ${totalHoras}, por encima del limite semanal de ${topeSemanal} horas vigente en ${anio}. Si corresponden a una misma semana, el excedente se paga con un doscientos por ciento mas (triple) conforme al articulo 68, y no puede pasar de cuatro horas adicionales. Verifica la distribucion antes de recabar la firma.`,
      'warn');
  }
  if (excedeCuatroDiarias.length) {
    _recuadro(state,
      `Hay ${excedeCuatroDiarias.length} dia(s) con mas de cuatro horas extra. El articulo 66 permite distribuir el tiempo extraordinario en hasta CUATRO HORAS DIARIAS y en un maximo de cuatro dias por semana.`,
      'warn');
  }

  _hSeccion(state, 'ALCANCE DE ESTA AUTORIZACION');
  _p(state, `Solo el tiempo extraordinario expresamente autorizado en este documento se considera autorizado. LA PERSONA TRABAJADORA no esta obligada a prestar servicios por un tiempo mayor del permitido en el Capitulo II del Titulo Tercero de la Ley (articulo 68, primer parrafo), y su negativa a laborar tiempo extra no autorizado no constituye falta ni causa de sancion alguna.`);
  _p(state, `Permanecer en las instalaciones fuera de la jornada sin autorizacion escrita no genera tiempo extraordinario. Si por necesidades del servicio se requiere prolongar la jornada mas alla de lo aqui autorizado, debera emitirse una nueva autorizacion previa.`);

  _gap(state, 8);
  const { ml, tw } = state;
  const colW = tw / 2 - 8;
  const y0 = state.y;
  const y1 = _firmaConIdentificacion(state, 'AUTORIZA — POR EL PATRON',
    d.autoriza || u.representante, d.autoriza_ine, null, ml, colW);
  state.y = y0;
  const y2 = _firmaConIdentificacion(state, 'DE CONFORMIDAD — LA PERSONA TRABAJADORA',
    trab.nombre, trab.num_identificacion, null, ml + colW + 16, colW);
  state.y = Math.max(y1, y2) + 8;

  return _salidaDoc(state, u, _nombreArchivo('autorizacion-horas-extra', trab), opts);
}

// ═══════════════════════════════════════════════════════════════════════════
//  2. SOLICITUD Y AUTORIZACIÓN DE PERMISO
//
//  Desactiva el "me dieron permiso". Sin papel, una falta injustificada se
//  convierte en la palabra del trabajador contra la del patrón, y el art. 784
//  resuelve esa duda a favor del primero.
// ═══════════════════════════════════════════════════════════════════════════

function generateSolicitudPermiso(empresa, trab, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);

  if (!d.fecha_inicio) {
    throw new Error('Indica la fecha de inicio del permiso: sin ella el documento no acredita qué día se autorizó.');
  }
  const TIPOS = {
    goce:      { etiqueta: 'CON goce de sueldo',  nota: 'El tiempo se paga integramente.' },
    sin_goce:  { etiqueta: 'SIN goce de sueldo',  nota: 'El tiempo no se paga; la ausencia queda justificada y no computa como falta.' },
    a_cuenta:  { etiqueta: 'A cuenta de vacaciones', nota: 'Los dias se descuentan del periodo vacacional en curso.' },
  };
  const tipo = TIPOS[d.tipo] || TIPOS.sin_goce;

  const state = _initDocLegal(
    'Solicitud y Autorizacion de Permiso',
    'Constancia de ausencia justificada',
    u, 'PERM'
  );
  _ciudadFecha(state, np(u.ciudad || ''), d.fecha_solicitud || new Date().toISOString().split('T')[0]);

  _p(state, `Yo, ${np(trab.nombre)}${trab.puesto ? `, ${np(trab.puesto)}` : ''}, solicito permiso para ausentarme de mis labores en los terminos siguientes:`);

  _table(state, [['Concepto', 'Dato']], [
    ['Del',       formatDateShort(d.fecha_inicio)],
    ['Al',        d.fecha_fin ? formatDateShort(d.fecha_fin) : formatDateShort(d.fecha_inicio)],
    ['Horario',   d.hora_inicio || d.hora_fin ? `${np(d.hora_inicio || '')} – ${np(d.hora_fin || '')}` : 'Jornada completa'],
    ['Dias',      d.dias != null ? String(d.dias) : ''],
    ['Modalidad', tipo.etiqueta],
    ['Motivo',    np(d.motivo || _OP_LINEA)],
  ]);

  _p(state, tipo.nota);

  _hSeccion(state, 'RESOLUCION');
  _p(state, `${d.autorizado === false ? 'NO SE AUTORIZA' : 'SE AUTORIZA'} el permiso en los terminos solicitados${d.observaciones ? `, con la siguiente observacion: ${np(d.observaciones)}` : ''}.`, { bold: true });
  _p(state, `Este documento acredita la autorizacion. La ausencia amparada por el no constituye falta injustificada para ningun efecto, en particular para el computo de las faltas del articulo 47 fraccion X de la Ley Federal del Trabajo. Fuera de las fechas y el horario aqui autorizados, la ausencia se rige por las reglas ordinarias.`);

  _gap(state, 8);
  const { ml, tw } = state;
  const colW = tw / 2 - 8;
  const y0 = state.y;
  const y1 = _firmaConIdentificacion(state, 'SOLICITA — LA PERSONA TRABAJADORA',
    trab.nombre, trab.num_identificacion, null, ml, colW);
  state.y = y0;
  const y2 = _firmaConIdentificacion(state, 'AUTORIZA — JEFE INMEDIATO',
    d.autoriza || u.representante, d.autoriza_ine, null, ml + colW + 16, colW);
  state.y = Math.max(y1, y2) + 8;

  return _salidaDoc(state, u, _nombreArchivo('permiso', trab), opts);
}

// ═══════════════════════════════════════════════════════════════════════════
//  3. CONVENIO DE MODIFICACIÓN DE CONDICIONES DE TRABAJO
//
//  Cambiar horario, puesto, salario o lugar sin convenio le entrega al
//  trabajador el art. 51: la fr. IV (reducir el salario) y la fr. IX (actos
//  que menoscaben su dignidad) le permiten rescindir CON responsabilidad para
//  el patrón, que es la misma indemnización de un despido injustificado.
//
//  Pero el convenio tiene un límite duro: el art. 56 impide que las
//  condiciones sean inferiores a las de la Ley, y el art. 5º fr. XIII hace
//  nula la renuncia de derechos. Por eso el generador BLOQUEA la reducción
//  salarial: no hay forma de redactarla que la vuelva válida.
// ═══════════════════════════════════════════════════════════════════════════

function generateConvenioModificacionCondiciones(empresa, trab, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);

  const cambios = (d.cambios || []).filter(c => c && c.concepto && (c.antes || c.despues));
  if (!cambios.length) {
    throw new Error(
      'Captura al menos un cambio con su valor anterior y el nuevo. Un convenio que no dice qué cambia ' +
      'no documenta nada, y lo que no queda documentado se resuelve a favor del trabajador (art. 784 LFT).'
    );
  }
  if (!d.motivo) {
    throw new Error('Indica la causa objetiva del cambio: es lo que distingue un acuerdo de una imposición.');
  }

  const salarioAntes   = d.salario_anterior != null ? Number(d.salario_anterior) : null;
  const salarioDespues = d.salario_nuevo    != null ? Number(d.salario_nuevo)    : null;
  if (salarioAntes != null && salarioDespues != null && salarioDespues < salarioAntes) {
    throw new Error(
      `El convenio reduciría el salario de ${fmt(salarioAntes)} a ${fmt(salarioDespues)}. Reducir el ` +
      'salario es causa de rescisión imputable al patrón (art. 51 fr. IV LFT), el art. 56 impide que ' +
      'las condiciones sean inferiores a las de la Ley, y el art. 5º fr. XIII hace nula la renuncia de ' +
      'derechos: firmarlo no lo vuelve válido, sólo deja constancia escrita de la reducción.'
    );
  }

  const fecha = d.fecha || new Date().toISOString().split('T')[0];
  const state = _initDocLegal(
    'Convenio de Modificacion de Condiciones de Trabajo',
    'Articulos 31, 33 y 56 de la Ley Federal del Trabajo',
    u, 'CONVMOD'
  );
  _ciudadFecha(state, np(u.ciudad || ''), fecha);

  _p(state, `Convenio que celebran, por una parte ${np(u.nombre)}${u.rfc ? `, R.F.C. ${np(u.rfc)}` : ''}, representada por ${np(d.representante || u.representante || _OP_LINEA)}, en adelante EL PATRON, y por la otra ${np(trab.nombre)}${trab.curp ? `, CURP ${np(trab.curp)}` : ''}, en adelante LA PERSONA TRABAJADORA, al tenor de las siguientes clausulas.`);

  _hOrdinal(state, 'PRIMERA', 'Antecedente y causa');
  _p(state, `Las partes tienen celebrado un contrato individual de trabajo con fecha de ingreso ${trab.fecha_ingreso ? formatDateLong(trab.fecha_ingreso) : _OP_LINEA}. Por ${np(d.motivo)}, acuerdan modificar las condiciones que se precisan en la clausula siguiente.`);

  _hOrdinal(state, 'SEGUNDA', 'Condiciones que se modifican');
  _table(state,
    [['Condicion', 'Como estaba', 'Como queda']],
    cambios.map(c => [np(c.concepto), np(c.antes || '—'), np(c.despues || '—')]));
  _p(state, `Las modificaciones surten efectos a partir del ${formatDateLong(d.fecha_efectos || fecha)}.`);

  _hOrdinal(state, 'TERCERA', 'Lo que no cambia');
  _p(state, `Todas las demas condiciones del contrato individual permanecen sin modificacion, en particular la ANTIGUEDAD, que se computa desde la fecha de ingreso original y no se interrumpe por este convenio.`, { bold: true });
  _p(state, `${np(d.no_cambia || 'Se conservan sin cambio el salario, las prestaciones, la jornada y el puesto en todo aquello que no se haya modificado expresamente en la clausula SEGUNDA.')}`);

  _hOrdinal(state, 'CUARTA', 'Limites del convenio');
  _p(state, `Las condiciones pactadas en ningun caso pueden ser inferiores a las fijadas en la Ley Federal del Trabajo (articulo 56). Es nula, y no produce efecto legal alguno, cualquier estipulacion que implique renuncia de LA PERSONA TRABAJADORA a los derechos consignados en las normas de trabajo, aunque conste en este convenio (articulo 5o. fraccion XIII).`);
  _p(state, `Este convenio no comprende ni afecta salarios devengados, indemnizaciones ni prestaciones ya generadas, cuya renuncia seria igualmente nula (articulo 33, primer parrafo).`);

  _hOrdinal(state, 'QUINTA', 'Voluntariedad');
  _p(state, `LA PERSONA TRABAJADORA manifiesta que suscribe este convenio de manera libre, que se le explico su contenido y alcance, que tuvo oportunidad de consultarlo, y que no medio violencia, intimidacion ni condicionamiento alguno de su permanencia en el empleo.`);

  _recuadro(state,
    'Si el convenio implicara alguna renuncia de derechos, debera hacerse por escrito con una relacion circunstanciada de los hechos y RATIFICARSE ante el Centro de Conciliacion o el Tribunal, que solo lo aprobara si no contiene renuncia de derechos (articulo 33, segundo parrafo, de la Ley Federal del Trabajo).',
    'info');

  _gap(state, 8);
  const { ml, tw } = state;
  const colW = tw / 2 - 8;
  const y0 = state.y;
  const y1 = _firmaConIdentificacion(state, 'EL PATRON', d.representante || u.representante,
    d.representante_ine, u.domicilio, ml, colW);
  state.y = y0;
  const y2 = _firmaConIdentificacion(state, 'LA PERSONA TRABAJADORA', trab.nombre,
    trab.num_identificacion, trab.domicilio, ml + colW + 16, colW);
  state.y = Math.max(y1, y2) + 8;
  if (d.testigo1_nombre || d.testigo2_nombre) _bloqueTestigos(state, d);

  return _salidaDoc(state, u, _nombreArchivo('convenio-modificacion', trab), opts);
}

// ═══════════════════════════════════════════════════════════════════════════
//  4. AVISO DE SUSPENSIÓN DE LA RELACIÓN DE TRABAJO (arts. 42, 43 y 45 LFT)
//
//  La suspensión no termina la relación: suspende las obligaciones de prestar
//  el servicio y pagar el salario, sin responsabilidad para ninguna de las
//  partes. Documentarla evita que una ausencia por prisión preventiva o por
//  falta de documentos se lea después como despido.
// ═══════════════════════════════════════════════════════════════════════════

/** Causas del art. 42 con la duración que les fija el art. 43 y el retorno del 45. */
const _CAUSAS_SUSPENSION = {
  I:    { texto: 'La enfermedad contagiosa de la persona trabajadora',
          duracion: 'Desde la fecha en que EL PATRON tuvo conocimiento de la enfermedad hasta que termine el periodo fijado por el Instituto Mexicano del Seguro Social, o antes si desaparece la incapacidad, sin exceder el termino que la Ley del Seguro Social fija para el tratamiento de enfermedades que no sean consecuencia de un riesgo de trabajo (articulo 43 fraccion I).',
          retorno: 'Al dia siguiente de que termine la causa (articulo 45 fraccion I).' },
  II:   { texto: 'La incapacidad temporal ocasionada por un accidente o enfermedad que no constituya un riesgo de trabajo',
          duracion: 'Desde que se produjo la incapacidad hasta que termine el periodo fijado por el Instituto Mexicano del Seguro Social, o antes si desaparece (articulo 43 fraccion I).',
          retorno: 'Al dia siguiente de que termine la causa (articulo 45 fraccion I).' },
  III:  { texto: 'La prision preventiva seguida de sentencia absolutoria',
          duracion: 'Desde que se acredite la detencion a disposicion de la autoridad judicial o administrativa, hasta que cause ejecutoria la sentencia absolutoria (articulo 43 fraccion II).',
          retorno: 'Dentro de los quince dias siguientes a la terminacion de la causa (articulo 45 fraccion II). Si obtiene libertad provisional, debe presentarse dentro de los quince dias siguientes a su liberacion, salvo que se le siga proceso por delitos intencionales contra EL PATRON o sus companeros de trabajo (articulo 43 fraccion II).' },
  IV:   { texto: 'El arresto de la persona trabajadora',
          duracion: 'Desde que se acredite la detencion hasta que termine el arresto (articulo 43 fraccion II).',
          retorno: 'Al dia siguiente de que termine la causa (articulo 45 fraccion I).' },
  V:    { texto: 'El cumplimiento de los servicios y cargos del articulo 5o. constitucional y de las obligaciones del articulo 31 fraccion III de la Constitucion',
          duracion: 'Desde la fecha en que deban prestarse los servicios o desempenarse los cargos, hasta por un periodo de seis anos (articulo 43 fraccion III).',
          retorno: 'Dentro de los quince dias siguientes a la terminacion de la causa (articulo 45 fraccion II).' },
  VI:   { texto: 'La designacion como representante ante organismos estatales',
          duracion: 'Desde la fecha en que deban desempenarse los cargos, hasta por un periodo de seis anos (articulo 43 fraccion III).',
          retorno: 'Dentro de los quince dias siguientes a la terminacion de la causa (articulo 45 fraccion II).' },
  VII:  { texto: 'La falta de los documentos que exijan las leyes y reglamentos, necesarios para la prestacion del servicio, cuando sea imputable a la persona trabajadora',
          duracion: 'Desde la fecha en que EL PATRON tuvo conocimiento del hecho, HASTA POR UN PERIODO DE DOS MESES (articulo 43 fraccion IV).',
          retorno: 'Al dia siguiente de que termine la causa (articulo 45 fraccion I).' },
  VIII: { texto: 'La conclusion de la temporada, tratandose de personas contratadas bajo esa modalidad',
          duracion: 'Desde la fecha de conclusion de la temporada hasta el inicio de la siguiente (articulo 43 fraccion V).',
          retorno: 'Al inicio de la siguiente temporada.' },
  IX:   { texto: 'La licencia a que se refiere el articulo 140 Bis de la Ley del Seguro Social',
          duracion: 'La que fije el Instituto Mexicano del Seguro Social al expedir la licencia.',
          retorno: 'Al dia siguiente de que termine la licencia.' },
};

function generateAvisoSuspension(empresa, trab, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);
  const causa = _CAUSAS_SUSPENSION[d.fraccion_art42];

  if (!causa) {
    throw new Error(
      'Indica la fracción del art. 42 LFT que motiva la suspensión (I a IX). Un aviso que no precisa la ' +
      'causa no acredita una suspensión: acredita una ausencia sin explicar, que es lo que después se ' +
      'alega como despido.'
    );
  }
  if (!d.fecha_inicio) {
    throw new Error('Indica la fecha en que inicia la suspensión.');
  }

  const state = _initDocLegal(
    'Aviso de Suspension de la Relacion de Trabajo',
    'Articulos 42, 43 y 45 de la Ley Federal del Trabajo',
    u, 'AVSUSP'
  );
  _ciudadFecha(state, np(u.ciudad || ''), d.fecha || new Date().toISOString().split('T')[0]);

  _p(state, `${np(trab.nombre)}`, { bold: true });
  _p(state, `${np(trab.puesto || '')}${trab.domicilio ? `\n${np(trab.domicilio)}` : ''}`);
  _gap(state, 3);

  _p(state, `Por este medio se hace de su conocimiento que, a partir del ${formatDateLong(d.fecha_inicio)}, se SUSPENDEN los efectos de la relacion de trabajo que nos vincula, por actualizarse la causa prevista en el ARTICULO 42 FRACCION ${np(d.fraccion_art42)} de la Ley Federal del Trabajo: ${causa.texto.toLowerCase()}.`);

  if (d.hechos) _p(state, `Hechos que la motivan: ${np(d.hechos)}.`);

  _hSeccion(state, 'EFECTOS DE LA SUSPENSION');
  _p(state, `La suspension recae sobre las obligaciones de prestar el servicio y de pagar el salario, SIN RESPONSABILIDAD para ninguna de las partes (articulo 42, primer parrafo). NO IMPLICA LA TERMINACION DE LA RELACION DE TRABAJO ni afecta la antiguedad acumulada.`, { bold: true });

  _hSeccion(state, 'DURACION');
  _p(state, causa.duracion);
  if (d.fecha_fin_estimada) {
    _p(state, `Fecha estimada de conclusion: ${formatDateLong(d.fecha_fin_estimada)}. Si la causa termina antes, la suspension concluye en ese momento.`);
  }

  _hSeccion(state, 'REINCORPORACION');
  _p(state, causa.retorno);
  _p(state, `Se le solicita informar por escrito, en cuanto cese la causa, para programar su reincorporacion. Cualquier duda puede plantearla en ${np(d.contacto || u.domicilio || _OP_LINEA)}.`);

  _recuadro(state,
    'Este aviso documenta una suspension, no una baja. No debe presentarse baja ante el Instituto Mexicano del Seguro Social por este motivo, salvo que la propia normativa del Instituto lo prevea para el caso concreto.',
    'warn');

  _gap(state, 8);
  const { ml, tw } = state;
  const colW = tw / 2 - 8;
  const y0 = state.y;
  const y1 = _firmaConIdentificacion(state, 'POR EL PATRON', d.emite || u.representante,
    d.emite_ine, u.domicilio, ml, colW);
  state.y = y0;
  const y2 = _firmaConIdentificacion(state, 'RECIBI — LA PERSONA TRABAJADORA', trab.nombre,
    trab.num_identificacion, trab.domicilio, ml + colW + 16, colW);
  state.y = Math.max(y1, y2) + 8;
  if (d.testigo1_nombre || d.testigo2_nombre) _bloqueTestigos(state, d);

  return _salidaDoc(state, u, _nombreArchivo('aviso-suspension', trab), opts);
}

// ═══════════════════════════════════════════════════════════════════════════
//  5. ACTA DE ENTREGA-RECEPCIÓN DEL PUESTO
//
//  Faltantes de inventario y de cartera. Sin acta, el patrón descubre el
//  faltante después de la baja y ya no tiene con quién contrastarlo.
// ═══════════════════════════════════════════════════════════════════════════

function generateActaEntregaRecepcion(empresa, trab, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);
  const partidas = (d.partidas || []).filter(p => p && p.concepto);

  if (!partidas.length) {
    throw new Error(
      'Captura al menos una partida a entregar (equipo, documentos, llaves, cartera, saldos). ' +
      'Un acta sin inventario no acredita qué se entregó ni qué faltó.'
    );
  }

  const fecha = d.fecha || new Date().toISOString().split('T')[0];
  const state = _initDocLegal(
    'Acta de Entrega-Recepcion del Puesto',
    'Constancia de entrega de bienes, informacion y asuntos en tramite',
    u, 'ACTAER'
  );

  _p(state, `En ${np(d.lugar || u.domicilio || u.ciudad)}, siendo las ${np(d.hora_inicio || '____')} horas del ${formatDateLong(fecha)}, comparecen ${np(trab.nombre)}, quien ENTREGA el puesto de ${np(trab.puesto || _OP_LINEA)}, y ${np(d.recibe_nombre || _OP_LINEA)}${d.recibe_puesto ? `, ${np(d.recibe_puesto)}` : ''}, quien RECIBE, con el objeto de hacer constar la entrega-recepcion siguiente.`);

  _hSeccion(state, 'I. PARTIDAS QUE SE ENTREGAN');
  _table(state,
    [['Concepto', 'Descripcion o identificador', 'Cantidad', 'Estado / observaciones']],
    partidas.map(p => [np(p.concepto), np(p.descripcion || ''), p.cantidad != null ? String(p.cantidad) : '', np(p.estado || '')]));

  if (d.asuntos_pendientes) {
    _hSeccion(state, 'II. ASUNTOS EN TRAMITE');
    _p(state, np(d.asuntos_pendientes));
  }

  if (d.faltantes) {
    _hSeccion(state, d.asuntos_pendientes ? 'III. FALTANTES Y OBSERVACIONES' : 'II. FALTANTES Y OBSERVACIONES');
    _p(state, np(d.faltantes));
    _recuadro(state,
      'Hacer constar el faltante NO autoriza a descontarlo del finiquito. El articulo 110 fraccion I de la Ley Federal del Trabajo condiciona cualquier descuento a un convenio, con el tope de un mes de salario como cantidad exigible y de un treinta por ciento del excedente del salario minimo como descuento periodico. Sin ese convenio, el descuento es ilegal aunque el faltante sea real.',
      'warn');
  }

  _hSeccion(state, 'MANIFESTACIONES');
  _p(state, `Quien entrega manifiesta que las partidas descritas comprenden la totalidad de los bienes, documentos e informacion que tenia asignados. ${np(d.manifestacion_entrega || '')}`);
  _p(state, `Quien recibe manifiesta que las recibio en el estado que se consigna, y que la revision de fondo de saldos, expedientes y cartera se realizara dentro de los ${np(d.plazo_revision || 'quince dias')} siguientes, plazo dentro del cual podra formular observaciones que se haran constar por separado.`);
  _p(state, `Esta acta no constituye finiquito ni implica renuncia de derecho alguno de ninguna de las partes.`);

  if (d.hora_cierre) {
    _p(state, `Se cierra la presente acta siendo las ${np(d.hora_cierre)} horas del dia de su fecha.`);
  }

  _gap(state, 8);
  const { ml, tw } = state;
  const colW = tw / 2 - 8;
  const y0 = state.y;
  const y1 = _firmaConIdentificacion(state, 'ENTREGA', trab.nombre,
    trab.num_identificacion, null, ml, colW);
  state.y = y0;
  const y2 = _firmaConIdentificacion(state, 'RECIBE', d.recibe_nombre, d.recibe_ine, null, ml + colW + 16, colW);
  state.y = Math.max(y1, y2) + 10;
  if (d.testigo1_nombre || d.testigo2_nombre) _bloqueTestigos(state, d);

  return _salidaDoc(state, u, _nombreArchivo('acta-entrega-recepcion', trab), opts);
}

// ═══════════════════════════════════════════════════════════════════════════
//  6. CARTA DE NO ADEUDO
//
//  Cierre operativo. Se emite a favor de LA PERSONA TRABAJADORA: acredita que
//  el patrón no le reclama nada. Deliberadamente NO se redacta al revés —una
//  carta donde el trabajador declara que nada se le debe sería una renuncia
//  de derechos, nula conforme al art. 5º fr. XIII.
// ═══════════════════════════════════════════════════════════════════════════

function generateCartaNoAdeudo(empresa, trab, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);
  const fecha = d.fecha || new Date().toISOString().split('T')[0];

  const state = _initDocLegal(
    'Carta de No Adeudo',
    'Constancia expedida a favor de la persona trabajadora',
    u, 'NOADEU'
  );
  _ciudadFecha(state, np(u.ciudad || ''), fecha);

  _p(state, `A QUIEN CORRESPONDA`, { bold: true });
  _gap(state, 3);

  _p(state, `${np(u.nombre)}${u.rfc ? `, R.F.C. ${np(u.rfc)}` : ''}, hace constar que ${np(trab.nombre)}${trab.curp ? `, CURP ${np(trab.curp)}` : ''}, quien se desempeno como ${np(trab.puesto || _OP_LINEA)}${trab.fecha_ingreso ? ` del ${formatDateLong(trab.fecha_ingreso)}` : ''}${trab.fecha_baja ? ` al ${formatDateLong(trab.fecha_baja)}` : ''}, NO TIENE ADEUDO ALGUNO con esta empresa por concepto de prestamos, anticipos de salario, faltantes, herramienta, equipo ni cualquier otro.`);

  _p(state, `Asimismo, hace constar que devolvio la totalidad de los bienes que le fueron asignados${d.detalle_bienes ? `: ${np(d.detalle_bienes)}` : ''}, y que no existen procedimientos internos pendientes en su contra.`);

  _p(state, `Se extiende la presente a peticion de la persona interesada, para los usos legales a que haya lugar.`);

  _recuadro(state,
    'Esta carta acredita unicamente que EL PATRON no tiene reclamacion economica en contra de la persona trabajadora. No constituye finiquito, no implica que la persona trabajadora renuncie a derecho alguno, y no puede oponersele como reconocimiento de que nada se le adeuda: una declaracion en ese sentido seria nula conforme al articulo 5o. fraccion XIII de la Ley Federal del Trabajo.',
    'info');

  _gap(state, 12);
  const { ml, tw } = state;
  _firmaConIdentificacion(state, 'POR EL PATRON', d.emite || u.representante,
    d.emite_ine, u.domicilio, ml, Math.min(tw * 0.55, 100));
  state.y += 10;

  return _salidaDoc(state, u, _nombreArchivo('carta-no-adeudo', trab), opts);
}

// ═══════════════════════════════════════════════════════════════════════════
//  7. AUTORIZACIÓN DE DESCUENTO POR PRÉSTAMO (art. 110 fr. I LFT)
//
//  Texto verificado: "Pago de deudas contraídas con el patrón por anticipo de
//  salarios, pagos hechos con exceso al trabajador, errores, pérdidas, averías
//  o adquisición de artículos producidos por la empresa o establecimiento. La
//  cantidad exigible en ningún caso podrá ser mayor del importe de los
//  salarios de un mes y el descuento será al que convengan el trabajador y el
//  patrón, sin que pueda ser mayor del treinta por ciento del excedente del
//  salario mínimo".
//
//  Son DOS topes distintos y el código valida los dos: el monto total del
//  préstamo y el descuento periódico. Sin convenio escrito el descuento es
//  ilegal aunque el préstamo sea real.
// ═══════════════════════════════════════════════════════════════════════════

function generateAutorizacionDescuento(empresa, trab, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);

  const monto     = Number(d.monto);
  const descuento = Number(d.descuento_periodico);
  if (!monto || monto <= 0)         throw new Error('Indica el monto del préstamo o adeudo.');
  if (!descuento || descuento <= 0) throw new Error('Indica el descuento que se aplicará en cada período de pago.');
  if (!d.concepto)                  throw new Error('Indica el concepto del adeudo: el art. 110 fr. I sólo admite los supuestos que enumera.');

  const salarioMensual = Number(d.salario_mensual ?? trab.salario_mensual);
  if (!salarioMensual) {
    throw new Error(
      'No hay salario mensual capturado para validar el tope del art. 110 fr. I LFT, que limita la ' +
      'cantidad exigible al importe de los salarios de un mes. Captura el salario antes de generar ' +
      'la autorización.'
    );
  }
  if (monto > salarioMensual) {
    throw new Error(
      `El adeudo de ${fmt(monto)} excede el salario de un mes (${fmt(salarioMensual)}). El art. 110 ` +
      'fr. I de la LFT establece que la cantidad exigible EN NINGÚN CASO podrá ser mayor del importe ' +
      'de los salarios de un mes. El excedente no es exigible por la vía del descuento.'
    );
  }

  // Tope del descuento periódico: 30% del EXCEDENTE del salario mínimo, no del
  // salario. _smgVigente() lanza si el valor del año no está configurado, que
  // es justo lo que debe pasar antes que calcular con un mínimo inventado.
  const smgDiario   = _smgVigente(trab.smg_zone === 'frontera' ? 'frontera' : 'general');
  const periodicidad = d.periodicidad || 'quincenal';
  const diasPeriodo  = { semanal: 7, quincenal: 15, mensual: 30 }[periodicidad] || 15;
  const salarioPeriodo = (salarioMensual / 30) * diasPeriodo;
  const smgPeriodo     = smgDiario * diasPeriodo;
  const excedente      = Math.max(salarioPeriodo - smgPeriodo, 0);
  const topeDescuento  = excedente * 0.30;

  if (descuento > topeDescuento + 0.005) {
    throw new Error(
      `El descuento ${periodicidad} de ${fmt(descuento)} excede el tope legal de ${fmt(topeDescuento)}. ` +
      'El art. 110 fr. I de la LFT limita el descuento al treinta por ciento del EXCEDENTE del salario ' +
      `mínimo: sobre un salario de ${fmt(salarioPeriodo)} por período y un mínimo de ${fmt(smgPeriodo)}, ` +
      `el excedente es ${fmt(excedente)}. Reduce el descuento o alarga el plazo.`
    );
  }

  const numPagos = Math.ceil(monto / descuento);
  const fecha = d.fecha || new Date().toISOString().split('T')[0];

  const state = _initDocLegal(
    'Convenio y Autorizacion de Descuento',
    'Articulo 110 fraccion I de la Ley Federal del Trabajo',
    u, 'AUTDESC'
  );
  _ciudadFecha(state, np(u.ciudad || ''), fecha);

  _p(state, `Convenio que celebran ${np(u.nombre)}, en adelante EL PATRON, y ${np(trab.nombre)}${trab.curp ? `, CURP ${np(trab.curp)}` : ''}, en adelante LA PERSONA TRABAJADORA, respecto del adeudo y su forma de pago.`);

  _hOrdinal(state, 'PRIMERA', 'Concepto y monto');
  _p(state, `LA PERSONA TRABAJADORA reconoce adeudar a EL PATRON la cantidad de ${fmt(monto)} por concepto de ${np(d.concepto)}${d.fecha_origen ? `, originado el ${formatDateLong(d.fecha_origen)}` : ''}.`);

  _hOrdinal(state, 'SEGUNDA', 'Forma de pago');
  _p(state, `Ambas partes convienen en que el adeudo se cubra mediante descuento de ${fmt(descuento)} en cada periodo de pago ${np(periodicidad)}, a partir del ${formatDateLong(d.fecha_primer_descuento || fecha)}, en aproximadamente ${numPagos} descuento(s), hasta cubrir el total.`);

  _table(state, [['Concepto', 'Importe']], [
    ['Adeudo total',                                    fmt(monto)],
    [`Salario del periodo ${periodicidad}`,             fmt(salarioPeriodo)],
    [`Salario minimo del periodo (${diasPeriodo} dias)`, fmt(smgPeriodo)],
    ['Excedente sobre el salario minimo',               fmt(excedente)],
    ['Tope legal del descuento (30% del excedente)',    fmt(topeDescuento)],
    ['Descuento convenido',                             fmt(descuento)],
  ]);

  _hOrdinal(state, 'TERCERA', 'Limites legales');
  _p(state, `Las partes reconocen que el articulo 110 fraccion I de la Ley Federal del Trabajo establece que la cantidad exigible en ningun caso podra ser mayor del importe de los salarios de un mes, y que el descuento sera el que convengan sin que pueda ser mayor del TREINTA POR CIENTO DEL EXCEDENTE DEL SALARIO MINIMO. El descuento pactado respeta ambos limites.`);
  _p(state, `Si el salario de LA PERSONA TRABAJADORA disminuye y el descuento convenido dejara de respetar el tope, EL PATRON lo ajustara a la baja sin necesidad de nuevo convenio.`);

  _hOrdinal(state, 'CUARTA', 'Terminacion de la relacion');
  _p(state, `Si la relacion de trabajo termina antes de cubrirse el adeudo, el saldo no se descuenta automaticamente del finiquito: su compensacion requiere el acuerdo expreso de LA PERSONA TRABAJADORA en ese momento, o bien la via legal que corresponda. Los salarios devengados y las prestaciones generadas no son renunciables (articulo 33 de la Ley Federal del Trabajo).`, { bold: true });

  _hOrdinal(state, 'QUINTA', 'Voluntariedad');
  _p(state, `LA PERSONA TRABAJADORA manifiesta que suscribe este convenio libremente y que se le explico su contenido. Puede liquidar el saldo anticipadamente en cualquier momento, sin penalizacion alguna. Este convenio no genera intereses.`);

  _gap(state, 8);
  const { ml, tw } = state;
  const colW = tw / 2 - 8;
  const y0 = state.y;
  const y1 = _firmaConIdentificacion(state, 'EL PATRON', d.emite || u.representante,
    d.emite_ine, u.domicilio, ml, colW);
  state.y = y0;
  const y2 = _firmaConIdentificacion(state, 'LA PERSONA TRABAJADORA', trab.nombre,
    trab.num_identificacion, trab.domicilio, ml + colW + 16, colW);
  state.y = Math.max(y1, y2) + 8;

  return _salidaDoc(state, u, _nombreArchivo('autorizacion-descuento', trab), opts);
}

// ═══════════════════════════════════════════════════════════════════════════
//  8. CARTA OFERTA
//
//  Documenta las condiciones ANTES del ingreso. Su valor está en el límite:
//  no es un contrato, y decirlo evita que se lea como uno.
// ═══════════════════════════════════════════════════════════════════════════

function generateCartaOferta(empresa, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);

  if (!d.candidato)  throw new Error('Indica el nombre de la persona candidata.');
  if (!d.puesto)     throw new Error('Indica el puesto ofrecido.');
  if (d.salario == null || d.salario === '') {
    throw new Error(
      'Indica el salario ofrecido. Una oferta sin salario no documenta la condición que más se discute ' +
      'después, y el art. 25 fr. VI LFT exige que el contrato lo contenga.'
    );
  }

  const fecha = d.fecha || new Date().toISOString().split('T')[0];
  const state = _initDocLegal(
    'Carta Oferta de Trabajo',
    'Propuesta de condiciones previa a la contratacion',
    u, 'OFERTA'
  );
  _ciudadFecha(state, np(u.ciudad || ''), fecha);

  _p(state, `${np(d.candidato)}`, { bold: true });
  _gap(state, 3);
  _p(state, `Nos complace ofrecerle incorporarse a ${np(u.nombre)} en las condiciones siguientes:`);

  _table(state, [['Condicion', 'Propuesta']], [
    ['Puesto',                np(d.puesto)],
    ['Area o departamento',   np(d.area || '')],
    ['Fecha de ingreso propuesta', d.fecha_ingreso ? formatDateLong(d.fecha_ingreso) : _OP_LINEA],
    ['Tipo de contrato',      np(d.tipo_contrato || 'Por tiempo indeterminado')],
    ['Salario',               `${fmt(Number(d.salario))} ${np(d.periodo_salario || 'mensual')} bruto`],
    ['Jornada',               np(d.jornada || '')],
    ['Lugar de trabajo',      np(d.lugar || u.domicilio || '')],
    ['Reporta a',             np(d.reporta_a || '')],
  ]);

  if (d.prestaciones) {
    _hSeccion(state, 'PRESTACIONES');
    _p(state, np(d.prestaciones));
  }
  _p(state, `En todo caso se otorgan como minimo las prestaciones de ley: aguinaldo, vacaciones, prima vacacional, prima dominical, dias de descanso y alta ante el Instituto Mexicano del Seguro Social desde el primer dia.`);

  if (d.periodo_prueba_dias) {
    _hSeccion(state, 'PERIODO A PRUEBA');
    _p(state, `Se propone un periodo a prueba de ${np(String(d.periodo_prueba_dias))} dias, en los terminos del articulo 39-A de la Ley Federal del Trabajo. Durante el, la relacion es de trabajo para todos los efectos y se cotiza ante el Instituto Mexicano del Seguro Social.`);
  }

  _hSeccion(state, 'ALCANCE DE ESTA OFERTA');
  _p(state, `Esta carta es una PROPUESTA y no sustituye al contrato individual de trabajo, que se celebrara por escrito antes del inicio de labores con los requisitos del articulo 25 de la Ley Federal del Trabajo. Las condiciones definitivas seran las que consten en ese contrato.`, { bold: true });
  _p(state, `La oferta esta vigente hasta el ${d.vigencia ? formatDateLong(d.vigencia) : _OP_LINEA}${d.condicionada ? `, y queda sujeta a ${np(d.condicionada)}` : ''}.`);
  _p(state, `Los datos personales que nos proporcione se tratan conforme al Aviso de Privacidad de la empresa. Si la relacion no llega a formalizarse, se conservan unicamente por el tiempo necesario para acreditar el proceso de seleccion.`);

  _gap(state, 10);
  const { ml, tw } = state;
  const colW = tw / 2 - 8;
  const y0 = state.y;
  const y1 = _firmaConIdentificacion(state, 'POR LA EMPRESA', d.emite || u.representante,
    d.emite_ine, u.domicilio, ml, colW);
  state.y = y0;
  const y2 = _firmaConIdentificacion(state, 'DE ENTERADO — LA PERSONA CANDIDATA',
    d.candidato, null, null, ml + colW + 16, colW);
  state.y = Math.max(y1, y2) + 8;

  return _salidaDoc(state, u, `carta-oferta-${np(d.candidato).replace(/\s+/g, '-').toLowerCase()}.pdf`, opts);
}

// ═══════════════════════════════════════════════════════════════════════════
//  9. SOLICITUD DE EMPLEO
//
//  Base del expediente. Su valor probatorio está en la declaración de
//  veracidad: el art. 47 fr. I permite rescindir sin responsabilidad cuando la
//  persona engaña con certificados o referencias falsos sobre la capacidad que
//  dice tener — pero esa causa DEJA DE TENER EFECTO después de treinta días de
//  prestar servicios. El formato lo dice, para que nadie la invoque tarde.
// ═══════════════════════════════════════════════════════════════════════════

function generateSolicitudEmpleo(empresa, datos = {}, sucursal = null, opts = {}) {
  const d = datos || {};
  const u = resolveUbicacion(empresa, sucursal);
  const state = _initDocLegal(
    'Solicitud de Empleo',
    'Formato de registro de la persona candidata',
    u, 'SOLEMP'
  );

  const linea = (etiqueta, valor) => [etiqueta, np(valor || _OP_LINEA)];

  _hSeccion(state, 'I. PUESTO SOLICITADO');
  _table(state, [['Concepto', 'Dato']], [
    linea('Puesto al que aspira',   d.puesto),
    linea('Fecha de la solicitud',  d.fecha ? formatDateShort(d.fecha) : new Date().toLocaleDateString('es-MX')),
    linea('Como se entero de la vacante', d.fuente),
  ]);

  _hSeccion(state, 'II. DATOS PERSONALES');
  _table(state, [['Concepto', 'Dato']], [
    linea('Nombre completo',   d.nombre),
    linea('Fecha de nacimiento', d.fecha_nacimiento),
    linea('CURP',              d.curp),
    linea('R.F.C.',            d.rfc),
    linea('Numero de seguridad social', d.nss),
    linea('Domicilio',         d.domicilio),
    linea('Telefono',          d.telefono),
    linea('Correo electronico', d.email),
    linea('Contacto en caso de emergencia', d.contacto_emergencia),
  ]);

  _recuadro(state,
    'No se solicitan datos sobre estado civil, responsabilidades familiares, embarazo, religion, preferencias sexuales ni afiliacion sindical. El articulo 133 fraccion XIV de la Ley Federal del Trabajo prohibe exigir certificados medicos de no embarazo para el ingreso, y el articulo 3o. prohibe la discriminacion por esos motivos.',
    'info');

  _hSeccion(state, 'III. ESCOLARIDAD Y CAPACITACION');
  _table(state, [['Nivel', 'Institucion', 'Periodo', 'Documento obtenido']],
    (d.escolaridad?.length ? d.escolaridad : [{}, {}, {}])
      .map(e => [np(e.nivel || _OP_LINEA), np(e.institucion || ''), np(e.periodo || ''), np(e.documento || '')]));

  _hSeccion(state, 'IV. EXPERIENCIA LABORAL');
  _table(state, [['Empresa', 'Puesto', 'Periodo', 'Motivo de separacion', 'Referencia y telefono']],
    (d.experiencia?.length ? d.experiencia : [{}, {}, {}])
      .map(e => [np(e.empresa || _OP_LINEA), np(e.puesto || ''), np(e.periodo || ''), np(e.motivo || ''), np(e.referencia || '')]));

  _hSeccion(state, 'V. DECLARACION DE VERACIDAD');
  _p(state, `Declaro bajo protesta de decir verdad que la informacion asentada en esta solicitud y en los documentos que la acompanan es VERDADERA, y que los certificados, constancias y referencias que presento son autenticos.`, { bold: true });
  _p(state, `Me doy por enterado de que, conforme al articulo 47 fraccion I de la Ley Federal del Trabajo, el patron puede rescindir la relacion de trabajo sin responsabilidad cuando el trabajador lo engana con certificados falsos o referencias en las que se atribuya capacidades, aptitudes o facultades de que carece, y de que esa causa DEJA DE TENER EFECTO DESPUES DE TREINTA DIAS de prestar servicios.`);
  _p(state, `Autorizo a ${np(u.nombre)} a verificar las referencias laborales y los datos aqui asentados. Mis datos personales se tratan conforme al Aviso de Privacidad de la empresa, que se pone a mi disposicion en este acto (articulo 16 de la Ley Federal de Proteccion de Datos Personales en Posesion de los Particulares).`);
  _p(state, `Entiendo que esta solicitud NO constituye contrato de trabajo ni obliga a la empresa a contratarme.`);

  _gap(state, 12);
  const { ml, tw } = state;
  _firmaConIdentificacion(state, 'FIRMA DE LA PERSONA SOLICITANTE', d.nombre, null, d.domicilio,
    ml, Math.min(tw * 0.55, 100));
  state.y += 10;

  return _salidaDoc(state, u, `solicitud-empleo${d.nombre ? '-' + np(d.nombre).replace(/\s+/g, '-').toLowerCase() : ''}.pdf`, opts);
}
