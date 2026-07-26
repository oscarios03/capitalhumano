/**
 * Capital Humano MX — Módulo Bajas
 * Depende de: app.js (CTX, eid, navigate, showModal, closeModal, db, helpers,
 * calcLiquidacion, calcFiniquito, generateRecibo, generateCartaRenuncia,
 * generateAvisoRescisionArt47, generateActaNegativaRecibirAviso,
 * generateAvisoTribunalArt47), calculo.js (FALTAS_CATALOG)
 */

// ═══════════════════════════════════════════════════════
//  BAJAS
// ═══════════════════════════════════════════════════════
async function renderBajas(preselId) {
  const _gen = typeof _navGen !== 'undefined' ? _navGen : 0;
  try {
    const trabajadores = await db.getTrabajadores({ estado:'activo' });
    if (typeof _navStale === 'function' && _navStale(_gen)) return;
    const main = eid('main-view');
    main.innerHTML = `
      <div class="view-header animate-in">
        <div><div class="view-title">Proceso de Baja</div><div class="view-subtitle">Genera los documentos correspondientes según el tipo de terminación</div></div>
      </div>

      <div class="card animate-in" style="max-width:760px;margin:0 auto;">
        <div class="form-grid">
          <div class="form-group span-2">
            <label class="form-label" for="baja-trab">Trabajador <span class="req">*</span></label>
            <select id="baja-trab" class="form-select" onchange="precargarDatosBaja()" required aria-required="true">
              <option value="">— Seleccionar trabajador activo —</option>
              ${trabajadores.map(t=>`<option value="${t.id}" ${t.id===preselId?'selected':''}>${escapeHtml(t.nombre)} — ${escapeHtml(t.puesto)||''}</option>`).join('')}
            </select>
          </div>
          <div id="baja-resguardos-warning" class="form-group span-2" style="display:none;"></div>
          <div class="form-group">
            <label class="form-label" for="baja-tipo">Tipo de baja <span class="req">*</span></label>
            <select id="baja-tipo" class="form-select" onchange="actualizarTipoBaja()" required aria-required="true">
              <option value="injustificada">Despido sin justificación (Liquidación)</option>
              <option value="renuncia">Renuncia voluntaria (Finiquito + Carta)</option>
              <option value="justificada">Rescisión justificada Art. 47 (Finiquito)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="baja-fecha">Fecha de baja <span class="req">*</span></label>
            <input id="baja-fecha" type="date" class="form-input" value="${new Date().toISOString().split('T')[0]}" required aria-required="true" />
          </div>
          <div class="form-group">
            <label class="form-label" for="baja-salario">Salario ordinario <span class="req">*</span></label>
            <input id="baja-salario" type="number" class="form-input" placeholder="Se carga automáticamente" min="1" step="0.01" required aria-required="true" />
          </div>
          <div class="form-group">
            <label class="form-label" for="baja-periodo">Periodo de pago</label>
            <select id="baja-periodo" class="form-select">
              <option value="mensual">Mensual (÷ 30)</option>
              <option value="quincenal">Quincenal (÷ 15)</option>
              <option value="semanal">Semanal (÷ 7)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="baja-dias">Días de salario pendientes de pago</label>
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
            <label class="form-label" for="baja-vac-pend">Días de vacaciones pendientes (años anteriores)</label>
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

          <!-- Datos que el Art. 47 LFT exige para que la rescisión se sostenga.
               Sólo se piden en la rescisión justificada. -->
          <div class="form-group span-2" id="baja-art47-group" style="display:none;">
            <div style="border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;background:var(--bg-surface);">
              <div style="font-weight:700;font-size:.9rem;margin-bottom:4px;">Datos de la rescisión — Artículo 47 LFT</div>
              <div class="helper-text" style="margin-bottom:14px;">
                El aviso debe referir claramente la conducta que motiva la rescisión y la fecha en que se cometió.
                Sin estos datos el aviso no cumple el Art. 47 y su falta presume la separación injustificada.
              </div>

              <div class="form-grid" style="gap:14px;">
                <div class="form-group">
                  <label class="form-label" for="baja-conocimiento">Fecha en que se conoció la causa <span class="req">*</span></label>
                  <input id="baja-conocimiento" type="date" class="form-input" onchange="revisarPrescripcion517()" />
                  <div class="helper-text">Inicia el plazo de un mes del Art. 517 fracc. I.</div>
                </div>
                <div class="form-group">
                  <label class="form-label" for="baja-fraccion47">Fracción del Art. 47 <span class="req">*</span></label>
                  <select id="baja-fraccion47" class="form-select"></select>
                </div>
                <div class="form-group span-2" id="baja-prescripcion-warn"></div>
                <div class="form-group span-2">
                  <label class="form-label" for="baja-descripcion">Descripción circunstanciada de los hechos <span class="req">*</span></label>
                  <textarea id="baja-descripcion" class="form-textarea" rows="4"
                            placeholder="Modo, tiempo y lugar. Ej.: El 12 de julio de 2026, siendo las 09:40 horas, en el andén de carga del centro de trabajo ubicado en…, el trabajador…"></textarea>
                </div>
                <div class="form-group span-2">
                  <label class="form-label" for="baja-evidencia">Evidencia con la que se acreditan los hechos</label>
                  <input id="baja-evidencia" type="text" class="form-input"
                         placeholder="Ej.: video de la cámara 3, acta administrativa del 12/07/2026, testimonio de…" />
                </div>
                <div class="form-group span-2">
                  <label class="form-label" for="baja-domicilio-trab">Domicilio del trabajador <span class="req">*</span></label>
                  <input id="baja-domicilio-trab" type="text" class="form-input"
                         placeholder="Se necesita para el aviso al Tribunal si se niega a recibir" />
                </div>

                <div class="form-group span-2" style="margin-top:2px;">
                  <div style="font-weight:600;font-size:.82rem;color:var(--text-secondary);">
                    Testigos — se piden INE y domicilio porque la testimonial suele desahogarse dos años después
                  </div>
                </div>
                <div class="form-group"><label class="form-label" for="baja-t1-nombre">Testigo 1 — nombre completo</label><input id="baja-t1-nombre" type="text" class="form-input" /></div>
                <div class="form-group"><label class="form-label" for="baja-t1-ine">Testigo 1 — INE</label><input id="baja-t1-ine" type="text" class="form-input" /></div>
                <div class="form-group span-2"><label class="form-label" for="baja-t1-dom">Testigo 1 — domicilio</label><input id="baja-t1-dom" type="text" class="form-input" /></div>
                <div class="form-group"><label class="form-label" for="baja-t2-nombre">Testigo 2 — nombre completo</label><input id="baja-t2-nombre" type="text" class="form-input" /></div>
                <div class="form-group"><label class="form-label" for="baja-t2-ine">Testigo 2 — INE</label><input id="baja-t2-ine" type="text" class="form-input" /></div>
                <div class="form-group span-2"><label class="form-label" for="baja-t2-dom">Testigo 2 — domicilio</label><input id="baja-t2-dom" type="text" class="form-input" /></div>

                <div class="form-group span-2">
                  <label class="form-label" style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                    <input type="checkbox" id="baja-aviso-rechazado" style="width:16px;height:16px;accent-color:var(--gold-primary);" />
                    El trabajador <strong>se negó a recibir</strong> el aviso
                  </label>
                  <div class="helper-text">
                    Activa el acta de negativa y el escrito al Tribunal, que debe presentarse dentro de los cinco días hábiles siguientes.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div id="baja-tipo-desc" class="alert alert-info" style="margin-bottom:16px;">
          <svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg><span><strong>Despido sin justificación:</strong> Se generará Aviso de Rescisión + Recibo de Liquidación (incluye indemnización constitucional).</span>
        </div>

        <div id="baja-error" class="error-msg" role="alert" style="display:none;margin-bottom:8px;"></div>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button class="btn-primary" onclick="handleProcesarBaja()">Calcular y generar documentos</button>
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
        <div class="alert alert-warn"><svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg>
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
    injustificada: `<svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg><span><strong>Despido sin justificación:</strong> Se generará el Recibo de Liquidación (incluye indemnización constitucional de 90 días SDI). No se emite aviso de rescisión: no hay causa que invocar, y un aviso sin causa acredita el despido injustificado.</span>`,
    renuncia:      `<svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg><span><strong>Renuncia voluntaria:</strong> Se generará Carta de Renuncia + Recibo de Finiquito (prestaciones proporcionales).</span>`,
    justificada:   `<svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg><span><strong>Rescisión con causa justificada (Art. 47):</strong> Se generará el Aviso de Rescisión del Art. 47 + Recibo de Finiquito. Captura la fracción y los hechos: sin aviso, la separación se presume injustificada.</span>`,
  };
  desc.innerHTML = msgs[tipo] || '';
  desc.className = tipo === 'injustificada' ? 'alert alert-warn' : tipo === 'justificada' ? 'alert alert-danger' : 'alert alert-info';
  antig.style.display = tipo === 'renuncia' ? '' : 'none';

  const art47 = eid('baja-art47-group');
  if (art47) {
    art47.style.display = tipo === 'justificada' ? '' : 'none';
    if (tipo === 'justificada') _llenarFraccionesArt47();
  }
}

/** Opciones del select de fracciones, tomadas del catálogo verificado. */
function _llenarFraccionesArt47() {
  const sel = eid('baja-fraccion47');
  if (!sel || sel.options.length) return;
  sel.innerHTML = '<option value="">— Selecciona la causa —</option>';
  (typeof FALTAS_CATALOG !== 'undefined' ? FALTAS_CATALOG : [])
    .filter(f => f.fraccion && f.severity.includes('rescisoria'))
    .forEach(f => {
      const o = document.createElement('option');
      o.value = f.fraccion;
      o.textContent = `Fracc. ${f.fraccion} — ${f.label}`;
      sel.appendChild(o);
    });
}

/**
 * Advertencia de prescripción del Art. 517 fracc. I: el patrón tiene UN MES
 * desde el día siguiente a aquel en que conoció la causa. Rescindir vencido ese
 * plazo convierte el despido en injustificado, así que la advertencia escala
 * conforme se acerca el vencimiento y no se puede descartar una vez cumplido.
 */
function revisarPrescripcion517() {
  const box = eid('baja-prescripcion-warn');
  const val = eid('baja-conocimiento')?.value;
  if (!box) return;
  if (!val) { box.innerHTML = ''; return; }

  const conocimiento = new Date(val + 'T00:00:00');
  const hoy = new Date(new Date().toISOString().slice(0,10) + 'T00:00:00');
  // El plazo es de un mes calendario, no de 30 días: febrero y julio no miden igual.
  const vence = new Date(conocimiento);
  vence.setMonth(vence.getMonth() + 1);
  const diasRestantes = Math.floor((vence - hoy) / 86400000);
  const transcurridos = Math.floor((hoy - conocimiento) / 86400000);

  if (diasRestantes < 0) {
    box.innerHTML = `
      <div class="alert alert-danger" style="align-items:flex-start;">
        <svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg>
        <span><strong>La causa de rescisión pudo haber prescrito.</strong>
        El artículo 517 fracción I de la LFT concede al patrón <strong>un mes</strong> para ejercer la acción
        de rescisión, contado a partir del día siguiente a la fecha en que se tuvo conocimiento de la causa.
        Han transcurrido ${transcurridos} días. Rescindir fuera de este plazo hace que el despido se considere
        injustificado. Consulta a tu abogado antes de continuar.</span>
      </div>`;
  } else if (diasRestantes <= 5) {
    box.innerHTML = `
      <div class="alert alert-danger" style="align-items:flex-start;">
        <svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg>
        <span><strong>Quedan ${diasRestantes} día(s) para que prescriba la acción</strong> (Art. 517 fracc. I LFT).
        Vencido el mes, la rescisión se considera despido injustificado.</span>
      </div>`;
  } else if (diasRestantes <= 10) {
    box.innerHTML = `
      <div class="alert alert-warn" style="align-items:flex-start;">
        <svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg>
        <span>Quedan ${diasRestantes} días del plazo de un mes del Art. 517 fracc. I LFT para ejercer la rescisión.</span>
      </div>`;
  } else {
    box.innerHTML = '';
  }
  return diasRestantes;
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

  // Datos del Art. 47 — obligatorios en la rescisión justificada
  let datosArt47 = null;
  if (tipo === 'justificada') {
    datosArt47 = {
      fecha_conocimiento_causa:    eid('baja-conocimiento')?.value || '',
      fraccion_art47:              eid('baja-fraccion47')?.value || '',
      descripcion_circunstanciada: eid('baja-descripcion')?.value.trim() || '',
      evidencia:                   eid('baja-evidencia')?.value.trim() || '',
      domicilio_trabajador:        eid('baja-domicilio-trab')?.value.trim() || trab.domicilio || '',
      testigo1_nombre:             eid('baja-t1-nombre')?.value.trim() || '',
      testigo1_ine:                eid('baja-t1-ine')?.value.trim() || '',
      testigo1_domicilio:          eid('baja-t1-dom')?.value.trim() || '',
      testigo2_nombre:             eid('baja-t2-nombre')?.value.trim() || '',
      testigo2_ine:                eid('baja-t2-ine')?.value.trim() || '',
      testigo2_domicilio:          eid('baja-t2-dom')?.value.trim() || '',
      aviso_rechazado:             eid('baja-aviso-rechazado')?.checked || false,
      fecha_efectos:               fecha,
    };
    const faltantes = [];
    if (!datosArt47.fecha_conocimiento_causa)    faltantes.push('la fecha en que se conoció la causa');
    if (!datosArt47.fraccion_art47)              faltantes.push('la fracción del Art. 47');
    if (!datosArt47.descripcion_circunstanciada) faltantes.push('la descripción circunstanciada de los hechos');
    if (!datosArt47.domicilio_trabajador)        faltantes.push('el domicilio del trabajador');
    if (faltantes.length) {
      err.innerHTML = `Para la rescisión justificada falta capturar ${faltantes.join(', ')}. ` +
        `El Art. 47 LFT exige que el aviso refiera claramente la conducta y la fecha en que se cometió.`;
      err.style.display = '';
      return;
    }
    if (datosArt47.fecha_conocimiento_causa > fecha) {
      err.textContent = 'La fecha en que se conoció la causa no puede ser posterior a la fecha de baja.';
      err.style.display = '';
      return;
    }
  }

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

  // El cálculo depende del salario mínimo y la UMA vigentes (tope de la prima de
  // antigüedad, Art. 162 fr. II LFT). Si no están configurados para el ejercicio
  // en curso, vigencias.js lanza en vez de calcular con cifras caducas: el error
  // debe verse, no morir como promesa rechazada.
  let result;
  try {
    result = (tipo === 'injustificada') ? calcLiquidacion(params) : calcFiniquito(params);
  } catch (e) {
    err.textContent = friendlyError(e);
    err.style.display = '';
    return;
  }
  const trabajadorPdf     = { ...trab, salario_mensual: salario, fecha_baja: fecha };

  const tipoLabel = { injustificada:'Despido injustificado (Liquidación)', renuncia:'Renuncia voluntaria (Finiquito)', justificada:'Rescisión justificada (Finiquito)' }[tipo] || tipo;
  const montoTotal = result.total ?? result.totalLiquidacion ?? result.totalFiniquito ?? 0;
  const fmtMx = n => '$' + (parseFloat(n)||0).toLocaleString('es-MX', { minimumFractionDigits:2 });

  showModal(`
    <div class="modal animate-in" style="max-width:480px;">
      <div class="modal-header">
        <div class="modal-title">Confirmar proceso de baja</div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div style="padding:20px 24px;">
        <p style="font-size:.9rem;color:var(--text-secondary);margin-bottom:16px;">Revisa los datos antes de confirmar. Esta acción es irreversible.</p>
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px 16px;display:grid;gap:10px;font-size:.88rem;">
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Trabajador</span><strong>${escapeHtml(trab.nombre)}</strong></div>
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

  window._pendingBaja = { trabId, fecha, tipo, salario, diasPendientes, result, trab, trabajadorPdf, sucursalTrab, datosArt47 };
}

async function _confirmarBaja() {
  const { trabId, fecha, tipo, salario, diasPendientes, result, trab, trabajadorPdf, sucursalTrab, datosArt47 } = window._pendingBaja || {};
  if (!trabId) return;
  const err = eid('baja-error');
  // B-4: esta secuencia tiene dos escrituras que NO son atómicas entre sí
  // (createBaja + darDeBaja) — si la primera tiene éxito y la segunda falla
  // (ej. conflicto de optimistic locking), el trabajador queda "a medias":
  // existe un registro en `bajas` pero su `estado` sigue activo. Se avisa
  // explícitamente en ese caso en vez de mostrar solo el error crudo.
  let bajaRegistrada = false;
  try {
    await db.createBaja({
      trabajador_id: trabId, fecha_baja: fecha, tipo_baja: tipo,
      salario_al_momento: salario, dias_pendientes: diasPendientes,
      calculo_json: result,
    }, CTX.empresa.id);
    bajaRegistrada = true;

    await db.darDeBaja(trabId, tipo, fecha, trab?.updated_at);

    // Migración 19: movimiento IMSS de baja — es un registro complementario,
    // su falla no debe impedir cerrar la baja (ya consumada arriba).
    if (typeof registrarMovimientoIMSS === 'function') {
      await registrarMovimientoIMSS(CTX.empresa.id, trabId, 'baja', {
        causaBaja: _causaBajaDesdeTipo(tipo),
        fecha,
      }).catch(e => console.warn('No se pudo registrar el movimiento IMSS de baja (no bloquea el proceso):', e.message));
    }

    // Registro de la rescisión: sostiene el aviso y alimenta la vigilancia de
    // los plazos del Art. 517 fracc. I y del Art. 47 (migración 40). Su falla no
    // debe deshacer la baja ya consumada, pero sí avisarse: sin este registro no
    // hay alerta del plazo de cinco días hábiles para el aviso al Tribunal.
    if (tipo === 'justificada' && datosArt47) {
      try {
        await window.supabase.from('rescisiones').insert({
          empresa_id:                  CTX.empresa.id,
          trabajador_id:               trabId,
          fecha_conocimiento_causa:    datosArt47.fecha_conocimiento_causa,
          fecha_rescision:             fecha,
          fraccion_art47:              datosArt47.fraccion_art47,
          descripcion_circunstanciada: datosArt47.descripcion_circunstanciada,
          evidencia:                   datosArt47.evidencia || null,
          domicilio_trabajador:        datosArt47.domicilio_trabajador,
          testigo1_nombre:             datosArt47.testigo1_nombre || null,
          testigo1_ine:                datosArt47.testigo1_ine || null,
          testigo1_domicilio:          datosArt47.testigo1_domicilio || null,
          testigo2_nombre:             datosArt47.testigo2_nombre || null,
          testigo2_ine:                datosArt47.testigo2_ine || null,
          testigo2_domicilio:          datosArt47.testigo2_domicilio || null,
          aviso_entregado:             !datosArt47.aviso_rechazado,
          aviso_rechazado:             !!datosArt47.aviso_rechazado,
        });
      } catch (e) {
        console.warn('No se pudo registrar la rescisión:', e.message);
        if (typeof showToast === 'function') {
          showToast('La baja se procesó, pero no se registró la rescisión: no habrá alerta del plazo de 5 días hábiles del Art. 47. ' + (e.message || ''), 'warn', 9000);
        }
      }
    }

    showResumenBaja(trab, result, tipo, CTX.empresa, trabajadorPdf, sucursalTrab, datosArt47);
  } catch(e) {
    if (err) {
      err.textContent = bajaRegistrada
        ? `Se registró la baja, pero el trabajador NO quedó marcado como dado de baja (${e.message}). Recarga la página y verifica su estado antes de reintentar — no vuelvas a confirmar sin revisar primero.`
        : e.message;
      err.style.display = '';
    }
  }
  delete window._pendingBaja;
}

function showResumenBaja(trab, result, tipo, empresa, trabajadorPdf, sucursal = null, datosArt47 = null) {
  const main = eid('main-view');

  const d47 = datosArt47 || {};
  const docsConfig = {
    // Sin causa que invocar no hay aviso del Art. 47 que emitir. El aviso que se
    // generaba antes citaba los arts. 49 y 50 y anunciaba una indemnización:
    // era una confesión escrita de despido injustificado.
    injustificada: [
      { icon:'', titulo:'Recibo de Liquidación', desc:'Desglose completo de la liquidación',              fn: () => generateRecibo(empresa, trabajadorPdf, result, sucursal) },
    ],
    renuncia: [
      { icon:'', titulo:'Carta de Renuncia',    desc:'Renuncia voluntaria e irrevocable (Art. 51 LFT)',   fn: () => generateCartaRenuncia(empresa, trabajadorPdf, sucursal) },
      { icon:'', titulo:'Recibo de Finiquito',   desc:'Desglose de prestaciones proporcionales',           fn: () => generateRecibo(empresa, trabajadorPdf, result, sucursal) },
    ],
    justificada: [
      { icon:'', titulo:'Aviso de Rescisión (Art. 47)', desc:'Aviso con la fracción invocada y los hechos. Entrégalo en persona y recaba el acuse.', fn: () => generateAvisoRescisionArt47(empresa, trabajadorPdf, d47, sucursal) },
      { icon:'', titulo:'Recibo de Finiquito',   desc:'Desglose de prestaciones proporcionales',           fn: () => generateRecibo(empresa, trabajadorPdf, result, sucursal) },
    ],
  };
  // Si el trabajador se negó a recibir, el aviso al Tribunal tiene plazo fatal
  // de cinco días hábiles (Art. 47); sin él la separación se presume injustificada.
  if (tipo === 'justificada' && d47.aviso_rechazado) {
    docsConfig.justificada.push(
      { icon:'', titulo:'Acta de Negativa a Recibir el Aviso', desc:'Acta circunstanciada con testigos identificados', fn: () => generateActaNegativaRecibirAviso(empresa, trabajadorPdf, d47, sucursal) },
      { icon:'', titulo:'Aviso al Tribunal Laboral', desc:'PLAZO FATAL: cinco días hábiles desde la rescisión (Art. 47 LFT)', fn: () => generateAvisoTribunalArt47(empresa, trabajadorPdf, d47, sucursal) },
    );
  }
  const docs = docsConfig[tipo] || [];
  const fmtMx = n => '$' + (parseFloat(n)||0).toLocaleString('es-MX', { minimumFractionDigits:2 });

  main.innerHTML = `
    <div class="view-header animate-in">
      <div><div class="view-title">Baja procesada</div></div>
      <button class="btn-secondary" onclick="navigate('empleados')">← Ver empleados</button>
    </div>

    <div style="max-width:760px;margin:0 auto;">
      <div class="card animate-in" style="border-color:var(--green-ok);margin-bottom:20px;">
        <div style="display:flex;gap:14px;align-items:center;margin-bottom:20px;">
          <div style="font-size:2.5rem;"></div>
          <div>
            <div style="font-size:1.2rem;font-weight:700;">${escapeHtml(trab.nombre)}</div>
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
          <div style="font-size:2.4rem;font-weight:700;color:var(--gold-light);">${fmtMx(result.total)}</div>
          <div style="font-size:.8rem;color:var(--text-secondary);margin-top:4px;">Monto bruto antes de retenciones fiscales (ISR)</div>
        </div>

        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
          <div style="flex:1;min-width:140px;border:1px solid var(--border);border-radius:var(--radius-md);padding:12px 16px;">
            <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Días laborados total</div>
            <div style="font-size:1.3rem;font-weight:700;">${result.diasLaborados.toLocaleString('es-MX')}</div>
            <div style="font-size:.75rem;color:var(--text-muted);margin-top:2px;">${formatDateShort(trab.fecha_ingreso)} → ${formatDateShort(trabajadorPdf.fecha_baja)}</div>
          </div>
          <div style="flex:1;min-width:140px;border:1px solid var(--border);border-radius:var(--radius-md);padding:12px 16px;">
            <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Días laborados en ${new Date(trabajadorPdf.fecha_baja+'T00:00:00').getFullYear()}</div>
            <div style="font-size:1.3rem;font-weight:700;">${result.diasEnAnio}</div>
            <div style="font-size:.75rem;color:var(--text-muted);margin-top:2px;">Del año calendario en curso</div>
          </div>
          <div style="flex:1;min-width:140px;border:1px solid var(--border);border-radius:var(--radius-md);padding:12px 16px;">
            <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Antigüedad</div>
            <div style="font-size:1.3rem;font-weight:700;">${result.completed} año${result.completed!==1?'s':''}</div>
            <div style="font-size:.75rem;color:var(--text-muted);margin-top:2px;">(${result.frac.toFixed(2)} fracción)</div>
          </div>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Concepto</th><th>Fundamento</th><th>Cálculo</th><th style="text-align:right;">Importe</th></tr></thead>
            <tbody>
              ${result.items.map(i => `
                <tr>
                  <td><strong>${i.name}</strong></td>
                  <td style="color:var(--text-muted);font-size:.78rem;">${i.fundamento || ''}</td>
                  <td style="color:var(--text-muted);font-size:.82rem;">${i.calc}</td>
                  <td style="text-align:right;font-weight:700;color:${i.amount > 0 ? 'var(--green-ok)' : 'var(--text-muted)'};">${fmtMx(i.amount)}</td>
                </tr>`).join('')}
              <tr style="background:var(--gold-dim);">
                <td colspan="3" style="font-weight:700;font-size:1rem;">TOTAL</td>
                <td style="text-align:right;font-weight:700;font-size:1rem;color:var(--gold-primary);">${fmtMx(result.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card animate-in" style="animation-delay:.1s;">
        <div class="card-header">
          <span class="card-title">Documentos — haz clic para descargar cada uno</span>
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
                Descargar — ${doc.titulo}
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
    <div class="card-header"><span class="card-title">Checklist de devolución de equipo</span></div>
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
            <option value="completo">Completo</option>
            <option value="danado">Dañado</option>
            <option value="no_devuelto">● No devuelto</option>
          </select></td>
        </tr>`).join('')}
      </tbody>
    </table></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
      <button class="btn-primary btn-sm" onclick="_guardarChecklistResguardosBaja(this)">Guardar checklist</button>
      <button class="btn-secondary btn-sm" onclick="_descargarConstanciaDevolucion()">Generar constancia de devolución</button>
    </div>
  `;
  wrap.appendChild(card);
}

async function _guardarChecklistResguardosBaja(btn) {
  const selects = [...document.querySelectorAll('.baja-res-estado')].filter(s => s.value);
  if (!selects.length) { alert('Selecciona el estado de al menos un artículo.'); return; }

  btnCargando(btn, 'Guardando…');
  for (const s of selects) {
    await window.supabase.from('resguardos').update({
      estado_devolucion: s.value,
      fecha_devolucion: new Date().toISOString().split('T')[0],
    }).eq('id', s.dataset.resguardoId);
  }
  btnRestaurar(btn);
  if (typeof showToast === 'function') showToast('Checklist de devolución guardado', 'success');
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
  btnCargando(btn, 'Generando PDF…');

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
      errBox.innerHTML = `<svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg><span><strong>Error al generar PDF:</strong> ${e.message || String(e)}</span>`;
      btn.closest('.doc-card-body').appendChild(errBox);
    }
  }, 50);
}
