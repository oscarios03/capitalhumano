/**
 * Capital Humano MX — Capa de Datos (Supabase)
 * Todas las operaciones CRUD con aislamiento por empresa
 */

// Acceso seguro al cliente (siempre lee window.supabase para evitar conflictos)
const _q = () => window.supabase;

// ─── TRABAJADORES ─────────────────────────────────────────────────────────────
const db = {

  // Trabajadores
  async getTrabajadores(filtros = {}) {
    let q = _q().from('trabajadores').select('*, sucursales(id,nombre)').order('nombre');
    if (filtros.estado)     q = q.eq('estado', filtros.estado);
    if (filtros.search)     q = q.ilike('nombre', `%${filtros.search}%`);
    if (filtros.sucursalId !== undefined) {
      if (filtros.sucursalId === null) q = q.is('sucursal_id', null);
      else q = q.eq('sucursal_id', filtros.sucursalId);
    }
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async getTrabajador(id) {
    const { data, error } = await _q().from('trabajadores').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async createTrabajador(datos, empresaId) {
    const { data, error } = await _q().from('trabajadores')
      .insert({ ...datos, empresa_id: empresaId }).select().single();
    if (error) throw error;
    return data;
  },

  async updateTrabajador(id, datos) {
    const { error } = await _q().from('trabajadores').update(datos).eq('id', id);
    if (error) throw error;
  },

  async darDeBaja(id, tipoBaja, fechaBaja) {
    const { error } = await _q().from('trabajadores')
      .update({ estado:'baja', tipo_baja: tipoBaja, fecha_baja: fechaBaja }).eq('id', id);
    if (error) throw error;
  },

  // Asistencia
  async getAsistencia(trabajadorId, mes) {
    const inicio = `${mes}-01`;
    const fin = new Date(mes + '-01');
    fin.setMonth(fin.getMonth() + 1);
    fin.setDate(fin.getDate() - 1);
    const finStr = fin.toISOString().split('T')[0];

    const { data, error } = await _q().from('asistencia')
      .select('*').eq('trabajador_id', trabajadorId)
      .gte('fecha', inicio).lte('fecha', finStr).order('fecha');
    if (error) throw error;
    return data || [];
  },

  async getAsistenciaTodos(mes) {
    const inicio = `${mes}-01`;
    const fin = new Date(mes + '-01');
    fin.setMonth(fin.getMonth() + 1);
    fin.setDate(fin.getDate() - 1);
    const { data, error } = await _q().from('asistencia')
      .select('*, trabajadores(nombre, puesto)')
      .gte('fecha', inicio).lte('fecha', fin.toISOString().split('T')[0])
      .order('fecha', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async createAsistencia(datos, empresaId) {
    const { data, error } = await _q().from('asistencia')
      .insert({ ...datos, empresa_id: empresaId }).select().single();
    if (error) throw error;
    return data;
  },

  async deleteAsistencia(id) {
    const { error } = await _q().from('asistencia').delete().eq('id', id);
    if (error) throw error;
  },

  /** Retorna faltas injustificadas en los últimos 30 días por trabajador */
  async getFaltasRecientes30Dias(trabajadorId) {
    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 30);
    const { data, error } = await _q().from('asistencia')
      .select('*')
      .eq('trabajador_id', trabajadorId)
      .eq('tipo', 'falta')
      .eq('justificada', false)
      .gte('fecha', hace30.toISOString().split('T')[0]);
    if (error) throw error;
    return data || [];
  },

  // Actas
  async getActas(filtros = {}) {
    let q = _q().from('actas').select('*, trabajadores(nombre, puesto)').order('creado_en', { ascending:false });
    if (filtros.trabajadorId) q = q.eq('trabajador_id', filtros.trabajadorId);
    if (filtros.tipo)         q = q.eq('tipo', filtros.tipo);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async getActa(id) {
    const { data, error } = await _q().from('actas').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async createActa(datos, empresaId) {
    const { data, error } = await _q().from('actas')
      .insert({ ...datos, empresa_id: empresaId }).select().single();
    if (error) throw error;
    return data;
  },

  // Contratos
  async getContratos(trabajadorId) {
    const { data, error } = await _q().from('contratos')
      .select('*').eq('trabajador_id', trabajadorId).order('fecha_generacion', { ascending:false });
    if (error) throw error;
    return data || [];
  },

  async createContrato(datos, empresaId) {
    const { data, error } = await _q().from('contratos')
      .insert({ ...datos, empresa_id: empresaId }).select().single();
    if (error) throw error;
    return data;
  },

  // Bajas
  async createBaja(datos, empresaId) {
    const { data, error } = await _q().from('bajas')
      .insert({ ...datos, empresa_id: empresaId }).select().single();
    if (error) throw error;
    return data;
  },

  async getBajas(filtros = {}) {
    let q = _q().from('bajas').select('*, trabajadores(nombre, puesto)').order('creado_en', { ascending:false });
    if (filtros.trabajadorId) q = q.eq('trabajador_id', filtros.trabajadorId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  // ─── Sucursales ───────────────────────────────────────────────────────────
  async getSucursales(soloActivas = false) {
    let q = _q().from('sucursales').select('*').order('tipo').order('nombre');
    if (soloActivas) q = q.eq('activa', true);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async getSucursal(id) {
    if (!id) return null;
    const { data, error } = await _q().from('sucursales').select('*').eq('id', id).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  },

  async getMatriz() {
    const { data, error } = await _q().from('sucursales').select('*').eq('tipo','matriz').maybeSingle();
    if (error) throw error;
    return data || null;
  },

  async createSucursal(datos, empresaId) {
    const { data, error } = await _q().from('sucursales')
      .insert({ ...datos, empresa_id: empresaId }).select().single();
    if (error) throw error;
    return data;
  },

  async updateSucursal(id, datos) {
    const { error } = await _q().from('sucursales').update(datos).eq('id', id);
    if (error) throw error;
  },

  async toggleSucursal(id, activa) {
    const { error } = await _q().from('sucursales').update({ activa }).eq('id', id);
    if (error) throw error;
  },

  async countTrabajadoresBySucursal(sucursalId) {
    const q = sucursalId
      ? _q().from('trabajadores').select('id', { count:'exact', head:true }).eq('sucursal_id', sucursalId).eq('estado','activo')
      : _q().from('trabajadores').select('id', { count:'exact', head:true }).is('sucursal_id', null).eq('estado','activo');
    const { count } = await q;
    return count || 0;
  },

  async ensureMatriz(empresa) {
    const { data } = await _q().rpc('get_or_create_matriz');
    return data;
  },

  // ─── Dashboard KPIs ───────────────────────────────────────────────────────
  async getKPIs() {
    const empresaId = CTX?.empresa?.id;
    if (!empresaId) return { empleadosActivos: 0, faltasMes: 0, actasMes: 0, bajasMes: 0 };

    const now = new Date();
    const mesStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const inicio = `${mesStr}-01`;

    const [tActivos, fMes, aMes, bMes] = await Promise.all([
      _q().from('trabajadores').select('id', { count:'exact', head:true }).eq('empresa_id', empresaId).eq('estado','activo'),
      _q().from('asistencia').select('id', { count:'exact', head:true }).eq('empresa_id', empresaId).gte('fecha', inicio),
      _q().from('actas').select('id', { count:'exact', head:true }).eq('empresa_id', empresaId).gte('creado_en', inicio),
      _q().from('trabajadores').select('id', { count:'exact', head:true }).eq('empresa_id', empresaId).eq('estado','baja').gte('fecha_baja', inicio),
    ]);

    return {
      empleadosActivos: tActivos.count || 0,
      faltasMes:        fMes.count || 0,
      actasMes:         aMes.count || 0,
      bajasMes:         bMes.count || 0,
    };
  },

  async getIncidenciasRecientes() {
    const empresaId = CTX?.empresa?.id;
    const q = empresaId
      ? _q().from('asistencia').select('*, trabajadores(nombre)').eq('empresa_id', empresaId)
      : _q().from('asistencia').select('*, trabajadores(nombre)');
    const { data } = await q.order('creado_en', { ascending:false }).limit(10);
    return data || [];
  },

  async getNominaPendiente(empresaId) {
    const hoy = new Date();
    const limite = new Date(hoy); limite.setDate(hoy.getDate() + 3);
    const limiteStr = limite.toISOString().split('T')[0];
    const { data } = await _q().from('periodos_nomina')
      .select('nombre, fecha_fin, tipo, cerrado')
      .eq('empresa_id', empresaId)
      .eq('cerrado', false)
      .lte('fecha_fin', limiteStr)
      .order('fecha_fin')
      .limit(1)
      .maybeSingle();
    return data || null;
  },

  // ─── Historial de salarios ────────────────────────────────────────────────
  async getHistorialSalarios(trabajadorId) {
    const { data, error } = await _q().from('historial_salarios')
      .select('*').eq('trabajador_id', trabajadorId)
      .order('fecha_cambio', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async registrarCambioSalario(trabajadorId, salarioAnterior, salarioNuevo, motivo, empresaId) {
    const { error } = await _q().from('historial_salarios').insert({
      trabajador_id: trabajadorId, empresa_id: empresaId,
      salario_anterior: salarioAnterior, salario_nuevo: salarioNuevo,
      motivo: motivo || null,
      fecha_cambio: new Date().toISOString().split('T')[0],
    });
    if (error) throw error;
  },
};
