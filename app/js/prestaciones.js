/**
 * Capital Humano MX — Prestaciones y previsión social
 * (vales de despensa, fondo de ahorro, premios, ayuda de transporte)
 * con desglose fiscal SBC/ISR. Depende de: calculo.js (desglosarPrestacion,
 * getConfigValor/_umaVigente de festivos.js), db.js pattern.
 */

const TIPOS_PRESTACION = {
  vales_despensa:      { icono: '🛒', label: 'Vales de despensa' },
  fondo_ahorro:         { icono: '🐷', label: 'Fondo de ahorro' },
  premio_puntualidad:  { icono: '⏱️', label: 'Premio de puntualidad' },
  premio_asistencia:   { icono: '📅', label: 'Premio de asistencia' },
  ayuda_transporte:    { icono: '🚌', label: 'Ayuda de transporte' },
  otro:                { icono: '📎', label: 'Otra prestación' },
};

/** Indicador visual + fundamento según el desglose fiscal. */
function _indicadorSBC(desglose) {
  if (!desglose.montoPeriodo) return { texto: '—', color: 'var(--text-muted)' };
  if (desglose.integraSBC <= 0) return { texto: '✅ No integra SBC', color: 'var(--green-ok)' };
  if (desglose.integraSBC >= desglose.montoPeriodo) return { texto: '🔴 Integra al SBC', color: 'var(--red-warn)' };
  return { texto: '⚠️ Integra parcialmente', color: '#f39c12' };
}

async function _listarPrestaciones(trabajadorId) {
  const { data, error } = await window.supabase
    .from('prestaciones_trabajador')
    .select('*')
    .eq('trabajador_id', trabajadorId)
    .order('activo', { ascending: false })
    .order('created_at', { ascending: false });
  return { data: data || [], error };
}

async function renderTabPrestaciones(trabajadorId) {
  const el = eid('tab-prestaciones');
  if (!el) return;
  el.innerHTML = `<div style="color:var(--text-muted);font-size:.85rem;padding:12px 0;">Cargando prestaciones…</div>`;

  const trab = await db.getTrabajador(trabajadorId);
  const { data: extra, error } = await _listarPrestaciones(trabajadorId);
  if (error) {
    el.innerHTML = `<div class="alert alert-danger">Error al cargar prestaciones: ${escapeHtml(error.message)}
      ${/relation|schema cache/i.test(error.message || '') ? '<br>Aplica la migración 18_migration_prestaciones_fiscal.sql.' : ''}</div>`;
    return;
  }

  const uma   = typeof _umaVigente === 'function' ? _umaVigente() : 113.14;
  const daily = calcSalarioDiario(trab.salario_mensual, trab.periodo_salario || 'mensual');
  const dias  = trab.periodo_salario === 'semanal' ? 7 : trab.periodo_salario === 'quincenal' ? 15 : 30;

  const filas = [];

  // Vales de despensa (almacenamiento actual: trabajadores.vales_despensa)
  if (parseFloat(trab.vales_despensa || 0) > 0) {
    const d = desglosarPrestacion({ tipo:'vales_despensa', montoPeriodo:parseFloat(trab.vales_despensa), diasPeriodo:dias }, daily, uma);
    filas.push({ icono:'🛒', label:'Vales de despensa', monto:d.montoPeriodo, ind:_indicadorSBC(d), fund:d.fundamento, editable:false });
  }
  // Fondo de ahorro (almacenamiento actual: trabajadores.fondo_ahorro_activo/pct — aportación patronal = obrera, siempre simétrico en este sistema)
  if (trab.fondo_ahorro_activo) {
    const pct = parseFloat(trab.fondo_ahorro_pct || 0.13);
    const aport = parseFloat((daily * dias * pct).toFixed(2));
    const d = desglosarPrestacion({ tipo:'fondo_ahorro', montoPeriodo:aport, aportacionTrabajador:aport, salarioBasePeriodo:daily*dias, diasPeriodo:dias }, daily, uma);
    filas.push({ icono:'🐷', label:'Fondo de ahorro', monto:d.montoPeriodo, ind:_indicadorSBC(d), fund:d.fundamento, editable:false });
  }
  // Prestaciones adicionales (tabla prestaciones_trabajador)
  for (const p of extra) {
    const monto = p.modalidad === 'porcentaje_salario' ? parseFloat((daily*dias*(parseFloat(p.valor)||0)/100).toFixed(2)) : parseFloat(p.valor || 0);
    const d = desglosarPrestacion({ tipo:p.tipo, montoPeriodo:monto, diasPeriodo:dias }, daily, uma);
    filas.push({ icono:TIPOS_PRESTACION[p.tipo]?.icono||'📎', label:TIPOS_PRESTACION[p.tipo]?.label||p.tipo, monto:d.montoPeriodo, ind:_indicadorSBC(d), fund:d.fundamento, editable:true, id:p.id, activo:p.activo });
  }

  const tabla = filas.length === 0
    ? `<div class="empty-state" style="padding:20px;"><div class="empty-state-icon">🎁</div><div class="empty-state-title">Sin prestaciones registradas</div></div>`
    : `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Prestación</th><th>Monto/periodo</th><th>Integración SBC</th><th></th></tr></thead>
        <tbody>${filas.map(f => `
          <tr${f.activo === false ? ' style="opacity:.5;"' : ''}>
            <td>${f.icono} ${f.label}</td>
            <td>${fmt(f.monto)}</td>
            <td><span style="color:${f.ind.color};font-weight:700;font-size:.82rem;" title="${f.fund}">${f.ind.texto}</span></td>
            <td>${f.editable ? `<button class="btn-danger btn-sm" onclick="_suspenderPrestacion('${f.id}','${trabajadorId}')">🗑 Quitar</button>` : `<span style="font-size:.72rem;color:var(--text-muted);">Editar en Datos/Mi Empresa</span>`}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <strong>Prestaciones y previsión social</strong>
      <button class="btn-primary btn-sm" onclick="_mostrarFormPrestacion('${trabajadorId}')">+ Agregar premio/ayuda</button>
    </div>
    ${tabla}
    <div id="form-prestacion" style="display:none;margin-top:18px;padding:16px;border:1.5px solid var(--border);border-radius:var(--radius-md);background:rgba(255,255,255,.02);"></div>
  `;
}

function _mostrarFormPrestacion(trabajadorId) {
  const form = eid('form-prestacion');
  if (!form) return;
  form.style.display = '';
  form.innerHTML = `
    <div style="font-weight:700;font-size:.9rem;margin-bottom:14px;">🎁 Nueva prestación</div>
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label" for="prs-tipo">Tipo <span class="req">*</span></label>
        <select id="prs-tipo" class="form-select" required aria-required="true">
          <option value="premio_puntualidad">⏱️ Premio de puntualidad</option>
          <option value="premio_asistencia">📅 Premio de asistencia</option>
          <option value="ayuda_transporte">🚌 Ayuda de transporte</option>
          <option value="otro">📎 Otra</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="prs-modalidad">Modalidad <span class="req">*</span></label>
        <select id="prs-modalidad" class="form-select" required aria-required="true">
          <option value="monto_fijo_periodo">Monto fijo por periodo</option>
          <option value="porcentaje_salario">% del salario del periodo</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="prs-valor">Valor <span class="req">*</span></label>
        <input id="prs-valor" type="number" class="form-input" min="0" step="0.01" placeholder="Monto o %" required aria-required="true" />
      </div>
      <div class="form-group span-2 helper-text">
        Los premios de puntualidad/asistencia no integran al SBC hasta el 10% del SBC de cada uno (Art. 27 fr. VII LSS); el excedente integra.
      </div>
    </div>
    <div id="prs-error" class="error-msg" role="alert" style="display:none;margin-bottom:8px;"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px;">
      <button class="btn-secondary btn-sm" onclick="_cerrarFormPrestacion()">Cancelar</button>
      <button id="prs-btn-guardar" class="btn-primary btn-sm" onclick="_guardarPrestacion('${trabajadorId}')">💾 Guardar</button>
    </div>
  `;
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _cerrarFormPrestacion() {
  const form = eid('form-prestacion');
  if (form) form.style.display = 'none';
}

async function _guardarPrestacion(trabajadorId) {
  const errEl = eid('prs-error');
  errEl.style.display = 'none';

  const tipo      = eid('prs-tipo')?.value;
  const modalidad = eid('prs-modalidad')?.value;
  const valor     = parseFloat(eid('prs-valor')?.value);

  if (!valor && valor !== 0) {
    errEl.textContent = 'Captura el valor de la prestación.';
    errEl.style.display = '';
    return;
  }

  const btn = eid('prs-btn-guardar');
  if (btn) { btn.textContent = 'Guardando…'; btn.disabled = true; }

  const { error } = await window.supabase.from('prestaciones_trabajador').insert({
    empresa_id: CTX.empresa.id, trabajador_id: trabajadorId, tipo, modalidad, valor,
  });

  if (btn) { btn.textContent = '💾 Guardar'; btn.disabled = false; }

  if (error) {
    errEl.textContent = 'Error al guardar: ' + error.message;
    errEl.style.display = '';
    return;
  }
  await renderTabPrestaciones(trabajadorId);
}

async function _suspenderPrestacion(id, trabajadorId) {
  if (!confirm('¿Quitar esta prestación? Dejará de pagarse en las próximas nóminas.')) return;
  const { error } = await window.supabase.from('prestaciones_trabajador').update({ activo: false }).eq('id', id);
  if (error) { alert('Error: ' + error.message); return; }
  await renderTabPrestaciones(trabajadorId);
}

/**
 * Costo total mensual estimado de prestaciones de la plantilla, para el
 * resumen en "Mi Empresa". Aproxima vales/fondo de ahorro (config plana)
 * + prestaciones_trabajador activas, normalizado a 30 días.
 */
async function costoMensualPrestaciones(empresaId) {
  const [{ data: trabs }, { data: extra }] = await Promise.all([
    window.supabase.from('trabajadores').select('salario_mensual, periodo_salario, vales_despensa, fondo_ahorro_activo, fondo_ahorro_pct').eq('empresa_id', empresaId).eq('estado', 'activo'),
    window.supabase.from('prestaciones_trabajador').select('tipo, modalidad, valor, trabajador_id').eq('empresa_id', empresaId).eq('activo', true),
  ]);

  let total = 0;
  for (const t of (trabs || [])) {
    total += parseFloat(t.vales_despensa || 0) * (30 / (t.periodo_salario === 'semanal' ? 7 : t.periodo_salario === 'quincenal' ? 15 : 30));
    if (t.fondo_ahorro_activo) {
      const daily = calcSalarioDiario(t.salario_mensual, t.periodo_salario || 'mensual');
      total += daily * 30 * parseFloat(t.fondo_ahorro_pct || 0.13);
    }
  }
  for (const p of (extra || [])) {
    if (p.modalidad === 'monto_fijo_periodo') total += parseFloat(p.valor || 0) * 2; // aprox. quincenal → mensual
  }
  return parseFloat(total.toFixed(2));
}
