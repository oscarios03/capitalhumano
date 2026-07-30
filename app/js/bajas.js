/**
 * Capital Humano MX — Módulo Bajas
 * Depende de: app.js (CTX, eid, navigate, showModal, closeModal, db, helpers,
 * calcLiquidacion, calcFiniquito, calcPropuestaBaja, calcFiscalBaja,
 * generateRecibo, generateCartaRenuncia, generateAvisoRescisionArt47,
 * generateActaNegativaRecibirAviso, generateAvisoTribunalArt47,
 * generateConvenioTerminacion, generateAnexoInstructivoRatificacion,
 * generatePropuestaBajaPDF), calculo.js (FALTAS_CATALOG)
 *
 * Tres ejes independientes (migración 38):
 *   · CAUSA REAL      — `#baja-tipo`, se guarda en bajas.tipo_baja. Es lo que
 *                       ve el reporte de rotación, lo que queda en el
 *                       expediente y lo que decide el cálculo legal (Art. 162
 *                       fr. III LFT) y qué aviso/acta se genera (Art. 47).
 *   · CÓMO SE DOCUMENTA — `#baja-doc-renuncia`. Permite imprimir carta de
 *                       renuncia aunque la causa real sea un despido.
 *   · CUÁNTO SE PAGA  — piso irrenunciable (calcFiniquito) + gratificación
 *                       negociada, comparada en la pantalla de propuesta.
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
          <div id="baja-borrador-aviso" class="form-group span-2" style="display:none;"></div>
          <div id="baja-resguardos-warning" class="form-group span-2" style="display:none;"></div>
          <div class="form-group">
            <label class="form-label" for="baja-tipo">Causa real de la baja (registro interno) <span class="req">*</span></label>
            <select id="baja-tipo" class="form-select" onchange="actualizarTipoBaja()" required aria-required="true">
              <option value="injustificada">Despido sin justificación (Liquidación)</option>
              <option value="renuncia">Renuncia voluntaria (Finiquito + Carta)</option>
              <option value="justificada">Rescisión justificada Art. 47 (Finiquito)</option>
            </select>
            <div class="helper-text">Se guarda siempre tal cual: es lo que aparece en el reporte de rotación.</div>
          </div>
          <div class="form-group">
            <label class="form-label" for="baja-fecha">Fecha de baja <span class="req">*</span></label>
            <input id="baja-fecha" type="date" class="form-input" value="${new Date().toISOString().split('T')[0]}" required aria-required="true" />
          </div>
          <div class="form-group span-2" id="baja-doc-renuncia-group" style="display:none;">
            <label class="form-label" style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-top:4px;">
              <input type="checkbox" id="baja-doc-renuncia"
                     style="width:16px;height:16px;accent-color:var(--gold-primary);"
                     onchange="actualizarTipoBaja()" />
              Documentar la baja <strong>como renuncia voluntaria</strong>
            </label>
            <div class="helper-text">El imprimible será una carta de renuncia y el cálculo pasa a finiquito (solo derechos irrenunciables). La causa real se sigue guardando internamente.</div>
          </div>
          <div class="form-group span-2" id="baja-doc-renuncia-aviso" style="display:none;">
            <div class="alert alert-warn"><svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg>
              <span>
                <strong>Antes de usar esta opción:</strong> la renuncia solo protege si el trabajador la firma libremente —
                firmada bajo presión es impugnable y no impide una demanda. El registro interno conserva la causa real
                y puede exhibirse. El instrumento con mayor certeza jurídica es un convenio de terminación
                ratificado ante el Centro de Conciliación.
              </span>
            </div>
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
              <span id="baja-antig-label">Incluir prima de antigüedad por acuerdo voluntario (si tiene menos de 15 años)</span>
            </label>
            <div class="helper-text" id="baja-antig-help">Con 15 años o más se incluye siempre, marques o no esta casilla.</div>
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

        <div style="border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:16px;">
          <div style="font-weight:700;margin-bottom:4px;">Propuesta de finiquito (opcional)</div>
          <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:14px;">
            Días de salario que se ofrecen <em>por encima</em> de lo que marca la ley. Es una liberalidad del patrón,
            no una prestación: se documenta como gratificación por terminación.
          </p>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label" for="baja-grat-base">Base de los días</label>
              <select id="baja-grat-base" class="form-select" onchange="_recalcGratDesdeDias()">
                <option value="sdi">SDI — salario diario integrado</option>
                <option value="diario">Salario diario (Art. 89 LFT)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="baja-grat-modo">Cómo se cuentan los días</label>
              <select id="baja-grat-modo" class="form-select" onchange="_recalcGratDesdeDias()">
                <option value="suma">Se suman al finiquito de ley</option>
                <option value="incluye">Los días son el paquete total</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="baja-grat-dias">Días propuestos</label>
              <input id="baja-grat-dias" type="number" class="form-input" min="0" step="1" placeholder="Ej. 60" oninput="_recalcGratDesdeDias()" />
            </div>
            <div class="form-group">
              <label class="form-label" for="baja-grat-monto">Gratificación por terminación</label>
              <input id="baja-grat-monto" type="number" class="form-input" min="0" step="0.01" value="0" oninput="_limpiarDiasGrat()" />
              <div class="helper-text" id="baja-grat-hint">Déjala en 0 si solo se pagará lo irrenunciable.</div>
            </div>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
            <button class="btn-secondary btn-sm" onclick="renderPropuestaBaja()">Comparar escenarios (15 a 90 días)</button>
          </div>
        </div>

        <div id="baja-error" class="error-msg" role="alert" style="display:none;margin-bottom:8px;"></div>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button class="btn-primary" onclick="handleProcesarBaja()">Calcular y generar documentos</button>
        </div>
      </div>
    `;

    window._trabListBajas = trabajadores;
    actualizarTipoBaja();
    if (preselId) precargarDatosBaja();

    document.getElementById('baja-fecha').addEventListener('change', function() {
      const d = new Date(this.value + 'T00:00:00');
      const esDic = d.getMonth() === 11;
      document.getElementById('baja-ag-group').style.display = esDic ? '' : 'none';
    });

    // Al volver de la pantalla de propuesta se restaura lo que ya se había capturado.
    if (window._bajaFormPendiente) {
      const s = window._bajaFormPendiente;
      window._bajaFormPendiente = null;
      _aplicarFormBaja(s);
    }
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

  _avisarBorradorPropuesta(id);

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

  const docGroup = eid('baja-doc-renuncia-group');
  const docChk   = eid('baja-doc-renuncia');
  const esRenunciaReal = tipo === 'renuncia';

  // La opción de documentar como renuncia solo tiene sentido cuando la causa
  // real NO es una renuncia (si ya lo es, el documento ya sería ese).
  if (docGroup) docGroup.style.display = esRenunciaReal ? 'none' : '';
  if (esRenunciaReal && docChk) docChk.checked = false;

  const docRenuncia = !esRenunciaReal && !!docChk?.checked;
  const aviso = eid('baja-doc-renuncia-aviso');
  if (aviso) aviso.style.display = docRenuncia ? '' : 'none';

  const msgs = {
    injustificada: `<svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg><span><strong>Despido sin justificación:</strong> Se generará el Recibo de Liquidación (incluye indemnización constitucional de 90 días SDI). No se emite aviso de rescisión: no hay causa que invocar, y un aviso sin causa acredita el despido injustificado.</span>`,
    renuncia:      `<svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg><span><strong>Renuncia voluntaria:</strong> Se generará Carta de Renuncia + Recibo de Finiquito (prestaciones proporcionales).</span>`,
    justificada:   `<svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg><span><strong>Rescisión con causa justificada (Art. 47):</strong> Se generará el Aviso de Rescisión del Art. 47 + Recibo de Finiquito. Captura la fracción y los hechos: sin aviso, la separación se presume injustificada.</span>`,
  };
  const msgDocumentada = `<svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg><span><strong>${tipo === 'injustificada' ? 'Despido sin justificación' : 'Rescisión justificada Art. 47'}, documentado como renuncia:</strong> internamente se registra la causa real; los imprimibles serán Carta de Renuncia + Recibo de finiquito y gratificación. El cálculo se limita a los derechos irrenunciables.</span>`;

  desc.innerHTML = docRenuncia ? msgDocumentada : (msgs[tipo] || '');
  desc.className = docRenuncia ? 'alert alert-warn'
    : tipo === 'injustificada' ? 'alert alert-warn'
    : tipo === 'justificada' ? 'alert alert-danger' : 'alert alert-info';

  // Prima de antigüedad: elegible tanto en la renuncia real como en la baja
  // documentada como renuncia (donde la separación NO fue voluntaria).
  antig.style.display = (esRenunciaReal || docRenuncia) ? '' : 'none';
  const lbl  = eid('baja-antig-label');
  const help = eid('baja-antig-help');
  if (lbl && help) {
    if (docRenuncia) {
      lbl.textContent = 'Incluir prima de antigüedad (12 días por año, tope 2 salarios mínimos)';
      help.textContent = 'Recomendado: la separación real no fue voluntaria, así que la prima de antigüedad se debe (Art. 162 LFT) sin importar la antigüedad. Excluirla deja fuera un derecho exigible.';
    } else {
      lbl.textContent = 'Incluir prima de antigüedad por acuerdo voluntario (si tiene menos de 15 años)';
      help.textContent = 'Con 15 años o más se incluye siempre, marques o no esta casilla.';
    }
  }

  // La captura del Art. 47 (fracción, hechos, testigos) depende de la CAUSA
  // REAL, no de cómo se vaya a documentar: aunque se imprima como renuncia,
  // el registro interno de la rescisión (tabla `rescisiones`, prescripción
  // del Art. 517) necesita estos datos igual.
  const art47 = eid('baja-art47-group');
  if (art47) {
    art47.style.display = tipo === 'justificada' ? '' : 'none';
    if (tipo === 'justificada') _llenarFraccionesArt47();
  }

  _recalcGratDesdeDias();
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

// ═══════════════════════════════════════════════════════
//  PARÁMETROS Y ESTADO DEL FORMULARIO
// ═══════════════════════════════════════════════════════

/** Lee el formulario y arma los parámetros del motor de cálculo. */
function _paramsDesdeForm() {
  const trabId  = eid('baja-trab')?.value;
  const tipo    = eid('baja-tipo')?.value;
  const fecha   = eid('baja-fecha')?.value;
  const salario = parseFloat(eid('baja-salario')?.value);
  if (!trabId || !tipo || !fecha || !salario) return null;

  const trab = (window._trabListBajas || []).find(t => t.id === trabId);
  if (!trab) return null;

  const vacGozadas  = eid('baja-vac-gozadas')?.checked ?? true;
  const docRenuncia = _documentarComoRenuncia();

  return {
    trab, trabId, tipo, fecha, docRenuncia,
    params: {
      startDate:            new Date(trab.fecha_ingreso + 'T00:00:00'),
      endDate:              new Date(fecha + 'T00:00:00'),
      salario,
      monthlySalary:        salario,
      periodoSalario:       eid('baja-periodo')?.value || trab.periodo_salario || 'mensual',
      smgZone:              trab.smg_zone || 'general',
      diasPendientes:       parseInt(eid('baja-dias')?.value) || 0,
      tieneAntig:           eid('baja-tiene-antig')?.checked || false,
      // calcFiniquito: Art. 162 fr. III LFT — el mínimo de 15 años para la
      // prima de antigüedad sólo aplica en la renuncia; en despido o
      // rescisión procede sin importar los años de servicio.
      motivo:               tipo,
      vacacionesPendientes: vacGozadas ? 0 : (parseInt(eid('baja-vac-pend')?.value) || 0),
      aguinaldoPagado:      eid('baja-ag-pagado')?.checked || false,
      baseDias:             eid('baja-grat-base')?.value || 'sdi',
      modo:                 eid('baja-grat-modo')?.value || 'suma',
    },
  };
}

function _documentarComoRenuncia() {
  return eid('baja-tipo')?.value !== 'renuncia' && !!eid('baja-doc-renuncia')?.checked;
}

/** ¿El cálculo base es finiquito? (todo menos el despido injustificado que se documenta como tal) */
function _usaFiniquito(tipo, docRenuncia) {
  return tipo !== 'injustificada' || docRenuncia;
}

function _leerFormBaja() {
  const g = id => eid(id)?.value;
  const c = id => !!eid(id)?.checked;
  return {
    trabId: g('baja-trab'), tipo: g('baja-tipo'), fecha: g('baja-fecha'),
    salario: g('baja-salario'), periodo: g('baja-periodo'), dias: g('baja-dias'),
    vacGozadas: c('baja-vac-gozadas'), vacPend: g('baja-vac-pend'),
    agPagado: c('baja-ag-pagado'), tieneAntig: c('baja-tiene-antig'),
    docRenuncia: c('baja-doc-renuncia'),
    gratBase: g('baja-grat-base'), gratModo: g('baja-grat-modo'),
    gratDias: g('baja-grat-dias'), gratMonto: g('baja-grat-monto'),
  };
}

function _aplicarFormBaja(s) {
  if (!s) return;
  const set  = (id, v) => { const el = eid(id); if (el && v != null && v !== '') el.value = v; };
  const chk  = (id, v) => { const el = eid(id); if (el) el.checked = !!v; };

  set('baja-trab', s.trabId);
  set('baja-tipo', s.tipo);
  set('baja-fecha', s.fecha);
  set('baja-salario', s.salario);
  set('baja-periodo', s.periodo);
  set('baja-dias', s.dias);
  chk('baja-vac-gozadas', s.vacGozadas);
  set('baja-vac-pend', s.vacPend);
  chk('baja-ag-pagado', s.agPagado);
  chk('baja-tiene-antig', s.tieneAntig);
  chk('baja-doc-renuncia', s.docRenuncia);
  set('baja-grat-base', s.gratBase);
  set('baja-grat-modo', s.gratModo);
  set('baja-grat-dias', s.gratDias);
  set('baja-grat-monto', s.gratMonto);

  const vacGroup = eid('baja-vac-pend-group');
  if (vacGroup) vacGroup.style.display = s.vacGozadas ? 'none' : '';
  const agGroup = eid('baja-ag-group');
  if (agGroup && s.fecha) agGroup.style.display = new Date(s.fecha + 'T00:00:00').getMonth() === 11 ? '' : 'none';

  actualizarTipoBaja();
}

/** Al escribir un importe a mano, los días dejan de mandar. */
function _limpiarDiasGrat() {
  const d = eid('baja-grat-dias');
  if (d) d.value = '';
  const hint = eid('baja-grat-hint');
  if (hint) hint.textContent = 'Importe capturado a mano.';
}

/** Recalcula la gratificación cuando se capturan días (no cuando se captura el importe). */
function _recalcGratDesdeDias() {
  const diasEl = eid('baja-grat-dias');
  const montoEl = eid('baja-grat-monto');
  const hint = eid('baja-grat-hint');
  if (!diasEl || !montoEl) return;

  const dias = parseFloat(diasEl.value);
  if (!(dias > 0)) return;

  const ctx = _paramsDesdeForm();
  if (!ctx) {
    if (hint) hint.textContent = 'Selecciona trabajador, fecha y salario para calcular el importe.';
    return;
  }

  const propuesta = calcPropuestaBaja({ ...ctx.params, diasEscenarios: [dias] });
  const esc = propuesta.escenarios.find(e => e.dias === dias);
  if (!esc) return;

  montoEl.value = esc.gratificacion.toFixed(2);
  if (hint) {
    hint.textContent = esc.insuficiente
      ? `Atención: ${dias} días (${fmt(esc.montoDias)}) NO cubren el finiquito de ley (${fmt(esc.finiquito)}). Faltan ${fmt(esc.faltante)}.`
      : `${dias} días × ${fmt(propuesta.base)} (${propuesta.baseDias === 'sdi' ? 'SDI' : 'salario diario'}) — total a pagar ${fmt(esc.total)}.`;
  }
}

// ═══════════════════════════════════════════════════════
//  PANTALLA DE PROPUESTA (escenarios)
// ═══════════════════════════════════════════════════════
function renderPropuestaBaja() {
  const err = eid('baja-error');
  const ctx = _paramsDesdeForm();
  if (!ctx) {
    if (err) { err.textContent = 'Selecciona trabajador, causa, fecha y salario antes de comparar escenarios.'; err.style.display = ''; }
    return;
  }
  if (err) err.style.display = 'none';

  const formState = _leerFormBaja();
  const diasManual = parseFloat(eid('baja-grat-dias')?.value) || 0;
  const propuesta = calcPropuestaBaja({ ...ctx.params, diasManual });

  window._propuestaCtx = { ...ctx, propuesta, formState, propuestaId: window._propuestaCtx?.propuestaId || null };

  const { trab, params } = ctx;
  const fin = propuesta.finiquito;
  const liq = propuesta.liquidacionRef;
  const baseLabel = propuesta.baseDias === 'sdi' ? 'SDI' : 'salario diario';
  const modoLabel = propuesta.modo === 'incluye' ? 'los días son el paquete total' : 'los días se suman al finiquito';

  const filas = propuesta.escenarios.map((e, i) => `
    <tr style="${e.insuficiente ? 'background:rgba(220,38,38,.08);' : ''}">
      <td><strong>${escapeHtml(e.etiqueta)}</strong>${e.insuficiente ? '<br><span style="font-size:.75rem;color:var(--red-danger,#dc2626);">No cubre el mínimo de ley — faltan ' + fmt(e.faltante) + '</span>' : ''}</td>
      <td style="color:var(--text-muted);font-size:.82rem;">${e.dias ? `${e.dias} × ${fmt(e.base)}` : '—'}</td>
      <td style="text-align:right;">${fmt(e.finiquito)}</td>
      <td style="text-align:right;">${fmt(e.gratificacion)}</td>
      <td style="text-align:right;font-weight:700;">${fmt(e.total)}</td>
      <td style="text-align:right;color:var(--text-muted);">${e.isr != null ? fmt(e.isr) : '—'}</td>
      <td style="text-align:right;font-weight:700;color:var(--green-ok);">${e.neto != null ? fmt(e.neto) : '—'}</td>
      <td style="text-align:right;color:var(--text-muted);">${e.pctVsLiquidacion != null ? (e.pctVsLiquidacion*100).toFixed(0) + '%' : '—'}</td>
      <td style="text-align:right;"><button class="btn-secondary btn-sm" onclick="_elegirEscenario(${i})">Elegir</button></td>
    </tr>`).join('');

  eid('main-view').innerHTML = `
    <div class="view-header animate-in">
      <div>
        <div class="view-title">Propuesta de salida</div>
        <div class="view-subtitle">${escapeHtml(trab.nombre)} · ${formatDateShort(ctx.fecha)} · base: ${baseLabel}, ${modoLabel}</div>
      </div>
      <button class="btn-secondary" onclick="_volverAFormBaja()">← Volver al formulario</button>
    </div>

    <div style="max-width:1080px;margin:0 auto;">
      <div class="alert alert-info animate-in" style="margin-bottom:16px;">
        <svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg>
        <span>
          <strong>Documento de trabajo interno.</strong> El finiquito de ley (${fmt(fin.total)}) es el piso irrenunciable:
          se debe aunque el papel diga renuncia. La gratificación es una liberalidad del patrón.
          La referencia de liquidación completa (${fmt(liq.total)}) es lo que costaría si el asunto termina en juicio
          y el patrón no reinstala (Arts. 48 y 50 LFT).
        </span>
      </div>

      <div class="card animate-in">
        <div class="card-header"><span class="card-title">Escenarios</span></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>
              <th>Escenario</th><th>Días × base</th>
              <th style="text-align:right;">Finiquito de ley</th>
              <th style="text-align:right;">Gratificación</th>
              <th style="text-align:right;">Total bruto</th>
              <th style="text-align:right;">ISR estimado</th>
              <th style="text-align:right;">Neto estimado</th>
              <th style="text-align:right;">vs liquidación</th>
              <th></th>
            </tr></thead>
            <tbody>
              ${filas}
              <tr style="background:var(--gold-dim);">
                <td><strong>Liquidación completa (referencia)</strong><br><span style="font-size:.75rem;color:var(--text-muted);">Arts. 48 y 50 LFT — 90 días + 20 días por año + prima de antigüedad</span></td>
                <td style="color:var(--text-muted);font-size:.82rem;">—</td>
                <td style="text-align:right;">—</td>
                <td style="text-align:right;">—</td>
                <td style="text-align:right;font-weight:700;">${fmt(liq.total)}</td>
                <td style="text-align:right;color:var(--text-muted);">—</td>
                <td style="text-align:right;color:var(--text-muted);">—</td>
                <td style="text-align:right;color:var(--text-muted);">100%</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style="font-size:.78rem;color:var(--text-muted);margin-top:12px;">
          El ISR es una estimación: exención de 90 UMA por año de servicio sobre indemnizaciones y prima de antigüedad
          (Art. 93 fr. XIII LISR), 30 UMA de aguinaldo y 15 UMA de prima vacacional. El cálculo definitivo lo confirma el contador.
        </p>
      </div>

      <div class="card animate-in" style="animation-delay:.1s;margin-top:16px;">
        <div class="form-group">
          <label class="form-label" for="prop-notas">Notas de la negociación (opcional)</label>
          <textarea id="prop-notas" class="form-input" rows="2" placeholder="Ej. el trabajador pidió 90 días; se autorizó hasta 60."></textarea>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
          <button class="btn-secondary" onclick="_descargarPropuestaPDF(this)">Descargar hoja de propuesta</button>
          <button class="btn-primary" onclick="_guardarBorradorPropuesta(this)">Guardar borrador</button>
        </div>
      </div>
    </div>
  `;
}

function _volverAFormBaja() {
  const ctx = window._propuestaCtx;
  window._bajaFormPendiente = ctx?.formState || null;
  renderBajas(ctx?.trabId);
}

function _elegirEscenario(idx) {
  const ctx = window._propuestaCtx;
  const esc = ctx?.propuesta?.escenarios?.[idx];
  if (!esc) return;

  window._bajaFormPendiente = {
    ...ctx.formState,
    gratDias:  esc.dias || '',
    gratMonto: esc.gratificacion.toFixed(2),
  };
  renderBajas(ctx.trabId);
  if (typeof showToast === 'function') {
    showToast(`Escenario aplicado: ${esc.etiqueta} — total ${fmt(esc.total)}`, 'success');
  }
}

async function _guardarBorradorPropuesta(btn) {
  const ctx = window._propuestaCtx;
  if (!ctx) return;
  btnCargando(btn, 'Guardando…');
  try {
    const elegido = ctx.propuesta.escenarios.find(e =>
      Math.abs(e.gratificacion - (parseFloat(ctx.formState.gratMonto) || 0)) < 0.01) || null;

    const fila = await db.guardarPropuestaBaja({
      trabajador_id:       ctx.trabId,
      creado_por:          CTX.user?.id || null,
      estado:              'borrador',
      causa_real:          ctx.tipo,
      documentar_como:     ctx.docRenuncia ? 'renuncia' : 'causa_real',
      fecha_baja_estimada: ctx.fecha,
      salario_al_momento:  ctx.params.salario,
      periodo_salario:     ctx.params.periodoSalario,
      params_json:         ctx.formState,
      escenarios_json:     ctx.propuesta.escenarios,
      dias_elegidos:       elegido?.dias ?? null,
      monto_acordado:      parseFloat(ctx.formState.gratMonto) || 0,
      notas:               eid('prop-notas')?.value || null,
    }, CTX.empresa.id);

    window._propuestaCtx.propuestaId = fila?.id || null;
    if (typeof showToast === 'function') showToast('Borrador guardado. Puedes retomarlo desde el formulario de bajas.', 'success');
  } catch(e) {
    showError(e);
  } finally {
    btnRestaurar(btn);
  }
}

function _descargarPropuestaPDF(btn) {
  const ctx = window._propuestaCtx;
  if (!ctx || typeof generatePropuestaBajaPDF !== 'function') return;
  btnCargando(btn, 'Generando PDF…');
  setTimeout(() => {
    try {
      generatePropuestaBajaPDF(CTX.empresa, { ...ctx.trab, fecha_baja: ctx.fecha }, ctx.propuesta, ctx.sucursalTrab || null);
    } catch(e) {
      showError(e);
    } finally {
      btnRestaurar(btn);
    }
  }, 50);
}

/** Aviso de que el trabajador ya tiene una propuesta guardada sin aplicar. */
async function _avisarBorradorPropuesta(trabajadorId) {
  const el = eid('baja-borrador-aviso');
  if (!el) return;
  el.style.display = 'none';
  el.innerHTML = '';
  try {
    const p = await db.getPropuestaBaja(trabajadorId);
    if (!p) return;
    window._borradorPropuesta = p;
    el.style.display = '';
    el.innerHTML = `
      <div class="alert alert-info"><svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg>
        <span>
          Hay una <strong>propuesta guardada</strong> del ${formatDateShort(p.creado_en)}${p.monto_acordado > 0 ? ` por ${fmt(p.monto_acordado)}` : ''}.
          <button class="btn-secondary btn-sm" style="margin-left:8px;" onclick="_retomarBorradorPropuesta()">Retomar</button>
          <button class="btn-secondary btn-sm" onclick="_descartarBorradorPropuesta(this)">Descartar</button>
        </span>
      </div>`;
  } catch(e) {
    console.warn('No se pudo consultar la propuesta guardada:', e.message);
  }
}

function _retomarBorradorPropuesta() {
  const p = window._borradorPropuesta;
  if (!p?.params_json) return;
  _aplicarFormBaja(p.params_json);
  window._propuestaCtx = { propuestaId: p.id };
  if (typeof showToast === 'function') showToast('Propuesta retomada.', 'success');
}

async function _descartarBorradorPropuesta(btn) {
  const p = window._borradorPropuesta;
  if (!p) return;
  const ok = typeof showConfirmacion === 'function'
    ? await showConfirmacion('Se descartará la propuesta guardada. El trabajador sigue activo.', { titulo:'Descartar propuesta', textoOk:'Descartar', peligro:true })
    : true;
  if (!ok) return;
  try {
    await db.descartarPropuestaBaja(p.id);
    window._borradorPropuesta = null;
    const el = eid('baja-borrador-aviso');
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
    if (typeof showToast === 'function') showToast('Propuesta descartada.', 'info');
  } catch(e) { showError(e); }
}

// ═══════════════════════════════════════════════════════
//  PROCESAR LA BAJA
// ═══════════════════════════════════════════════════════
async function handleProcesarBaja() {
  const err = eid('baja-error');
  err.style.display = 'none';

  const ctx = _paramsDesdeForm();
  if (!ctx) {
    err.textContent = 'Selecciona trabajador, tipo de baja, fecha y salario.';
    err.style.display = ''; return;
  }
  const { trabId, tipo, fecha, docRenuncia, params } = ctx;

  const trab = await db.getTrabajador(trabId);
  if (!trab) { err.textContent = 'Trabajador no encontrado.'; err.style.display=''; return; }
  const sucursalTrab = trab.sucursal_id ? await db.getSucursal(trab.sucursal_id) : null;

  // Datos del Art. 47 — obligatorios en la rescisión justificada. Dependen de
  // la CAUSA REAL, no de cómo se vaya a documentar: la tabla `rescisiones` y
  // la prescripción del Art. 517 necesitan estos datos aunque el imprimible
  // termine siendo una carta de renuncia.
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

  const documentadoComo = docRenuncia ? 'renuncia' : 'causa_real';

  // El cálculo depende del salario mínimo y la UMA vigentes (tope de la prima de
  // antigüedad, Art. 162 fr. II LFT). Si no están configurados para el ejercicio
  // en curso, vigencias.js lanza en vez de calcular con cifras caducas: el error
  // debe verse, no morir como promesa rechazada.
  let result;
  try {
    result = _usaFiniquito(tipo, docRenuncia) ? calcFiniquito(params) : calcLiquidacion(params);
  } catch (e) {
    err.textContent = friendlyError(e);
    err.style.display = '';
    return;
  }

  // Gratificación: se guarda APARTE de result.items para que el recibo pueda
  // separar visiblemente lo que es prestación de ley de lo que es liberalidad.
  const gratificacion = Math.max(0, parseFloat(eid('baja-grat-monto')?.value) || 0);
  result.gratificacion = gratificacion;
  result.gratificacionDias = parseFloat(eid('baja-grat-dias')?.value) || null;
  result.gratificacionBase = params.baseDias;
  result.gratificacionModo = params.modo;
  result.totalPagar = parseFloat((result.total + gratificacion).toFixed(2));
  result.documentadoComo = documentadoComo;
  result.causaReal = tipo;
  result.fiscal = typeof calcFiscalBaja === 'function' ? calcFiscalBaja(result, { gratificacion }) : null;

  const trabajadorPdf = { ...trab, salario_mensual: params.salario, fecha_baja: fecha };

  const tipoLabel = { injustificada:'Despido injustificado', renuncia:'Renuncia voluntaria', justificada:'Rescisión justificada Art. 47' }[tipo] || tipo;
  // Sin maximumFractionDigits, toLocaleString con minimumFractionDigits:2
  // llegaba a imprimir 3 decimales ($32,039.934). fmt() de calculo.js usa
  // style:'currency', que fija los 2 decimales del peso.
  const fmtMx = fmt;

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
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Causa real</span><span>${tipoLabel}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Se documenta como</span><span>${documentadoComo === 'renuncia' ? 'Renuncia voluntaria' : 'La causa real'}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Fecha de baja</span><span>${formatDateShort(fecha)}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">${result.type === 'liquidacion' ? 'Liquidación' : 'Finiquito'} de ley</span><span>${fmtMx(result.total)}</span></div>
          ${gratificacion > 0 ? `<div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Gratificación por acuerdo</span><span>${fmtMx(gratificacion)}</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);padding-top:10px;margin-top:2px;"><span style="color:var(--text-muted);">Total bruto</span><strong style="color:var(--gold-primary);font-size:1rem;">${fmtMx(result.totalPagar)}</strong></div>
          ${result.fiscal ? `<div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Neto estimado (menos ISR)</span><span>${fmtMx(result.fiscal.neto)}</span></div>` : ''}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-danger" onclick="closeModal();_confirmarBaja()">Confirmar baja</button>
      </div>
    </div>
  `);

  // Todo lo que necesita _confirmarBaja se congela aquí: no debe volver a leer
  // el formulario, que para entonces puede haber cambiado.
  window._pendingBaja = {
    trabId, fecha, tipo, documentadoComo, salario: params.salario,
    diasPendientes: params.diasPendientes, tieneAntig: params.tieneAntig, gratificacion,
    result, trab, trabajadorPdf, sucursalTrab, datosArt47,
  };
}

async function _confirmarBaja() {
  const { trabId, fecha, tipo, documentadoComo, salario, diasPendientes, tieneAntig, gratificacion,
          result, trab, trabajadorPdf, sucursalTrab, datosArt47 } = window._pendingBaja || {};
  if (!trabId) return;
  const err = eid('baja-error');
  // B-4: esta secuencia tiene dos escrituras que NO son atómicas entre sí
  // (createBaja + darDeBaja) — si la primera tiene éxito y la segunda falla
  // (ej. conflicto de optimistic locking), el trabajador queda "a medias":
  // existe un registro en `bajas` pero su `estado` sigue activo. Se avisa
  // explícitamente en ese caso en vez de mostrar solo el error crudo.
  let bajaRegistrada = false;
  try {
    const baja = await db.createBaja({
      trabajador_id: trabId, fecha_baja: fecha,
      // tipo_baja SIEMPRE es la causa real; el documento lo decide documentado_como
      tipo_baja: tipo,
      documentado_como: documentadoComo,
      incluye_prima_antiguedad: !!tieneAntig,
      gratificacion_dias:  result.gratificacionDias,
      gratificacion_base:  gratificacion > 0 ? result.gratificacionBase : null,
      gratificacion_modo:  gratificacion > 0 ? result.gratificacionModo : null,
      gratificacion_monto: gratificacion,
      salario_al_momento: salario, dias_pendientes: diasPendientes,
      calculo_json: result,
      propuesta_json: window._propuestaCtx?.propuesta?.escenarios || null,
    }, CTX.empresa.id);
    bajaRegistrada = true;

    await db.darDeBaja(trabId, tipo, fecha, trab?.updated_at);

    // Migración 19: movimiento IMSS de baja — es un registro complementario,
    // su falla no debe impedir cerrar la baja (ya consumada arriba).
    // Cuando la baja se documenta como renuncia, el aviso al IMSS usa la causa
    // '02' (separación voluntaria) para no contradecir el papel que se firmó.
    if (typeof registrarMovimientoIMSS === 'function') {
      await registrarMovimientoIMSS(CTX.empresa.id, trabId, 'baja', {
        causaBaja: documentadoComo === 'renuncia' ? '02' : _causaBajaDesdeTipo(tipo),
        fecha,
      });
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

    // La propuesta se cierra al final: si falla, la baja ya quedó bien y solo
    // se queda un borrador huérfano que el usuario puede descartar a mano.
    const propuestaId = window._propuestaCtx?.propuestaId || window._borradorPropuesta?.id;
    if (propuestaId) {
      try { await db.marcarPropuestaAplicada(propuestaId, baja?.id); }
      catch(e) { console.warn('La baja se registró pero la propuesta sigue como borrador:', e.message); }
    }
    window._propuestaCtx = null;
    window._borradorPropuesta = null;

    showResumenBaja(trab, result, tipo, CTX.empresa, trabajadorPdf, sucursalTrab, datosArt47, documentadoComo);
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

// Renuncias masivas "voluntarias" en poco tiempo son un patrón que los
// Tribunales asocian con renuncias inducidas para evitar el pago de
// indemnizaciones (constructive/simulated resignations). No se puede saber
// con certeza si una renuncia es genuina, pero sí advertir cuando el patrón
// de uso es inusual, para que quien la genera lo confirme a sabiendas.
// sessionStorage (no localStorage): la advertencia es por sesión de trabajo,
// no un límite permanente — quien de verdad procesa varias renuncias legítimas
// en un día puede seguir, sólo confirmando cada vez a partir del umbral.
const UMBRAL_RENUNCIAS_SESION = 3;

function _contarRenunciasSesion(empresaId) {
  return parseInt(sessionStorage.getItem(`renuncias_generadas_${empresaId}`) || '0', 10);
}

async function _generarCartaRenunciaConAviso(empresa, trab, sucursal) {
  const previas = _contarRenunciasSesion(empresa.id);
  if (previas >= UMBRAL_RENUNCIAS_SESION) {
    const seguir = await showConfirmacion(
      `Ya se han generado ${previas} cartas de renuncia en esta sesión para esta empresa. ` +
      `Un volumen inusual de renuncias "voluntarias" en poco tiempo es un patrón que los ` +
      `Tribunales asocian con renuncias inducidas o simuladas para evitar el pago de ` +
      `indemnizaciones. Verifica que ésta responda a una decisión verdaderamente ` +
      `individual y voluntaria del trabajador antes de continuar.`,
      { titulo: 'Varias renuncias en esta sesión', textoOk: 'Generar de todas formas', textoCancelar: 'Cancelar', peligro: true }
    );
    if (!seguir) return;
  }
  sessionStorage.setItem(`renuncias_generadas_${empresa.id}`, String(previas + 1));
  generateCartaRenuncia(empresa, trab, sucursal);
}

function showResumenBaja(trab, result, tipo, empresa, trabajadorPdf, sucursal = null, datosArt47 = null, documentadoComo = 'causa_real') {
  const main = eid('main-view');
  const esRenunciaDocumentada = documentadoComo === 'renuncia';

  const d47 = datosArt47 || {};

  // Datos del Convenio de Terminación por motivo — documento OPCIONAL pensado
  // para ratificarse ante el Centro de Conciliación (Art. 33 LFT) y cerrar el
  // asunto con efecto de cosa juzgada, algo que el recibo por sí solo no
  // logra. En 'justificada' reutiliza la fracción y los testigos ya
  // capturados para el aviso, para no pedirlos dos veces.
  const datosConvenio = tipo === 'justificada'
    ? {
        motivo: 'justificada',
        fraccion_art47: d47.fraccion_art47,
        fecha_aviso: d47.fecha_efectos,
        fecha_efectos: d47.fecha_efectos,
        testigo1_nombre: d47.testigo1_nombre, testigo1_ine: d47.testigo1_ine, testigo1_domicilio: d47.testigo1_domicilio,
        testigo2_nombre: d47.testigo2_nombre, testigo2_ine: d47.testigo2_ine, testigo2_domicilio: d47.testigo2_domicilio,
      }
    : { motivo: tipo };

  const docsConfig = {
    // Sin causa que invocar no hay aviso del Art. 47 que emitir. El aviso que se
    // generaba antes citaba los arts. 49 y 50 y anunciaba una indemnización:
    // era una confesión escrita de despido injustificado.
    injustificada: [
      { icon:'', titulo:'Recibo de Liquidación', desc:'Desglose completo de la liquidación',              fn: () => generateRecibo(empresa, trabajadorPdf, result, sucursal) },
      { icon:'', titulo:'Convenio de Terminación (opcional)', desc:'Para ratificar ante el Centro de Conciliación y cerrar el asunto con efecto de cosa juzgada (Art. 33 LFT)', fn: () => generateConvenioTerminacion(empresa, trabajadorPdf, result, datosConvenio, sucursal) },
      { icon:'', titulo:'Anexo — Instructivo de Ratificación', desc:'Explica el trámite; no se firma',     fn: () => generateAnexoInstructivoRatificacion(empresa, trabajadorPdf, sucursal) },
    ],
    renuncia: [
      { icon:'', titulo:'Carta de Renuncia',    desc:'Renuncia voluntaria e irrevocable — documento unilateral del trabajador', fn: () => _generarCartaRenunciaConAviso(empresa, trabajadorPdf, sucursal) },
      { icon:'', titulo:'Recibo de Finiquito',   desc:'Desglose de prestaciones proporcionales',           fn: () => generateRecibo(empresa, trabajadorPdf, result, sucursal) },
      { icon:'', titulo:'Convenio de Terminación (opcional)', desc:'Para ratificar ante el Centro de Conciliación y cerrar el asunto con efecto de cosa juzgada (Art. 33 LFT)', fn: () => generateConvenioTerminacion(empresa, trabajadorPdf, result, datosConvenio, sucursal) },
      { icon:'', titulo:'Anexo — Instructivo de Ratificación', desc:'Explica el trámite; no se firma',     fn: () => generateAnexoInstructivoRatificacion(empresa, trabajadorPdf, sucursal) },
    ],
    justificada: [
      { icon:'', titulo:'Aviso de Rescisión (Art. 47)', desc:'Aviso con la fracción invocada y los hechos. Entrégalo en persona y recaba el acuse.', fn: () => generateAvisoRescisionArt47(empresa, trabajadorPdf, d47, sucursal) },
      { icon:'', titulo:'Recibo de Finiquito',   desc:'Desglose de prestaciones proporcionales',           fn: () => generateRecibo(empresa, trabajadorPdf, result, sucursal) },
      { icon:'', titulo:'Convenio de Terminación (opcional)', desc:'Para ratificar ante el Centro de Conciliación; no sustituye ni modifica el aviso de rescisión ya notificado (Art. 33 LFT)', fn: () => generateConvenioTerminacion(empresa, trabajadorPdf, result, datosConvenio, sucursal) },
      { icon:'', titulo:'Anexo — Instructivo de Ratificación', desc:'Explica el trámite; no se firma',     fn: () => generateAnexoInstructivoRatificacion(empresa, trabajadorPdf, sucursal) },
    ],
  };
  // Si el trabajador se negó a recibir, el aviso al Tribunal tiene plazo fatal
  // de cinco días hábiles (Art. 47); sin él la separación se presume injustificada.
  // Se agrega ANTES de decidir `docs`: si se documenta como renuncia esta rama
  // no se imprime, pero el registro interno (docsConfig.justificada) debe
  // reflejar la realidad por si se destapa la causa real más adelante.
  if (tipo === 'justificada' && d47.aviso_rechazado) {
    docsConfig.justificada.push(
      { icon:'', titulo:'Acta de Negativa a Recibir el Aviso', desc:'Acta circunstanciada con testigos identificados', fn: () => generateActaNegativaRecibirAviso(empresa, trabajadorPdf, d47, sucursal) },
      { icon:'', titulo:'Aviso al Tribunal Laboral', desc:'PLAZO FATAL: cinco días hábiles desde la rescisión (Art. 47 LFT)', fn: () => generateAvisoTribunalArt47(empresa, trabajadorPdf, d47, sucursal) },
    );
  }

  const docs = esRenunciaDocumentada
    ? [
        { icon:'', titulo:'Carta de Renuncia', desc:'Renuncia voluntaria e irrevocable (Art. 51 LFT)', fn: () => generateCartaRenuncia(empresa, trabajadorPdf, sucursal) },
        { icon:'', titulo:'Recibo de finiquito y gratificación', desc:'Prestaciones de ley y gratificación por acuerdo, en bloques separados', fn: () => generateRecibo(empresa, trabajadorPdf, result, sucursal) },
      ]
    : (docsConfig[tipo] || []);

  // Sin maximumFractionDigits, toLocaleString con minimumFractionDigits:2
  // llegaba a imprimir 3 decimales ($32,039.934). fmt() de calculo.js usa
  // style:'currency', que fija los 2 decimales del peso.
  const fmtMx = fmt;
  const grat = result.gratificacion || 0;
  const totalPagar = result.totalPagar ?? result.total;

  const causaLabel = {injustificada:'Despido sin justificación',renuncia:'Renuncia voluntaria',justificada:'Rescisión justificada Art. 47'}[tipo];

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
              ${causaLabel}${esRenunciaDocumentada ? ' · documentada como renuncia' : ''}
              · ${formatDateShort(trabajadorPdf.fecha_baja)}
            </div>
          </div>
        </div>

        ${esRenunciaDocumentada ? `
        <div class="alert alert-warn" style="margin-bottom:16px;">
          <svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg>
          <span>Internamente quedó registrada como <strong>${causaLabel}</strong>; los documentos emitidos son de renuncia voluntaria. El aviso de baja al IMSS se registró con causa 02 (separación voluntaria) para coincidir con el documento.</span>
        </div>` : ''}

        <div style="background:var(--gold-dim);border:1px solid var(--gold-border);border-radius:var(--radius-md);padding:20px;text-align:center;margin-bottom:20px;">
          <div style="font-size:.78rem;font-weight:700;color:var(--gold-primary);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">
            ${result.type === 'liquidacion' ? 'LIQUIDACIÓN' : 'FINIQUITO'} TOTAL
          </div>
          <div style="font-size:2.4rem;font-weight:700;color:var(--gold-light);">${fmtMx(totalPagar)}</div>
          <div style="font-size:.8rem;color:var(--text-secondary);margin-top:4px;">
            Monto bruto antes de retenciones fiscales (ISR)${result.fiscal ? ` · neto estimado ${fmtMx(result.fiscal.neto)}` : ''}
          </div>
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
              ${grat > 0 ? `
              <tr>
                <td colspan="2" style="font-weight:700;">Subtotal prestaciones de ley</td>
                <td style="text-align:right;font-weight:700;">${fmtMx(result.total)}</td>
              </tr>
              <tr>
                <td><strong>Gratificación por terminación</strong><br><span style="font-size:.75rem;color:var(--text-muted);">Por acuerdo de las partes — no es prestación de ley</span></td>
                <td style="color:var(--text-muted);font-size:.82rem;">${result.gratificacionDias ? `${result.gratificacionDias} días × ${result.gratificacionBase === 'sdi' ? 'SDI' : 'salario diario'}` : 'Monto acordado'}</td>
                <td style="text-align:right;font-weight:700;color:var(--green-ok);">${fmtMx(grat)}</td>
              </tr>` : ''}
              <tr style="background:var(--gold-dim);">
                <td colspan="2" style="font-weight:700;font-size:1rem;">TOTAL</td>
                <td style="text-align:right;font-weight:700;font-size:1rem;color:var(--gold-primary);">${fmtMx(totalPagar)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        ${result.fiscal ? `
        <div style="margin-top:16px;border:1px solid var(--border);border-radius:var(--radius-md);padding:14px 16px;font-size:.85rem;">
          <div style="font-weight:700;margin-bottom:8px;">ISR estimado</div>
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Exento</span><span>${fmtMx(result.fiscal.exentoTotal)}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Gravado</span><span>${fmtMx(result.fiscal.gravadoTotal)}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Retención estimada</span><span>${fmtMx(result.fiscal.isr)}</span></div>
          <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);padding-top:8px;margin-top:8px;font-weight:700;"><span>Neto estimado</span><span>${fmtMx(result.fiscal.neto)}</span></div>
          <p style="font-size:.76rem;color:var(--text-muted);margin-top:8px;">Estimación con la exención de 90 UMA por año de servicio (Art. 93 fr. XIII LISR). El cálculo definitivo lo confirma el contador.</p>
        </div>` : ''}
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

  setTimeout(async () => {
    try {
      await docCfg.fn();
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
