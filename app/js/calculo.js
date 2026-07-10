/**
 * Capital Humano MX — Motor de Cálculo LFT 2026
 * Sin dependencias de DOM — funciones puras reutilizables
 */

// ─── CONSTANTES LFT 2026 ──────────────────────────────────────────────────────
// Valores de respaldo: se usan solo si config_valores (migración 15) no está
// disponible todavía. La fuente de verdad vive en la tabla config_valores;
// consultar con getConfigValor('salario_minimo_general', SMG_GENERAL), etc.
const SMG_GENERAL      = 315.04;
const SMG_FRONTERA     = 419.88;
const UMA_DIARIA_FALLBACK = 113.14;
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

/** Salario mínimo vigente (config_valores, migración 15) con respaldo local. */
function _smgVigente(zona) {
  const clave = zona === 'frontera' ? 'salario_minimo_frontera' : 'salario_minimo_general';
  const fallback = zona === 'frontera' ? SMG_FRONTERA : SMG_GENERAL;
  return typeof getConfigValor === 'function' ? getConfigValor(clave, fallback) : fallback;
}

/** UMA diaria vigente (config_valores, migración 15) con respaldo local. */
function _umaVigente() {
  return typeof getConfigValor === 'function' ? getConfigValor('uma_diaria', UMA_DIARIA_FALLBACK) : UMA_DIARIA_FALLBACK;
}

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
        { name:'Vacaciones devengadas (años anteriores)', calc:`${vacPend} días × ${fmt(sdi)}`, amount: vacPend * sdi },
        { name:'Vacaciones proporcionales (año en curso)', calc:`${propVac.toFixed(1)} días × ${fmt(sdi)}`, amount: propVac * sdi },
      ]
    : [{ name:'Vacaciones proporcionales', calc:`${propVac.toFixed(1)} días × ${fmt(sdi)}`, amount: vac }];

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
      { name:'Indemnización constitucional (Art. 50 fr. I LFT)',
        calc:`${INDEM_CONST_DAYS} días × ${fmt(sdi)} SDI`,
        amount: ic },
      { name:'20 días por año (Art. 50 fr. II LFT)',
        calc:`${frac.toFixed(2)} años × ${DIAS_20_POR_ANIO} días × ${fmt(sdi)} SDI`,
        amount: veintePorAnio },
      { name:'Prima de antigüedad (Art. 162 LFT)',
        calc:`${frac.toFixed(2)} años × ${PRIMA_ANTIG_DAYS} días × ${fmt(sdiCap)} (tope 2×SMG = ${fmt(2*smg)})`,
        amount: pa },
      ...itemsVac,
      { name:'Prima vacacional (Art. 80 LFT)',
        calc:`${fmt(vac)} × ${(prest.primaVacPct*100).toFixed(0)}%`,
        amount: pv },
      { name:'Aguinaldo proporcional (Art. 87 LFT)',
        calc: p.aguinaldoPagado ? 'Ya pagado este año' : `${diasAg} días (${p.endDate.getFullYear()}) × ${fmt(sdi)} ÷ 365`,
        amount: ag },
      { name:'Salarios pendientes de pago',
        calc:`${p.diasPendientes||0} días × ${fmt(daily)}`,
        amount: sp },
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
  const hasAntig = completed >= 15 || p.tieneAntig;

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

  const itemsVac = vacPend > 0
    ? [
        { name:'Vacaciones devengadas (años anteriores)', calc:`${vacPend} días × ${fmt(sdi)}`, amount: vacPend * sdi },
        { name:'Vacaciones proporcionales (año en curso)', calc:`${propVac.toFixed(1)} días × ${fmt(sdi)}`, amount: propVac * sdi },
      ]
    : [{ name:'Vacaciones proporcionales', calc:`${propVac.toFixed(1)} días × ${fmt(sdi)}`, amount: vac }];

  const itemsVacFin = vacPend > 0
    ? [
        { name:'Vacaciones de años anteriores (Art. 76 LFT)',
          calc:`${vacPend} días × ${fmt(sdi)}`,
          amount: vacPend * sdi },
        { name:'Vacaciones proporcionales año en curso (Art. 76 LFT)',
          calc:`${propVac.toFixed(1)} días × ${fmt(sdi)}`,
          amount: propVac * sdi },
      ]
    : [{ name:'Vacaciones proporcionales (Art. 76 LFT)',
         calc:`${propVac.toFixed(1)} días × ${fmt(sdi)}`,
         amount: vac }];

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
      { name:'Prima vacacional (Art. 80 LFT)',
        calc:`${fmt(vac)} × ${(prest.primaVacPct*100).toFixed(0)}%`,
        amount: pv },
      { name:'Aguinaldo proporcional (Art. 87 LFT)',
        calc: p.aguinaldoPagado ? 'Ya pagado este año' : `${diasAg} días (${p.endDate.getFullYear()}) × ${fmt(sdi)} ÷ 365`,
        amount: ag },
      { name:'Prima de antigüedad (Art. 162 LFT)',
        calc: hasAntig
          ? `${frac.toFixed(2)} años × ${PRIMA_ANTIG_DAYS} días × ${fmt(sdiCap)} (tope 2×SMG = ${fmt(2*smg)})`
          : 'No aplica (antigüedad menor a 15 años)',
        amount: pa },
      { name:'Salarios pendientes de pago',
        calc:`${p.diasPendientes||0} días × ${fmt(daily)}`,
        amount: sp },
    ],
    total
  };
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
  const uma    = typeof _umaVigente === 'function' ? _umaVigente() : UMA_DIARIA_FALLBACK;
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
