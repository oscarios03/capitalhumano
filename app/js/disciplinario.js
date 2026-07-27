/**
 * Capital Humano MX — Módulo Disciplinario
 * Depende de: app.js (CTX, eid, navigate, showModal, closeModal, db, FALTAS_CATALOG, helpers)
 */

// ═══════════════════════════════════════════════════════
//  ACTAS ADMINISTRATIVAS
// ═══════════════════════════════════════════════════════
async function renderDisciplinario() {
  const _gen = typeof _navGen !== 'undefined' ? _navGen : 0;
  try {
    const [actas, trabajadores] = await Promise.all([
      db.getActas(),
      db.getTrabajadores({ estado:'activo' }),
    ]);
    if (typeof _navStale === 'function' && _navStale(_gen)) return;
    window._trabListActas = trabajadores;
    const main = eid('main-view');
    main.innerHTML = `
      <div class="view-header animate-in">
        <div><div class="view-title">Actas Administrativas</div></div>
        <button class="btn-primary" onclick="showModalActa(null)">+ Nueva acta</button>
      </div>
      <div class="search-bar animate-in">
        <select class="form-select" style="max-width:220px;" id="filtro-acta-trab" onchange="filtrarActas()">
          <option value="">Todos los trabajadores</option>
          ${trabajadores.map(t=>`<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('')}
        </select>
        <select class="form-select" style="max-width:180px;" id="filtro-acta-tipo" onchange="filtrarActas()">
          <option value="">Todos los tipos</option>
          <option value="amonestacion">Amonestación</option>
          <option value="formal">Acta Formal</option>
          <option value="rescisoria">Rescisoria</option>
        </select>
      </div>
      <div class="table-wrap animate-in">
        <table class="data-table" id="tabla-actas">
          <thead><tr><th>Trabajador</th><th>Tipo</th><th>Falta</th><th>Fecha</th><th>Reincidente</th><th>Acciones</th></tr></thead>
          <tbody>
            ${actas.length === 0
              ? `<tr><td colspan="6"><div class="empty-state"><div class="empty-state-icon"><svg class="ic"><use href="#i-check-circle"></use></svg></div><div class="empty-state-title">Sin actas registradas</div></div></td></tr>`
              : actas.map(a=>`<tr data-trab="${a.trabajador_id}" data-tipo="${a.tipo}">
                  <td><strong>${escapeHtml(a.trabajadores?.nombre)||'—'}</strong></td>
                  <td>${badgeActa(a.tipo)}</td>
                  <td style="font-size:.82rem;color:var(--text-muted);">${escapeHtml(a.tipo_falta_label||a.tipo_falta)||'—'}</td>
                  <td>${formatDateShort(a.fecha)}</td>
                  <td>${a.reincidente?'<span style="color:var(--red-warn)">Sí</span>':'No'}</td>
                  <td><div class="actions">
                    <button class="btn-secondary btn-sm" onclick="reDescargarActa('${a.id}','${a.trabajador_id}')">PDF</button>
                    <button class="btn-secondary btn-sm" style="border-color:var(--gold-border);color:var(--gold-primary);"
                      onclick="abrirAgenteIA('${a.trabajador_id}','acta_${a.tipo}')">IA</button>
                    <button class="btn-secondary btn-sm" onclick="navigate('empleado','${a.trabajador_id}')">Ver perfil</button>
                    ${htmlBotonWhatsApp(a.trabajadores?.telefono, `Hola ${a.trabajadores?.nombre||''}, se te cita para el levantamiento de un acta administrativa (${a.tipo_falta_label||a.tipo_falta||''}) el ${formatDateShort(a.fecha)}${a.hora_falta?` a las ${a.hora_falta}`:''}${a.lugar?` en ${a.lugar}`:''}. Favor de confirmar tu asistencia.`, { ocultarSiFalta: true })}
                  </div></td>
                </tr>`).join('')
            }
          </tbody>
        </table>
      </div>
    `;
  } catch(e) { showError(e); }
}

function filtrarActas() {
  const trab = eid('filtro-acta-trab')?.value;
  const tipo  = eid('filtro-acta-tipo')?.value;
  document.querySelectorAll('#tabla-actas tbody tr[data-trab]').forEach(tr => {
    const mt = !trab || tr.dataset.trab === trab;
    const mti = !tipo || tr.dataset.tipo === tipo;
    tr.style.display = (mt && mti) ? '' : 'none';
  });
}

function showModalActa(trabId, tipoPresel, faltaPresel) {
  const trabList = window._trabListActas || [];

  showModal(`
    <div class="modal animate-in" style="max-width:720px;">
      <div class="modal-header">
        <div><div class="modal-title">Nueva Acta Administrativa</div></div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div class="form-grid">
        <div class="form-group span-2">
          <label class="form-label" for="ac-trab">Trabajador <span class="req">*</span></label>
          <select id="ac-trab" class="form-select" required aria-required="true">
            <option value="">— Seleccionar —</option>
            ${trabList.map(t=>`<option value="${t.id}" ${t.id===trabId?'selected':''}>${escapeHtml(t.nombre)} — ${escapeHtml(t.puesto)||''}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="ac-tipo">Tipo de acta <span class="req">*</span></label>
          <select id="ac-tipo" class="form-select" onchange="actualizarCatalogoFaltas()" required aria-required="true">
            <option value="amonestacion" ${tipoPresel==='amonestacion'?'selected':''}>Amonestación</option>
            <option value="formal" ${tipoPresel==='formal'?'selected':''}>Acta Formal</option>
            <option value="rescisoria" ${tipoPresel==='rescisoria'?'selected':''}>Rescisoria</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="ac-reincidente">¿Es reincidente?</label>
          <select id="ac-reincidente" class="form-select">
            <option value="no">No — primer incidente</option>
            <option value="si">Sí — ha reincidido</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="ac-fecha">Fecha de la falta <span class="req">*</span></label>
          <input id="ac-fecha" type="date" class="form-input" value="${new Date().toISOString().split('T')[0]}" required aria-required="true" onchange="revisarPrescripcionActa()" />
        </div>
        <div class="form-group span-2" id="ac-prescripcion-warn"></div>
        <div class="form-group">
          <label class="form-label" for="ac-hora">Hora de inicio (aprox.)</label>
          <input id="ac-hora" type="time" class="form-input" />
        </div>
        <div class="form-group">
          <label class="form-label" for="ac-hora-cierre">Hora de cierre de la diligencia <span class="req">*</span></label>
          <input id="ac-hora-cierre" type="time" class="form-input" required aria-required="true" />
        </div>
        <div class="form-group span-2">
          <label class="form-label" for="ac-lugar">Lugar</label>
          <input id="ac-lugar" type="text" class="form-input" placeholder="Ej. Piso de producción, instalaciones de la empresa" />
        </div>
        <div class="form-group">
          <label class="form-label" for="ac-tipo-falta">Tipo de falta <span class="req">*</span></label>
          <select id="ac-tipo-falta" class="form-select" onchange="autoRellenarCausal()" required aria-required="true"></select>
        </div>
        <div class="form-group">
          <label class="form-label" for="ac-aceptacion">Posición del trabajador</label>
          <select id="ac-aceptacion" class="form-select">
            <option value="acepta">Acepta y firma</option>
            <option value="no_acepta">No acepta pero firma</option>
            <option value="no_firma">Se negó a firmar</option>
          </select>
        </div>
        <div class="form-group span-2">
          <label class="form-label" for="ac-causal">Causal legal <span class="req">*</span></label>
          <input id="ac-causal" type="text" class="form-input" placeholder="Auto-completado al elegir tipo de falta" required aria-required="true" />
        </div>
        <div class="form-group span-2">
          <label class="form-label" for="ac-descripcion">Descripción de los hechos <span class="req">*</span></label>
          <textarea id="ac-descripcion" class="form-textarea" placeholder="Describe con precisión los hechos…" required aria-required="true"></textarea>
        </div>
        <div class="form-group span-2">
          <label class="form-label" for="ac-manifestacion">Derecho de audiencia — manifestación del trabajador <span class="req">*</span></label>
          <textarea id="ac-manifestacion" class="form-textarea" placeholder="Se le concede el uso de la voz. Transcribe lo que declara, o anota si se niega a manifestar algo." required aria-required="true"></textarea>
          <div class="helper-text">El acta debe dejar constancia de que se le dio al trabajador oportunidad de manifestarse, aun si decide no hacerlo.</div>
        </div>
        <div class="form-group">
          <label class="form-label" for="ac-t1">Testigo 1 — Nombre</label>
          <input id="ac-t1" type="text" class="form-input" placeholder="Nombre del testigo" />
        </div>
        <div class="form-group">
          <label class="form-label" for="ac-t1p">Testigo 1 — Puesto</label>
          <input id="ac-t1p" type="text" class="form-input" placeholder="Ej. Supervisor" />
        </div>
        <div class="form-group">
          <label class="form-label" for="ac-t1-ine">Testigo 1 — INE</label>
          <input id="ac-t1-ine" type="text" class="form-input" />
        </div>
        <div class="form-group">
          <label class="form-label" for="ac-t1-dom">Testigo 1 — Domicilio</label>
          <input id="ac-t1-dom" type="text" class="form-input" placeholder="Para poder citarlo si el litigio llega años después" />
        </div>
        <div class="form-group">
          <label class="form-label" for="ac-t2">Testigo 2 — Nombre</label>
          <input id="ac-t2" type="text" class="form-input" placeholder="Nombre del testigo (opcional)" />
        </div>
        <div class="form-group">
          <label class="form-label" for="ac-t2p">Testigo 2 — Puesto</label>
          <input id="ac-t2p" type="text" class="form-input" placeholder="Ej. Jefe de área" />
        </div>
        <div class="form-group">
          <label class="form-label" for="ac-t2-ine">Testigo 2 — INE</label>
          <input id="ac-t2-ine" type="text" class="form-input" />
        </div>
        <div class="form-group">
          <label class="form-label" for="ac-t2-dom">Testigo 2 — Domicilio</label>
          <input id="ac-t2-dom" type="text" class="form-input" />
        </div>
      </div>
      <div id="ac-error" class="error-msg" role="alert" style="display:none;margin-bottom:8px;"></div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="handleGuardarActa()">Guardar y generar PDF</button>
      </div>
    </div>
  `);

  actualizarCatalogoFaltas();
  if (faltaPresel) {
    const sel = eid('ac-tipo-falta');
    if (sel) { sel.value = faltaPresel; autoRellenarCausal(); }
  }
}

/**
 * Advertencia roja no descartable cuando la falta pudo prescribir.
 *
 * El art. 517 fr. I concede al patrón un mes —desde el día siguiente a aquel en
 * que tuvo conocimiento de la causa— para despedir y para disciplinar faltas.
 * Es, en la práctica, lo que más rescisiones tumba: el patrón junta expediente
 * durante meses y cuando por fin rescinde, la causa ya prescribió.
 *
 * Sólo se muestra en el acta rescisoria: en la amonestación el plazo también
 * corre, pero su consecuencia no es un despido injustificado.
 */
function revisarPrescripcionActa() {
  const box = eid('ac-prescripcion-warn');
  if (!box) return;
  const tipo  = eid('ac-tipo')?.value;
  const fecha = eid('ac-fecha')?.value;
  if (tipo !== 'rescisoria' || !fecha) { box.innerHTML = ''; return; }

  const falta = new Date(fecha + 'T00:00:00');
  const hoy   = new Date(new Date().toISOString().slice(0,10) + 'T00:00:00');
  // Un mes calendario, no 30 días: febrero y julio no miden lo mismo.
  const vence = new Date(falta);
  vence.setMonth(vence.getMonth() + 1);
  const restantes = Math.floor((vence - hoy) / 86400000);

  if (restantes < 0) {
    box.innerHTML = `
      <div class="alert alert-danger" style="align-items:flex-start;">
        <svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg>
        <span><strong>La causa de rescisión pudo haber prescrito.</strong>
        El artículo 517 fracción I de la LFT concede al patrón <strong>un mes</strong> para ejercer la acción
        de rescisión, contado a partir del día siguiente a la fecha en que se tuvo conocimiento de la causa.
        Rescindir fuera de este plazo hace que el despido se considere injustificado.
        Consulta a tu abogado antes de continuar.</span>
      </div>`;
  } else if (restantes <= 5) {
    box.innerHTML = `
      <div class="alert alert-danger" style="align-items:flex-start;">
        <svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg>
        <span><strong>Quedan ${restantes} día(s)</strong> del plazo de un mes del Art. 517 fracc. I LFT
        para ejercer la rescisión.</span>
      </div>`;
  } else if (restantes <= 10) {
    box.innerHTML = `
      <div class="alert alert-warn" style="align-items:flex-start;">
        <svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg>
        <span>Quedan ${restantes} días del plazo del Art. 517 fracc. I LFT para ejercer la rescisión.</span>
      </div>`;
  } else {
    box.innerHTML = '';
  }
  return restantes;
}

function actualizarCatalogoFaltas() {
  const tipo = eid('ac-tipo')?.value || 'amonestacion';
  revisarPrescripcionActa();
  const sel  = eid('ac-tipo-falta');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '';
  FALTAS_CATALOG.filter(f => f.severity.includes(tipo)).forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.value; opt.textContent = f.label;
    if (f.value === prev) opt.selected = true;
    sel.appendChild(opt);
  });
  autoRellenarCausal();
}

function autoRellenarCausal() {
  const val   = eid('ac-tipo-falta')?.value;
  const input = eid('ac-causal');
  if (!val || !input) return;
  const f = FALTAS_CATALOG.find(x => x.value === val);
  if (f) input.value = f.causal;
}

async function handleGuardarActa() {
  const err = eid('ac-error');
  err.style.display = 'none';
  const trabId  = eid('ac-trab')?.value;
  const tipo    = eid('ac-tipo')?.value;
  const fecha   = eid('ac-fecha')?.value;
  const desc    = eid('ac-descripcion')?.value.trim();
  const causal  = eid('ac-causal')?.value.trim();
  const horaCierre = eid('ac-hora-cierre')?.value;
  const manifestacion = eid('ac-manifestacion')?.value.trim();
  const tipoFaltaSel = eid('ac-tipo-falta');

  if (!trabId || !tipo || !fecha || !desc || !causal || !horaCierre || !manifestacion) {
    err.textContent = 'Completa todos los campos requeridos, incluyendo la hora de cierre y la manifestación del trabajador (derecho de audiencia).';
    err.style.display=''; return;
  }

  // Bloqueo con confirmación explícita: pasado el mes del art. 517 fr. I la
  // rescisión ya no se sostiene, y el patrón debe decidirlo a sabiendas.
  if (tipo === 'rescisoria') {
    const restantes = revisarPrescripcionActa();
    if (typeof restantes === 'number' && restantes < 0 && typeof showConfirmacion === 'function') {
      const seguir = await showConfirmacion(
        'La causa de rescisión pudo haber prescrito. El artículo 517 fracción I de la LFT ' +
        'concede al patrón un mes para ejercer la acción de rescisión, contado a partir del ' +
        'día siguiente a la fecha en que se tuvo conocimiento de la causa. Rescindir fuera de ' +
        'este plazo hace que el despido se considere injustificado.\n\n' +
        '¿Deseas generar el acta de todas formas?',
        { titulo: 'Posible prescripción de la causa', textoOk: 'Generar de todas formas',
          textoCancelar: 'Cancelar', peligro: true }
      );
      if (!seguir) return;
    }
  }

  const datos = {
    trabajador_id:   trabId,
    fecha, tipo,
    tipo_falta:      tipoFaltaSel?.value,
    tipo_falta_label:tipoFaltaSel?.options[tipoFaltaSel?.selectedIndex]?.text,
    causal, descripcion: desc,
    lugar:           eid('ac-lugar')?.value.trim() || null,
    hora_falta:      eid('ac-hora')?.value || null,
    hora_cierre:     horaCierre,
    manifestacion_trabajador: manifestacion,
    reincidente:     eid('ac-reincidente')?.value === 'si',
    testigo1:          eid('ac-t1')?.value.trim() || null,
    testigo1_puesto:   eid('ac-t1p')?.value.trim() || null,
    testigo1_ine:      eid('ac-t1-ine')?.value.trim() || null,
    testigo1_domicilio:eid('ac-t1-dom')?.value.trim() || null,
    testigo2:          eid('ac-t2')?.value.trim() || null,
    testigo2_puesto:   eid('ac-t2p')?.value.trim() || null,
    testigo2_ine:      eid('ac-t2-ine')?.value.trim() || null,
    testigo2_domicilio:eid('ac-t2-dom')?.value.trim() || null,
    aceptacion:      eid('ac-aceptacion')?.value,
  };

  try {
    const acta     = await db.createActa(datos, CTX.empresa.id);
    const trab     = await db.getTrabajador(trabId);
    const sucursal = trab.sucursal_id ? await db.getSucursal(trab.sucursal_id) : null;
    generateActaPDF(acta, CTX.empresa, trab, sucursal);
    closeModal();
    navigate('disciplinario');
  } catch(e) { err.textContent = friendlyError(e); err.style.display=''; }
}
