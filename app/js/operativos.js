/**
 * Capital Humano MX — Pantallas de los documentos operativos
 *
 * Nueve formatos que comparten estructura (unos cuantos campos y, a veces, una
 * tabla de renglones repetibles), así que en vez de nueve modales casi
 * idénticos hay un modal genérico dirigido por una especificación de campos.
 * Cada documento declara qué pide; la validación jurídica vive en el generador
 * de pdfs_operativos.js, no aquí: la interfaz no debe ser el único filtro.
 *
 * Depende de: app.js (CTX, eid, showModal, closeModal, showToast, btnCargando,
 * escapeHtml), db.js, pdfs_operativos.js.
 */

// ─── Modal genérico ──────────────────────────────────────────────────────────

let _OP_TABLAS = {};   // id de tabla → siguiente índice de renglón

/**
 * Campos soportados: text, date, time, number, textarea, select y tabla.
 * `tabla` genera renglones repetibles con un botón para agregar y otro para
 * quitar; se lee como arreglo de objetos con las claves de sus columnas.
 */
function _opCampoHTML(c) {
  const span = c.ancho === 2 ? ' span-2' : '';
  const req  = c.requerido ? ' <span class="req">*</span>' : '';
  const ayuda = c.ayuda ? `<div class="helper-text">${c.ayuda}</div>` : '';
  const valor = c.valor != null ? escapeHtml(String(c.valor)) : '';

  if (c.tipo === 'tabla') {
    return `
      <div class="form-group span-2">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <label class="form-label" style="margin:0;">${c.label}${req}</label>
          <button class="btn-secondary btn-sm" onclick="_opAgregarRenglon('${c.id}')">+ Agregar</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>${c.columnas.map(col => `<th>${col.label}</th>`).join('')}<th></th></tr></thead>
            <tbody id="op-tb-${c.id}"></tbody>
          </table>
        </div>
        ${ayuda}
      </div>`;
  }
  if (c.tipo === 'textarea') {
    return `<div class="form-group${span}">
      <label class="form-label" for="op-${c.id}">${c.label}${req}</label>
      <textarea id="op-${c.id}" class="form-textarea" rows="${c.filas || 3}"
        placeholder="${c.placeholder || ''}">${valor}</textarea>${ayuda}
    </div>`;
  }
  if (c.tipo === 'select') {
    return `<div class="form-group${span}">
      <label class="form-label" for="op-${c.id}">${c.label}${req}</label>
      <select id="op-${c.id}" class="form-select">
        ${c.opciones.map(o => `<option value="${o.v}" ${o.v === c.valor ? 'selected' : ''}>${o.t}</option>`).join('')}
      </select>${ayuda}
    </div>`;
  }
  return `<div class="form-group${span}">
    <label class="form-label" for="op-${c.id}">${c.label}${req}</label>
    <input id="op-${c.id}" type="${c.tipo || 'text'}" class="form-input"
      ${c.min != null ? `min="${c.min}"` : ''} ${c.paso ? `step="${c.paso}"` : ''}
      value="${valor}" placeholder="${c.placeholder || ''}" />${ayuda}
  </div>`;
}

function _opAgregarRenglon(tablaId) {
  const tb = eid('op-tb-' + tablaId);
  const cfg = (window._OP_CFG?.campos || []).find(c => c.id === tablaId);
  if (!tb || !cfg) return;
  const i = _OP_TABLAS[tablaId] = (_OP_TABLAS[tablaId] || 0) + 1;
  tb.insertAdjacentHTML('beforeend', `
    <tr id="op-r-${tablaId}-${i}">
      ${cfg.columnas.map(col => `
        <td><input id="op-c-${tablaId}-${i}-${col.id}" type="${col.tipo || 'text'}" class="form-input"
             ${col.paso ? `step="${col.paso}"` : ''} placeholder="${col.placeholder || ''}" /></td>`).join('')}
      <td><button class="btn-secondary btn-sm"
            onclick="document.getElementById('op-r-${tablaId}-${i}').remove()">Quitar</button></td>
    </tr>`);
}

function _opLeerTabla(cfg) {
  const filas = [];
  const total = _OP_TABLAS[cfg.id] || 0;
  for (let i = 1; i <= total; i++) {
    if (!eid(`op-r-${cfg.id}-${i}`)) continue;
    const fila = {};
    let vacia = true;
    for (const col of cfg.columnas) {
      const v = eid(`op-c-${cfg.id}-${i}-${col.id}`)?.value.trim();
      if (v) vacia = false;
      fila[col.id] = col.tipo === 'number' && v ? Number(v) : v;
    }
    if (!vacia) filas.push(fila);
  }
  return filas;
}

function _opLeerDatos(cfg) {
  const datos = {};
  for (const c of cfg.campos) {
    if (c.tipo === 'tabla') { datos[c.id] = _opLeerTabla(c); continue; }
    const el = eid('op-' + c.id);
    if (!el) continue;
    const v = el.value;
    if (c.tipo === 'number') datos[c.id] = v === '' ? null : Number(v);
    else datos[c.id] = typeof v === 'string' ? v.trim() : v;
  }
  return datos;
}

/**
 * cfg = { titulo, subtitulo, aviso, campos, generar(datos, trab, sucursal) }
 * `generar` recibe los datos ya leídos y devuelve (o lanza) igual que el
 * generador de PDF; los errores del generador se muestran en el propio modal
 * porque son instrucciones accionables, no fallos técnicos.
 */
function _opAbrirModal(cfg, trabajadorId = null) {
  window._OP_CFG = cfg;
  window._OP_TRAB_ID = trabajadorId;
  _OP_TABLAS = {};

  showModal(`
    <div class="modal animate-in" style="max-width:${cfg.ancho || 720}px;display:flex;flex-direction:column;max-height:92vh;">
      <div class="modal-header">
        <div>
          <div class="modal-title">${cfg.titulo}</div>
          <p style="font-size:.8rem;color:var(--text-muted);margin-top:3px;">${cfg.subtitulo}</p>
        </div>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div style="padding:16px 24px;overflow-y:auto;">
        ${cfg.aviso ? `<div class="alert alert-info" style="margin-bottom:16px;">
          <svg class="ic" style="flex-shrink:0;"><use href="#i-info"></use></svg>
          <span style="font-size:.82rem;">${cfg.aviso}</span></div>` : ''}
        <div class="form-grid">${cfg.campos.map(_opCampoHTML).join('')}</div>
        <div id="op-msg" role="alert" style="display:none;margin-top:10px;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-primary" id="op-btn" onclick="_opGenerar()">Generar documento</button>
      </div>
    </div>
  `);

  // Un renglón inicial en cada tabla, para que no se vea vacía.
  for (const c of cfg.campos) if (c.tipo === 'tabla') _opAgregarRenglon(c.id);
}

async function _opGenerar() {
  const cfg = window._OP_CFG;
  const btn = eid('op-btn'), box = eid('op-msg');
  if (box) box.style.display = 'none';
  btnCargando(btn, 'Generando…');
  try {
    const datos = _opLeerDatos(cfg);
    let trab = null, sucursal = null;
    if (window._OP_TRAB_ID) {
      trab = await db.getTrabajador(window._OP_TRAB_ID);
      sucursal = trab.sucursal_id ? await db.getSucursal(trab.sucursal_id) : null;
    }
    cfg.generar(datos, trab, sucursal);
    closeModal();
    showToast('Documento generado.', 'success');
  } catch (e) {
    if (box) { box.textContent = e.message; box.className = 'error-msg'; box.style.display = ''; }
    else showToast(e.message, 'error', 8000);
  } finally {
    btnRestaurar(btn);
  }
}

// ─── Los nueve documentos ────────────────────────────────────────────────────

const _HOY = () => new Date().toISOString().split('T')[0];

function showModalHorasExtra(trabajadorId) {
  _opAbrirModal({
    titulo: 'Autorización previa de tiempo extraordinario',
    subtitulo: 'Artículos 66, 67 y 68 de la Ley Federal del Trabajo',
    aviso: 'Las horas extra son la reclamación más difícil de desvirtuar: el art. 784 pone en el patrón la carga de probar la jornada. Una autorización <strong>previa</strong> y firmada acredita cuántas horas se autorizaron y cuáles no.',
    campos: [
      { id:'fecha', label:'Fecha del documento', tipo:'date', valor:_HOY() },
      { id:'horas_jornada_ordinaria', label:'Horas de jornada ordinaria diaria', tipo:'number', min:1, valor:8,
        ayuda:'Se usa para verificar el tope de 12 horas diarias del art. 68.' },
      { id:'motivo', label:'Circunstancia extraordinaria', tipo:'textarea', ancho:2, requerido:true, filas:2,
        placeholder:'Ej. cierre de inventario anual',
        ayuda:'El art. 66 sólo permite prolongar la jornada por circunstancias extraordinarias.' },
      { id:'jornadas', label:'Días y horas autorizadas', tipo:'tabla', requerido:true,
        columnas:[
          { id:'fecha', label:'Fecha', tipo:'date' },
          { id:'horas', label:'Horas', tipo:'number', paso:'0.5' },
          { id:'hora_inicio', label:'De', tipo:'time' },
          { id:'hora_fin', label:'A', tipo:'time' },
        ],
        ayuda:'Máximo 4 horas por día y 4 días por semana (art. 66).' },
      { id:'autoriza', label:'Autoriza', ancho:2, valor: CTX.empresa?.representante || '' },
    ],
    generar: (d, trab, suc) => generateAutorizacionHorasExtra(CTX.empresa, trab, d, suc),
  }, trabajadorId);
}

function showModalPermiso(trabajadorId) {
  _opAbrirModal({
    titulo: 'Solicitud y autorización de permiso',
    subtitulo: 'Constancia de ausencia justificada',
    aviso: 'Desactiva el "me dieron permiso": sin papel, la falta injustificada queda en la palabra de uno contra la del otro, y el art. 784 resuelve esa duda a favor del trabajador.',
    campos: [
      { id:'fecha_solicitud', label:'Fecha de la solicitud', tipo:'date', valor:_HOY() },
      { id:'tipo', label:'Modalidad', tipo:'select', valor:'sin_goce', opciones:[
        { v:'sin_goce', t:'Sin goce de sueldo' },
        { v:'goce',     t:'Con goce de sueldo' },
        { v:'a_cuenta', t:'A cuenta de vacaciones' },
      ]},
      { id:'fecha_inicio', label:'Del', tipo:'date', requerido:true },
      { id:'fecha_fin',    label:'Al',  tipo:'date' },
      { id:'hora_inicio',  label:'Desde (si es por horas)', tipo:'time' },
      { id:'hora_fin',     label:'Hasta', tipo:'time' },
      { id:'dias',   label:'Días', tipo:'number', min:0, paso:'0.5' },
      { id:'autoriza', label:'Autoriza (jefe inmediato)', valor: CTX.empresa?.representante || '' },
      { id:'motivo', label:'Motivo', tipo:'textarea', ancho:2, filas:2 },
      { id:'observaciones', label:'Observaciones', tipo:'textarea', ancho:2, filas:2 },
    ],
    generar: (d, trab, suc) => generateSolicitudPermiso(CTX.empresa, trab, d, suc),
  }, trabajadorId);
}

function showModalModificacionCondiciones(trabajadorId) {
  _opAbrirModal({
    titulo: 'Convenio de modificación de condiciones',
    subtitulo: 'Artículos 31, 33 y 56 de la Ley Federal del Trabajo',
    aviso: 'Cambiar horario, puesto o lugar sin convenio le entrega al trabajador el art. 51. Ojo: el convenio <strong>no puede reducir el salario</strong> — el art. 51 fr. IV lo convierte en causa de rescisión y el art. 5º fr. XIII hace nula la renuncia.',
    campos: [
      { id:'fecha', label:'Fecha del convenio', tipo:'date', valor:_HOY() },
      { id:'fecha_efectos', label:'Surte efectos a partir de', tipo:'date' },
      { id:'motivo', label:'Causa objetiva del cambio', tipo:'textarea', ancho:2, requerido:true, filas:2,
        placeholder:'Ej. la reorganización del turno vespertino' },
      { id:'cambios', label:'Condiciones que se modifican', tipo:'tabla', requerido:true,
        columnas:[
          { id:'concepto', label:'Condición', placeholder:'Horario' },
          { id:'antes',    label:'Como estaba', placeholder:'09:00 a 18:00' },
          { id:'despues',  label:'Como queda',  placeholder:'12:00 a 21:00' },
        ]},
      { id:'salario_anterior', label:'Salario anterior (si cambia)', tipo:'number', min:0, paso:'0.01' },
      { id:'salario_nuevo',    label:'Salario nuevo',                tipo:'number', min:0, paso:'0.01' },
      { id:'no_cambia', label:'Qué permanece sin cambio', tipo:'textarea', ancho:2, filas:2,
        ayuda:'Déjalo vacío para usar el texto base.' },
    ],
    generar: (d, trab, suc) => generateConvenioModificacionCondiciones(CTX.empresa, trab, d, suc),
  }, trabajadorId);
}

function showModalSuspension(trabajadorId) {
  _opAbrirModal({
    titulo: 'Aviso de suspensión de la relación de trabajo',
    subtitulo: 'Artículos 42, 43 y 45 de la Ley Federal del Trabajo',
    aviso: 'La suspensión <strong>no termina</strong> la relación ni afecta la antigüedad. Documentarla evita que la ausencia se lea después como despido.',
    campos: [
      { id:'fecha', label:'Fecha del aviso', tipo:'date', valor:_HOY() },
      { id:'fecha_inicio', label:'Inicia el', tipo:'date', requerido:true },
      { id:'fraccion_art42', label:'Causa (art. 42)', tipo:'select', ancho:2, valor:'', opciones:[
        { v:'',     t:'— Selecciona la fracción —' },
        { v:'I',    t:'I — Enfermedad contagiosa' },
        { v:'II',   t:'II — Incapacidad por accidente o enfermedad no profesional' },
        { v:'III',  t:'III — Prisión preventiva seguida de sentencia absolutoria' },
        { v:'IV',   t:'IV — Arresto' },
        { v:'V',    t:'V — Servicios y cargos constitucionales' },
        { v:'VI',   t:'VI — Representante ante organismos estatales' },
        { v:'VII',  t:'VII — Falta de documentos exigidos por las leyes' },
        { v:'VIII', t:'VIII — Conclusión de la temporada' },
        { v:'IX',   t:'IX — Licencia del art. 140 Bis de la Ley del Seguro Social' },
      ]},
      { id:'fecha_fin_estimada', label:'Fecha estimada de conclusión', tipo:'date', ancho:2,
        ayuda:'Si la causa termina antes, la suspensión concluye en ese momento.' },
      { id:'hechos', label:'Hechos que la motivan', tipo:'textarea', ancho:2, filas:2 },
      { id:'contacto', label:'Dónde plantear dudas', ancho:2, valor: CTX.empresa?.domicilio || '' },
      { id:'emite', label:'Emite', ancho:2, valor: CTX.empresa?.representante || '' },
    ],
    generar: (d, trab, suc) => generateAvisoSuspension(CTX.empresa, trab, d, suc),
  }, trabajadorId);
}

function showModalEntregaRecepcion(trabajadorId) {
  _opAbrirModal({
    titulo: 'Acta de entrega-recepción del puesto',
    subtitulo: 'Constancia de bienes, información y asuntos en trámite',
    aviso: 'Sin acta, el faltante se descubre después de la baja y ya no hay con quién contrastarlo. Hacer constar un faltante <strong>no</strong> autoriza a descontarlo del finiquito.',
    ancho: 820,
    campos: [
      { id:'fecha', label:'Fecha', tipo:'date', valor:_HOY() },
      { id:'lugar', label:'Lugar', valor: CTX.empresa?.domicilio || '' },
      { id:'hora_inicio', label:'Hora de inicio', tipo:'time' },
      { id:'hora_cierre', label:'Hora de cierre', tipo:'time' },
      { id:'recibe_nombre', label:'Quién recibe', requerido:true },
      { id:'recibe_puesto', label:'Puesto de quien recibe' },
      { id:'partidas', label:'Partidas que se entregan', tipo:'tabla', requerido:true,
        columnas:[
          { id:'concepto',    label:'Concepto', placeholder:'Laptop' },
          { id:'descripcion', label:'Descripción o identificador', placeholder:'Dell ABC123' },
          { id:'cantidad',    label:'Cantidad', tipo:'number' },
          { id:'estado',      label:'Estado', placeholder:'Buena' },
        ]},
      { id:'asuntos_pendientes', label:'Asuntos en trámite', tipo:'textarea', ancho:2, filas:2 },
      { id:'faltantes', label:'Faltantes y observaciones', tipo:'textarea', ancho:2, filas:2 },
      { id:'plazo_revision', label:'Plazo para revisar saldos y cartera', valor:'quince días' },
    ],
    generar: (d, trab, suc) => generateActaEntregaRecepcion(CTX.empresa, trab, d, suc),
  }, trabajadorId);
}

function showModalNoAdeudo(trabajadorId) {
  _opAbrirModal({
    titulo: 'Carta de no adeudo',
    subtitulo: 'Constancia a favor de la persona trabajadora',
    aviso: 'Se expide a favor del trabajador: acredita que la empresa no le reclama nada. Deliberadamente no se redacta al revés — una carta donde el trabajador declare que nada se le debe sería una renuncia de derechos, nula por el art. 5º fr. XIII.',
    ancho: 560,
    campos: [
      { id:'fecha', label:'Fecha', tipo:'date', valor:_HOY() },
      { id:'emite', label:'Emite', valor: CTX.empresa?.representante || '' },
      { id:'detalle_bienes', label:'Bienes devueltos', tipo:'textarea', ancho:2, filas:2 },
    ],
    generar: (d, trab, suc) => generateCartaNoAdeudo(CTX.empresa, trab, d, suc),
  }, trabajadorId);
}

function showModalDescuento(trabajadorId) {
  _opAbrirModal({
    titulo: 'Convenio y autorización de descuento',
    subtitulo: 'Artículo 110 fracción I de la Ley Federal del Trabajo',
    aviso: 'Dos topes distintos, y ambos se validan: la cantidad exigible no puede pasar de <strong>un mes de salario</strong>, y el descuento periódico no puede pasar del <strong>30% del excedente del salario mínimo</strong>. Sin convenio escrito el descuento es ilegal aunque el préstamo sea real.',
    campos: [
      { id:'fecha', label:'Fecha del convenio', tipo:'date', valor:_HOY() },
      { id:'fecha_origen', label:'Fecha del préstamo o del adeudo', tipo:'date' },
      { id:'concepto', label:'Concepto del adeudo', ancho:2, requerido:true,
        placeholder:'préstamo personal / anticipo de salario / faltante de caja',
        ayuda:'El art. 110 fr. I sólo admite los supuestos que enumera: anticipos, pagos en exceso, errores, pérdidas, averías o artículos de la empresa.' },
      { id:'monto', label:'Monto total', tipo:'number', min:0, paso:'0.01', requerido:true },
      { id:'descuento_periodico', label:'Descuento por período', tipo:'number', min:0, paso:'0.01', requerido:true },
      { id:'periodicidad', label:'Periodicidad', tipo:'select', valor:'quincenal', opciones:[
        { v:'semanal',   t:'Semanal' },
        { v:'quincenal', t:'Quincenal' },
        { v:'mensual',   t:'Mensual' },
      ]},
      { id:'fecha_primer_descuento', label:'Primer descuento', tipo:'date' },
      { id:'emite', label:'Firma por el patrón', ancho:2, valor: CTX.empresa?.representante || '' },
    ],
    generar: (d, trab, suc) => generateAutorizacionDescuento(CTX.empresa, trab, d, suc),
  }, trabajadorId);
}

function showModalCartaOferta() {
  _opAbrirModal({
    titulo: 'Carta oferta',
    subtitulo: 'Propuesta de condiciones previa a la contratación',
    aviso: 'Documenta las condiciones antes del ingreso. Su valor está en el límite: <strong>no es un contrato</strong>, y el documento lo dice para que no se lea como uno.',
    campos: [
      { id:'candidato', label:'Persona candidata', ancho:2, requerido:true },
      { id:'puesto', label:'Puesto', requerido:true },
      { id:'area', label:'Área o departamento' },
      { id:'salario', label:'Salario bruto', tipo:'number', min:0, paso:'0.01', requerido:true },
      { id:'periodo_salario', label:'Periodicidad del salario', tipo:'select', valor:'mensual', opciones:[
        { v:'mensual',   t:'Mensual' },
        { v:'quincenal', t:'Quincenal' },
        { v:'semanal',   t:'Semanal' },
        { v:'diario',    t:'Diario' },
      ]},
      { id:'fecha_ingreso', label:'Fecha de ingreso propuesta', tipo:'date' },
      { id:'tipo_contrato', label:'Tipo de contrato', valor:'Por tiempo indeterminado' },
      { id:'jornada', label:'Jornada', ancho:2, placeholder:'lunes a viernes de 9:00 a 18:00' },
      { id:'lugar', label:'Lugar de trabajo', ancho:2, valor: CTX.empresa?.domicilio || '' },
      { id:'reporta_a', label:'Reporta a' },
      { id:'periodo_prueba_dias', label:'Período a prueba (días)', tipo:'number', min:0,
        ayuda:'Art. 39-A: 30 días como regla general; 180 sólo en puestos de dirección o técnicos especializados.' },
      { id:'prestaciones', label:'Prestaciones superiores a la ley', tipo:'textarea', ancho:2, filas:2 },
      { id:'vigencia', label:'La oferta vence el', tipo:'date' },
      { id:'condicionada', label:'Sujeta a', placeholder:'la entrega de documentos' },
      { id:'emite', label:'Firma por la empresa', ancho:2, valor: CTX.empresa?.representante || '' },
    ],
    generar: (d) => generateCartaOferta(CTX.empresa, d),
  });
}

function showModalSolicitudEmpleo() {
  _opAbrirModal({
    titulo: 'Solicitud de empleo',
    subtitulo: 'Base del expediente y declaración de veracidad',
    aviso: 'Su valor está en la declaración de veracidad del art. 47 fr. I — que <strong>caduca a los treinta días</strong> de prestar servicios. Puedes generarla en blanco para llenar a mano.',
    ancho: 820,
    campos: [
      { id:'puesto', label:'Puesto al que aspira' },
      { id:'fecha', label:'Fecha', tipo:'date', valor:_HOY() },
      { id:'nombre', label:'Nombre completo', ancho:2 },
      { id:'fecha_nacimiento', label:'Fecha de nacimiento', tipo:'date' },
      { id:'curp', label:'CURP' },
      { id:'rfc', label:'R.F.C.' },
      { id:'nss', label:'Número de seguridad social' },
      { id:'domicilio', label:'Domicilio', ancho:2 },
      { id:'telefono', label:'Teléfono' },
      { id:'email', label:'Correo electrónico' },
      { id:'contacto_emergencia', label:'Contacto de emergencia', ancho:2 },
      { id:'fuente', label:'Cómo se enteró de la vacante', ancho:2 },
      { id:'escolaridad', label:'Escolaridad', tipo:'tabla',
        columnas:[
          { id:'nivel', label:'Nivel' }, { id:'institucion', label:'Institución' },
          { id:'periodo', label:'Periodo' }, { id:'documento', label:'Documento' },
        ]},
      { id:'experiencia', label:'Experiencia laboral', tipo:'tabla',
        columnas:[
          { id:'empresa', label:'Empresa' }, { id:'puesto', label:'Puesto' },
          { id:'periodo', label:'Periodo' }, { id:'motivo', label:'Motivo de separación' },
          { id:'referencia', label:'Referencia y teléfono' },
        ]},
    ],
    generar: (d) => generateSolicitudEmpleo(CTX.empresa, d),
  });
}

/** Catálogo que pinta la tarjeta de documentos operativos del perfil. */
const DOCS_OPERATIVOS = [
  { label:'Autorización de tiempo extraordinario', fundamento:'Arts. 66-68 LFT',
    porQue:'La reclamación #1 y la más difícil de desvirtuar.', accion:'showModalHorasExtra' },
  { label:'Solicitud y autorización de permiso', fundamento:'Constancia de ausencia',
    porQue:'Desactiva el "me dieron permiso".', accion:'showModalPermiso' },
  { label:'Convenio de modificación de condiciones', fundamento:'Arts. 31, 33 y 56 LFT',
    porQue:'Cambiar horario, puesto o lugar sin convenio activa el art. 51.', accion:'showModalModificacionCondiciones' },
  { label:'Aviso de suspensión de la relación', fundamento:'Arts. 42, 43 y 45 LFT',
    porQue:'Evita que la ausencia se lea después como despido.', accion:'showModalSuspension' },
  { label:'Autorización de descuento', fundamento:'Art. 110 fr. I LFT',
    porQue:'Sin convenio escrito el descuento es ilegal.', accion:'showModalDescuento' },
  { label:'Acta de entrega-recepción del puesto', fundamento:'Inventario y cartera',
    porQue:'Faltantes que se descubren cuando ya no hay con quién contrastarlos.', accion:'showModalEntregaRecepcion' },
  { label:'Carta de no adeudo', fundamento:'Cierre operativo',
    porQue:'Acredita que la empresa no le reclama nada.', accion:'showModalNoAdeudo' },
];

function _cardDocumentosOperativos(trabajadorId) {
  return `
    <div class="card" style="margin-top:14px;">
      <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">
        Documentos operativos
      </div>
      <p style="font-size:.8rem;color:var(--text-muted);margin-bottom:16px;">
        Ordenados por lo que más se pelea en juicio. No los revisa ninguna inspección, pero son los que invierten
        la dinámica probatoria del artículo 784.
      </p>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Documento</th><th>Fundamento</th><th></th></tr></thead>
          <tbody>
            ${DOCS_OPERATIVOS.map(d => `<tr>
              <td><strong>${escapeHtml(d.label)}</strong>
                  <div style="font-size:.75rem;color:var(--text-muted);">${escapeHtml(d.porQue)}</div></td>
              <td style="font-size:.8rem;color:var(--text-muted);">${escapeHtml(d.fundamento)}</td>
              <td><button class="btn-secondary btn-sm" onclick="${d.accion}('${trabajadorId}')">Generar</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}
