/**
 * Capital Humano MX — Vigencias fiscales y salariales
 *
 * Fuente única de los valores que caducan cada año (salario mínimo, UMA,
 * subsidio al empleo). Sustituye a los antiguos respaldos sin fecha de
 * calculo.js (SMG_GENERAL / SMG_FRONTERA / UMA_DIARIA_FALLBACK), que
 * calculaban en silencio con cifras de 2025.
 *
 * Regla de diseño: un respaldo SIN año es peligroso; uno indexado POR año es
 * seguro. Si el año en curso no está registrado, estas funciones LANZAN
 * ErrorVigencia en vez de devolver una cifra vieja. Prima de antigüedad
 * (tope de 2 SMG, art. 162 fr. II LFT), exención de ISR (art. 93 fr. XIII
 * LISR) y cuotas del IMSS dependen de estos valores: un dato caduco produce
 * un documento firmado con cifras equivocadas.
 *
 * Orden de precedencia: config_valores (Supabase) → tabla local VIGENCIAS.
 *
 * Depende de: festivos.js (cargarConfigValores, getConfigValorVigencia)
 */

// ─── ERROR TIPADO ─────────────────────────────────────────────────────────────
class ErrorVigencia extends Error {
  constructor(message, clave, anio) {
    super(message);
    this.name  = 'ErrorVigencia';
    this.clave = clave;
    this.anio  = anio;
  }
}

// ─── TABLA LOCAL POR AÑO ──────────────────────────────────────────────────────
// Respaldo indexado por año: nunca se aplica a un año distinto del suyo.
// Al abrir un ejercicio nuevo se registra aquí o, preferentemente, en
// config_valores desde el SQL Editor de Supabase.
const VIGENCIAS = {
  2025: { salario_minimo_general: 278.80, salario_minimo_frontera: 419.88, uma_diaria: 113.14 },
  2026: { salario_minimo_general: 315.04, salario_minimo_frontera: 440.87, uma_diaria: 117.31 },
};

/**
 * Fecha a partir de la cual DEBE existir un valor nuevo para el año dado.
 * CONASAMI publica el salario mínimo con vigencia del 1 de enero; INEGI la
 * UMA con vigencia del 1 de febrero. Distinguirlas evita falsas alarmas en
 * enero, cuando la UMA vigente todavía es la del año anterior.
 */
function _vigenteDesdeEsperada(clave, anio) {
  const mesDia = (clave === 'uma_diaria') ? '-02-01' : '-01-01';
  return `${anio}${mesDia}`;
}

const _ETIQUETAS = {
  salario_minimo_general:  'el salario mínimo general',
  salario_minimo_frontera: 'el salario mínimo de la Zona Libre de la Frontera Norte',
  uma_diaria:              'la UMA diaria',
  subsidio_pct_uma:        'el porcentaje de subsidio al empleo',
  subsidio_limite_mensual: 'el límite mensual del subsidio al empleo',
};

function _comoActualizar(clave, anio) {
  const que = _ETIQUETAS[clave] || `el valor "${clave}"`;
  return `Falta configurar ${que} vigente para ${anio}. ` +
         `Regístralo en Configuración → Valores vigentes antes de generar ` +
         `documentos o cálculos que dependan de él.`;
}

// ─── LECTURA CON VALIDACIÓN ───────────────────────────────────────────────────
/**
 * Devuelve el valor vigente de una clave para el año indicado.
 * Lanza ErrorVigencia si no está configurado o si el registrado caducó.
 *
 * @param {string} clave  p. ej. 'uma_diaria'
 * @param {number} [anio] por omisión, el año en curso
 */
function valorVigente(clave, anio = new Date().getFullYear()) {
  const esperada = _vigenteDesdeEsperada(clave, anio);
  const hoy      = new Date().toISOString().slice(0, 10);

  // 1. config_valores — fuente de verdad
  const reg = (typeof getConfigValorVigencia === 'function')
    ? getConfigValorVigencia(clave)
    : null;

  if (reg === undefined) {
    // El caché todavía no se ha cargado: es un estado transitorio, no un
    // dato faltante. Distinguirlo evita bloquear la app en conexiones lentas.
    throw new ErrorVigencia(
      'Aún no se han cargado los valores vigentes (salario mínimo y UMA). ' +
      'Espera unos segundos y vuelve a intentarlo; si persiste, recarga la página.',
      clave, anio
    );
  }

  if (reg && Number.isFinite(reg.valor)) {
    // Sólo se considera caduco una vez llegada la fecha en que debía
    // publicarse el valor nuevo.
    const yaDebioActualizarse = hoy >= esperada && reg.vigencia_desde < esperada;
    if (!yaDebioActualizarse) return reg.valor;
    throw new ErrorVigencia(
      _comoActualizar(clave, anio) +
      ` El último valor registrado (${reg.valor}) tiene vigencia desde ${reg.vigencia_desde}.`,
      clave, anio
    );
  }

  // 2. Tabla local indexada por año
  const local = VIGENCIAS[anio]?.[clave];
  if (Number.isFinite(local)) return local;

  throw new ErrorVigencia(_comoActualizar(clave, anio), clave, anio);
}

/** Salario mínimo diario vigente. @param {string} zona 'general' | 'frontera' */
function _smgVigente(zona, anio = new Date().getFullYear()) {
  return valorVigente(
    zona === 'frontera' ? 'salario_minimo_frontera' : 'salario_minimo_general',
    anio
  );
}

/** UMA diaria vigente (art. 26 apartado B constitucional; INEGI). */
function _umaVigente(anio = new Date().getFullYear()) {
  return valorVigente('uma_diaria', anio);
}

/**
 * Comprueba por adelantado que estén configuradas todas las vigencias que
 * necesita un documento con cálculos legales, para fallar antes de abrir el
 * PDF y no a la mitad. Devuelve el primer ErrorVigencia encontrado, o null.
 */
function revisarVigencias(claves = ['salario_minimo_general', 'uma_diaria'],
                          anio   = new Date().getFullYear()) {
  for (const clave of claves) {
    try { valorVigente(clave, anio); }
    catch (e) { if (e instanceof ErrorVigencia) return e; throw e; }
  }
  return null;
}

/**
 * ¿Las vigencias del año en curso están al día? Para el aviso del dashboard
 * en enero y febrero, sin interrumpir al usuario.
 */
function vigenciasDesactualizadas(anio = new Date().getFullYear()) {
  return ['salario_minimo_general', 'salario_minimo_frontera', 'uma_diaria']
    .map(clave => {
      try { valorVigente(clave, anio); return null; }
      catch (e) { return e instanceof ErrorVigencia ? e : null; }
    })
    .filter(Boolean);
}
