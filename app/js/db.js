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

  // `expectedUpdatedAt` es opcional: si se pasa, el UPDATE sólo aplica si
  // nadie más modificó el registro desde que se leyó (optimistic locking).
  // Si el registro cambió mientras tanto, no se sobreescribe en silencio —
  // se lanza un error claro para que el usuario recargue y reintente.
  async updateTrabajador(id, datos, expectedUpdatedAt) {
    let q = _q().from('trabajadores').update(datos).eq('id', id);
    if (expectedUpdatedAt) q = q.eq('updated_at', expectedUpdatedAt);
    const { data, error } = await q.select('id');
    if (error) throw error;
    if (expectedUpdatedAt && (!data || data.length === 0)) {
      throw new Error('Alguien más editó a este trabajador mientras tanto. Recarga la página e intenta de nuevo.');
    }
  },

  async darDeBaja(id, tipoBaja, fechaBaja, expectedUpdatedAt) {
    let q = _q().from('trabajadores')
      .update({ estado:'baja', tipo_baja: tipoBaja, fecha_baja: fechaBaja }).eq('id', id);
    if (expectedUpdatedAt) q = q.eq('updated_at', expectedUpdatedAt);
    const { data, error } = await q.select('id');
    if (error) throw error;
    if (expectedUpdatedAt && (!data || data.length === 0)) {
      throw new Error('Alguien más editó a este trabajador mientras tanto (puede que ya se haya dado de baja). Recarga la página e intenta de nuevo.');
    }
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
    let q = _q().from('actas').select('*, trabajadores(nombre, puesto, telefono)').order('creado_en', { ascending:false });
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

  // ─── Puestos (plantillas de puesto) ───────────────────────────────────────
  async getPuestos(soloActivos = true) {
    let q = _q().from('puestos').select('*').order('nombre');
    if (soloActivos) q = q.eq('activo', true);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async getPuesto(id) {
    if (!id) return null;
    const { data, error } = await _q().from('puestos').select('*').eq('id', id).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  },

  async createPuesto(datos, empresaId) {
    const { data, error } = await _q().from('puestos')
      .insert({ ...datos, empresa_id: empresaId }).select().single();
    if (error) throw error;
    return data;
  },

  async updatePuesto(id, datos) {
    const { error } = await _q().from('puestos').update(datos).eq('id', id);
    if (error) throw error;
  },

  async togglePuesto(id, activo) {
    const { error } = await _q().from('puestos').update({ activo }).eq('id', id);
    if (error) throw error;
  },

  async countTrabajadoresByPuesto(puestoId) {
    const { count } = await _q().from('trabajadores')
      .select('id', { count:'exact', head:true })
      .eq('puesto_id', puestoId).eq('estado','activo');
    return count || 0;
  },

  // ─── Dashboard KPIs ───────────────────────────────────────────────────────
  async getKPIs() {
    const empresaId = CTX?.empresa?.id;
    if (!empresaId) return { empleadosActivos: 0, faltasMes: 0, actasMes: 0, bajasMes: 0, nominaMes: null };

    const now = new Date();
    const mesStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const inicio = `${mesStr}-01`;
    const fin    = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const [tActivos, fMes, aMes, bMes, nomina] = await Promise.all([
      _q().from('trabajadores').select('id', { count:'exact', head:true }).eq('empresa_id', empresaId).eq('estado','activo'),
      // Solo faltas: antes contaba TODOS los registros de asistencia del mes
      // (asistencias, retardos, vacaciones…), así que el KPI "Faltas este mes"
      // mostraba el total de incidencias capturadas, no las faltas.
      _q().from('asistencia').select('id', { count:'exact', head:true }).eq('empresa_id', empresaId).eq('tipo','falta').gte('fecha', inicio),
      _q().from('actas').select('id', { count:'exact', head:true }).eq('empresa_id', empresaId).gte('creado_en', inicio),
      _q().from('trabajadores').select('id', { count:'exact', head:true }).eq('empresa_id', empresaId).eq('estado','baja').gte('fecha_baja', inicio),
      this.getCostoNominaMes(empresaId, inicio, fin).catch(() => null),
    ]);

    return {
      empleadosActivos: tActivos.count || 0,
      faltasMes:        fMes.count || 0,
      actasMes:         aMes.count || 0,
      bajasMes:         bMes.count || 0,
      nominaMes:        nomina,
    };
  },

  /**
   * Costo de la nómina del mes: neto pagado + lo que la empresa paga encima
   * (cuotas patronales IMSS, INFONAVIT 5% e ISN — migración 32).
   * Devuelve null si no hay períodos del mes.
   */
  async getCostoNominaMes(empresaId, inicio, fin) {
    const { data: periodos } = await _q().from('periodos_nomina')
      .select('id').eq('empresa_id', empresaId)
      .gte('fecha_fin', inicio).lte('fecha_fin', fin);
    if (!periodos?.length) return null;

    const { data: recibos, error } = await _q().from('recibos_nomina')
      .select('total_percepciones, neto_pagar, imss_patronal, infonavit_patronal, isn')
      .in('periodo_id', periodos.map(p => p.id));
    // Tolerancia: sin la migración 32 no existen las columnas patronales
    if (error) {
      if (!/imss_patronal|infonavit_patronal|isn/i.test(error.message || '')) throw error;
      console.warn('Columnas patronales no disponibles — aplica la migración 32_migration_fiscal_patronal.sql');
      const { data: base } = await _q().from('recibos_nomina')
        .select('total_percepciones, neto_pagar').in('periodo_id', periodos.map(p => p.id));
      const bruto = (base || []).reduce((s, r) => s + parseFloat(r.total_percepciones || 0), 0);
      return { neto: (base || []).reduce((s, r) => s + parseFloat(r.neto_pagar || 0), 0),
               bruto, patronal: 0, total: bruto, recibos: (base || []).length, parcial: true };
    }

    const num = (r, k) => parseFloat(r[k] || 0);
    const bruto    = (recibos || []).reduce((s, r) => s + num(r, 'total_percepciones'), 0);
    const neto     = (recibos || []).reduce((s, r) => s + num(r, 'neto_pagar'), 0);
    const patronal = (recibos || []).reduce((s, r) =>
      s + num(r, 'imss_patronal') + num(r, 'infonavit_patronal') + num(r, 'isn'), 0);

    return {
      neto:     parseFloat(neto.toFixed(2)),
      bruto:    parseFloat(bruto.toFixed(2)),
      patronal: parseFloat(patronal.toFixed(2)),
      total:    parseFloat((bruto + patronal).toFixed(2)),
      recibos:  (recibos || []).length,
      parcial:  false,
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
