/**
 * Capital Humano MX — Motor de Cálculo LFT 2026
 * Sin dependencias de DOM — funciones puras reutilizables
 */

// ─── CONSTANTES LFT 2026 ──────────────────────────────────────────────────────
// El salario mínimo y la UMA caducan cada año y viven en vigencias.js, que
// LANZA ErrorVigencia si el año en curso no está configurado. Aquí sólo quedan
// las constantes que no dependen del ejercicio fiscal.
//   Salario mínimo → _smgVigente('general' | 'frontera')
//   UMA diaria     → _umaVigente()
const AGUINALDO_DAYS   = 15;
const PRIMA_VAC_PCT    = 0.25;
const PRIMA_ANTIG_DAYS = 12;
const INDEM_CONST_DAYS = 90;
const DIAS_20_POR_ANIO = 20;  // Art. 50 fracc. II LFT — cuando el patrón se niega a reinstalar

const VACATION_TABLE = [
  { from:1,  to:1,  days:12 }, { from:2,  to:2,  days:14 },
  { from:3,  to:3,  days:16 }, { from:4,  to:4,  days:18 },
  { from:5,  to:9,  days:20 }, { from:10, to:14, days:22 },
  { from:15, to:19, days:24 }, { from:20, to:24, days:26 },
  { from:25, to:29, days:28 }, { from:30, to:34, days:30 },
  { from:35, to:39, days:32 },
];

// ─── ART. 47 LFT — TEXTO LITERAL DE LAS FRACCIONES ───────────────────────────
// Transcripción del texto consolidado publicado por la Cámara de Diputados
// (LFT, última reforma DOF 14-05-2026). El aviso de rescisión debe reproducir
// la fracción invocada: citar mal una fracción en un documento que se exhibe en
// juicio tumba la rescisión, así que estos textos NO se parafrasean.
const ART47_FRACCIONES = {
  'I': 'Engañarlo el trabajador o en su caso, el sindicato que lo hubiese propuesto o recomendado con certificados falsos o referencias en los que se atribuyan al trabajador capacidad, aptitudes o facultades de que carezca. Esta causa de rescisión dejará de tener efecto después de treinta días de prestar sus servicios el trabajador;',
  'II': 'Incurrir el trabajador, durante sus labores, en faltas de probidad u honradez, en actos de violencia, amagos, injurias o malos tratamientos en contra del patrón, sus familiares o del personal directivo o administrativo de la empresa o establecimiento, o en contra de clientes y proveedores del patrón, salvo que medie provocación o que obre en defensa propia;',
  'III': 'Cometer el trabajador contra alguno de sus compañeros, cualquiera de los actos enumerados en la fracción anterior, si como consecuencia de ellos se altera la disciplina del lugar en que se desempeña el trabajo;',
  'IV': 'Cometer el trabajador, fuera del servicio, contra el patrón, sus familiares o personal directivo administrativo, alguno de los actos a que se refiere la fracción II, si son de tal manera graves que hagan imposible el cumplimiento de la relación de trabajo;',
  'V': 'Ocasionar el trabajador, intencionalmente, perjuicios materiales durante el desempeño de las labores o con motivo de ellas, en los edificios, obras, maquinaria, instrumentos, materias primas y demás objetos relacionados con el trabajo;',
  'VI': 'Ocasionar el trabajador los perjuicios de que habla la fracción anterior siempre que sean graves, sin dolo, pero con negligencia tal, que ella sea la causa única del perjuicio;',
  'VII': 'Comprometer el trabajador, por su imprudencia o descuido inexcusable, la seguridad del establecimiento o de las personas que se encuentren en él;',
  'VIII': 'Cometer el trabajador actos inmorales o de hostigamiento y/o acoso sexual contra cualquier persona en el establecimiento o lugar de trabajo;',
  'IX': 'Revelar el trabajador los secretos de fabricación o dar a conocer asuntos de carácter reservado, con perjuicio de la empresa;',
  'X': 'Tener el trabajador más de tres faltas de asistencia en un período de treinta días, sin permiso del patrón o sin causa justificada;',
  'XI': 'Desobedecer el trabajador al patrón o a sus representantes, sin causa justificada, siempre que se trate del trabajo contratado;',
  'XII': 'Negarse el trabajador a adoptar las medidas preventivas o a seguir los procedimientos indicados para evitar accidentes o enfermedades;',
  'XIII': 'Concurrir el trabajador a sus labores en estado de embriaguez o bajo la influencia de algún narcótico o droga enervante, salvo que, en este último caso, exista prescripción médica. Antes de iniciar su servicio, el trabajador deberá poner el hecho en conocimiento del patrón y presentar la prescripción suscrita por el médico;',
  'XIV': 'La sentencia ejecutoriada que imponga al trabajador una pena de prisión, que le impida el cumplimiento de la relación de trabajo;',
  'XIV Bis': 'La falta de documentos que exijan las leyes y reglamentos, necesarios para la prestación del servicio cuando sea imputable al trabajador y que exceda del periodo a que se refiere la fracción IV del artículo 43; y',
  'XV': 'Las análogas a las establecidas en las fracciones anteriores, de igual manera graves y de consecuencias semejantes en lo que al trabajo se refiere.',
};

/** Texto literal de una fracción del art. 47, o null si no existe. */
function textoFraccionArt47(fraccion) {
  return ART47_FRACCIONES[String(fraccion || '').trim().toUpperCase().replace(/\s+BIS$/, ' Bis')] || null;
}

// Catálogo de faltas. `fraccion` es la del art. 47 que sustenta la RESCISIÓN;
// las faltas que sólo admiten amonestación se apoyan en el art. 134 y en el
// Reglamento Interior de Trabajo, y por eso llevan `fraccion: null`.
// Toda entrada con severidad 'rescisoria' debe tener fracción del art. 47.
const FALTAS_CATALOG = [
  { value:'impuntualidad', label:'Impuntualidad reiterada', fraccion:null,
    causal:'Art. 134 Fracc. IV LFT — Obligación de observar el horario de trabajo / Reglamento Interior de Trabajo',
    severity:['amonestacion','formal'] },
  { value:'desobediencia', label:'Desobediencia / Negativa a cumplir instrucciones', fraccion:'XI',
    causal:'Art. 47 Fracc. XI LFT — Desobedecer al patrón o a sus representantes, sin causa justificada, siempre que se trate del trabajo contratado',
    severity:['amonestacion','formal','rescisoria'] },
  { value:'medidas', label:'Negativa a adoptar medidas de seguridad e higiene', fraccion:'XII',
    causal:'Art. 47 Fracc. XII LFT — Negarse a adoptar las medidas preventivas o a seguir los procedimientos indicados para evitar accidentes o enfermedades',
    severity:['amonestacion','formal','rescisoria'] },
  { value:'asistencia', label:'Falta de asistencia injustificada', fraccion:'X',
    causal:'Art. 47 Fracc. X LFT — Más de tres faltas de asistencia en un período de treinta días, sin permiso del patrón o sin causa justificada',
    severity:['formal','rescisoria'] },
  { value:'danos', label:'Daño intencional a bienes de la empresa', fraccion:'V',
    causal:'Art. 47 Fracc. V LFT — Ocasionar intencionalmente perjuicios materiales en edificios, obras, maquinaria, instrumentos, materias primas y demás objetos relacionados con el trabajo',
    severity:['formal','rescisoria'] },
  { value:'negligencia', label:'Daño grave por negligencia (sin dolo)', fraccion:'VI',
    causal:'Art. 47 Fracc. VI LFT — Ocasionar los mismos perjuicios, graves, sin dolo, pero con negligencia tal que sea la causa única del perjuicio',
    severity:['formal','rescisoria'] },
  { value:'seguridad_establecimiento', label:'Comprometer la seguridad del establecimiento o de las personas', fraccion:'VII',
    causal:'Art. 47 Fracc. VII LFT — Comprometer, por imprudencia o descuido inexcusable, la seguridad del establecimiento o de las personas que se encuentren en él',
    severity:['formal','rescisoria'] },
  { value:'embriaguez', label:'Presentarse bajo efectos de alcohol o drogas', fraccion:'XIII',
    causal:'Art. 47 Fracc. XIII LFT — Concurrir a sus labores en estado de embriaguez o bajo la influencia de algún narcótico o droga enervante, salvo prescripción médica avisada previamente',
    severity:['formal','rescisoria'] },
  { value:'violencia', label:'Violencia o injurias contra el patrón, jefes, clientes o proveedores', fraccion:'II',
    causal:'Art. 47 Fracc. II LFT — Faltas de probidad u honradez, actos de violencia, amagos, injurias o malos tratamientos contra el patrón, sus familiares, el personal directivo o administrativo, o contra clientes y proveedores, salvo provocación o defensa propia',
    severity:['formal','rescisoria'] },
  { value:'violencia_companeros', label:'Violencia o injurias contra compañeros de trabajo', fraccion:'III',
    causal:'Art. 47 Fracc. III LFT — Cometer contra algún compañero los actos de la fracción II, si como consecuencia se altera la disciplina del lugar de trabajo',
    severity:['formal','rescisoria'] },
  { value:'violencia_fuera', label:'Actos graves fuera del servicio contra el patrón o jefes', fraccion:'IV',
    causal:'Art. 47 Fracc. IV LFT — Cometer fuera del servicio, contra el patrón, sus familiares o personal directivo administrativo, los actos de la fracción II, si son de tal gravedad que hagan imposible el cumplimiento de la relación de trabajo',
    severity:['rescisoria'] },
  { value:'robo', label:'Robo / Fraude / Faltas de probidad u honradez', fraccion:'II',
    causal:'Art. 47 Fracc. II LFT — Incurrir durante sus labores en faltas de probidad u honradez',
    severity:['rescisoria'] },
  { value:'secretos', label:'Revelación de secretos o asuntos reservados', fraccion:'IX',
    causal:'Art. 47 Fracc. IX LFT — Revelar los secretos de fabricación o dar a conocer asuntos de carácter reservado, con perjuicio de la empresa',
    severity:['rescisoria'] },
  { value:'acoso', label:'Actos inmorales, hostigamiento o acoso sexual', fraccion:'VIII',
    causal:'Art. 47 Fracc. VIII LFT — Cometer actos inmorales o de hostigamiento y/o acoso sexual contra cualquier persona en el establecimiento o lugar de trabajo',
    severity:['rescisoria'] },
  { value:'certificados_falsos', label:'Engaño con certificados o referencias falsas', fraccion:'I',
    causal:'Art. 47 Fracc. I LFT — Engañar al patrón con certificados falsos o referencias que atribuyan capacidades de que se carece. Caduca a los treinta días de prestar servicios',
    severity:['rescisoria'] },
  { value:'prision', label:'Sentencia ejecutoriada de pena de prisión', fraccion:'XIV',
    causal:'Art. 47 Fracc. XIV LFT — Sentencia ejecutoriada que imponga pena de prisión que impida el cumplimiento de la relación de trabajo',
    severity:['rescisoria'] },
  { value:'falta_documentos', label:'Falta de documentos exigidos por ley para prestar el servicio', fraccion:'XIV Bis',
    causal:'Art. 47 Fracc. XIV Bis LFT — Falta de documentos que exijan las leyes y reglamentos, imputable al trabajador, que exceda del periodo del art. 43 fracc. IV',
    severity:['rescisoria'] },
  { value:'analoga', label:'Causa análoga de igual gravedad (fundamentar en la descripción)', fraccion:'XV',
    causal:'Art. 47 Fracc. XV LFT — Causas análogas a las anteriores, de igual manera graves y de consecuencias semejantes en lo que al trabajo se refiere',
    severity:['rescisoria'] },
  { value:'otra', label:'Otra falta disciplinaria (especificar en descripción)', fraccion:null,
    causal:'Reglamento Interior de Trabajo / Art. 134 LFT — Obligaciones generales del trabajador',
    severity:['amonestacion','formal'] },
];

// ─── JORNADA — RÉGIMEN DE TRANSICIÓN 2026-2030 ───────────────────────────────
// Decreto de reducción de la jornada laboral, DOF 01-05-2026. El máximo semanal
// lo fija el art. 59 LFT (el 61 regula la jornada DIARIA: 8 diurna, 7 nocturna,
// 7.5 mixta). El texto consolidado del art. 59 ya dice 40 horas, pero el
// Transitorio Segundo escalona su entrada en vigor a partir del 1 de enero de
// cada año; el Cuarto hace lo propio con la jornada extraordinaria del art. 66.
//
// Importa pactar el máximo vigente y no la meta legislativa: por los arts. 31,
// 56 y 57 LFT y el principio de irreversibilidad, lo pactado por encima del
// mínimo legal se vuelve condición adquirida. Un contrato que hoy fije 40 horas
// no podrá volver a 48, y las 8 horas de diferencia se vuelven tiempo
// extraordinario pagado al doble.
const JORNADA_SEMANAL_MAX   = { 2026: 48, 2027: 46, 2028: 44, 2029: 42, 2030: 40 };
const HORAS_EXTRA_MAX_SEMANA = { 2026: 9,  2027: 9,  2028: 10, 2029: 11, 2030: 12 };

/** Jornada semanal máxima aplicable al año dado (Transitorio Segundo). */
function jornadaMaximaVigente(anio = new Date().getFullYear()) {
  if (anio >= 2030) return 40;
  return JORNADA_SEMANAL_MAX[anio] ?? 48;
}

/** Tope semanal de horas extraordinarias del año dado (Transitorio Cuarto). */
function horasExtraMaxVigente(anio = new Date().getFullYear()) {
  if (anio >= 2030) return 12;
  return HORAS_EXTRA_MAX_SEMANA[anio] ?? 9;
}

/**
 * Horas semanales que resultan del horario capturado. Descuenta el descanso
 * intermedio sólo si está definido, y cuenta únicamente los días laborables
 * pactados.
 * @returns {number|null} null si el horario está incompleto o es inconsistente
 */
function horasSemanalesPactadas({ horaInicio, horaFin, horaDescansoInicio, horaDescansoFin, diasSemana }) {
  const min = (hhmm) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m) return null;
    const h = +m[1], mm = +m[2];
    return (h >= 0 && h <= 23 && mm >= 0 && mm <= 59) ? h * 60 + mm : null;
  };
  const ini = min(horaInicio), fin = min(horaFin);
  if (ini === null || fin === null) return null;

  // Jornada que cruza la medianoche (turno nocturno)
  let bruto = fin - ini;
  if (bruto <= 0) bruto += 24 * 60;

  const dIni = min(horaDescansoInicio), dFin = min(horaDescansoFin);
  let descanso = 0;
  if (dIni !== null && dFin !== null) {
    descanso = dFin - dIni;
    if (descanso < 0) descanso += 24 * 60;
    if (descanso >= bruto) return null;
  }

  const dias = Array.isArray(diasSemana) ? diasSemana.length : 0;
  if (!dias) return null;
  return parseFloat((((bruto - descanso) / 60) * dias).toFixed(2));
}

const MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];

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

function vacDaysForYear(yrs, extraDias = 0) {
  if (yrs <= 0) return 12 + extraDias;
  for (const r of VACATION_TABLE) if (yrs >= r.from && yrs <= r.to) return r.days + extraDias;
  return 30 + (Math.floor((yrs - 30) / 5) + 1) * 2 + extraDias;
}

/**
 * Días de vacaciones proporcionales al año en curso.
 * Se usan los días del año que SE ESTÁ TRABAJANDO (completed + 1),
 * no los del último año ya cumplido.
 * Ej.: trabajador en su año 3 → le aplican 16 días (año 3), no 14 (año 2).
 */
function propVacDays(start, end, extraDias = 0) {
  const completed   = fullYears(start, end);
  const entitlement = vacDaysForYear(completed + 1, extraDias); // año en curso
  const anniversary = new Date(start);
  anniversary.setFullYear(anniversary.getFullYear() + completed);
  const elapsed  = daysBetween(anniversary, end);
  const fraction = Math.min(1, elapsed / 365);
  return parseFloat((entitlement * fraction).toFixed(4));
}

/**
 * Días trabajados dentro del año calendario de la fecha de baja.
 * Si el trabajador ingresó este año, cuenta desde su ingreso;
 * si ya venía del año anterior, cuenta desde el 1 de enero.
 */
function diasEnAnoCalendario(startDate, endDate) {
  const inicioAno = new Date(endDate.getFullYear(), 0, 1);
  const fechaBase = startDate > inicioAno ? startDate : inicioAno;
  return Math.max(0, daysBetween(fechaBase, endDate));
}

function calcSDI(daily, vacDays, primaPct, agDays) {
  return daily * (1 + (vacDays * primaPct + agDays) / 365);
}

/**
 * Cuota OBRERA del IMSS por ramos (Ley del Seguro Social), calculada sobre el
 * Salario Base de Cotización (SBC) diario, no sobre el salario ordinario.
 * Ramos a cargo del trabajador (porcentajes 2024-2026):
 *   · Enf. y Mat. — prestaciones en especie, cuota adicional: 0.40% sobre el
 *     EXCEDENTE de 3 UMA (Art. 106 fr. II LSS). Exento si SBC ≤ 3 UMA.
 *   · Enf. y Mat. — prestaciones en dinero: 0.25% del SBC (Art. 107).
 *   · Gastos médicos pensionados y beneficiarios: 0.375% del SBC (Art. 25).
 *   · Invalidez y Vida: 0.625% del SBC (Art. 147).
 *   · Cesantía en edad avanzada y Vejez: 1.125% del SBC (Art. 168).
 * (Riesgos de trabajo y Guarderías son 100% patronales: el obrero no aporta.)
 * El SBC se topa a 25 UMA (Art. 28 LSS).
 *
 * @param {number} sbcDiario   SBC diario (si no hay SBC calculado, usar salario diario)
 * @param {number} diasCotiz   Días cotizados en el período
 * @param {number} umaDiaria   UMA diaria vigente
 * @returns {number} Cuota obrera del período (2 decimales)
 */
function calcIMSSObrero(sbcDiario, diasCotiz, umaDiaria) {
  const base      = Math.min(Math.max(0, sbcDiario || 0), 25 * umaDiaria); // tope 25 UMA
  const excedente = Math.max(0, base - 3 * umaDiaria);                     // exención 3 UMA
  const cuotaDiaria =
      excedente * 0.0040   // EyM especie — cuota adicional obrero sobre excedente 3 UMA
    + base * 0.0025        // EyM prestaciones en dinero
    + base * 0.00375       // Gastos médicos pensionados
    + base * 0.00625       // Invalidez y vida
    + base * 0.01125;      // Cesantía y vejez
  return parseFloat((cuotaDiaria * Math.max(0, diasCotiz)).toFixed(2));
}

/**
 * Cuota PATRONAL de Cesantía en Edad Avanzada y Vejez (CEAV) vigente en 2026.
 * Reforma de pensiones (DOF 16/12/2020): esquema progresivo 2023-2030 por
 * rango de SBC. El primer renglón (1 SM) se compara contra el salario mínimo;
 * los demás contra múltiplos de UMA. Cuando se publique la tabla del año
 * siguiente, actualizar estas constantes (los porcentajes crecen cada enero
 * hasta llegar a los definitivos de 2030).
 */
const CEAV_PATRONAL_2026 = [
  { hastaUMA: 1.50, pct: 0.03676 },  // de 1.01 SM a 1.50 UMA
  { hastaUMA: 2.00, pct: 0.04851 },
  { hastaUMA: 2.50, pct: 0.05556 },
  { hastaUMA: 3.00, pct: 0.06026 },
  { hastaUMA: 3.50, pct: 0.06361 },
  { hastaUMA: 4.00, pct: 0.06613 },
  { hastaUMA: Infinity, pct: 0.07513 },
];
const CEAV_PATRONAL_1SM = 0.03150;   // SBC de exactamente 1 salario mínimo

function _ceavPatronalPct(sbcDiario, umaDiaria, smgDiario) {
  // Con SBC ≤ 1 SM aplica la cuota mínima sin progresión (el SBC nunca puede
  // ser menor al SM, pero se tolera por datos capturados a mano).
  // smgDiario siempre llega validado desde _smgVigente(); sin respaldo local.
  if (sbcDiario <= smgDiario * 1.005) return CEAV_PATRONAL_1SM;
  const enUMA = sbcDiario / umaDiaria;
  return (CEAV_PATRONAL_2026.find(r => enUMA <= r.hastaUMA) || CEAV_PATRONAL_2026.at(-1)).pct;
}

/**
 * Cuotas PATRONALES del IMSS por ramos (LSS), sobre el SBC diario topado a
 * 25 UMA. NO incluye INFONAVIT (5%, se calcula aparte) ni el ISN estatal.
 * Ramos a cargo del patrón (2026):
 *   · EyM cuota fija: 20.40% de una UMA por día cotizado (Art. 106 fr. I)
 *   · EyM excedente 3 UMA: 1.10% sobre el excedente (Art. 106 fr. II)
 *   · EyM prestaciones en dinero: 0.70% del SBC (Art. 107)
 *   · Gastos médicos pensionados: 1.05% del SBC (Art. 25)
 *   · Riesgos de trabajo: prima de la empresa % del SBC (Arts. 71-74;
 *     la de la declaración anual de febrero; default clase I = 0.54355%)
 *   · Invalidez y Vida: 1.75% del SBC (Art. 147)
 *   · Guarderías y prest. sociales: 1.00% del SBC (Art. 211)
 *   · Retiro: 2.00% del SBC (Art. 168 fr. I)
 *   · CEAV patronal: progresiva por rango de SBC (tabla 2026, ver arriba)
 *
 * @param {number} sbcDiario       SBC diario (fallback: salario diario)
 * @param {number} diasCotiz       Días cotizados en el período
 * @param {number} umaDiaria       UMA diaria vigente
 * @param {number} primaRiesgoPct  Prima de riesgo de la empresa en % (ej. 0.54355)
 * @param {string} [smgZone]       'general' | 'frontera' (para el renglón 1 SM de CEAV)
 * @returns {{total:number, desglose:Object}} Cuota patronal del período
 */
function calcIMSSPatronal(sbcDiario, diasCotiz, umaDiaria, primaRiesgoPct, smgZone = 'general') {
  const dias      = Math.max(0, diasCotiz || 0);
  const base      = Math.min(Math.max(0, sbcDiario || 0), 25 * umaDiaria); // tope 25 UMA (Art. 28 LSS)
  const excedente = Math.max(0, base - 3 * umaDiaria);
  const primaRT   = Math.max(0, parseFloat(primaRiesgoPct) || 0.54355) / 100;
  const smgDiario = _smgVigente(smgZone);

  const d = {
    cuotaFija:     umaDiaria * 0.2040,
    excedente:     excedente * 0.0110,
    prestDinero:   base * 0.0070,
    gastosMedicos: base * 0.0105,
    riesgoTrabajo: base * primaRT,
    invalidezVida: base * 0.0175,
    guarderias:    base * 0.0100,
    retiro:        base * 0.0200,
    ceav:          base * _ceavPatronalPct(base, umaDiaria, smgDiario),
  };
  const desglose = {};
  let total = 0;
  for (const [k, v] of Object.entries(d)) {
    desglose[k] = parseFloat((v * dias).toFixed(2));
    total += desglose[k];
  }
  return { total: parseFloat(total.toFixed(2)), desglose };
}

/**
 * Costo total mensual de un trabajador para el patrón:
 * salario + cuotas patronales IMSS + INFONAVIT 5% + ISN estatal +
 * provisiones mensuales de aguinaldo, vacaciones y prima vacacional.
 * Todo informativo — no toca la nómina; alimenta el simulador del perfil
 * y el preview del alta.
 *
 * @param {Object} trab  Trabajador ({ salario_mensual, periodo_salario, sbc,
 *                       fecha_ingreso, smg_zone })
 * @param {Object} [emp] Empresa (default CTX.empresa) — usa prima_riesgo_pct
 *                       e isn_pct de la migración 32
 * @returns {Object} desglose mensual con total
 */
function costoTotalEmpleado(trab, emp) {
  const e     = emp || (typeof CTX !== 'undefined' && CTX?.empresa) || {};
  const prest = prestacionesEmpresa(e);
  const uma   = _umaVigente();

  const daily    = calcSalarioDiario(parseFloat(trab.salario_mensual) || 0, trab.periodo_salario || 'mensual');
  const salMens  = daily * 30;
  const sbcDiario = parseFloat(trab.sbc) > 0 ? parseFloat(trab.sbc) : daily;

  // Cuotas patronales sobre 30.4 días promedio/mes (convención IMSS)
  const imssPat  = calcIMSSPatronal(sbcDiario, 30.4, uma, e.prima_riesgo_pct, trab.smg_zone || 'general');
  const sbcTope  = Math.min(sbcDiario, 25 * uma);
  const infonavit = parseFloat((sbcTope * 0.05 * 30.4).toFixed(2));
  const isn       = parseFloat((salMens * (parseFloat(e.isn_pct) || 0)).toFixed(2));

  // Provisiones mensuales (lo que se devenga aunque se pague después)
  const ingreso   = trab.fecha_ingreso ? new Date(trab.fecha_ingreso + 'T00:00:00') : new Date();
  const yrs       = Math.max(1, fullYears(ingreso, new Date()) + 1); // año de servicio en curso
  const vacDias   = vacDaysForYear(yrs, prest.vacDiasExtra);
  const provAguinaldo = parseFloat((daily * prest.aguinaldoDias / 12).toFixed(2));
  const provVacaciones = parseFloat((daily * vacDias / 12).toFixed(2));
  const provPrimaVac   = parseFloat((provVacaciones * prest.primaVacPct).toFixed(2));

  const total = parseFloat((salMens + imssPat.total + infonavit + isn +
                            provAguinaldo + provVacaciones + provPrimaVac).toFixed(2));
  return {
    salarioMensual: parseFloat(salMens.toFixed(2)),
    imssPatronal:   imssPat.total,
    imssDesglose:   imssPat.desglose,
    infonavit,
    isn,
    provAguinaldo,
    provVacaciones,
    provPrimaVac,
    total,
    factorSobreSalario: salMens > 0 ? parseFloat((total / salMens).toFixed(3)) : 0,
  };
}

/**
 * Convierte el salario al periodo indicado a salario DIARIO.
 * Art. 89 LFT: mensual / 30; quincenal / 15; semanal / 7.
 */
function calcSalarioDiario(monto, periodo) {
  if (periodo === 'quincenal') return monto / 15;
  if (periodo === 'semanal')   return monto / 7;
  return monto / 30; // mensual (default)
}

// ─── PRESTACIONES DE EMPRESA (fallback a mínimos de ley) ─────────────────────
/**
 * Lee la configuración de prestaciones particulares de la empresa
 * (migración 14) con fallback a los mínimos de la LFT si las columnas
 * no existen o la empresa no ha configurado nada. Math.max() blinda
 * los mínimos de ley en JS (los CHECK de Postgres son la segunda barrera).
 * @param {Object} [emp]  Objeto empresa; default CTX.empresa
 */
function prestacionesEmpresa(emp) {
  const e = emp || (typeof CTX !== 'undefined' && CTX?.empresa) || {};
  const num = (v, def) => { const n = parseFloat(v); return Number.isFinite(n) ? n : def; };
  return {
    aguinaldoDias: Math.max(AGUINALDO_DAYS, num(e.dias_aguinaldo, AGUINALDO_DAYS)),
    vacDiasExtra:  Math.max(0, num(e.dias_vacaciones_extra, 0)),
    primaVacPct:   Math.max(PRIMA_VAC_PCT, num(e.prima_vacacional_pct, PRIMA_VAC_PCT)),
    primaDomPct:   Math.max(0.25, num(e.prima_dominical_pct, 0.25)),   // Art. 71 LFT
    factorHE:      Math.max(2, num(e.factor_horas_extra, 2)),          // Art. 67-68 LFT
    fondoAhorro: {
      activo:        !!e.fondo_ahorro_empresa_activo,
      pctTrabajador: num(e.fondo_ahorro_pct_trabajador, 0.13),
      pctPatron:     num(e.fondo_ahorro_pct_patron, 0.13),
    },
    vales: {
      activo: !!e.vales_despensa_activo,
      tipo:   e.vales_despensa_tipo === 'pct' ? 'pct' : 'monto',
      valor:  num(e.vales_despensa_valor, 0),
    },
    festivos: Array.isArray(e.festivos_adicionales) ? e.festivos_adicionales : [],
  };
}

/**
 * ¿La fecha ISO (YYYY-MM-DD) es festivo particular de la empresa?
 * Soporta festivos de fecha exacta y recurrentes cada año (MM-DD).
 */
function esFestivoEmpresa(fechaISO, prest) {
  const p = prest || prestacionesEmpresa();
  const mmdd = String(fechaISO || '').slice(5); // 'MM-DD'
  return p.festivos.some(f =>
    (f.tipo === 'fecha' && f.valor === fechaISO) ||
    (f.tipo === 'recurrente' && f.valor === mmdd)
  );
}

// _smgVigente() y _umaVigente() viven ahora en vigencias.js: validan que el
// valor corresponda al ejercicio en curso y lanzan ErrorVigencia si caducó.

// ─── PRIMA DOMINICAL Y PAGO DE DÍA FESTIVO (Arts. 71, 74-75 LFT) ─────────────
/**
 * Prima dominical (Art. 71 LFT): quien preste servicios en domingo tiene
 * derecho a una prima adicional del 25% (mínimo) sobre el salario del día,
 * cuando ese día corresponde a su jornada ordinaria de descanso.
 * @param {number} salarioDiario
 * @param {number} domingosTrabajados
 * @param {number} [pct=0.25]  Porcentaje pactado (nunca menor a 0.25)
 */
function calcularPrimaDominical(salarioDiario, domingosTrabajados, pct = 0.25) {
  const p = Math.max(0.25, parseFloat(pct) || 0.25);
  return parseFloat(((salarioDiario || 0) * (domingosTrabajados || 0) * p).toFixed(2));
}

// ─── DESCUENTOS Y PRÉSTAMOS (Art. 110 LFT) ───────────────────────────────────
/**
 * Aplica los descuentos/préstamos activos de un trabajador a un periodo de
 * nómina, respetando el orden de prioridad legal y el tope del Art. 110
 * fracc. I LFT.
 *
 * Reglas:
 *  - La pensión alimenticia (prioridad 1) SIEMPRE se aplica primero y
 *    completa — deriva de una orden judicial (Art. 110 fr. V LFT), no le
 *    aplican los topes de esta función.
 *  - Los préstamos de la empresa ('prestamo_empresa') no pueden exceder,
 *    en conjunto, el 30% del excedente del salario del periodo sobre el
 *    salario mínimo del mismo periodo (Art. 110 fr. I LFT).
 *  - Ningún descuento (salvo la pensión alimenticia) puede dejar el neto
 *    del periodo por debajo del salario mínimo.
 *  - Si un descuento no cabe completo, se aplica lo que quepa (parcial) y
 *    se marca `recortado:true` para mostrar la advertencia en pantalla.
 *
 * @param {Array}  descuentos     Filas activas de descuentos_trabajador
 * @param {number} salarioPeriodo Total de percepciones del periodo (base de %)
 * @param {number} diasPeriodo
 * @param {number} smgDiario      Salario mínimo vigente (config_valores)
 * @param {number} umaDiaria      UMA vigente (config_valores) — modalidad 'vsm'
 * @returns {{ aplicados: Array, totalDescontado: number }}
 */
function calcularDescuentosPeriodo(descuentos, salarioPeriodo, diasPeriodo, smgDiario, umaDiaria) {
  const smgPeriodo    = smgDiario * diasPeriodo;
  let disponibleTotal = salarioPeriodo - smgPeriodo;      // nunca dejar el neto bajo el SMG (salvo pensión)
  let disponibleTope110 = Math.max(0, disponibleTotal * 0.30); // Art. 110 fr. I — préstamos de la empresa

  const ordenados = [...(descuentos || [])].sort((a, b) => (a.prioridad ?? 100) - (b.prioridad ?? 100));
  const aplicados = [];
  let totalDescontado = 0;

  for (const d of ordenados) {
    let monto = 0;
    if (d.modalidad === 'porcentaje') monto = salarioPeriodo * (parseFloat(d.valor) || 0) / 100;
    else if (d.modalidad === 'vsm')   monto = (parseFloat(d.valor) || 0) * umaDiaria * diasPeriodo;
    else                              monto = parseFloat(d.valor) || 0; // cuota_fija

    monto = Math.max(0, parseFloat(monto.toFixed(2)));

    // Nunca descontar más de lo que falta por pagar del crédito
    if (d.saldo_restante != null) monto = Math.min(monto, Math.max(0, parseFloat(d.saldo_restante)));

    let recortado = false;
    if (d.tipo !== 'pension_alimenticia') {
      if (d.tipo === 'prestamo_empresa' && monto > disponibleTope110) {
        monto = disponibleTope110;
        recortado = true;
      }
      if (monto > Math.max(0, disponibleTotal)) {
        monto = Math.max(0, disponibleTotal);
        recortado = true;
      }
      disponibleTotal -= monto;
      if (d.tipo === 'prestamo_empresa') disponibleTope110 = Math.max(0, disponibleTope110 - monto);
    }

    monto = parseFloat(monto.toFixed(2));
    const saldoDespues = d.saldo_restante != null ? parseFloat((parseFloat(d.saldo_restante) - monto).toFixed(2)) : null;
    totalDescontado += monto;

    aplicados.push({
      descuento: d,
      montoAplicado: monto,
      saldoDespues,
      recortado,
      liquidado: saldoDespues !== null && saldoDespues <= 0.005,
    });
  }

  return { aplicados, totalDescontado: parseFloat(totalDescontado.toFixed(2)) };
}

/**
 * Pago por día festivo oficial (Art. 74 LFT) efectivamente trabajado.
 * Art. 75 LFT: quien trabaje en un día de descanso obligatorio tiene derecho,
 * independientemente del salario que le corresponda por el descanso, a un
 * salario doble por el servicio prestado — percepción TOTAL del día: triple.
 * Esta función regresa SOLO la parte adicional (el doble); el salario
 * ordinario de ese día ya se contabiliza como día laborado normal.
 * @param {number} salarioDiario
 * @param {number} diasFestivosTrabajados
 */
function calcularPagoFestivo(salarioDiario, diasFestivosTrabajados) {
  return parseFloat(((salarioDiario || 0) * 2 * (diasFestivosTrabajados || 0)).toFixed(2));
}

// ─── PREVISIÓN SOCIAL: DESGLOSE FISCAL SBC/ISR (Arts. 27 LSS, 93 LISR) ───────
/**
 * Desglosa una prestación de previsión social para saber qué parte integra
 * al Salario Base de Cotización (SBC, IMSS) y qué parte está exenta/gravada
 * para ISR. El detalle fino de límites combinados de previsión social
 * (7 UMA anuales, Art. 93 fr. VIII LISR) debe validarlo el contador; aquí se
 * implementa la regla general de cada prestación.
 *
 * @param {Object} prestacion
 * @param {'vales_despensa'|'fondo_ahorro'|'premio_puntualidad'|'premio_asistencia'|'ayuda_transporte'|'otro'} prestacion.tipo
 * @param {number} prestacion.montoPeriodo         Monto pagado en el periodo (aportación patronal si es fondo de ahorro)
 * @param {number} [prestacion.aportacionTrabajador] Solo fondo de ahorro: aportación del trabajador en el periodo
 * @param {number} [prestacion.diasPeriodo=15]
 * @param {number} [prestacion.sbcDiario]          Solo premios: SBC diario de referencia (default: salarioDiario)
 * @param {number} salarioDiario
 * @param {number} umaDiaria
 * @returns {{ montoPeriodo:number, integraSBC:number, exentoISR:number, gravadoISR:number, fundamento:string }}
 */
function desglosarPrestacion(prestacion, salarioDiario, umaDiaria) {
  const dias  = prestacion.diasPeriodo || 15;
  const monto = parseFloat(prestacion.montoPeriodo || 0);
  let integraSBC = 0, exentoISR = 0, gravadoISR = monto, fundamento = '';

  switch (prestacion.tipo) {
    case 'vales_despensa': {
      // Art. 27 fr. VI LSS: exento de integrar al SBC hasta 40% de la UMA
      // diaria POR DÍA; el excedente sí integra. Para ISR se aproxima con
      // el mismo tope (previsión social general, Art. 93 fr. VIII LISR).
      const tope = umaDiaria * 0.40 * dias;
      integraSBC = parseFloat(Math.max(0, monto - tope).toFixed(2));
      exentoISR  = parseFloat(Math.min(monto, tope).toFixed(2));
      gravadoISR = parseFloat((monto - exentoISR).toFixed(2));
      fundamento = 'Art. 27 fr. VI LSS (tope SBC 40% UMA/día) y Art. 93 fr. VIII LISR (previsión social)';
      break;
    }
    case 'fondo_ahorro': {
      // Art. 27 fr. II LSS: NO integra al SBC si la aportación patronal es
      // IGUAL a la del trabajador, y la patronal no excede 13% del salario
      // ni 1.3 veces la UMA. Si incumple cualquier condición, integra.
      const aportPatron  = monto;
      const aportTrab    = parseFloat(prestacion.aportacionTrabajador || 0);
      const salarioBase  = parseFloat(prestacion.salarioBasePeriodo || salarioDiario * dias);
      const topePct      = salarioBase * 0.13;
      const topeUMA       = umaDiaria * 1.3 * dias;
      const iguales      = Math.abs(aportPatron - aportTrab) < 0.01;
      const dentroDeTope = aportPatron <= topePct && aportPatron <= topeUMA;
      integraSBC = (iguales && dentroDeTope) ? 0 : parseFloat(aportPatron.toFixed(2));
      exentoISR  = 0;
      gravadoISR = monto; // el fondo de ahorro no es un ingreso exento de ISR para el trabajador
      fundamento = 'Art. 27 fr. II LSS — no integra si aportaciones iguales y patronal ≤13% salario y ≤1.3 UMA';
      break;
    }
    case 'premio_puntualidad':
    case 'premio_asistencia': {
      // Art. 27 fr. VII LSS: no integra al SBC si cada premio no excede el
      // 10% del SBC; el excedente sí integra.
      const sbc  = parseFloat(prestacion.sbcDiario || salarioDiario);
      const tope = sbc * 0.10 * dias;
      integraSBC = parseFloat(Math.max(0, monto - tope).toFixed(2));
      exentoISR  = 0;
      gravadoISR = monto;
      fundamento = 'Art. 27 fr. VII LSS — exento de integrar hasta el 10% del SBC por cada premio';
      break;
    }
    default: {
      integraSBC = parseFloat(monto.toFixed(2));
      exentoISR  = 0;
      gravadoISR = monto;
      fundamento = 'Sin tratamiento especial de ley — integra en su totalidad al SBC y es gravable para ISR';
    }
  }

  return {
    montoPeriodo: monto,
    integraSBC,
    exentoISR: parseFloat(exentoISR.toFixed(2)),
    gravadoISR: parseFloat(gravadoISR.toFixed(2)),
    fundamento,
  };
}

function formatDateLong(d) {
  // Acepta Date, '2025-03-15' o '2025-03-15T00:00:00' sin duplicar el sufijo
  let date;
  if (d instanceof Date) {
    date = d;
  } else {
    const s = String(d || '');
    date = new Date(s.includes('T') ? s : s + 'T00:00:00');
  }
  if (isNaN(date.getTime())) return '—';
  return `${date.getDate()} de ${MESES[date.getMonth()]} de ${date.getFullYear()}`;
}

function formatDateShort(d) {
  let date;
  if (d instanceof Date) {
    date = d;
  } else {
    const s = String(d || '');
    date = new Date(s.includes('T') ? s : s + 'T00:00:00');
  }
  if (isNaN(date.getTime())) return '—';
  const day   = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

function antiguedadLabel(start, end) {
  const completed = fullYears(start, end);
  return `${completed} año${completed !== 1 ? 's' : ''}`;
}

// ─── CÁLCULO LIQUIDACIÓN ──────────────────────────────────────────────────────
/**
 * @param {Object}  p
 * @param {Date}    p.startDate
 * @param {Date}    p.endDate
 * @param {number}  p.salario            Monto del salario según periodo
 * @param {string}  p.periodoSalario     'mensual' | 'quincenal' | 'semanal'
 * @param {string}  p.smgZone            'general' | 'frontera'
 * @param {number}  p.diasPendientes     Días de salario sin pagar
 * @param {number}  [p.vacacionesPendientes=0]  Días de vac. de años anteriores no gozadas
 * @param {boolean} [p.aguinaldoPagado=false]   Si ya se pagó el aguinaldo del año en curso
 */
function calcLiquidacion(p) {
  const prest = p.prestaciones || prestacionesEmpresa();
  const smg   = _smgVigente(p.smgZone);
  const daily = calcSalarioDiario(p.salario || p.monthlySalary, p.periodoSalario || 'mensual');
  const completed   = fullYears(p.startDate, p.endDate);
  const frac        = fracYears(p.startDate, p.endDate);
  const entitlement = vacDaysForYear(completed + 1, prest.vacDiasExtra);
  const sdi    = calcSDI(daily, entitlement, prest.primaVacPct, prest.aguinaldoDias);
  const sdiCap = Math.min(sdi, 2 * smg);

  // Periodo de devengo de cada concepto, para que el recibo lo cite (no basta
  // con el importe: el trabajador debe poder verificar a qué lapso corresponde).
  const aniversario = new Date(p.startDate);
  aniversario.setFullYear(aniversario.getFullYear() + completed);
  const inicioAno = new Date(p.endDate.getFullYear(), 0, 1);
  const inicioAguinaldo = p.startDate > inicioAno ? p.startDate : inicioAno;
  const periodoRelacion  = `${formatDateShort(p.startDate)} – ${formatDateShort(p.endDate)}`;
  const periodoVacActual = `${formatDateShort(aniversario)} – ${formatDateShort(p.endDate)}`;
  const periodoAguinaldo = `${formatDateShort(inicioAguinaldo)} – ${formatDateShort(p.endDate)}`;

  // Trato fiscal: Art. 93 fr. XIII LISR exenta hasta 90 UMA por año de
  // servicio los pagos por indemnización, prima de antigüedad y retiro; el
  // resto de las prestaciones es ingreso ordinario sujeto a la retención
  // normal de nómina, no a ese tope.
  const EXENTO  = 'Exento hasta el tope (Art. 93 fr. XIII LISR)';
  const GRAVADO = 'Gravado — retención ordinaria de nómina';

  // Vacaciones: proporcionales del año en curso + devengadas pendientes
  const propVac = propVacDays(p.startDate, p.endDate, prest.vacDiasExtra);
  const vacPend = p.vacacionesPendientes || 0;
  const vacTotal = propVac + vacPend;
  const vac = vacTotal * sdi;
  const pv  = vac * prest.primaVacPct;

  // Aguinaldo: año calendario actual; si es diciembre y ya fue pagado → $0
  const esDiciembre = p.endDate.getMonth() === 11;
  const diasAg = p.aguinaldoPagado ? 0
    : (esDiciembre ? 365 : diasEnAnoCalendario(p.startDate, p.endDate));
  const ag = prest.aguinaldoDias * (diasAg / 365) * sdi;

  const ic            = INDEM_CONST_DAYS  * sdi;
  const veintePorAnio = DIAS_20_POR_ANIO  * frac * sdi;   // Art. 50 fracc. II LFT
  const pa            = PRIMA_ANTIG_DAYS  * frac * sdiCap;
  const sp            = (p.diasPendientes || 0) * daily;
  const total         = ic + veintePorAnio + pa + vac + pv + ag + sp;

  // Desglose de vacaciones (puede ser 1 o 2 filas)
  const itemsVac = vacPend > 0
    ? [
        { name:'Vacaciones devengadas (años anteriores)', calc:`${vacPend} días × ${fmt(sdi)}`, amount: vacPend * sdi,
          fundamento:'Art. 76 LFT', periodo:`Ejercicios anteriores al ${formatDateShort(aniversario)}`, tratoFiscal: GRAVADO },
        { name:'Vacaciones proporcionales (año en curso)', calc:`${propVac.toFixed(1)} días × ${fmt(sdi)}`, amount: propVac * sdi,
          fundamento:'Art. 76 LFT', periodo: periodoVacActual, tratoFiscal: GRAVADO },
      ]
    : [{ name:'Vacaciones proporcionales', calc:`${propVac.toFixed(1)} días × ${fmt(sdi)}`, amount: vac,
         fundamento:'Art. 76 LFT', periodo: periodoVacActual, tratoFiscal: GRAVADO }];

  const salarioIngresado = p.salario || p.monthlySalary;

  const diasLaborados = daysBetween(p.startDate, p.endDate);
  const diasEnAnio    = diasEnAnoCalendario(p.startDate, p.endDate);

  return {
    type:'liquidacion', sdi, sdiCap, smg, daily,
    completed, frac, propVac, vacPend, vacTotal, entitlement,
    diasLaborados, diasEnAnio,
    salario: salarioIngresado, periodoSalario: p.periodoSalario || 'mensual',
    ic, veintePorAnio, pa, vac, pv, ag, sp,
    items:[
      { name:'Indemnización constitucional',
        calc:`${INDEM_CONST_DAYS} días × ${fmt(sdi)} SDI`,
        amount: ic, fundamento:'Art. 50 fracc. I LFT', periodo: periodoRelacion, tratoFiscal: EXENTO },
      { name:'20 días por año',
        calc:`${frac.toFixed(2)} años × ${DIAS_20_POR_ANIO} días × ${fmt(sdi)} SDI`,
        amount: veintePorAnio, fundamento:'Art. 50 fracc. II LFT', periodo: periodoRelacion, tratoFiscal: EXENTO },
      { name:'Prima de antigüedad',
        calc:`${frac.toFixed(2)} años × ${PRIMA_ANTIG_DAYS} días × ${fmt(sdiCap)} (tope 2×SMG = ${fmt(2*smg)})`,
        amount: pa, fundamento:'Art. 162 LFT', periodo: periodoRelacion, tratoFiscal: EXENTO },
      ...itemsVac,
      { name:'Prima vacacional',
        calc:`${fmt(vac)} × ${(prest.primaVacPct*100).toFixed(0)}%`,
        amount: pv, fundamento:'Art. 80 LFT', periodo: periodoVacActual, tratoFiscal: GRAVADO },
      { name:'Aguinaldo proporcional',
        calc: p.aguinaldoPagado ? 'Ya pagado este año' : `${diasAg} días (${p.endDate.getFullYear()}) × ${fmt(sdi)} ÷ 365`,
        amount: ag, fundamento:'Art. 87 LFT', periodo: p.aguinaldoPagado ? 'Ya cubierto' : periodoAguinaldo, tratoFiscal: GRAVADO },
      { name:'Salarios pendientes de pago',
        calc:`${p.diasPendientes||0} días × ${fmt(daily)}`,
        amount: sp, fundamento:'Arts. 82 y 88 LFT', periodo:'Días previos a la baja no cubiertos en nómina', tratoFiscal: GRAVADO },
    ],
    total
  };
}

// ─── CÁLCULO FINIQUITO ────────────────────────────────────────────────────────
function calcFiniquito(p) {
  const prest = p.prestaciones || prestacionesEmpresa();
  const smg   = _smgVigente(p.smgZone);
  const daily = calcSalarioDiario(p.salario || p.monthlySalary, p.periodoSalario || 'mensual');
  const completed   = fullYears(p.startDate, p.endDate);
  const frac        = fracYears(p.startDate, p.endDate);
  const entitlement = vacDaysForYear(completed + 1, prest.vacDiasExtra);
  const sdi    = calcSDI(daily, entitlement, prest.primaVacPct, prest.aguinaldoDias);
  const sdiCap = Math.min(sdi, 2 * smg);

  // Art. 162 fr. III LFT: la antigüedad mínima de 15 años para la prima de
  // antigüedad SÓLO aplica cuando el trabajador se separa VOLUNTARIAMENTE
  // (renuncia). En despido o rescisión —justificada o no— la ley la concede
  // "independientemente de la justificación o injustificación del despido",
  // sin mínimo de años. calcFiniquito se usa tanto para renuncia como para
  // rescisión justificada (bajas.js): sin este parámetro, ambas compartían el
  // mismo mínimo de 15 años, negando la prima en una rescisión justificada
  // con menos antigüedad salvo que alguien marcara manualmente la casilla
  // "voluntaria" — un derecho tratado como si fuera opcional cuando la ley lo
  // hace obligatorio.
  if (!['renuncia', 'justificada', 'injustificada'].includes(p.motivo)) {
    throw new Error(
      'calcFiniquito requiere indicar el motivo de la baja (renuncia, justificada o ' +
      'injustificada): el Art. 162 fr. III LFT exige 15 años de antigüedad para la prima ' +
      'SÓLO en la renuncia; en despido o rescisión procede sin importar los años de servicio.'
    );
  }
  const hasAntig = p.motivo === 'renuncia' ? (completed >= 15 || p.tieneAntig) : true;

  // Periodo de devengo de cada concepto (ver nota en calcLiquidacion).
  const aniversario = new Date(p.startDate);
  aniversario.setFullYear(aniversario.getFullYear() + completed);
  const inicioAno = new Date(p.endDate.getFullYear(), 0, 1);
  const inicioAguinaldo = p.startDate > inicioAno ? p.startDate : inicioAno;
  const periodoRelacion  = `${formatDateShort(p.startDate)} – ${formatDateShort(p.endDate)}`;
  const periodoVacActual = `${formatDateShort(aniversario)} – ${formatDateShort(p.endDate)}`;
  const periodoAguinaldo = `${formatDateShort(inicioAguinaldo)} – ${formatDateShort(p.endDate)}`;
  const EXENTO  = 'Exento hasta el tope (Art. 93 fr. XIII LISR)';
  const GRAVADO = 'Gravado — retención ordinaria de nómina';

  // Vacaciones: proporcionales del año en curso + devengadas pendientes
  const propVac  = propVacDays(p.startDate, p.endDate, prest.vacDiasExtra);
  const vacPend  = p.vacacionesPendientes || 0;
  const vacTotal = propVac + vacPend;
  const vac = vacTotal * sdi;
  const pv  = vac * prest.primaVacPct;

  // Aguinaldo: año calendario actual; si es diciembre y ya fue pagado → $0
  const esDiciembre = p.endDate.getMonth() === 11;
  const diasAg = p.aguinaldoPagado ? 0
    : (esDiciembre ? 365 : diasEnAnoCalendario(p.startDate, p.endDate));
  const ag = prest.aguinaldoDias * (diasAg / 365) * sdi;

  const pa = hasAntig ? PRIMA_ANTIG_DAYS * frac * sdiCap : 0;
  const sp = (p.diasPendientes || 0) * daily;
  const total = vac + pv + ag + pa + sp;

  const itemsVacFin = vacPend > 0
    ? [
        { name:'Vacaciones de años anteriores', calc:`${vacPend} días × ${fmt(sdi)}`, amount: vacPend * sdi,
          fundamento:'Art. 76 LFT', periodo:`Ejercicios anteriores al ${formatDateShort(aniversario)}`, tratoFiscal: GRAVADO },
        { name:'Vacaciones proporcionales año en curso', calc:`${propVac.toFixed(1)} días × ${fmt(sdi)}`, amount: propVac * sdi,
          fundamento:'Art. 76 LFT', periodo: periodoVacActual, tratoFiscal: GRAVADO },
      ]
    : [{ name:'Vacaciones proporcionales', calc:`${propVac.toFixed(1)} días × ${fmt(sdi)}`, amount: vac,
         fundamento:'Art. 76 LFT', periodo: periodoVacActual, tratoFiscal: GRAVADO }];

  const diasLaborados = daysBetween(p.startDate, p.endDate);
  const diasEnAnio    = diasEnAnoCalendario(p.startDate, p.endDate);

  return {
    type:'finiquito', sdi, sdiCap, smg, daily,
    completed, frac, propVac, vacPend, vacTotal, entitlement,
    diasLaborados, diasEnAnio,
    salario: p.salario || p.monthlySalary, periodoSalario: p.periodoSalario || 'mensual',
    pa, vac, pv, ag, sp,
    items:[
      ...itemsVacFin,
      { name:'Prima vacacional',
        calc:`${fmt(vac)} × ${(prest.primaVacPct*100).toFixed(0)}%`,
        amount: pv, fundamento:'Art. 80 LFT', periodo: periodoVacActual, tratoFiscal: GRAVADO },
      { name:'Aguinaldo proporcional',
        calc: p.aguinaldoPagado ? 'Ya pagado este año' : `${diasAg} días (${p.endDate.getFullYear()}) × ${fmt(sdi)} ÷ 365`,
        amount: ag, fundamento:'Art. 87 LFT', periodo: p.aguinaldoPagado ? 'Ya cubierto' : periodoAguinaldo, tratoFiscal: GRAVADO },
      { name:'Prima de antigüedad',
        calc: hasAntig
          ? `${frac.toFixed(2)} años × ${PRIMA_ANTIG_DAYS} días × ${fmt(sdiCap)} (tope 2×SMG = ${fmt(2*smg)})`
          : 'No aplica (antigüedad menor a 15 años)',
        amount: pa, fundamento:'Art. 162 LFT', periodo: periodoRelacion, tratoFiscal: EXENTO },
      { name:'Salarios pendientes de pago',
        calc:`${p.diasPendientes||0} días × ${fmt(daily)}`,
        amount: sp, fundamento:'Arts. 82 y 88 LFT', periodo:'Días previos a la baja no cubiertos en nómina', tratoFiscal: GRAVADO },
    ],
    total
  };
}

// ─── PROPUESTA DE BAJA NEGOCIADA ──────────────────────────────────────────────
/**
 * Escenarios de una salida negociada.
 *
 * La plataforma calcula DOS cosas distintas y no las mezcla:
 *   · El PISO IRRENUNCIABLE — es literalmente calcFiniquito(): vacaciones
 *     proporcionales y devengadas, prima vacacional, aguinaldo proporcional,
 *     salarios pendientes y (si `tieneAntig`) la prima de antigüedad. No se
 *     negocia: se debe aunque el papel diga renuncia.
 *   · La GRATIFICACIÓN por terminación — los días que se ofrecen encima. Es
 *     una liberalidad del patrón, no una prestación de ley.
 *
 * calcLiquidacion() se calcula también, pero solo como REFERENCIA: es el costo
 * si el asunto termina en juicio (90 días + 20 días/año + prima de antigüedad).
 * Sirve para que el usuario vea contra qué está negociando.
 *
 * @param {Object}   p                       Mismos parámetros que calcFiniquito()
 * @param {'sdi'|'diario'}   [p.baseDias='sdi']  Base de los días negociados
 * @param {'suma'|'incluye'} [p.modo='suma']     'suma': la gratificación se agrega
 *        al finiquito. 'incluye': los N días son el paquete TOTAL y la
 *        gratificación es la diferencia contra el finiquito.
 * @param {number[]} [p.diasEscenarios]       Default 15/30/45/60/75/90
 * @param {number}   [p.diasManual]           Días capturados a mano (escenario extra)
 * @param {number}   [p.montoManual]          Gratificación capturada como importe
 * @returns {{finiquito:Object, liquidacionRef:Object, base:number,
 *            baseDias:string, modo:string, escenarios:Array}}
 */
function calcPropuestaBaja(p) {
  const baseDias = p.baseDias === 'diario' ? 'diario' : 'sdi';
  const modo     = p.modo === 'incluye' ? 'incluye' : 'suma';

  const finiquito      = calcFiniquito(p);
  const liquidacionRef = calcLiquidacion(p);
  const base = baseDias === 'diario' ? finiquito.daily : finiquito.sdi;

  const fiscalDe = (grat) => (typeof calcFiscalBaja === 'function'
    ? calcFiscalBaja(finiquito, { gratificacion: grat })
    : null);

  const armar = (dias, etiqueta, gratFija) => {
    // Con monto capturado a mano no hay días: la gratificación es el importe.
    const montoDias = gratFija != null ? gratFija : (dias || 0) * base;

    let gratificacion, total, insuficiente = false;
    if (modo === 'incluye' && gratFija == null) {
      total         = montoDias;
      gratificacion = Math.max(0, total - finiquito.total);
      insuficiente  = total < finiquito.total;
    } else {
      gratificacion = montoDias;
      total         = finiquito.total + gratificacion;
    }

    const fiscal = fiscalDe(gratificacion);
    return {
      dias: gratFija != null ? null : (dias || 0),
      etiqueta,
      base, baseDias, modo,
      montoDias:     parseFloat(montoDias.toFixed(2)),
      finiquito:     parseFloat(finiquito.total.toFixed(2)),
      gratificacion: parseFloat(gratificacion.toFixed(2)),
      total:         parseFloat(total.toFixed(2)),
      // En modo 'incluye' con días insuficientes el paquete NO cubre el mínimo
      // de ley: la UI debe marcarlo, no dejarlo pasar como una opción válida.
      insuficiente,
      faltante: insuficiente ? parseFloat((finiquito.total - total).toFixed(2)) : 0,
      isr:  fiscal ? fiscal.isr  : null,
      neto: fiscal ? fiscal.neto : null,
      fiscal,
      pctVsLiquidacion: liquidacionRef.total > 0
        ? parseFloat((total / liquidacionRef.total).toFixed(4)) : null,
    };
  };

  const dias = Array.isArray(p.diasEscenarios) && p.diasEscenarios.length
    ? p.diasEscenarios : [15, 30, 45, 60, 75, 90];

  const escenarios = [
    armar(0, 'Solo lo irrenunciable'),
    ...dias.map(d => armar(d, `${d} días`)),
  ];

  // Los días capturados a mano solo se agregan si no repiten un escenario fijo.
  if (p.diasManual > 0 && !dias.includes(p.diasManual)) {
    escenarios.push(armar(p.diasManual, `${p.diasManual} días (captura manual)`));
  }
  if (p.montoManual > 0) escenarios.push(armar(null, 'Monto capturado a mano', parseFloat(p.montoManual)));

  return { finiquito, liquidacionRef, base, baseDias, modo, escenarios };
}

// ─── SBC — SALARIO BASE DE COTIZACIÓN (Art. 27-28 LSS) ───────────────────────
/**
 * Factor de integración MÍNIMO legal por año de antigüedad (Art. 27 LSS):
 * (365 + días de aguinaldo + días de vacaciones × % de prima vacacional) / 365
 * Usa prestacionesEmpresa() para que, si la empresa otorga más que el mínimo
 * de ley, el factor lo refleje (Math.max ya blinda los mínimos).
 *
 * Tabla de factores por año de antigüedad con los MÍNIMOS de ley (aguinaldo
 * 15 días, prima vacacional 25%, tabla de vacaciones LFT reformada 2023):
 *   Año 1:      12 días vac. → (365+15+12×0.25)/365   = 1.0493
 *   Año 2:      14 días vac. → (365+15+14×0.25)/365   = 1.0507
 *   Año 3:      16 días vac. → (365+15+16×0.25)/365   = 1.0521
 *   Año 4:      18 días vac. → (365+15+18×0.25)/365   = 1.0534
 *   Años 5-9:   20 días vac. → (365+15+20×0.25)/365   = 1.0548
 *   Años 10-14: 22 días vac. → (365+15+22×0.25)/365   = 1.0562
 *   Años 15-19: 24 días vac. → (365+15+24×0.25)/365   = 1.0575
 *   Años 20-24: 26 días vac. → (365+15+26×0.25)/365   = 1.0589
 *   Años 25-29: 28 días vac. → (365+15+28×0.25)/365   = 1.0603
 *   Años 30-34: 30 días vac. → (365+15+30×0.25)/365   = 1.0616
 *   Años 35-39: 32 días vac. → (365+15+32×0.25)/365   = 1.0630
 *   (continúa +2 días de vacaciones cada 5 años — ver vacDaysForYear())
 *
 * @param {Object} trabajador  Debe traer fecha_ingreso (o fecha_ingreso_reconocida)
 * @param {Object} [prest]     prestacionesEmpresa() ya resuelto; si no se pasa, se calcula
 */
function calcularFactorIntegracion(trabajador, prest) {
  const p = prest || prestacionesEmpresa();
  const ingresoStr = trabajador.fecha_ingreso_reconocida || trabajador.fecha_ingreso;
  const ingreso = new Date(String(ingresoStr) + 'T00:00:00');
  const hoy = new Date();
  const antiguedadAnios = fullYears(ingreso, hoy) + 1; // año de antigüedad en curso
  const vacDias = vacDaysForYear(antiguedadAnios, p.vacDiasExtra);
  const factor = (365 + p.aguinaldoDias + vacDias * p.primaVacPct) / 365;
  return parseFloat(factor.toFixed(4));
}

/**
 * Salario Base de Cotización (Art. 27 LSS): salario diario × factor de
 * integración + elementos variables/prestaciones que integran (Art. 27
 * fracciones II, VI, VII LSS — ver desglosarPrestacion()). Tope: 25 UMA
 * (Art. 28 LSS). Piso: salario mínimo de la zona del trabajador — para
 * efectos de cotización IMSS el piso real es 1 UMA cuando el salario base
 * es menor (ver Art. 28 LSS / Reglas RCFI); aquí se usa el salario mínimo
 * como piso operativo y se documenta la excepción.
 *
 * @param {Object} trabajador
 * @param {number} [montoVariableIntegrable=0]  Suma de "integraSBC" de
 *        desglosarPrestacion() para el periodo, ya prorrateada a diario
 * @param {Object} [prest]
 */
function calcularSBC(trabajador, montoVariableIntegrable = 0, prest) {
  const p = prest || prestacionesEmpresa();
  const daily  = calcSalarioDiario(trabajador.salario_mensual, trabajador.periodo_salario || 'mensual');
  const factor = calcularFactorIntegracion(trabajador, p);
  const uma    = _umaVigente();
  const piso   = _smgVigente(trabajador.smg_zone);
  const tope   = 25 * uma; // Art. 28 LSS

  let sbc = daily * factor + (parseFloat(montoVariableIntegrable) || 0);
  sbc = Math.min(Math.max(sbc, piso), tope);
  return parseFloat(sbc.toFixed(2));
}

// ─── NÚMERO A PALABRAS ────────────────────────────────────────────────────────
function numToWords(num) {
  const n = Math.floor(num);
  if (n === 0) return 'CERO';
  const u = ['','UN','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE',
             'DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISEIS','DIECISIETE','DIECIOCHO','DIECINUEVE'];
  const d = ['','','VEINTE','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'];
  const c = ['','CIEN','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS',
             'SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];
  function tw(n) {
    if (n < 20) return u[n];
    if (n < 100) return d[Math.floor(n/10)] + (n%10 ? ' Y ' + u[n%10] : '');
    if (n === 100) return 'CIEN';
    if (n < 1000) return c[Math.floor(n/100)] + (n%100 ? ' ' + tw(n%100) : '');
    if (n < 1000000) {
      const th = Math.floor(n/1000);
      return (th === 1 ? 'MIL' : tw(th) + ' MIL') + (n%1000 ? ' ' + tw(n%1000) : '');
    }
    return n.toLocaleString();
  }
  return tw(n);
}
