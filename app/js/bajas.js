/**
 * Capital Humano MX — Módulo Bajas
 * Depende de: app.js (CTX, eid, navigate, showModal, closeModal, db, helpers, calcLiquidacion, calcFiniquito, generateAvisoRecision, generateRecibo, generateCartaRenuncia)
 */

// ═══════════════════════════════════════════════════════
//  BAJAS
// ═══════════════════════════════════════════════════════
async function renderBajas(preselId) {
  try {
    const trabajadores = await db.getTrabajadores({ estado:'activo' });
    const main = eid('main-view');
    main.innerHTML = `
      <div class="view-header animate-in">
        <div><div class="view-title">🚪 Proceso de Baja</div><div class="view-subtitle">Genera los documentos correspondientes según el tipo de terminación</div></div>
      </div>

      <div class="card animate-in" style="max-width:760px;margin:0 auto;">
        <div class="form-grid">
          <div class="form-group span-2">
            <label class="form-label">Trabajador <span class="req">*</span></label>
            <select id="baja-trab" class="form-select" onchange="precargarDatosBaja()">
              <option value="">— Seleccionar trabajador activo —</option>
              ${trabajadores.map(t=>`<option value="${t.id}" ${t.id===preselId?'selected':''}>${t.nombre} — ${t.puesto||''}</option>`).join('')}
            </select>
          </div>
          <div id="baja-resguardos-warning" class="form-group span-2" style="display:none;"></div>
          <div class="form-group">
            <label class="form-label">Tipo de baja <span class="req">*</span></label>
            <select id="baja-tipo" class="form-select" onchange="actualizarTipoBaja()">
              <option value="injustificada">⚖️ Despido sin justificación (Liquidación)</option>
              <option value="renuncia">📄 Renuncia voluntaria (Finiquito + Carta)</option>
              <option value="justificada">🚫 Rescisión justificada Art. 47 (Finiquito)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Fecha de baja <span class="req">*</span></label>
            <input id="baja-fecha" type="date" class="form-input" value="${new Date().toISOString().split('T')[0]}" />
          </div>
          <div class="form-group">
            <label class="form-label">Salario ordinario <span class="req">*</span></label>
            <input id="baja-salario" type="number" class="form-input" placeholder="Se carga automáticamente" min="1" step="0.01" />
          </div>
          <div class="form-group">
            <label class="form-label">Periodo de pago</label>
            <select id="baja-periodo" class="form-select">
              <option value="mensual">Mensual (÷ 30)</option>
              <option value="quincenal">Quincenal (÷ 15)</option>
              <option value="semanal">Semanal (÷ 7)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Días de salario pendientes de pago</label>
            <input id="baja-dias" type="number" class="form-input" value="0" min="0" />
          </div>
          <div class="form-group span-2">
            <label class="form-label" style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-top:4px;">
              <input type="checkbox" id="baja-vac-gozadas" checked
                     style="width:16px;height:16px;accent-color:var(--gold-primary);"
                     onchange="document.getElementById('baja-vac-pend-group').style.display=this.checked?'none':''" />
              Las vacaciones de años anteriores <strong>fueron gozadas</strong>
            </label>
            <div class="helper-text">Desmarca si hay vacaciones de años cumplidos sin tomar ni pagar.</div>
          </div>
          <div class="form-group" id="baja-vac-pend-group" style="display:none;">
            <label class="form-label">Días de vacaciones pendientes (años anteriores)</label>
            <input id="baja-vac-pend" type="number" class="form-input" placeholder="0" min="0" value="0" />
          </div>
          <div class="form-group" id="baja-ag-group" style="display:none;">
            <label class="form-label" style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-top:4px;">
              <input type="checkbox" id="baja-ag-pagado"
                     style="width:16px;height:16px;accent-color:var(--gold-primary);" />
              El aguinaldo del año en curso <strong>ya fue pagado</strong>
            </label>
            <div class="helper-text">Solo aplica si la baja es en diciembre y el aguinaldo ya se liquidó.</div>
          </div>
          <div class="form-group span-2" id="baja-antig-group" style="display:none;">
            <label class="form-label" style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="checkbox" id="baja-tiene-antig" style="width:16px;height:16px;accent-color:var(--gold-primary);" />
              Incluir prima de antigüedad por acuerdo voluntario (si tiene menos de 15 años)
            </label>
          </div>
        </div>

        <div id="baja-tipo-desc" class="alert alert-info" style="margin-bottom:16px;">
          <span>⚖️</span><span><strong>Despido sin justificación:</strong> Se generará Aviso de Rescisión + Recibo de Liquidación (incluye indemnización constitucional).</span>
        </div>

        <div id="baja-error" class="error-msg" style="display:none;margin-bottom:8px;"></div>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button class="btn-primary" onclick="handleProcesarBaja()">⚡ Calcular y generar documentos</button>
        </div>
      </div>
    `;

    window._trabListBajas = trabajadores;
    if (preselId) precargarDatosBaja();

    document.getElementById('baja-fecha').addEventListener('change', function() {
      const d = new Date(this.value + 'T00:00:00');
      const esDic = d.getMonth() === 11;
      document.getElementById('baja-ag-group').style.display = esDic ? '' : 'none';
    });
  } catch(e) { showError(e); }
}

async function precargarDatosBaja() {
  const id = eid('baja-trab')?.value;
  if (!id) return;
  const trab = (window._trabListBajas||[]).find(t=>t.id===id);
  if (!trab) return;
  eid('baja-salario').value = trab.salario_mensual;
  // También cargar el período de pago del trabajador
  const periodoEl = eid('baja-periodo');
  if (periodoEl && trab.periodo_salario) {
    periodoEl.value = trab.periodo_salario;
  }

  // Resguardos pendientes de devolución (migración 20)
  const warnEl = eid('baja-resguardos-warning');
  if (warnEl && typeof resguardosPendientes === 'function') {
    const pendientes = await resguardosPendientes(id);
    if (pendientes.length) {
      const valorTotal = pendientes.reduce((s, r) => s + (parseFloat(r.valor_estimado) || 0), 0);
      warnEl.style.display = '';
      warnEl.innerHTML = `
        <div class="alert alert-warn">
          <span>⚠️</span>
          <span>
            <strong>Resguardos pendientes de devolución (${pendientes.length}):</strong> ${valorTotal > 0 ? `valor estimado ${fmt(valorTotal)}. ` : ''}
            ${pendientes.map(r => `${r.articulo}${r.numero_serie ? ' (' + r.numero_serie + ')' : ''}`).join(', ')}.
            Se solicitará el checklist de devolución al confirmar la baja.
          </span>
        </div>`;
    } else {
      warnEl.style.display = 'none';
      warnEl.innerHTML = '';
    }
  }
}

function actualizarTipoBaja() {
  const tipo = eid('baja-tipo')?.value;
  const desc = eid('baja-tipo-desc');
  const antig = eid('baja-antig-group');
  if (!desc || !antig) return;

  const msgs = {
    injustificada: `<span>⚖️</span><span><strong>Despido sin justificación:</strong> Se generará Aviso de Rescisión + Recibo de Liquidación (incluye indemnización constitucional de 90 días SDI).</span>`,
    renuncia:      `<span>📄</span><span><strong>Renuncia voluntaria:</strong> Se generará Carta de Renuncia + Recibo de Finiquito (prestaciones proporcionales).</span>`,
    justificada:   `<span>🚫</span><span><strong>Rescisión con causa justificada (Art. 47):</strong> Se generará Recibo de Finiquito. Debe existir acta rescisoria previa.</span>`,
  };
  desc.innerHTML = msgs[tipo] || '';
  desc.className = tipo === 'injustificada' ? 'alert alert-warn' : tipo === 'justificada' ? 'alert alert-danger' : 'alert alert-info';
  antig.style.display = tipo === 'renuncia' ? '' : 'none';
}

async function handleProcesarBaja() {
  const err = eid('baja-error');
  err.style.display = 'none';
  const trabId  = eid('baja-trab')?.value;
  const tipo    = eid('baja-tipo')?.value;
  const fecha   = eid('baja-fecha')?.value;
  const salario = parseFloat(eid('baja-salario')?.value);
  if (!trabId || !tipo || !fecha || !salario) {
    err.textContent = 'Selecciona trabajador, tipo de baja, fecha y salario.';
    err.style.display = ''; return;
  }

  const trab = await db.getTrabajador(trabId);
  if (!trab) { err.textContent = 'Trabajador no encontrado.'; err.style.display=''; return; }
  const sucursalTrab = trab.sucursal_id ? await db.getSucursal(trab.sucursal_id) : null;

  const startDate      = new Date(trab.fecha_ingreso + 'T00:00:00');
  const endDate        = new Date(fecha + 'T00:00:00');
  const diasPendientes = parseInt(eid('baja-dias')?.value) || 0;
  const tieneAntig     = eid('baja-tiene-antig')?.checked || false;
  const vacGozadas     = eid('baja-vac-gozadas')?.checked ?? true;

  const params = {
    startDate, endDate,
    salario,
    monthlySalary:       salario,
    periodoSalario:      eid('baja-periodo')?.value || trab.periodo_salario || 'mensual',
    smgZone:             trab.smg_zone || 'general',
    diasPendientes,
    tieneAntig,
    vacacionesPendientes: vacGozadas ? 0 : (parseInt(eid('baja-vac-pend')?.value) || 0),
    aguinaldoPagado:      eid('baja-ag-pagado')?.checked || false,
  };

  const result            = (tipo === 'injustificada') ? calcLiquidacion(params) : calcFiniquito(params);
  const trabajadorPdf     = { ...trab, salario_mensual: salario, fecha_baja: fecha };

  const tipoLabel = { injustificada:'Despido injustificado (Liquidación)', renuncia:'Renuncia voluntaria (Finiquito)', justificada:'Rescisión justificada (Finiquito)' }[tipo] || tipo;
  const montoTotal = result.total ?? result.totalLiquidacion ?? result.totalFiniquito ?? 0;
  const fmtMx = n => '$' + (parseFloat(n)||0).toLocaleString('es-MX', { minimumFractionDigits:2 });

  showModal(`
    <div class="modal animate-in" style="max-width:480px;">
      <div class="modal-header">
        <div class="modal-title">⚠️ Confirmar proceso de baja</div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div style="padding:20px 24px;">
        <p style="font-size:.9rem;color:var(--text-secondary);margin-bottom:16px;">Revisa los datos antes de confirmar. Esta acción es irreversible.</p>
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px 16px;display:grid;gap:10px;font-size:.88rem;">
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Trabajador</span><strong>${trab.nombre}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Tipo de baja</span><span>${tipoLabel}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Fecha de baja</span><span>${formatDateShort(fecha)}</span></div>
          <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);padding-top:10px;margin-top:2px;"><span style="color:var(--text-muted);">Monto total</span><strong style="color:var(--gold-primary);font-size:1rem;">${fmtMx(montoTotal)}</strong></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-danger" onclick="closeModal();_confirmarBaja()">Confirmar baja</button>
      </div>
    </div>
  `);

  window._pendingBaja = { trabId, fecha, tipo, salario, diasPendientes, result, trab, trabajadorPdf, sucursalTrab };
}

async function _confirmarBaja() {
  const { trabId, fecha, tipo, salario, diasPendientes, result, trab, trabajadorPdf, sucursalTrab } = window._pendingBaja || {};
  if (!trabId) return;
  const err = eid('baja-error');
  try {
    await db.createBaja({
      trabajador_id: trabId, fecha_baja: fecha, tipo_baja: tipo,
      salario_al_momento: salario, dias_pendientes: diasPendientes,
      calculo_json: result,
    }, CTX.empresa.id);

    await db.darDeBaja(trabId, tipo, fecha);

    // Migración 19: movimiento IMSS de baja con la clave de causa correspondiente.
    if (typeof registrarMovimientoIMSS === 'function') {
      await registrarMovimientoIMSS(CTX.empresa.id, trabId, 'baja', {
        causaBaja: _causaBajaDesdeTipo(tipo),
        fecha,
      });
    }

    showResumenBaja(trab, result, tipo, CTX.empresa, trabajadorPdf, sucursalTrab);
  } catch(e) { if (err) { err.textContent = e.message; err.style.display=''; } }
  delete window._pendingBaja;
}

function showResumenBaja(trab, result, tipo, empresa, trabajadorPdf, sucursal = null) {
  const main = eid('main-view');

  const docsConfig = {
    injustificada: [
      { icon:'📋', titulo:'Aviso de Rescisión',   desc:'Notificación formal de terminación (Art. 53 LFT)', fn: () => generateAvisoRecision(empresa, trabajadorPdf, result, sucursal) },
      { icon:'🧾', titulo:'Recibo de Liquidación', desc:'Desglose completo de la liquidación',              fn: () => generateRecibo(empresa, trabajadorPdf, result, sucursal) },
    ],
    renuncia: [
      { icon:'✍️', titulo:'Carta de Renuncia',    desc:'Renuncia voluntaria e irrevocable (Art. 51 LFT)',   fn: () => generateCartaRenuncia(empresa, trabajadorPdf, sucursal) },
      { icon:'🧾', titulo:'Recibo de Finiquito',   desc:'Desglose de prestaciones proporcionales',           fn: () => generateRecibo(empresa, trabajadorPdf, result, sucursal) },
    ],
    justificada: [
      { icon:'🧾', titulo:'Recibo de Finiquito',   desc:'Desglose de prestaciones proporcionales',           fn: () => generateRecibo(empresa, trabajadorPdf, result, sucursal) },
    ],
  };
  const docs = docsConfig[tipo] || [];
  const fmtMx = n => '$' + (parseFloat(n)||0).toLocaleString('es-MX', { minimumFractionDigits:2 });

  main.innerHTML = `
    <div class="view-header animate-in">
      <div><div class="view-title">✅ Baja procesada</div></div>
      <button class="btn-secondary" onclick="navigate('empleados')">← Ver empleados</button>
    </div>

    <div style="max-width:760px;margin:0 auto;">
      <div class="card animate-in" style="border-color:var(--green-ok);margin-bottom:20px;">
        <div style="display:flex;gap:14px;align-items:center;margin-bottom:20px;">
          <div style="font-size:2.5rem;">✅</div>
          <div>
            <div style="font-family:'Montserrat',sans-serif;font-size:1.2rem;font-weight:900;">${trab.nombre}</div>
            <div style="font-size:.85rem;color:var(--text-secondary);">
              ${{injustificada:'Despido sin justificación',renuncia:'Renuncia voluntaria',justificada:'Rescisión justificada Art. 47'}[tipo]}
              · ${formatDateShort(trabajadorPdf.fecha_baja)}
            </div>
          </div>
        </div>

        <div style="background:var(--gold-dim);border:1px solid var(--gold-border);border-radius:var(--radius-md);padding:20px;text-align:center;margin-bottom:20px;">
          <div style="font-size:.78rem;font-weight:700;color:var(--gold-primary);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">
            ${result.type === 'liquidacion' ? 'LIQUIDACIÓN' : 'FINIQUITO'} TOTAL
          </div>
          <div style="font-family:'Montserrat',sans-serif;font-size:2.4rem;font-weight:900;color:var(--gold-light);">${fmtMx(result.total)}</div>
          <div style="font-size:.8rem;color:var(--text-secondary);margin-top:4px;">Monto bruto antes de retenciones fiscales (ISR)</div>
        </div>

        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
          <div style="flex:1;min-width:140px;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px 16px;">
            <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Días laborados total</div>
            <div style="font-size:1.3rem;font-weight:900;font-family:'Montserrat',sans-serif;">${result.diasLaborados.toLocaleString('es-MX')}</div>
            <div style="font-size:.75rem;color:var(--text-muted);margin-top:2px;">${formatDateShort(trab.fecha_ingreso)} → ${formatDateShort(trabajadorPdf.fecha_baja)}</div>
          </div>
          <div style="flex:1;min-width:140px;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px 16px;">
            <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Días laborados en ${new Date(trabajadorPdf.fecha_baja+'T00:00:00').getFullYear()}</div>
            <div style="font-size:1.3rem;font-weight:900;font-family:'Montserrat',sans-serif;">${result.diasEnAnio}</div>
            <div style="font-size:.75rem;color:var(--text-muted);margin-top:2px;">Del año calendario en curso</div>
          </div>
          <div style="flex:1;min-width:140px;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px 16px;">
            <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Antigüedad</div>
            <div style="font-size:1.3rem;font-weight:900;font-family:'Montserrat',sans-serif;">${result.completed} año${result.completed!==1?'s':''}</div>
            <div style="font-size:.75rem;color:var(--text-muted);margin-top:2px;">(${result.frac.toFixed(2)} fracción)</div>
          </div>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Concepto</th><th>Cálculo</th><th style="text-align:right;">Importe</th></tr></thead>
            <tbody>
              ${result.items.map(i => `
                <tr>
                  <td><strong>${i.name}</strong></td>
                  <td style="color:var(--text-muted);font-size:.82rem;">${i.calc}</td>
                  <td style="text-align:right;font-weight:700;color:${i.amount > 0 ? 'var(--green-ok)' : 'var(--text-muted)'};">${fmtMx(i.amount)}</td>
                </tr>`).join('')}
              <tr style="background:rgba(245,166,35,.08);">
                <td colspan="2" style="font-weight:800;font-size:1rem;">TOTAL</td>
                <td style="text-align:right;font-weight:900;font-size:1rem;color:var(--gold-primary);">${fmtMx(result.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card animate-in" style="animation-delay:.1s;">
        <div class="card-header">
          <span class="card-title">📄 Documentos — haz clic para descargar cada uno</span>
        </div>
        ${docs.map((doc, i) => `
          <div class="doc-card" style="margin-bottom:${i < docs.length-1 ? '12px' : '0'};">
            <div class="doc-card-header">
              <span class="doc-card-icon">${doc.icon}</span>
              <div>
                <div class="doc-card-title">${doc.titulo}</div>
                <div class="doc-card-desc">${doc.desc}</div>
              </div>
            </div>
            <div class="doc-card-body">
              <button class="btn-download" onclick="descargarDocBaja(${i}, this)">
                ⬇️ Descargar — ${doc.titulo}
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  window._docsActualesBaja = docs;

  // Resguardos pendientes de devolución (migración 20) — checklist adicional,
  // no se integra al PDF de finiquito/liquidación para no modificar ese
  // cálculo compartido; se documenta en una constancia separada.
  _renderChecklistResguardosBaja(trab.id, empresa, trabajadorPdf);
}

async function _renderChecklistResguardosBaja(trabajadorId, empresa, trabajadorPdf) {
  if (typeof resguardosPendientes !== 'function') return;
  const pendientes = await resguardosPendientes(trabajadorId);
  if (!pendientes.length) return;

  window._bajaResguardosCtx = { trabajadorId, empresa, trabajadorPdf };

  const wrap = document.querySelector('#main-view > div');
  if (!wrap) return;
  const card = document.createElement('div');
  card.className = 'card animate-in';
  card.style.cssText = 'margin-top:16px;';
  card.innerHTML = `
    <div class="card-header"><span class="card-title">🧰 Checklist de devolución de equipo</span></div>
    <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:12px;">
      No se descuenta automáticamente el valor de lo no devuelto del finiquito — la retención unilateral es riesgosa legalmente; solo se documenta.
    </p>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Artículo</th><th>Estado de devolución</th></tr></thead>
      <tbody>${pendientes.map(r => `
        <tr>
          <td>${r.articulo}${r.numero_serie ? ` (${r.numero_serie})` : ''}</td>
          <td><select class="form-select baja-res-estado" data-resguardo-id="${r.id}" style="max-width:200px;">
            <option value="">— Pendiente —</option>
            <option value="completo">✅ Completo</option>
            <option value="danado">⚠️ Dañado</option>
            <option value="no_devuelto">🔴 No devuelto</option>
          </select></td>
        </tr>`).join('')}
      </tbody>
    </table></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
      <button class="btn-primary btn-sm" onclick="_guardarChecklistResguardosBaja(this)">💾 Guardar checklist</button>
      <button class="btn-secondary btn-sm" onclick="_descargarConstanciaDevolucion()">📄 Generar constancia de devolución</button>
    </div>
  `;
  wrap.appendChild(card);
}

async function _guardarChecklistResguardosBaja(btn) {
  const selects = [...document.querySelectorAll('.baja-res-estado')].filter(s => s.value);
  if (!selects.length) { alert('Selecciona el estado de al menos un artículo.'); return; }

  btn.textContent = 'Guardando…'; btn.disabled = true;
  for (const s of selects) {
    await window.supabase.from('resguardos').update({
      estado_devolucion: s.value,
      fecha_devolucion: new Date().toISOString().split('T')[0],
    }).eq('id', s.dataset.resguardoId);
  }
  btn.textContent = '💾 Guardar checklist'; btn.disabled = false;
  if (typeof showToast === 'function') showToast('✅ Checklist de devolución guardado', 'success');
  else alert('Checklist de devolución guardado.');
}

async function _descargarConstanciaDevolucion() {
  const ctx = window._bajaResguardosCtx;
  if (!ctx || typeof generarConstanciaDevolucionPDF !== 'function') return;
  const { data: resguardos } = await window.supabase.from('resguardos').select('*').eq('trabajador_id', ctx.trabajadorId);
  generarConstanciaDevolucionPDF(ctx.empresa, ctx.trabajadorPdf, resguardos || []);
}

function descargarDocBaja(idx, btn) {
  const docCfg = window._docsActualesBaja?.[idx];
  if (!docCfg) {
    alert('Error: no se encontró la configuración del documento. Recarga la página e intenta de nuevo.');
    return;
  }
  const orig = btn.innerHTML;
  btn.textContent = '⏳ Generando PDF…'; btn.disabled = true;

  setTimeout(() => {
    try {
      docCfg.fn();
      setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 1800);
    } catch(e) {
      console.error('Error al generar PDF de baja:', e);
      btn.innerHTML = orig;
      btn.disabled = false;
      const errBox = document.createElement('div');
      errBox.className = 'alert alert-danger animate-in';
      errBox.style.cssText = 'margin-top:12px;';
      errBox.innerHTML = `<span>❌</span><span><strong>Error al generar PDF:</strong> ${e.message || String(e)}</span>`;
      btn.closest('.doc-card-body').appendChild(errBox);
    }
  }, 50);
}
