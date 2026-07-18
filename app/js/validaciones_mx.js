/**
 * Capital Humano MX — Validación de identificadores mexicanos
 *
 * RFC, CURP y NSS traen un dígito verificador calculado a partir del resto de
 * la clave. Validarlo detecta errores de captura (dedazos, transposiciones)
 * que el simple formato deja pasar — y esos errores se convierten después en
 * rechazos del IDSE, del SUA o del timbrado.
 *
 * Todas las validaciones son ADVERTENCIAS, no bloqueos: hay expedientes
 * heredados con datos imperfectos y el patrón necesita poder guardarlos.
 *
 * Sin dependencias de DOM: funciones puras.
 */

// ─── RFC ─────────────────────────────────────────────────────────────────────
// Algoritmo del SAT (Anexo 3 RMF), módulo 11:
//   1. Se toma la clave SIN el dígito verificador (12 caracteres; si es persona
//      moral son 11 y se antepone un espacio).
//   2. Cada carácter vale según la tabla de abajo; se multiplica por su peso
//      (13 para el primero, bajando hasta 2) y se suman los productos.
//   3. residuo = suma mod 11 →  0 → '0' · 10 → 'A' · resto → 11 − residuo
// Verificado con GODE561231GR8: suma 1026, 1026 mod 11 = 3, 11 − 3 = 8 ✓

const _RFC_VALORES = (() => {
  const t = {};
  '0123456789'.split('').forEach((c, i) => { t[c] = i; });          // 0–9
  'ABCDEFGHIJKLMN'.split('').forEach((c, i) => { t[c] = 10 + i; }); // 10–23
  t['&'] = 24;
  'OPQRSTUVWXYZ'.split('').forEach((c, i) => { t[c] = 25 + i; });   // 25–36
  t[' '] = 37;
  t['Ñ'] = 38;
  return t;
})();

// RFCs genéricos del SAT: no cumplen el dígito verificador y son válidos igual
const RFC_GENERICOS = ['XAXX010101000', 'XEXX010101000'];

const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

/**
 * @param {string} rfc
 * @returns {{ valido: boolean, motivo: string|null }}
 */
function validarRFC(rfc) {
  const v = String(rfc || '').toUpperCase().replace(/[\s-]/g, '');
  if (!v) return { valido: true, motivo: null };  // vacío = no se valida
  if (RFC_GENERICOS.includes(v)) return { valido: true, motivo: null };

  if (v.length !== 12 && v.length !== 13) {
    return { valido: false, motivo: 'El RFC debe tener 12 caracteres (persona moral) o 13 (persona física).' };
  }
  if (!RFC_REGEX.test(v)) {
    return { valido: false, motivo: 'El RFC no tiene el formato correcto (letras, fecha AAMMDD y homoclave).' };
  }
  // La fecha embebida (posiciones 4-9 en física, 3-8 en moral) debe existir
  const fecha = v.length === 13 ? v.slice(4, 10) : v.slice(3, 9);
  if (!_fechaAAMMDDValida(fecha)) {
    return { valido: false, motivo: 'La fecha dentro del RFC no es una fecha real.' };
  }

  const base = (v.length === 12 ? ' ' : '') + v.slice(0, -1); // 12 caracteres
  let suma = 0;
  for (let i = 0; i < 12; i++) {
    const val = _RFC_VALORES[base[i]];
    if (val === undefined) return { valido: false, motivo: `El RFC tiene un carácter no permitido: "${base[i]}".` };
    suma += val * (13 - i);
  }
  const residuo = suma % 11;
  const esperado = residuo === 0 ? '0' : residuo === 10 ? 'A' : String(11 - residuo);

  return v.slice(-1) === esperado
    ? { valido: true, motivo: null }
    : { valido: false, motivo: `El dígito verificador del RFC no coincide (debería terminar en "${esperado}"). Revisa que no haya un dedazo.` };
}

// ─── CURP ────────────────────────────────────────────────────────────────────
// Algoritmo de RENAPO, módulo 10:
//   suma = Σ valor(caracter_i) × (18 − i), i de 0 a 16
//   dígito = (10 − (suma mod 10)) mod 10
// Verificado con HEGG560427MVZRRL04: suma 2246 → (10 − 6) mod 10 = 4 ✓

const _CURP_DICC = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';
const CURP_REGEX = /^[A-Z][AEIOUX][A-Z]{2}\d{6}[HMX][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9]\d$/;

const CURP_ESTADOS = {
  AS:'Aguascalientes', BC:'Baja California', BS:'Baja California Sur', CC:'Campeche',
  CL:'Coahuila', CM:'Colima', CS:'Chiapas', CH:'Chihuahua', DF:'Ciudad de México',
  DG:'Durango', GT:'Guanajuato', GR:'Guerrero', HG:'Hidalgo', JC:'Jalisco',
  MC:'Estado de México', MN:'Michoacán', MS:'Morelos', NT:'Nayarit', NL:'Nuevo León',
  OC:'Oaxaca', PL:'Puebla', QT:'Querétaro', QR:'Quintana Roo', SP:'San Luis Potosí',
  SL:'Sinaloa', SR:'Sonora', TC:'Tabasco', TS:'Tamaulipas', TL:'Tlaxcala',
  VZ:'Veracruz', YN:'Yucatán', ZS:'Zacatecas', NE:'Nacido en el extranjero',
};

function validarCURP(curp) {
  const v = String(curp || '').toUpperCase().replace(/[\s-]/g, '');
  if (!v) return { valido: true, motivo: null };

  if (v.length !== 18) return { valido: false, motivo: 'La CURP debe tener exactamente 18 caracteres.' };
  if (!CURP_REGEX.test(v)) return { valido: false, motivo: 'La CURP no tiene el formato correcto.' };
  if (!_fechaAAMMDDValida(v.slice(4, 10))) {
    return { valido: false, motivo: 'La fecha de nacimiento dentro de la CURP no es una fecha real.' };
  }
  if (!CURP_ESTADOS[v.slice(11, 13)]) {
    return { valido: false, motivo: `La CURP trae un código de estado desconocido: "${v.slice(11, 13)}".` };
  }

  let suma = 0;
  for (let i = 0; i < 17; i++) {
    const idx = _CURP_DICC.indexOf(v[i]);
    if (idx < 0) return { valido: false, motivo: `La CURP tiene un carácter no permitido: "${v[i]}".` };
    suma += idx * (18 - i);
  }
  const esperado = String((10 - (suma % 10)) % 10);

  return v.slice(-1) === esperado
    ? { valido: true, motivo: null }
    : { valido: false, motivo: `El dígito verificador de la CURP no coincide (debería terminar en "${esperado}"). Revisa que no haya un dedazo.` };
}

/**
 * Extrae de una CURP válida la fecha de nacimiento, el sexo y el estado.
 * El siglo se deduce del carácter 17 (homoclave): dígito = siglo XX,
 * letra = siglo XXI — así lo asigna RENAPO desde el año 2000.
 * @returns {{ fechaNacimiento: string, sexo: string, estado: string }|null}
 */
function datosDesdeCURP(curp) {
  const v = String(curp || '').toUpperCase().replace(/[\s-]/g, '');
  if (v.length !== 18 || !CURP_REGEX.test(v)) return null;

  const aa = v.slice(4, 6), mm = v.slice(6, 8), dd = v.slice(8, 10);
  if (!_fechaAAMMDDValida(aa + mm + dd)) return null;

  const siglo = /\d/.test(v[16]) ? '19' : '20';
  const sexo  = { H: 'Masculino', M: 'Femenino', X: 'No binario' }[v[10]] || null;

  return {
    fechaNacimiento: `${siglo}${aa}-${mm}-${dd}`,
    sexo,
    estado: CURP_ESTADOS[v.slice(11, 13)] || null,
  };
}

// ─── NSS (IMSS) ──────────────────────────────────────────────────────────────
// 11 dígitos con dígito verificador por algoritmo de Luhn (módulo 10).
// Verificado con 92988084494: suma ponderada 66 + 4 = 70 → 70 mod 10 = 0 ✓

function validarNSS(nss) {
  const v = String(nss || '').replace(/[\s-]/g, '');
  if (!v) return { valido: true, motivo: null };

  if (!/^\d{11}$/.test(v)) return { valido: false, motivo: 'El NSS debe tener exactamente 11 dígitos.' };

  // Luhn: se duplican las posiciones pares contadas desde la derecha
  let suma = 0;
  for (let i = 0; i < 11; i++) {
    let d = parseInt(v[10 - i], 10);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    suma += d;
  }
  return suma % 10 === 0
    ? { valido: true, motivo: null }
    : { valido: false, motivo: 'El dígito verificador del NSS no coincide. Revisa el número contra la credencial del IMSS.' };
}

/** Calcula el dígito verificador que le correspondería a 10 dígitos de NSS. */
function digitoNSS(diezDigitos) {
  const v = String(diezDigitos || '').replace(/\D/g, '');
  if (v.length !== 10) return null;
  let suma = 0;
  for (let i = 0; i < 10; i++) {
    let d = parseInt(v[9 - i], 10);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    suma += d;
  }
  return String((10 - (suma % 10)) % 10);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** ¿AAMMDD corresponde a un día real? (no valida el siglo) */
function _fechaAAMMDDValida(s) {
  if (!/^\d{6}$/.test(s)) return false;
  const mm = parseInt(s.slice(2, 4), 10);
  const dd = parseInt(s.slice(4, 6), 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  const diasMes = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // feb: 29 por bisiestos
  return dd <= diasMes[mm - 1];
}

// ─── Completitud del expediente ──────────────────────────────────────────────
// Qué debe traer un expediente laboral bien integrado. Importa por dos razones:
// los datos fiscales evitan rechazos del IMSS/SAT, y los documentos son la
// prueba con la que se defiende el patrón — Art. 784 LFT: la carga de la
// prueba le toca a él, así que lo que no esté en el expediente, no existe.

const EXPEDIENTE_REQUISITOS = [
  // Datos de la ficha
  { id:'nombre',       label:'Nombre completo',            grupo:'datos', peso:2, check: t => !!(t.nombre || '').trim() },
  { id:'rfc',          label:'RFC',                        grupo:'datos', peso:2, check: t => !!t.rfc && validarRFC(t.rfc).valido },
  { id:'curp',         label:'CURP',                       grupo:'datos', peso:2, check: t => !!t.curp && validarCURP(t.curp).valido },
  { id:'nss',          label:'NSS',                        grupo:'datos', peso:2, check: t => !!t.nss && validarNSS(t.nss).valido },
  { id:'fecha_nac',    label:'Fecha de nacimiento',        grupo:'datos', peso:1, check: t => !!t.fecha_nacimiento },
  { id:'domicilio',    label:'Domicilio',                  grupo:'datos', peso:1, check: t => !!(t.domicilio || '').trim() },
  { id:'salario',      label:'Salario y periodo de pago',  grupo:'datos', peso:2, check: t => parseFloat(t.salario_mensual) > 0 },
  { id:'ingreso',      label:'Fecha de ingreso',           grupo:'datos', peso:2, check: t => !!t.fecha_ingreso },
  { id:'emergencia',   label:'Contacto de emergencia',     grupo:'datos', peso:1, check: t => !!(t.contacto_emergencia_nombre || '').trim() },
  { id:'beneficiario', label:'Beneficiario (Art. 25 fr. X LFT)', grupo:'datos', peso:1, check: t => !!(t.beneficiario1_nombre || '').trim() },
  // Documentos del expediente digital.
  // Pesan MÁS que los datos a propósito: en un juicio el documento firmado es
  // la prueba; lo capturado en el sistema es tu dicho, y el Art. 784 LFT no te
  // lo concede. Un expediente con todos los datos pero sin un solo documento
  // no debe verse como "casi listo" — por eso el contrato firmado vale por
  // tres campos juntos.
  { id:'doc_contrato', label:'Contrato firmado',           grupo:'docs', peso:6, tipos:['contrato'] },
  { id:'doc_ine',      label:'Identificación oficial',     grupo:'docs', peso:3, tipos:['identificacion'] },
  { id:'doc_curp',     label:'CURP impresa',               grupo:'docs', peso:2, tipos:['curp_doc'] },
  { id:'doc_nss',      label:'Constancia de NSS',          grupo:'docs', peso:2, tipos:['nss_doc'] },
  { id:'doc_domicilio',label:'Comprobante de domicilio',   grupo:'docs', peso:2, tipos:['comprobante_domicilio'] },
  { id:'doc_acta',     label:'Acta de nacimiento',         grupo:'docs', peso:2, tipos:['acta_nacimiento'] },
  { id:'doc_csf',      label:'Constancia de situación fiscal', grupo:'docs', peso:2, tipos:['csf'] },
];

/**
 * Evalúa qué tan completo está el expediente de un trabajador.
 * @param {Object} trab  Fila de trabajadores
 * @param {Array}  docs  Filas de documentos_trabajador (usa `tipo_documento`)
 * @returns {{ pct:number, nivel:string, faltantes:Array, cumplidos:Array }}
 */
function completitudExpediente(trab, docs = []) {
  const tiposSubidos = new Set((docs || []).map(d => d.tipo_documento));
  const cumplidos = [], faltantes = [];
  let logrado = 0, total = 0;

  for (const r of EXPEDIENTE_REQUISITOS) {
    total += r.peso;
    const ok = r.tipos
      ? r.tipos.some(t => tiposSubidos.has(t))
      : (() => { try { return !!r.check(trab || {}); } catch { return false; } })();
    if (ok) { logrado += r.peso; cumplidos.push(r); } else { faltantes.push(r); }
  }

  const pct = total > 0 ? Math.round((logrado / total) * 100) : 0;
  const nivel = pct >= 90 ? 'completo' : pct >= 60 ? 'parcial' : 'incompleto';
  return { pct, nivel, faltantes, cumplidos };
}

/** Edad cumplida a partir de una fecha ISO de nacimiento. */
function edadDesdeFecha(fechaISO) {
  if (!fechaISO) return null;
  const n = new Date(fechaISO + 'T00:00:00');
  if (isNaN(n.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - n.getFullYear();
  const m = hoy.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) edad--;
  return edad >= 0 && edad < 120 ? edad : null;
}
