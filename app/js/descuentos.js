/**
 * Capital Humano MX — Préstamos y descuentos (INFONAVIT, FONACOT,
 * pensión alimenticia, préstamo de empresa, caja de ahorro)
 * Depende de: db.js pattern (window.supabase), calculo.js (aplicado en nomina.js)
 */

const TIPOS_DESCUENTO = {
  infonavit:           { icono: '🏠', label: 'INFONAVIT' },
  fonacot:             { icono: '🛍️', label: 'FONACOT' },
  pension_alimenticia: { icono: '⚖️', label: 'Pensión alimenticia' },
  prestamo_empresa:    { icono: '💵', label: 'Préstamo de la empresa' },
  caja_ahorro:         { icono: '🐷', label: 'Caja de ahorro' },
  otro:                { icono: '📎', label: 'Otro' },
};

const MODALIDADES_DESCUENTO = {
  porcentaje: '% del salario del periodo',
  cuota_fija: 'Cuota fija por periodo',
  vsm:        'Veces UMA diaria (INFONAVIT)',
};

async function _listarDescuentos(trabajadorId) {
  const { data, error } = await window.supabase
    .from('descuentos_trabajador')
    .select('*')
    .eq('trabajador_id', trabajadorId)
    .order('activo', { ascending: false })
    .order('created_at', { ascending: false });
  return { data: data || [], error };
}

async function _listarHistorialDescuento(descuentoId) {
  const { data, error } = await window.supabase
    .from('descuentos_aplicados')
    .select('*')
    .eq('descuento_id', descuentoId)
    .order('fecha_aplicacion', { ascending: false });
  return { data: data || [], error };
}

async function renderTabDescuentos(trabajadorId) {
  const el = eid('tab-descuentos');
  if (!el) return;
  el.innerHTML = `<div style="color:var(--text-muted);font-size:.85rem;padding:12px 0;">Cargando descuentos…</div>`;

  const { data: descuentos, error } = await _listarDescuentos(trabajadorId);
  if (error) {
    el.innerHTML = `<div class="alert alert-danger">Error al cargar descuentos: ${error.message}
      ${/relation|schema cache/i.test(error.message || '') ? '<br>Aplica la migración 17_migration_prestamos_descuentos.sql.' : ''}</div>`;
    return;
  }

  const activos   = descuentos.filter(d => d.activo);
  const inactivos = descuentos.filter(d => !d.activo);

  const filaDescuento = d => {
    const cfg = TIPOS_DESCUENTO[d.tipo] || TIPOS_DESCUENTO.otro;
    const valorLabel = d.modalidad === 'porcentaje' ? `${d.valor}%`
      : d.modalidad === 'vsm' ? `${d.valor} UMA/día`
      : fmt(d.valor);
    return `
      <tr>
        <td>${cfg.icono} ${cfg.label}${d.tipo === 'pension_alimenticia' ? ' <span style="font-size:.68rem;color:var(--gold-primary);" title="Prioridad absoluta, sin tope de ley (orden judicial, Art. 110 fr. V LFT)">⚖️ prioritario</span>' : ''}</td>
        <td style="font-size:.82rem;color:var(--text-muted);">${d.numero_credito || '—'}</td>
        <td style="font-size:.82rem;">${MODALIDADES_DESCUENTO[d.modalidad] || d.modalidad}<br><strong>${valorLabel}</strong></td>
        <td style="font-size:.82rem;">${d.saldo_restante != null ? fmt(d.saldo_restante) : '<span style="color:var(--text-muted);">Sin fin</span>'}</td>
        <td>
          <div class="actions">
            <button class="btn-secondary btn-sm" onclick="_verHistorialDescuento('${d.id}','${trabajadorId}')">🕘 Historial</button>
            ${d.activo ? `
              <button class="btn-secondary btn-sm" onclick="_liquidarDescuento('${d.id}','${trabajadorId}')">✅ Liquidar</button>
              <button class="btn-danger btn-sm" onclick="_suspenderDescuento('${d.id}','${trabajadorId}')">⏸ Suspender</button>
            ` : `<span style="font-size:.75rem;color:var(--text-muted);">Inactivo</span>`}
          </div>
        </td>
      </tr>`;
  };

  const tabla = (items, vacioTxt) => items.length === 0
    ? `<div class="empty-state" style="padding:20px;"><div class="empty-state-icon">💳</div><div class="empty-state-title">${vacioTxt}</div></div>`
    : `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Tipo</th><th>Núm. crédito/expediente</th><th>Modalidad</th><th>Saldo restante</th><th>Acciones</th></tr></thead>
        <tbody>${items.map(filaDescuento).join('')}</tbody>
      </table></div>`;

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <strong>Descuentos y préstamos <span style="font-size:.8rem;font-weight:400;color:var(--text-muted);">(${activos.length} activo${activos.length !== 1 ? 's' : ''})</span></strong>
      <button class="btn-primary btn-sm" onclick="_mostrarFormDescuento('${trabajadorId}')">+ Nuevo descuento</button>
    </div>
    ${tabla(activos, 'Sin descuentos activos')}
    ${inactivos.length ? `
      <div style="margin-top:20px;">
        <strong style="font-size:.85rem;color:var(--text-muted);">Descuentos liquidados/suspendidos</strong>
        ${tabla(inactivos, '')}
      </div>` : ''}
    <div id="form-descuento" style="display:none;margin-top:18px;padding:16px;border:1.5px solid var(--border);border-radius:var(--radius-md);background:rgba(255,255,255,.02);"></div>
    <div id="historial-descuento" style="display:none;margin-top:18px;"></div>
  `;
}

function _mostrarFormDescuento(trabajadorId) {
  const form = eid('form-descuento');
  if (!form) return;
  form.style.display = '';
  form.innerHTML = `
    <div style="font-weight:700;font-size:.9rem;margin-bottom:14px;">💳 Nuevo descuento / préstamo</div>
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Tipo <span class="req">*</span></label>
        <select id="dsc-tipo" class="form-select" onchange="_ayudaTipoDescuento()">
          ${Object.entries(TIPOS_DESCUENTO).map(([v, t]) => `<option value="${v}">${t.icono} ${t.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Número de crédito / expediente</label>
        <input id="dsc-numcredito" type="text" class="form-input" placeholder="Ej. 123456789 (INFONAVIT/FONACOT) o expediente judicial" />
      </div>
      <div class="form-group">
        <label class="form-label">Modalidad <span class="req">*</span></label>
        <select id="dsc-modalidad" class="form-select">
          <option value="cuota_fija">Cuota fija por periodo ($)</option>
          <option value="porcentaje">% del salario del periodo</option>
          <option value="vsm">Veces UMA diaria (típico INFONAVIT)</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Valor <span class="req">*</span></label>
        <input id="dsc-valor" type="number" class="form-input" min="0" step="0.01" placeholder="Monto, % o factor" />
      </div>
      <div class="form-group">
        <label class="form-label">Monto total del crédito <span style="font-weight:400;color:var(--text-muted);">(opcional — vacío = sin fin, ej. pensión)</span></label>
        <input id="dsc-total" type="number" class="form-input" min="0" step="0.01" placeholder="Ej. 150000" />
      </div>
      <div class="form-group span-2">
        <label class="form-label">Descripción</label>
        <input id="dsc-desc" type="text" class="form-input" placeholder="Notas internas" />
      </div>
      <div id="dsc-ayuda" class="form-group span-2 helper-text"></div>
    </div>
    <div id="dsc-error" class="error-msg" style="display:none;margin-bottom:8px;"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px;">
      <button class="btn-secondary btn-sm" onclick="_cerrarFormDescuento()">Cancelar</button>
      <button id="dsc-btn-guardar" class="btn-primary btn-sm" onclick="_guardarDescuento('${trabajadorId}')">💾 Guardar</button>
    </div>
  `;
  _ayudaTipoDescuento();
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _ayudaTipoDescuento() {
  const tipo = eid('dsc-tipo')?.value;
  const ayuda = eid('dsc-ayuda');
  if (!ayuda) return;
  const textos = {
    infonavit: 'Captura el número de crédito INFONAVIT. La modalidad "veces UMA" es la más común para créditos en factor de descuento.',
    fonacot: 'Captura el número de crédito FONACOT. Normalmente es una cuota fija mensual/quincenal.',
    pension_alimenticia: '⚖️ Tiene prioridad absoluta sobre cualquier otro descuento y NO le aplican los topes del Art. 110 LFT (deriva de una orden judicial, Art. 110 fr. V LFT). Captura el número de expediente judicial.',
    prestamo_empresa: 'Sujeto al tope del Art. 110 fr. I LFT: no puede exceder el 30% del excedente del salario sobre el salario mínimo del periodo. El sistema recorta automáticamente si se excede.',
    caja_ahorro: 'Descuento recurrente para una caja de ahorro (distinto del fondo de ahorro configurado en el expediente del trabajador).',
    otro: 'Descuento recurrente de otro tipo.',
  };
  ayuda.textContent = textos[tipo] || '';
}

function _cerrarFormDescuento() {
  const form = eid('form-descuento');
  if (form) form.style.display = 'none';
}

async function _guardarDescuento(trabajadorId) {
  const errEl = eid('dsc-error');
  errEl.style.display = 'none';

  const tipo      = eid('dsc-tipo')?.value;
  const modalidad = eid('dsc-modalidad')?.value;
  const valor     = parseFloat(eid('dsc-valor')?.value);
  const montoTotal= parseFloat(eid('dsc-total')?.value) || null;
  const numCred   = eid('dsc-numcredito')?.value.trim() || null;
  const desc      = eid('dsc-desc')?.value.trim() || (TIPOS_DESCUENTO[tipo]?.label || tipo);

  if (!valor && valor !== 0) {
    errEl.textContent = 'Captura el valor del descuento.';
    errEl.style.display = '';
    return;
  }

  const btn = eid('dsc-btn-guardar');
  if (btn) { btn.textContent = 'Guardando…'; btn.disabled = true; }

  const { error } = await window.supabase.from('descuentos_trabajador').insert({
    empresa_id:     CTX.empresa.id,
    trabajador_id:  trabajadorId,
    tipo, modalidad,
    valor,
    monto_total:    montoTotal,
    saldo_restante: montoTotal,
    numero_credito: numCred,
    descripcion:    desc,
    prioridad:      tipo === 'pension_alimenticia' ? 1 : 100,
  });

  if (btn) { btn.textContent = '💾 Guardar'; btn.disabled = false; }

  if (error) {
    errEl.textContent = 'Error al guardar: ' + error.message;
    errEl.style.display = '';
    return;
  }
  await renderTabDescuentos(trabajadorId);
}

async function _suspenderDescuento(descuentoId, trabajadorId) {
  if (!confirm('¿Suspender este descuento? Dejará de aplicarse en las próximas nóminas.')) return;
  const { error } = await window.supabase.from('descuentos_trabajador').update({ activo: false }).eq('id', descuentoId);
  if (error) { alert('Error: ' + error.message); return; }
  await renderTabDescuentos(trabajadorId);
}

async function _liquidarDescuento(descuentoId, trabajadorId) {
  if (!confirm('¿Marcar este descuento como liquidado? Se desactivará y no se aplicará en próximas nóminas.')) return;
  const { error } = await window.supabase.from('descuentos_trabajador')
    .update({ activo: false, saldo_restante: 0 }).eq('id', descuentoId);
  if (error) { alert('Error: ' + error.message); return; }
  await renderTabDescuentos(trabajadorId);
}

async function _verHistorialDescuento(descuentoId, trabajadorId) {
  const cont = eid('historial-descuento');
  if (!cont) return;
  cont.style.display = '';
  cont.innerHTML = `<div style="color:var(--text-muted);font-size:.85rem;">Cargando historial…</div>`;

  const { data: historial, error } = await _listarHistorialDescuento(descuentoId);
  if (error) { cont.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`; return; }

  cont.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <strong style="font-size:.85rem;">🕘 Historial de aplicaciones</strong>
      <button class="btn-secondary btn-sm" onclick="eid('historial-descuento').style.display='none'">Cerrar</button>
    </div>
    ${historial.length === 0
      ? `<div class="empty-state" style="padding:16px;"><div class="empty-state-title">Sin aplicaciones registradas todavía</div></div>`
      : `<div class="table-wrap"><table class="data-table">
          <thead><tr><th>Fecha</th><th>Monto aplicado</th><th>Saldo después</th></tr></thead>
          <tbody>${historial.map(h => `
            <tr>
              <td>${formatDateShort(h.fecha_aplicacion)}</td>
              <td>${fmt(h.monto_aplicado)}</td>
              <td>${h.saldo_despues != null ? fmt(h.saldo_despues) : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>`
    }
  `;
}
