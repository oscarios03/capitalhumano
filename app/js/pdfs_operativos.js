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
 * fmt, npDate, formatDateLong), así que debe cargarse DESPUÉS de pdfs.js, y de
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
    'Autorización Previa de Tiempo Extraordinario',
    'Artículos 66, 67 y 68 de la Ley Federal del Trabajo',
    u, 'AUTHE'
  );
  _ciudadFecha(state, u.ciudad || '', d.fecha || new Date().toISOString().split('T')[0]);

  _p(state, `${u.nombre} autoriza a ${trab.nombre}${trab.puesto ? `, ${trab.puesto}` : ''}, a laborar tiempo extraordinario en las fechas y por las horas que a continuación se detallan, por la siguiente circunstancia extraordinaria: ${d.motivo}.`);

  _table(state,
    [['Fecha', 'Horas autorizadas', 'De', 'A', 'Autoriza']],
    jornadas.map(j => [
      formatDateShort(j.fecha), String(j.horas),
      j.hora_inicio || '', j.hora_fin || '',
      j.autoriza || d.autoriza || u.representante || '',
    ]));

  _p(state, `Total de horas autorizadas en el periodo: ${totalHoras}.`, { bold: true });

  _hSeccion(state, 'COMO SE PAGA');
  _p(state, `El tiempo extraordinario se abona con un CIEN POR CIENTO MAS de lo fijado para las horas ordinarias (artículo 66 de la Ley Federal del Trabajo). La prolongación que supere el límite de ese artículo no puede ser mayor de cuatro horas a la semana y obliga a pagar un DOSCIENTOS POR CIENTO MAS del salario de las horas ordinarias (artículo 68, segundo párrafo).`);
  _p(state, `Para ${anio}, el límite semanal del artículo 66 es de ${topeSemanal} HORAS, conforme al Transitorio Cuarto del decreto de reducción de la jornada laboral publicado el 1 de mayo de 2026. Ese tiempo puede distribuirse en hasta cuatro horas diarias, en un máximo de cuatro días por semana.`);
  _p(state, `La suma de la jornada ordinaria y la extraordinaria no puede exceder de doce horas diarias en ningún caso (artículo 68, último párrafo).`);

  if (totalHoras > topeSemanal) {
    _recuadro(state,
      `Las horas autorizadas suman ${totalHoras}, por encima del límite semanal de ${topeSemanal} horas vigente en ${anio}. Si corresponden a una misma semana, el excedente se paga con un doscientos por ciento mas (triple) conforme al artículo 68, y no puede pasar de cuatro horas adicionales. Verifica la distribución antes de recabar la firma.`,
      'warn');
  }
  if (excedeCuatroDiarias.length) {
    _recuadro(state,
      `Hay ${excedeCuatroDiarias.length} día(s) con mas de cuatro horas extra. El artículo 66 permite distribuir el tiempo extraordinario en hasta CUATRO HORAS DIARIAS y en un máximo de cuatro días por semana.`,
      'warn');
  }

  _hSeccion(state, 'ALCANCE DE ESTA AUTORIZACIÓN');
  _p(state, `Solo el tiempo extraordinario expresamente autorizado en este documento se considera autorizado. LA PERSONA TRABAJADORA no esta obligada a prestar servicios por un tiempo mayor del permitido en el Capítulo II del Titulo Tercero de la Ley (artículo 68, primer párrafo), y su negativa a laborar tiempo extra no autorizado no constituye falta ni causa de sanción alguna.`);
  _p(state, `Permanecer en las instalaciones fuera de la jornada sin autorización escrita no genera tiempo extraordinario. Si por necesidades del servicio se requiere prolongar la jornada mas alla de lo aquí autorizado, deberá emitirse una nueva autorización previa.`);

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

  return _salidaDoc(state, u, _nombreArchivo('autorización-horas-extra', trab), opts);
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
    a_cuenta:  { etiqueta: 'A cuenta de vacaciones', nota: 'Los días se descuentan del periodo vacacional en curso.' },
  };
  const tipo = TIPOS[d.tipo] || TIPOS.sin_goce;

  const state = _initDocLegal(
    'Solicitud y Autorización de Permiso',
    'Constancia de ausencia justificada',
    u, 'PERM'
  );
  _ciudadFecha(state, u.ciudad || '', d.fecha_solicitud || new Date().toISOString().split('T')[0]);

  _p(state, `Yo, ${trab.nombre}${trab.puesto ? `, ${trab.puesto}` : ''}, solicito permiso para ausentarme de mis labores en los términos siguientes:`);

  _table(state, [['Concepto', 'Dato']], [
    ['Del',       formatDateShort(d.fecha_inicio)],
    ['Al',        d.fecha_fin ? formatDateShort(d.fecha_fin) : formatDateShort(d.fecha_inicio)],
    ['Horario',   d.hora_inicio || d.hora_fin ? `${d.hora_inicio || ''} – ${d.hora_fin || ''}` : 'Jornada completa'],
    ['Dias',      d.dias != null ? String(d.dias) : ''],
    ['Modalidad', tipo.etiqueta],
    ['Motivo',    d.motivo || _OP_LINEA],
  ]);

  _p(state, tipo.nota);

  _hSeccion(state, 'RESOLUCION');
  _p(state, `${d.autorizado === false ? 'NO SE AUTORIZA' : 'SE AUTORIZA'} el permiso en los términos solicitados${d.observaciones ? `, con la siguiente observación: ${d.observaciones}` : ''}.`, { bold: true });
  _p(state, `Este documento acredita la autorización. La ausencia amparada por el no constituye falta injustificada para ningún efecto, en particular para el computo de las faltas del artículo 47 fracción X de la Ley Federal del Trabajo. Fuera de las fechas y el horario aquí autorizados, la ausencia se rige por las reglas ordinarias.`);

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
    'Convenio de Modificación de Condiciones de Trabajo',
    'Artículos 31, 33 y 56 de la Ley Federal del Trabajo',
    u, 'CONVMOD'
  );
  _ciudadFecha(state, u.ciudad || '', fecha);

  _p(state, `Convenio que celebran, por una parte ${u.nombre}${u.rfc ? `, R.F.C. ${u.rfc}` : ''}, representada por ${d.representante || u.representante || _OP_LINEA}, en adelante EL PATRON, y por la otra ${trab.nombre}${trab.curp ? `, CURP ${trab.curp}` : ''}, en adelante LA PERSONA TRABAJADORA, al tenor de las siguientes cláusulas.`);

  _hOrdinal(state, 'PRIMERA', 'Antecedente y causa');
  _p(state, `Las partes tienen celebrado un contrato individual de trabajo con fecha de ingreso ${trab.fecha_ingreso ? formatDateLong(trab.fecha_ingreso) : _OP_LINEA}. Por ${d.motivo}, acuerdan modificar las condiciones que se precisan en la cláusula siguiente.`);

  _hOrdinal(state, 'SEGUNDA', 'Condiciones que se modifican');
  _table(state,
    [['Condicion', 'Como estaba', 'Como queda']],
    cambios.map(c => [c.concepto, c.antes || '—', c.despues || '—']));
  _p(state, `Las modificaciones surten efectos a partir del ${formatDateLong(d.fecha_efectos || fecha)}.`);

  _hOrdinal(state, 'TERCERA', 'Lo que no cambia');
  _p(state, `Todas las demas condiciones del contrato individual permanecen sin modificación, en particular la ANTIGUEDAD, que se computa desde la fecha de ingreso original y no se interrumpe por este convenio.`, { bold: true });
  _p(state, `${d.no_cambia || 'Se conservan sin cambio el salario, las prestaciones, la jornada y el puesto en todo aquello que no se haya modificado expresamente en la cláusula SEGUNDA.'}`);

  _hOrdinal(state, 'CUARTA', 'Límites del convenio');
  _p(state, `Las condiciones pactadas en ningún caso pueden ser inferiores a las fijadas en la Ley Federal del Trabajo (artículo 56). Es nula, y no produce efecto legal alguno, cualquier estipulación que implique renuncia de LA PERSONA TRABAJADORA a los derechos consignados en las normas de trabajo, aunque conste en este convenio (artículo 5o. fracción XIII).`);
  _p(state, `Este convenio no comprende ni afecta salarios devengados, indemnizaciones ni prestaciones ya generadas, cuya renuncia seria igualmente nula (artículo 33, primer párrafo).`);

  _hOrdinal(state, 'QUINTA', 'Voluntariedad');
  _p(state, `LA PERSONA TRABAJADORA manifiesta que suscribe este convenio de manera libre, que se le explico su contenido y alcance, que tuvo oportunidad de consultarlo, y que no medio violencia, intimidación ni condicionamiento alguno de su permanencia en el empleo.`);

  _recuadro(state,
    'Si el convenio implicara alguna renuncia de derechos, deberá hacerse por escrito con una relación circunstanciada de los hechos y RATIFICARSE ante el Centro de Conciliacion o el Tribunal, que solo lo aprobara si no contiene renuncia de derechos (artículo 33, segundo párrafo, de la Ley Federal del Trabajo).',
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

  return _salidaDoc(state, u, _nombreArchivo('convenio-modificación', trab), opts);
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
          duracion: 'Desde la fecha en que EL PATRON tuvo conocimiento de la enfermedad hasta que termine el periodo fijado por el Instituto Mexicano del Seguro Social, o antes si desaparece la incapacidad, sin exceder el término que la Ley del Seguro Social fija para el tratamiento de enfermedades que no sean consecuencia de un riesgo de trabajo (artículo 43 fracción I).',
          retorno: 'Al día siguiente de que termine la causa (artículo 45 fracción I).' },
  II:   { texto: 'La incapacidad temporal ocasionada por un accidente o enfermedad que no constituya un riesgo de trabajo',
          duracion: 'Desde que se produjo la incapacidad hasta que termine el periodo fijado por el Instituto Mexicano del Seguro Social, o antes si desaparece (artículo 43 fracción I).',
          retorno: 'Al día siguiente de que termine la causa (artículo 45 fracción I).' },
  III:  { texto: 'La prisión preventiva seguida de sentencia absolutoria',
          duracion: 'Desde que se acredite la detención a disposición de la autoridad judicial o administrativa, hasta que cause ejecutoria la sentencia absolutoria (artículo 43 fracción II).',
          retorno: 'Dentro de los quince días siguientes a la terminación de la causa (artículo 45 fracción II). Si obtiene libertad provisional, debe presentarse dentro de los quince días siguientes a su liberación, salvo que se le siga proceso por delitos intencionales contra EL PATRON o sus companeros de trabajo (artículo 43 fracción II).' },
  IV:   { texto: 'El arresto de la persona trabajadora',
          duracion: 'Desde que se acredite la detención hasta que termine el arresto (artículo 43 fracción II).',
          retorno: 'Al día siguiente de que termine la causa (artículo 45 fracción I).' },
  V:    { texto: 'El cumplimiento de los servicios y cargos del artículo 5o. constitucional y de las obligaciones del artículo 31 fracción III de la Constitucion',
          duracion: 'Desde la fecha en que deban prestarse los servicios o desempenarse los cargos, hasta por un periodo de seis años (artículo 43 fracción III).',
          retorno: 'Dentro de los quince días siguientes a la terminación de la causa (artículo 45 fracción II).' },
  VI:   { texto: 'La designación como representante ante organismos estatales',
          duracion: 'Desde la fecha en que deban desempenarse los cargos, hasta por un periodo de seis años (artículo 43 fracción III).',
          retorno: 'Dentro de los quince días siguientes a la terminación de la causa (artículo 45 fracción II).' },
  VII:  { texto: 'La falta de los documentos que exijan las leyes y reglamentos, necesarios para la prestación del servicio, cuando sea imputable a la persona trabajadora',
          duracion: 'Desde la fecha en que EL PATRON tuvo conocimiento del hecho, HASTA POR UN PERIODO DE DOS MESES (artículo 43 fracción IV).',
          retorno: 'Al día siguiente de que termine la causa (artículo 45 fracción I).' },
  VIII: { texto: 'La conclusión de la temporada, tratandose de personas contratadas bajo esa modalidad',
          duracion: 'Desde la fecha de conclusión de la temporada hasta el inicio de la siguiente (artículo 43 fracción V).',
          retorno: 'Al inicio de la siguiente temporada.' },
  IX:   { texto: 'La licencia a que se refiere el artículo 140 Bis de la Ley del Seguro Social',
          duracion: 'La que fije el Instituto Mexicano del Seguro Social al expedir la licencia.',
          retorno: 'Al día siguiente de que termine la licencia.' },
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
    'Aviso de Suspensión de la Relación de Trabajo',
    'Artículos 42, 43 y 45 de la Ley Federal del Trabajo',
    u, 'AVSUSP'
  );
  _ciudadFecha(state, u.ciudad || '', d.fecha || new Date().toISOString().split('T')[0]);

  _p(state, `${trab.nombre}`, { bold: true });
  _p(state, `${trab.puesto || ''}${trab.domicilio ? `\n${trab.domicilio}` : ''}`);
  _gap(state, 3);

  _p(state, `Por este medio se hace de su conocimiento que, a partir del ${formatDateLong(d.fecha_inicio)}, se SUSPENDEN los efectos de la relación de trabajo que nos vincula, por actualizarse la causa prevista en el ARTÍCULO 42 FRACCIÓN ${d.fraccion_art42} de la Ley Federal del Trabajo: ${causa.texto.toLowerCase()}.`);

  if (d.hechos) _p(state, `Hechos que la motivan: ${d.hechos}.`);

  _hSeccion(state, 'EFECTOS DE LA SUSPENSIÓN');
  _p(state, `La suspensión recae sobre las obligaciones de prestar el servicio y de pagar el salario, SIN RESPONSABILIDAD para ninguna de las partes (artículo 42, primer párrafo). NO IMPLICA LA TERMINACIÓN DE LA RELACIÓN DE TRABAJO ni afecta la antiguedad acumulada.`, { bold: true });

  _hSeccion(state, 'DURACION');
  _p(state, causa.duracion);
  if (d.fecha_fin_estimada) {
    _p(state, `Fecha estimada de conclusión: ${formatDateLong(d.fecha_fin_estimada)}. Si la causa termina antes, la suspensión concluye en ese momento.`);
  }

  _hSeccion(state, 'REINCORPORACION');
  _p(state, causa.retorno);
  _p(state, `Se le solicita informar por escrito, en cuanto cese la causa, para programar su reincorporación. Cualquier duda puede plantearla en ${d.contacto || u.domicilio || _OP_LINEA}.`);

  _recuadro(state,
    'Este aviso documenta una suspensión, no una baja. No debe presentarse baja ante el Instituto Mexicano del Seguro Social por este motivo, salvo que la propia normativa del Instituto lo prevea para el caso concreto.',
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

  return _salidaDoc(state, u, _nombreArchivo('aviso-suspensión', trab), opts);
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
    'Acta de Entrega-Recepción del Puesto',
    'Constancia de entrega de bienes, información y asuntos en tramite',
    u, 'ACTAER'
  );

  _p(state, `En ${d.lugar || u.domicilio || u.ciudad}, siendo las ${d.hora_inicio || '____'} horas del ${formatDateLong(fecha)}, comparecen ${trab.nombre}, quien ENTREGA el puesto de ${trab.puesto || _OP_LINEA}, y ${d.recibe_nombre || _OP_LINEA}${d.recibe_puesto ? `, ${d.recibe_puesto}` : ''}, quien RECIBE, con el objeto de hacer constar la entrega-recepción siguiente.`);

  _hSeccion(state, 'I. PARTIDAS QUE SE ENTREGAN');
  _table(state,
    [['Concepto', 'Descripción o identificador', 'Cantidad', 'Estado / observaciones']],
    partidas.map(p => [p.concepto, p.descripcion || '', p.cantidad != null ? String(p.cantidad) : '', p.estado || '']));

  if (d.asuntos_pendientes) {
    _hSeccion(state, 'II. ASUNTOS EN TRAMITE');
    _p(state, d.asuntos_pendientes);
  }

  if (d.faltantes) {
    _hSeccion(state, d.asuntos_pendientes ? 'III. FALTANTES Y OBSERVACIONES' : 'II. FALTANTES Y OBSERVACIONES');
    _p(state, d.faltantes);
    _recuadro(state,
      'Hacer constar el faltante NO autoriza a descontarlo del finiquito. El artículo 110 fracción I de la Ley Federal del Trabajo condiciona cualquier descuento a un convenio, con el tope de un mes de salario como cantidad exigible y de un treinta por ciento del excedente del salario mínimo como descuento periódico. Sin ese convenio, el descuento es ilegal aunque el faltante sea real.',
      'warn');
  }

  _hSeccion(state, 'MANIFESTACIONES');
  _p(state, `Quien entrega manifiesta que las partidas descritas comprenden la totalidad de los bienes, documentos e información que tenia asignados. ${d.manifestacion_entrega || ''}`);
  _p(state, `Quien recibe manifiesta que las recibio en el estado que se consigna, y que la revisión de fondo de saldos, expedientes y cartera se realizara dentro de los ${d.plazo_revision || 'quince días'} siguientes, plazo dentro del cual podrá formular observaciones que se harán constar por separado.`);
  _p(state, `Esta acta no constituye finiquito ni implica renuncia de derecho alguno de ninguna de las partes.`);

  if (d.hora_cierre) {
    _p(state, `Se cierra la presente acta siendo las ${d.hora_cierre} horas del día de su fecha.`);
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

  return _salidaDoc(state, u, _nombreArchivo('acta-entrega-recepción', trab), opts);
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
  _ciudadFecha(state, u.ciudad || '', fecha);

  _p(state, `A QUIEN CORRESPONDA`, { bold: true });
  _gap(state, 3);

  _p(state, `${u.nombre}${u.rfc ? `, R.F.C. ${u.rfc}` : ''}, hace constar que ${trab.nombre}${trab.curp ? `, CURP ${trab.curp}` : ''}, quien se desempeno como ${trab.puesto || _OP_LINEA}${trab.fecha_ingreso ? ` del ${formatDateLong(trab.fecha_ingreso)}` : ''}${trab.fecha_baja ? ` al ${formatDateLong(trab.fecha_baja)}` : ''}, NO TIENE ADEUDO ALGUNO con esta empresa por concepto de prestamos, anticipos de salario, faltantes, herramienta, equipo ni cualquier otro.`);

  _p(state, `Asimismo, hace constar que devolvio la totalidad de los bienes que le fueron asignados${d.detalle_bienes ? `: ${d.detalle_bienes}` : ''}, y que no existen procedimientos internos pendientes en su contra.`);

  _p(state, `Se extiende la presente a petición de la persona interesada, para los usos legales a que haya lugar.`);

  _recuadro(state,
    'Esta carta acredita unicamente que EL PATRON no tiene reclamación económica en contra de la persona trabajadora. No constituye finiquito, no implica que la persona trabajadora renuncie a derecho alguno, y no puede oponersele como reconocimiento de que nada se le adeuda: una declaración en ese sentido seria nula conforme al artículo 5o. fracción XIII de la Ley Federal del Trabajo.',
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
//  Son DOS topes distintos y el código válida los dos: el monto total del
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
    'Convenio y Autorización de Descuento',
    'Artículo 110 fracción I de la Ley Federal del Trabajo',
    u, 'AUTDESC'
  );
  _ciudadFecha(state, u.ciudad || '', fecha);

  _p(state, `Convenio que celebran ${u.nombre}, en adelante EL PATRON, y ${trab.nombre}${trab.curp ? `, CURP ${trab.curp}` : ''}, en adelante LA PERSONA TRABAJADORA, respecto del adeudo y su forma de pago.`);

  _hOrdinal(state, 'PRIMERA', 'Concepto y monto');
  _p(state, `LA PERSONA TRABAJADORA reconoce adeudar a EL PATRON la cantidad de ${fmt(monto)} por concepto de ${d.concepto}${d.fecha_origen ? `, originado el ${formatDateLong(d.fecha_origen)}` : ''}.`);

  _hOrdinal(state, 'SEGUNDA', 'Forma de pago');
  _p(state, `Ambas partes convienen en que el adeudo se cubra mediante descuento de ${fmt(descuento)} en cada periodo de pago ${periodicidad}, a partir del ${formatDateLong(d.fecha_primer_descuento || fecha)}, en aproximadamente ${numPagos} descuento(s), hasta cubrir el total.`);

  _table(state, [['Concepto', 'Importe']], [
    ['Adeudo total',                                    fmt(monto)],
    [`Salario del periodo ${periodicidad}`,             fmt(salarioPeriodo)],
    [`Salario mínimo del periodo (${diasPeriodo} días)`, fmt(smgPeriodo)],
    ['Excedente sobre el salario mínimo',               fmt(excedente)],
    ['Tope legal del descuento (30% del excedente)',    fmt(topeDescuento)],
    ['Descuento convenido',                             fmt(descuento)],
  ]);

  _hOrdinal(state, 'TERCERA', 'Límites legales');
  _p(state, `Las partes reconocen que el artículo 110 fracción I de la Ley Federal del Trabajo establece que la cantidad exigible en ningún caso podrá ser mayor del importe de los salarios de un mes, y que el descuento será el que convengan sin que pueda ser mayor del TREINTA POR CIENTO DEL EXCEDENTE DEL SALARIO MÍNIMO. El descuento pactado respeta ambos límites.`);
  _p(state, `Si el salario de LA PERSONA TRABAJADORA disminuye y el descuento convenido dejara de respetar el tope, EL PATRON lo ajustara a la baja sin necesidad de nuevo convenio.`);

  _hOrdinal(state, 'CUARTA', 'Terminación de la relación');
  _p(state, `Si la relación de trabajo termina antes de cubrirse el adeudo, el saldo no se descuenta automaticamente del finiquito: su compensación requiere el acuerdo expreso de LA PERSONA TRABAJADORA en ese momento, o bien la via legal que corresponda. Los salarios devengados y las prestaciones generadas no son renunciables (artículo 33 de la Ley Federal del Trabajo).`, { bold: true });

  _hOrdinal(state, 'QUINTA', 'Voluntariedad');
  _p(state, `LA PERSONA TRABAJADORA manifiesta que suscribe este convenio libremente y que se le explico su contenido. Puede liquidar el saldo anticipadamente en cualquier momento, sin penalización alguna. Este convenio no genera intereses.`);

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

  return _salidaDoc(state, u, _nombreArchivo('autorización-descuento', trab), opts);
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
    'Propuesta de condiciones previa a la contratación',
    u, 'OFERTA'
  );
  _ciudadFecha(state, u.ciudad || '', fecha);

  _p(state, `${d.candidato}`, { bold: true });
  _gap(state, 3);
  _p(state, `Nos complace ofrecerle incorporarse a ${u.nombre} en las condiciones siguientes:`);

  _table(state, [['Condicion', 'Propuesta']], [
    ['Puesto',                d.puesto],
    ['Area o departamento',   d.area || ''],
    ['Fecha de ingreso propuesta', d.fecha_ingreso ? formatDateLong(d.fecha_ingreso) : _OP_LINEA],
    ['Tipo de contrato',      d.tipo_contrato || 'Por tiempo indeterminado'],
    ['Salario',               `${fmt(Number(d.salario))} ${d.periodo_salario || 'mensual'} bruto`],
    ['Jornada',               d.jornada || ''],
    ['Lugar de trabajo',      d.lugar || u.domicilio || ''],
    ['Reporta a',             d.reporta_a || ''],
  ]);

  if (d.prestaciones) {
    _hSeccion(state, 'PRESTACIONES');
    _p(state, d.prestaciones);
  }
  _p(state, `En todo caso se otorgan como mínimo las prestaciones de ley: aguinaldo, vacaciones, prima vacacional, prima dominical, días de descanso y alta ante el Instituto Mexicano del Seguro Social desde el primer día.`);

  if (d.periodo_prueba_dias) {
    _hSeccion(state, 'PERIODO A PRUEBA');
    _p(state, `Se propone un periodo a prueba de ${String(d.periodo_prueba_dias)} días, en los términos del artículo 39-A de la Ley Federal del Trabajo. Durante el, la relación es de trabajo para todos los efectos y se cotiza ante el Instituto Mexicano del Seguro Social.`);
  }

  _hSeccion(state, 'ALCANCE DE ESTA OFERTA');
  _p(state, `Esta carta es una PROPUESTA y no sustituye al contrato individual de trabajo, que se celebrara por escrito antes del inicio de labores con los requisitos del artículo 25 de la Ley Federal del Trabajo. Las condiciones definitivas serán las que consten en ese contrato.`, { bold: true });
  _p(state, `La oferta esta vigente hasta el ${d.vigencia ? formatDateLong(d.vigencia) : _OP_LINEA}${d.condicionada ? `, y queda sujeta a ${d.condicionada}` : ''}.`);
  _p(state, `Los datos personales que nos proporcione se tratan conforme al Aviso de Privacidad de la empresa. Si la relación no llega a formalizarse, se conservan unicamente por el tiempo necesario para acreditar el proceso de selección.`);

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

  return _salidaDoc(state, u, `carta-oferta-${d.candidato.replace(/\s+/g, '-').toLowerCase()}.pdf`, opts);
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

  const linea = (etiqueta, valor) => [etiqueta, valor || _OP_LINEA];

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
    linea('Número de seguridad social', d.nss),
    linea('Domicilio',         d.domicilio),
    linea('Telefono',          d.telefono),
    linea('Correo electrónico', d.email),
    linea('Contacto en caso de emergencia', d.contacto_emergencia),
  ]);

  _recuadro(state,
    'No se solicitan datos sobre estado civil, responsabilidades familiares, embarazo, religion, preferencias sexuales ni afiliación sindical. El artículo 133 fracción XIV de la Ley Federal del Trabajo prohibe exigir certificados médicos de no embarazo para el ingreso, y el artículo 3o. prohibe la discriminación por esos motivos.',
    'info');

  _hSeccion(state, 'III. ESCOLARIDAD Y CAPACITACIÓN');
  _table(state, [['Nivel', 'Institucion', 'Periodo', 'Documento obtenido']],
    (d.escolaridad?.length ? d.escolaridad : [{}, {}, {}])
      .map(e => [e.nivel || _OP_LINEA, e.institucion || '', e.periodo || '', e.documento || '']));

  _hSeccion(state, 'IV. EXPERIENCIA LABORAL');
  _table(state, [['Empresa', 'Puesto', 'Periodo', 'Motivo de separación', 'Referencia y telefono']],
    (d.experiencia?.length ? d.experiencia : [{}, {}, {}])
      .map(e => [e.empresa || _OP_LINEA, e.puesto || '', e.periodo || '', e.motivo || '', e.referencia || '']));

  _hSeccion(state, 'V. DECLARACIÓN DE VERACIDAD');
  _p(state, `Declaro bajo protesta de decir verdad que la información asentada en esta solicitud y en los documentos que la acompanan es VERDADERA, y que los certificados, constancias y referencias que presento son autenticos.`, { bold: true });
  _p(state, `Me doy por enterado de que, conforme al artículo 47 fracción I de la Ley Federal del Trabajo, el patron puede rescindir la relación de trabajo sin responsabilidad cuando el trabajador lo engana con certificados falsos o referencias en las que se atribuya capacidades, aptitudes o facultades de que carece, y de que esa causa DEJA DE TENER EFECTO DESPUES DE TREINTA DÍAS de prestar servicios.`);
  _p(state, `Autorizo a ${u.nombre} a verificar las referencias laborales y los datos aquí asentados. Mis datos personales se tratan conforme al Aviso de Privacidad de la empresa, que se pone a mi disposición en este acto (artículo 16 de la Ley Federal de Protección de Datos Personales en Posesion de los Particulares).`);
  _p(state, `Entiendo que esta solicitud NO constituye contrato de trabajo ni obliga a la empresa a contratarme.`);

  _gap(state, 12);
  const { ml, tw } = state;
  _firmaConIdentificacion(state, 'FIRMA DE LA PERSONA SOLICITANTE', d.nombre, null, d.domicilio,
    ml, Math.min(tw * 0.55, 100));
  state.y += 10;

  return _salidaDoc(state, u, `solicitud-empleo${d.nombre ? '-' + d.nombre.replace(/\s+/g, '-').toLowerCase() : ''}.pdf`, opts);
}
