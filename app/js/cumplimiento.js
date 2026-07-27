/**
 * Capital Humano MX — Cumplimiento documental
 *
 * Pantallas y modales de los documentos que la inspección de la STPS y un
 * juicio laboral exigen tener, y que hasta ahora no existían en el producto:
 * Reglamento Interior de Trabajo, aviso de privacidad y consentimientos,
 * protocolo de violencia laboral, NOM-035 y comisiones mixtas.
 *
 * Depende de: app.js (CTX, eid, showModal, closeModal, showToast, btnCargando,
 * escapeHtml), auth.js (actualizarEmpresa), pdfs_compliance.js (generadores).
 */

// ═══════════════════════════════════════════════════════════════════════════
//  PESTAÑA "CUMPLIMIENTO" DEL PERFIL DEL TRABAJADOR
//
//  Un solo lugar donde ver qué documentos de cumplimiento se le entregaron a
//  cada persona y cuáles faltan. El acuse es lo que convierte al documento en
//  oponible: sin él, ni el reglamento ni el protocolo ni el consentimiento de
//  datos sirven de nada frente a esa persona en particular.
// ═══════════════════════════════════════════════════════════════════════════

/** Catálogo de documentos de cumplimiento por trabajador. */
const DOCS_CUMPLIMIENTO = [
  { clave:'rit', label:'Reglamento Interior de Trabajo', fundamento:'Art. 425 LFT',
    porQue:'Sin acuse no se puede sancionar por incumplirlo.',
    accion:'generarEntregaRIT' },
  { clave:'aviso_privacidad', label:'Aviso de privacidad', fundamento:'Art. 16 LFPDPPP',
    porQue:'Debe ponerse a disposición al momento de recabar los datos.',
    accion:'generarAvisoPrivacidad' },
  { clave:'consentimiento_sensibles', label:'Consentimiento de datos sensibles', fundamento:'Art. 8 LFPDPPP',
    porQue:'Incapacidades y biométricos exigen consentimiento expreso y por escrito.',
    accion:'generarConsentimientoSensibles' },
  { clave:'consentimiento_monitoreo', label:'Consentimiento de monitoreo', fundamento:'Arts. 3 fr. IV y 7 LFPDPPP',
    porQue:'Correo, GPS, videovigilancia y uso de imagen.',
    accion:'generarConsentimientoMonitoreoUI' },
  { clave:'protocolo_violencia', label:'Protocolo de violencia laboral', fundamento:'Art. 132 fr. XXXI LFT',
    porQue:'Prerrequisito para rescindir por acoso (art. 47 fr. VIII).',
    accion:'generarAcuseProtocolo' },
];

/**
 * Genera el PDF y, si el patrón confirma que ya lo tiene firmado, registra el
 * acuse.
 *
 * El registro se pide en un segundo paso a propósito: lo que acredita la
 * entrega es la firma, no la descarga. Registrar al descargar produciría un
 * expediente que dice tener acuses que nadie firmó — peor que no tener nada,
 * porque da falsa tranquilidad.
 */
async function _generarYRegistrarAcuse(trabajadorId, clave, generar, opciones = {}) {
  try {
    const trab = await db.getTrabajador(trabajadorId);
    const sucursal = trab.sucursal_id ? await db.getSucursal(trab.sucursal_id) : null;
    const hoy = new Date().toISOString().split('T')[0];

    generar(trab, sucursal, hoy);

    const ok = await showConfirmacion(
      'Se descargó el documento. Imprímelo y recábale la firma.<br><br>' +
      '¿Registro la entrega en el expediente? Hazlo sólo cuando lo tengas firmado: el registro es lo que ' +
      'apaga la alerta y lo que el Kit de defensa reporta como acreditado.',
      { titulo: 'Registrar el acuse', textoOk: 'Ya está firmado, registrar', textoCancelar: 'Todavía no' }
    );
    if (!ok) return;

    const { data: { user } } = await window.supabase.auth.getUser();
    const { error } = await window.supabase.from('acuses_documentos').insert({
      empresa_id: CTX.empresa.id,
      trabajador_id: trabajadorId,
      documento: clave,
      version: opciones.version || null,
      fecha_entrega: hoy,
      medio: 'impreso',
      observaciones: opciones.observaciones || null,
      creado_por: user?.id || null,
    });
    if (error) throw error;
    if (typeof _invalidarCache === 'function') _invalidarCache();
    showToast('Acuse registrado.', 'success');
    renderTabCumplimiento(trabajadorId);
  } catch (e) {
    showToast(e.message, 'error', 8000);
  }
}

function generarAvisoPrivacidad(trabajadorId) {
  const version = new Date().toISOString().split('T')[0];
  return _generarYRegistrarAcuse(trabajadorId, 'aviso_privacidad',
    (trab, sucursal) => generateAvisoPrivacidadTrabajador(CTX.empresa, { version }, sucursal),
    { version });
}

function generarConsentimientoSensibles(trabajadorId) {
  return _generarYRegistrarAcuse(trabajadorId, 'consentimiento_sensibles',
    (trab, sucursal, hoy) => generateConsentimientoDatosSensibles(CTX.empresa, trab, { fecha: hoy }, sucursal));
}

/** El consentimiento de monitoreo necesita saber QUÉ se monitorea (art. 3 fr. IV). */
function generarConsentimientoMonitoreoUI(trabajadorId) {
  showModal(`
    <div class="modal animate-in" style="max-width:520px;">
      <div class="modal-header">
        <div>
          <div class="modal-title">Consentimiento de monitoreo</div>
          <p style="font-size:.8rem;color:var(--text-muted);margin-top:3px;">Marca sólo lo que realmente se usa</p>
        </div>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div style="padding:16px 24px;">
        <div class="alert alert-info" style="margin-bottom:14px;">
          <svg class="ic" style="flex-shrink:0;"><use href="#i-info"></use></svg>
          <span style="font-size:.82rem;">El consentimiento debe ser <strong>específico e informado</strong>
          (artículo 3 fracción IV de la LFPDPPP). Marcar medios que no se usan no protege de nada y resta
          credibilidad al documento.</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${[['correo','Correo electrónico y equipos corporativos'],
             ['gps','Geolocalización de vehículos o dispositivos'],
             ['video','Videovigilancia en el centro de trabajo'],
             ['imagen','Uso de imagen en materiales de la empresa']].map(([v, l]) => `
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:.86rem;">
              <input type="checkbox" id="mon-${v}" style="width:15px;height:15px;accent-color:var(--gold-primary);" />
              <span>${l}</span>
            </label>`).join('')}
        </div>
        <div id="mon-msg" role="alert" style="display:none;margin-top:10px;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="_generarConsentimientoMonitoreo('${trabajadorId}')">Generar</button>
      </div>
    </div>
  `);
}

async function _generarConsentimientoMonitoreo(trabajadorId) {
  const medios = ['correo', 'gps', 'video', 'imagen'].filter(v => eid('mon-' + v)?.checked);
  if (!medios.length) {
    const box = eid('mon-msg');
    if (box) {
      box.textContent = 'Marca al menos un medio: un consentimiento genérico de monitoreo no legitima ninguno en particular.';
      box.className = 'error-msg'; box.style.display = '';
    }
    return;
  }
  closeModal();
  await _generarYRegistrarAcuse(trabajadorId, 'consentimiento_monitoreo',
    (trab, sucursal, hoy) => generateConsentimientoMonitoreo(CTX.empresa, trab, { fecha: hoy, medios }, sucursal),
    { observaciones: 'Medios: ' + medios.join(', ') });
}

async function renderTabCumplimiento(trabajadorId) {
  const cont = eid('tab-cumplimiento');
  if (!cont) return;
  cont.innerHTML = `<div class="card"><div style="text-align:center;padding:24px;color:var(--text-muted);">
    <div class="spinner" style="margin:0 auto 10px;"></div>Revisando los acuses…</div></div>`;

  try {
    const { data: acuses, error } = await window.supabase
      .from('acuses_documentos')
      .select('documento, version, fecha_entrega')
      .eq('trabajador_id', trabajadorId)
      .order('fecha_entrega', { ascending: false });
    if (error) throw error;

    const ultimo = {};
    for (const a of (acuses || [])) if (!ultimo[a.documento]) ultimo[a.documento] = a;

    cont.innerHTML = `
      <div class="card">
        <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">
          Documentos de cumplimiento
        </div>
        <p style="font-size:.8rem;color:var(--text-muted);margin-bottom:16px;">
          El documento obliga a esta persona sólo si se acredita habérselo entregado. Genera el PDF, recábale la firma
          y registra el acuse.
        </p>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Documento</th><th>Fundamento</th><th>Acuse</th><th>Acciones</th></tr></thead>
            <tbody>
              ${DOCS_CUMPLIMIENTO.map(d => {
                const a = ultimo[d.clave];
                return `<tr>
                  <td><strong>${escapeHtml(d.label)}</strong>
                      <div style="font-size:.75rem;color:var(--text-muted);">${escapeHtml(d.porQue)}</div></td>
                  <td style="font-size:.8rem;color:var(--text-muted);">${escapeHtml(d.fundamento)}</td>
                  <td>${a
                    ? `<span style="color:var(--green-ok);font-weight:600;">${formatDateShort(a.fecha_entrega)}</span>`
                    : '<span style="color:var(--amber-warn);font-weight:600;">Pendiente</span>'}</td>
                  <td><button class="btn-secondary btn-sm" onclick="${d.accion}('${trabajadorId}')">
                        ${a ? 'Volver a generar' : 'Generar'}
                      </button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  } catch (e) {
    cont.innerHTML = `<div class="card"><div class="error-msg">${escapeHtml(friendlyError(e))}</div></div>`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  REGLAMENTO INTERIOR DE TRABAJO
// ═══════════════════════════════════════════════════════════════════════════

/** Nombres capturados uno por línea → arreglo limpio. */
function _lineasANombres(valor) {
  return (valor || '').split('\n').map(s => s.trim()).filter(Boolean);
}

function showModalRIT() {
  const e = CTX.empresa || {};
  const hoy = new Date().toISOString().split('T')[0];

  showModal(`
    <div class="modal animate-in" style="max-width:760px;display:flex;flex-direction:column;max-height:92vh;">
      <div class="modal-header">
        <div>
          <div class="modal-title">Reglamento Interior de Trabajo</div>
          <p style="font-size:.8rem;color:var(--text-muted);margin-top:3px;">Artículos 422 a 425 de la Ley Federal del Trabajo</p>
        </div>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>

      <div style="padding:16px 24px;overflow-y:auto;">
        <div class="alert alert-info" style="margin-bottom:16px;">
          <svg class="ic" style="flex-shrink:0;"><use href="#i-info"></use></svg>
          <span style="font-size:.82rem;">El artículo 423 enumera lo que el reglamento <strong>debe</strong> contener.
          Los campos marcados son los que no se pueden deducir de tus datos: sin ellos el reglamento no es depositable,
          y sin depósito no surte efectos (artículo 425).</span>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label class="form-label" for="rit-fecha-firma">Fecha de firma</label>
            <input id="rit-fecha-firma" type="date" class="form-input" value="${hoy}" />
            <div class="helper-text">El depósito debe hacerse dentro de los 8 días siguientes.</div>
          </div>
          <div class="form-group">
            <label class="form-label" for="rit-lugar-jornada">Lugar donde comienzan y terminan las jornadas</label>
            <input id="rit-lugar-jornada" type="text" class="form-input" value="${escapeHtml(e.domicilio) || ''}" />
          </div>

          <div class="form-group">
            <label class="form-label" for="rit-hora-entrada">Hora de entrada</label>
            <input id="rit-hora-entrada" type="time" class="form-input" value="09:00" />
          </div>
          <div class="form-group">
            <label class="form-label" for="rit-hora-salida">Hora de salida</label>
            <input id="rit-hora-salida" type="time" class="form-input" value="18:00" />
          </div>
          <div class="form-group">
            <label class="form-label" for="rit-comida-inicio">Comida — desde</label>
            <input id="rit-comida-inicio" type="time" class="form-input" value="14:00" />
          </div>
          <div class="form-group">
            <label class="form-label" for="rit-comida-fin">Comida — hasta</label>
            <input id="rit-comida-fin" type="time" class="form-input" value="15:00" />
          </div>

          <div class="form-group">
            <label class="form-label" for="rit-dias-pago">Días de pago</label>
            <input id="rit-dias-pago" type="text" class="form-input" placeholder="Ej. los días 15 y último de cada mes" />
          </div>
          <div class="form-group">
            <label class="form-label" for="rit-lugar-pago">Lugar de pago</label>
            <input id="rit-lugar-pago" type="text" class="form-input" placeholder="Ej. transferencia a cuenta bancaria" />
          </div>

          <div class="form-group">
            <label class="form-label" for="rit-limpieza-dias">Días de limpieza</label>
            <input id="rit-limpieza-dias" type="text" class="form-input" placeholder="Ej. diariamente al cierre" />
          </div>
          <div class="form-group">
            <label class="form-label" for="rit-limpieza-horas">Horario de limpieza</label>
            <input id="rit-limpieza-horas" type="text" class="form-input" placeholder="Ej. 18:00 a 19:00" />
          </div>

          <div class="form-group">
            <label class="form-label" for="rit-botiquin">Ubicación del botiquín</label>
            <input id="rit-botiquin" type="text" class="form-input" placeholder="Ej. recepción, muro norte" />
          </div>
          <div class="form-group">
            <label class="form-label" for="rit-resp-seguridad">Responsable de seguridad e higiene</label>
            <input id="rit-resp-seguridad" type="text" class="form-input" />
          </div>

          <div class="form-group span-2">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:.88rem;">
              <input type="checkbox" id="rit-teletrabajo" style="width:16px;height:16px;accent-color:var(--gold-primary);" />
              <span>Incluir el capítulo de teletrabajo</span>
            </label>
            <div class="helper-text">Obligatorio si hay personal en teletrabajo y la empresa no tiene contrato colectivo (artículo 330-D LFT).</div>
          </div>

          <div class="form-group">
            <label class="form-label" for="rit-reps-patron">Representantes del patrón</label>
            <textarea id="rit-reps-patron" class="form-input" rows="3"
              placeholder="Un nombre por línea">${escapeHtml(e.representante) || ''}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label" for="rit-reps-trab">Representantes de las personas trabajadoras</label>
            <textarea id="rit-reps-trab" class="form-input" rows="3" placeholder="Un nombre por línea"></textarea>
            <div class="helper-text">Artículo 424 fracción I: la comisión debe ser mixta.</div>
          </div>

          <div class="form-group span-2">
            <label class="form-label" for="rit-adicionales">Disposiciones complementarias</label>
            <textarea id="rit-adicionales" class="form-input" rows="3"
              placeholder="Déjalo vacío para usar el texto base (prohibiciones de alcohol y armas, uso de bienes, remisión al protocolo de violencia laboral)."></textarea>
          </div>
        </div>

        <div id="rit-msg" role="alert" style="display:none;margin-top:10px;"></div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-secondary" id="rit-btn-acta" onclick="handleGenerarActaComisionRIT()">Acta de la comisión mixta</button>
        <button class="btn-primary" id="rit-btn" onclick="handleGenerarRIT()">Generar reglamento</button>
      </div>
    </div>
  `);
}

/** Lee el formulario del RIT en el objeto `datos` que espera el generador. */
function _datosRITDesdeForm() {
  return {
    fecha_firma:   eid('rit-fecha-firma')?.value,
    lugar_jornada: eid('rit-lugar-jornada')?.value.trim(),
    hora_entrada:  eid('rit-hora-entrada')?.value,
    hora_salida:   eid('rit-hora-salida')?.value,
    comida_inicio: eid('rit-comida-inicio')?.value,
    comida_fin:    eid('rit-comida-fin')?.value,
    dias_pago:     eid('rit-dias-pago')?.value.trim(),
    lugar_pago:    eid('rit-lugar-pago')?.value.trim(),
    limpieza_dias: eid('rit-limpieza-dias')?.value.trim(),
    limpieza_horas:eid('rit-limpieza-horas')?.value.trim(),
    ubicacion_botiquin:   eid('rit-botiquin')?.value.trim(),
    responsable_seguridad:eid('rit-resp-seguridad')?.value.trim(),
    incluye_teletrabajo:  !!eid('rit-teletrabajo')?.checked,
    disposiciones_adicionales: eid('rit-adicionales')?.value.trim(),
    representantes_patron:       _lineasANombres(eid('rit-reps-patron')?.value),
    representantes_trabajadores: _lineasANombres(eid('rit-reps-trab')?.value),
  };
}

function _ritError(msg) {
  const box = eid('rit-msg');
  if (!box) { showToast(msg, 'error', 7000); return; }
  box.textContent = msg;
  box.className = 'error-msg';
  box.style.display = '';
}

function handleGenerarRIT() {
  const btn = eid('rit-btn');
  btnCargando(btn, 'Generando…');
  try {
    generateReglamentoInteriorTrabajo(CTX.empresa, _datosRITDesdeForm());
    showToast('Reglamento generado. Deposítalo ante el Centro Federal de Conciliación y Registro Laboral y captura la fecha de depósito.', 'success', 8000);
  } catch (e) {
    _ritError(e.message);
  } finally {
    btnRestaurar(btn);
  }
}

function handleGenerarActaComisionRIT() {
  const btn = eid('rit-btn-acta');
  btnCargando(btn, 'Generando…');
  try {
    const d = _datosRITDesdeForm();
    generateActaComisionMixtaRIT(CTX.empresa, {
      fecha_sesion: d.fecha_firma,
      lugar: d.lugar_jornada,
      representantes_patron: d.representantes_patron,
      representantes_trabajadores: d.representantes_trabajadores,
    });
    showToast('Acta de la comisión mixta generada.', 'success');
  } catch (e) {
    _ritError(e.message);
  } finally {
    btnRestaurar(btn);
  }
}

/** Guarda el estado de depósito del RIT en los datos de la empresa. */
async function handleGuardarDepositoRIT() {
  const msg = eid('rit-dep-msg');
  const btn = eid('rit-dep-btn');
  const firma    = eid('rit-dep-firma')?.value    || null;
  const deposito = eid('rit-dep-fecha')?.value    || null;
  const folio    = eid('rit-dep-folio')?.value.trim() || null;

  if (msg) msg.style.display = 'none';
  if (deposito && firma && deposito < firma) {
    if (msg) { msg.textContent = 'La fecha de depósito no puede ser anterior a la de firma.'; msg.className = 'error-msg'; msg.style.display = ''; }
    return;
  }

  btnCargando(btn);
  try {
    // `rit_depositado` se deriva de la fecha: no tiene sentido marcarlo sin
    // poder decir desde cuándo surte efectos (art. 425 LFT).
    const datos = {
      rit_fecha_firma: firma,
      rit_fecha_deposito: deposito,
      rit_folio_deposito: folio,
      rit_depositado: !!deposito,
    };
    await actualizarEmpresa(CTX.empresa.id, datos);
    CTX.empresa = { ...CTX.empresa, ...datos };
    if (typeof _invalidarCache === 'function') _invalidarCache();
    if (msg) { msg.textContent = 'Datos del reglamento guardados.'; msg.className = 'alert alert-success'; msg.style.display = ''; }
    showToast(deposito ? 'Reglamento registrado como depositado.' : 'Datos guardados.', 'success');
  } catch (e) {
    if (msg) { msg.textContent = friendlyError(e); msg.className = 'error-msg'; msg.style.display = ''; }
  } finally {
    btnRestaurar(btn);
  }
}

// ─── Constancia de entrega del RIT ───────────────────────────────────────────

/**
 * Genera el acuse de entrega del reglamento y lo registra.
 *
 * El registro importa tanto como el PDF: es lo que permite al sistema saber a
 * quién le falta el acuse y advertirlo antes de levantar un acta que invoque
 * el reglamento (art. 425 LFT).
 */
function generarEntregaRIT(trabajadorId) {
  // La versión del acuse es la fecha de depósito: un acuse del reglamento
  // anterior no acredita la entrega del que se depositó después.
  const version = CTX.empresa?.rit_fecha_deposito || null;
  return _generarYRegistrarAcuse(trabajadorId, 'rit',
    (trab, sucursal, hoy) => generateConstanciaEntregaRIT(
      CTX.empresa, trab, { fecha_entrega: hoy, version }, sucursal),
    { version });
}

// ═══════════════════════════════════════════════════════════════════════════
//  PROTOCOLO DE VIOLENCIA LABORAL (art. 132 fr. XXXI LFT)
// ═══════════════════════════════════════════════════════════════════════════

function showModalProtocoloViolencia() {
  const e = CTX.empresa || {};
  const hoy = new Date().toISOString().split('T')[0];

  showModal(`
    <div class="modal animate-in" style="max-width:700px;display:flex;flex-direction:column;max-height:92vh;">
      <div class="modal-header">
        <div>
          <div class="modal-title">Protocolo de violencia laboral</div>
          <p style="font-size:.8rem;color:var(--text-muted);margin-top:3px;">Artículo 132 fracción XXXI de la Ley Federal del Trabajo</p>
        </div>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div style="padding:16px 24px;overflow-y:auto;">
        <div class="alert alert-info" style="margin-bottom:16px;">
          <svg class="ic" style="flex-shrink:0;"><use href="#i-info"></use></svg>
          <span style="font-size:.82rem;">La ley obliga a implementar el protocolo <strong>en acuerdo con los trabajadores</strong>.
          Uno redactado sólo por el patrón no cumple la obligación, por bien escrito que esté.</span>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label" for="prot-fecha">Fecha del acuerdo</label>
            <input id="prot-fecha" type="date" class="form-input" value="${hoy}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="prot-revision">Periodicidad de revisión</label>
            <input id="prot-revision" type="text" class="form-input" placeholder="dos años" />
          </div>
          <div class="form-group span-2">
            <label class="form-label" for="prot-recepcion">Quién recibe las denuncias</label>
            <input id="prot-recepcion" type="text" class="form-input" placeholder="Ej. la Dirección de Capital Humano" />
          </div>
          <div class="form-group span-2">
            <label class="form-label" for="prot-medio">Medio para denunciar</label>
            <input id="prot-medio" type="text" class="form-input" placeholder="Ej. correo a denuncias@empresa.com, o de forma verbal" />
          </div>
          <div class="form-group span-2">
            <label class="form-label" for="prot-alterno">Vía alterna si la persona señalada es quien recibe las denuncias</label>
            <input id="prot-alterno" type="text" class="form-input" placeholder="Déjalo vacío para usar el texto base" />
            <div class="helper-text">Una vía de denuncia que pasa por el denunciado no es una vía de denuncia.</div>
          </div>
          <div class="form-group">
            <label class="form-label" for="prot-investiga">Quién conduce la investigación</label>
            <input id="prot-investiga" type="text" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label" for="prot-plazo">Plazo de investigación</label>
            <input id="prot-plazo" type="text" class="form-input" placeholder="quince días hábiles" />
          </div>
          <div class="form-group">
            <label class="form-label" for="prot-reps-patron">Representantes del patrón</label>
            <textarea id="prot-reps-patron" class="form-input" rows="3" placeholder="Un nombre por línea">${escapeHtml(e.representante) || ''}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label" for="prot-reps-trab">Representantes de las personas trabajadoras</label>
            <textarea id="prot-reps-trab" class="form-input" rows="3" placeholder="Un nombre por línea"></textarea>
          </div>
        </div>
        <div id="prot-msg" role="alert" style="display:none;margin-top:10px;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-primary" id="prot-btn" onclick="handleGenerarProtocolo()">Generar protocolo</button>
      </div>
    </div>
  `);
}

function handleGenerarProtocolo() {
  const btn = eid('prot-btn');
  const box = eid('prot-msg');
  if (box) box.style.display = 'none';
  btnCargando(btn, 'Generando…');
  try {
    generateProtocoloViolenciaLaboral(CTX.empresa, {
      fecha: eid('prot-fecha')?.value,
      responsable_recepcion:    eid('prot-recepcion')?.value.trim(),
      medio_denuncia:           eid('prot-medio')?.value.trim(),
      responsable_alterno:      eid('prot-alterno')?.value.trim(),
      responsable_investigacion:eid('prot-investiga')?.value.trim(),
      plazo_investigacion:      eid('prot-plazo')?.value.trim(),
      periodicidad_revision:    eid('prot-revision')?.value.trim(),
      representantes_patron:       _lineasANombres(eid('prot-reps-patron')?.value),
      representantes_trabajadores: _lineasANombres(eid('prot-reps-trab')?.value),
    });
    showToast('Protocolo generado. Difúndelo y recaba el acuse de cada persona.', 'success', 7000);
  } catch (e) {
    if (box) { box.textContent = e.message; box.className = 'error-msg'; box.style.display = ''; }
    else showToast(e.message, 'error', 7000);
  } finally {
    btnRestaurar(btn);
  }
}

/**
 * La vía de denuncia se pregunta aquí y no se guarda en la empresa: puede
 * cambiar entre centros de trabajo, y una vía equivocada impresa en la
 * constancia es peor que una línea en blanco que se llena a mano.
 */
function generarAcuseProtocolo(trabajadorId) {
  showModal(`
    <div class="modal animate-in" style="max-width:480px;">
      <div class="modal-header">
        <div class="modal-title">Constancia de difusión del protocolo</div>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div style="padding:16px 24px;">
        <div class="form-group">
          <label class="form-label" for="acp-via">Ante quién se presentan las denuncias</label>
          <input id="acp-via" type="text" class="form-input" placeholder="Ej. la Dirección de Capital Humano" />
          <div class="helper-text">Se imprime en la constancia. Déjalo vacío para llenarlo a mano.</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="_generarAcuseProtocolo('${trabajadorId}')">Generar</button>
      </div>
    </div>
  `);
}

async function _generarAcuseProtocolo(trabajadorId) {
  const via = eid('acp-via')?.value.trim() || null;
  closeModal();
  await _generarYRegistrarAcuse(trabajadorId, 'protocolo_violencia',
    (trab, sucursal, hoy) => generateConstanciaDifusionProtocolo(CTX.empresa, trab, {
      fecha_entrega: hoy,
      responsable_recepcion: via,
    }, sucursal));
}

// ─── Acta de investigación ───────────────────────────────────────────────────

function showModalActaInvestigacion() {
  const hoy = new Date().toISOString().split('T')[0];
  showModal(`
    <div class="modal animate-in" style="max-width:720px;display:flex;flex-direction:column;max-height:92vh;">
      <div class="modal-header">
        <div>
          <div class="modal-title">Acta de investigación de violencia laboral</div>
          <p style="font-size:.8rem;color:var(--text-muted);margin-top:3px;">Debido proceso del protocolo del art. 132 fr. XXXI LFT</p>
        </div>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div style="padding:16px 24px;overflow-y:auto;">
        <div class="alert alert-warn" style="margin-bottom:16px;">
          <svg class="ic" style="flex-shrink:0;"><use href="#i-alert"></use></svg>
          <span style="font-size:.82rem;">Una sanción impuesta sin oír a la persona señalada se anula, y al anularse
          deja a la empresa como si no hubiera atendido la denuncia. La manifestación es obligatoria.</span>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label" for="inv-fecha">Fecha de la diligencia</label>
            <input id="inv-fecha" type="date" class="form-input" value="${hoy}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="inv-fecha-den">Fecha de la denuncia</label>
            <input id="inv-fecha-den" type="date" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label" for="inv-hora-ini">Hora de inicio</label>
            <input id="inv-hora-ini" type="time" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label" for="inv-hora-fin">Hora de cierre</label>
            <input id="inv-hora-fin" type="time" class="form-input" />
          </div>
          <div class="form-group span-2">
            <label class="form-label" for="inv-lugar">Lugar</label>
            <input id="inv-lugar" type="text" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label" for="inv-denunciante">Persona denunciante</label>
            <input id="inv-denunciante" type="text" class="form-input" placeholder="Déjalo vacío para reservar la identidad" />
          </div>
          <div class="form-group">
            <label class="form-label" for="inv-senalado">Persona señalada</label>
            <input id="inv-senalado" type="text" class="form-input" />
          </div>
          <div class="form-group span-2">
            <label class="form-label" for="inv-hechos">Hechos denunciados <span class="req">*</span></label>
            <textarea id="inv-hechos" class="form-textarea" rows="3"
              placeholder="Qué ocurrió, con fecha, hora y lugar. Sin esto la persona señalada no puede defenderse."></textarea>
          </div>
          <div class="form-group span-2">
            <label class="form-label" for="inv-medidas">Medidas de protección adoptadas</label>
            <textarea id="inv-medidas" class="form-textarea" rows="2"
              placeholder="Se cambia de área o turno a la persona SEÑALADA, no a quien denuncia."></textarea>
          </div>
          <div class="form-group span-2">
            <label class="form-label" for="inv-manifestacion">Manifestación de la persona señalada <span class="req">*</span></label>
            <textarea id="inv-manifestacion" class="form-textarea" rows="3"
              placeholder="Lo que declaró textualmente al concedérsele el uso de la palabra."></textarea>
          </div>
          <div class="form-group span-2">
            <label class="form-label" for="inv-declaraciones">Otras declaraciones y pruebas</label>
            <textarea id="inv-declaraciones" class="form-textarea" rows="2"></textarea>
          </div>
          <div class="form-group span-2">
            <label class="form-label" for="inv-responsable">Quién conduce la investigación</label>
            <input id="inv-responsable" type="text" class="form-input" value="${escapeHtml(CTX.empresa?.representante) || ''}" />
          </div>
        </div>
        <div id="inv-msg" role="alert" style="display:none;margin-top:10px;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-primary" id="inv-btn" onclick="handleGenerarActaInvestigacion()">Generar acta</button>
      </div>
    </div>
  `);
}

function handleGenerarActaInvestigacion() {
  const btn = eid('inv-btn');
  const box = eid('inv-msg');
  if (box) box.style.display = 'none';
  btnCargando(btn, 'Generando…');
  try {
    generateActaInvestigacionAcoso(CTX.empresa, {
      fecha:         eid('inv-fecha')?.value,
      fecha_denuncia:eid('inv-fecha-den')?.value,
      hora_inicio:   eid('inv-hora-ini')?.value,
      hora_cierre:   eid('inv-hora-fin')?.value,
      lugar:         eid('inv-lugar')?.value.trim(),
      denunciante_nombre: eid('inv-denunciante')?.value.trim(),
      senalado_nombre:    eid('inv-senalado')?.value.trim(),
      hechos_denunciados: eid('inv-hechos')?.value.trim(),
      medidas_proteccion: eid('inv-medidas')?.value.trim(),
      manifestacion_senalado: eid('inv-manifestacion')?.value.trim(),
      declaraciones:      eid('inv-declaraciones')?.value.trim(),
      responsable_investigacion: eid('inv-responsable')?.value.trim(),
    });
    showToast('Acta generada. Consérvala en un expediente reservado.', 'success', 6000);
  } catch (e) {
    if (box) { box.textContent = e.message; box.className = 'error-msg'; box.style.display = ''; }
    else showToast(e.message, 'error', 7000);
  } finally {
    btnRestaurar(btn);
  }
}
