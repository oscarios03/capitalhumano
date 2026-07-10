/**
 * Capital Humano MX — Días festivos oficiales (Art. 74 LFT) y
 * configuración editable de UMA / salarios mínimos.
 * Depende de: config.js (constantes de respaldo), db.js (CTX.empresa)
 */

// ── Caché en memoria ──────────────────────────────────────────────────────
let _festivosCache      = null;  // Map fecha(YYYY-MM-DD) -> registro dias_festivos
let _configValoresCache = null;  // { clave: valor }

// ═══════════════════════════════════════════════════════════════════════════
//  CONFIG_VALORES (UMA / salarios mínimos — nunca hardcodear)
// ═══════════════════════════════════════════════════════════════════════════
async function cargarConfigValores(forzar = false) {
  if (_configValoresCache && !forzar) return _configValoresCache;

  const { data, error } = await window.supabase
    .from('config_valores')
    .select('clave, valor, vigencia_desde')
    .lte('vigencia_desde', new Date().toISOString().slice(0, 10))
    .order('vigencia_desde', { ascending: false });

  if (error) {
    console.warn('config_valores no disponible (¿falta la migración 15?):', error.message);
    _configValoresCache = {};
    return _configValoresCache;
  }

  // Toma el valor de vigencia más reciente para cada clave
  const map = {};
  for (const row of (data || [])) {
    if (!(row.clave in map)) map[row.clave] = parseFloat(row.valor);
  }
  _configValoresCache = map;
  return map;
}

/**
 * Obtiene un valor de config_valores ya cacheado (llamar a
 * cargarConfigValores() antes). Si no está disponible, usa el respaldo.
 */
function getConfigValor(clave, fallback) {
  const v = _configValoresCache ? _configValoresCache[clave] : undefined;
  return Number.isFinite(v) ? v : fallback;
}

// ═══════════════════════════════════════════════════════════════════════════
//  DÍAS FESTIVOS
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Carga y cachea en memoria los festivos oficiales (empresa_id NULL) y los
 * propios de la empresa actual. Se indexan por fecha ISO (YYYY-MM-DD).
 */
async function cargarFestivos(forzar = false) {
  if (_festivosCache && !forzar) return _festivosCache;

  const empresaId = (typeof CTX !== 'undefined' && CTX?.empresa?.id) || null;

  let query = window.supabase
    .from('dias_festivos')
    .select('id, empresa_id, fecha, descripcion, oficial')
    .order('fecha', { ascending: true });

  query = empresaId
    ? query.or(`empresa_id.is.null,empresa_id.eq.${empresaId}`)
    : query.is('empresa_id', null);

  const { data, error } = await query;

  if (error) {
    console.warn('dias_festivos no disponible (¿falta la migración 15?):', error.message);
    _festivosCache = new Map();
    return _festivosCache;
  }

  const map = new Map();
  for (const f of (data || [])) map.set(f.fecha, f); // el último (empresa) gana sobre el oficial si coinciden
  _festivosCache = map;
  return map;
}

/**
 * ¿La fecha ISO (YYYY-MM-DD) es un día festivo (oficial o propio de la
 * empresa)? Regresa el registro de dias_festivos o null.
 * Requiere haber llamado antes a cargarFestivos().
 */
function esFestivo(fechaISO) {
  if (!_festivosCache) return null;
  const clave = String(fechaISO || '').slice(0, 10);
  return _festivosCache.get(clave) || null;
}

/** ¿La fecha ISO cae en domingo? */
function esDomingo(fechaISO) {
  const d = new Date(String(fechaISO || '').slice(0, 10) + 'T00:00:00');
  return !isNaN(d.getTime()) && d.getDay() === 0;
}

/** Festivos del año en curso (u otro), para pintar en la UI de administración. */
function festivosDelAnio(anio = new Date().getFullYear()) {
  if (!_festivosCache) return [];
  return [..._festivosCache.values()]
    .filter(f => f.fecha.startsWith(String(anio)))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Agrega un festivo propio de la empresa actual (nunca oficial). */
async function agregarFestivoEmpresa(fecha, descripcion) {
  const empresaId = CTX?.empresa?.id;
  if (!empresaId) throw new Error('No hay empresa en contexto.');
  const { error } = await window.supabase
    .from('dias_festivos')
    .insert({ empresa_id: empresaId, fecha, descripcion, oficial: false });
  if (error) throw error;
  await cargarFestivos(true);
}

/** Elimina un festivo propio de la empresa (las políticas RLS ya impiden borrar los oficiales). */
async function eliminarFestivoEmpresa(id) {
  const { error } = await window.supabase.from('dias_festivos').delete().eq('id', id);
  if (error) throw error;
  await cargarFestivos(true);
}
