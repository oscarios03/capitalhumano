/**
 * Capital Humano MX — Módulo de Empleados
 * Depende de: app.js (CTX, eid, navigate, showModal, closeModal, db, helpers)
 */

// ─── Salario según periodo de pago ───────────────────────────────────────────
// El campo salario_mensual almacena el monto correspondiente al periodo de pago
// del trabajador (mensual / quincenal / semanal). calcSalarioDiario() aplica el
// divisor del Art. 89 LFT: /30 mensual, /15 quincenal, /7 semanal.
function _labelPeriodoSalario(periodo) {
  return periodo === 'quincenal' ? 'Quincenal'
       : periodo === 'semanal'   ? 'Semanal'
       : 'Mensual';
}

// Recalcula la etiqueta del campo y el desglose (diario + equivalente mensual)
// en vivo conforme el usuario cambia el monto o el periodo de pago.
function _actualizarPreviewSalario() {
  const periodo = eid('n-periodo')?.value || 'mensual';
  const monto   = parseFloat(eid('n-salario')?.value) || 0;
  const lbl     = document.getElementById('n-salario-label-periodo');
  if (lbl) lbl.textContent = _labelPeriodoSalario(periodo);

  const box = document.getElementById('n-salario-preview');
  if (!box) return;
  if (monto <= 0) {
    box.innerHTML = 'Captura el <strong>salario del periodo de pago seleccionado</strong>. Abajo verás el salario diario y el equivalente mensual.';
    return;
  }
  const diario   = calcSalarioDiario(monto, periodo);
  const mensual  = diario * 30; // equivalente mensual (Art. 89 LFT: diario × 30)
  const perLabel = _labelPeriodoSalario(periodo).toLowerCase();

  // Costo real mensual para la empresa (cuotas patronales + provisiones)
  let costoHTML = '';
  if (typeof costoTotalEmpleado === 'function') {
    const ingreso = eid('n-ingreso')?.value || new Date().toISOString().split('T')[0];
    const c = costoTotalEmpleado({ salario_mensual: monto, periodo_salario: periodo, fecha_ingreso: ingreso });
    costoHTML = `<div style="margin-top:6px;padding-top:6px;border-top:1px dashed rgba(245,166,35,.35);"
        title="Salario + cuotas patronales IMSS (${fmt(c.imssPatronal)}) + INFONAVIT 5% (${fmt(c.infonavit)}) + ISN (${fmt(c.isn)}) + provisiones de aguinaldo, vacaciones y prima vacacional (${fmt(c.provAguinaldo + c.provVacaciones + c.provPrimaVac)})">
      Costo real mensual para la empresa: <strong>${fmt(c.total)}</strong>
      <span style="color:var(--text-secondary);">(× ${c.factorSobreSalario} del salario)</span>
    </div>`;
  }

  box.innerHTML = `
    Estás capturando <strong>${fmt(monto)}</strong> como salario <strong>${perLabel}</strong>.
    &nbsp;→&nbsp; Salario diario: <strong>${fmt(diario)}</strong>
    &nbsp;·&nbsp; Equivalente mensual: <strong>${fmt(mensual)}</strong>
    ${periodo !== 'mensual' ? `<div style="margin-top:4px;color:var(--text-secondary);">Verifica que ${fmt(monto)} sea lo que el trabajador cobra <strong>cada ${perLabel === 'quincenal' ? 'quincena' : 'semana'}</strong>, no su sueldo mensual.</div>` : ''}
    ${costoHTML}
  `;
}

// ═══════════════════════════════════════════════════════
//  EMPLEADOS
// ═══════════════════════════════════════════════════════
// Subvista activa dentro del área de Trabajadores: 'trabajadores' | 'puestos'
let _empleadosSubvista = 'trabajadores';

function switchEmpleadosTab(sub) {
  _empleadosSubvista = sub;
  renderEmpleados();
}

async function renderEmpleados() {
  const sub = _empleadosSubvista;
  const seg = `
    <div class="seg-control animate-in" style="display:inline-flex;gap:4px;background:var(--surface-2,rgba(255,255,255,.04));border:1px solid var(--border);border-radius:10px;padding:4px;margin-bottom:16px;">
      <button class="btn-sm" style="border:none;border-radius:7px;padding:7px 16px;font-weight:700;cursor:pointer;background:${sub==='trabajadores'?'var(--gold-primary)':'transparent'};color:${sub==='trabajadores'?'#1a1a1a':'var(--text-secondary)'};" onclick="switchEmpleadosTab('trabajadores')">👤 Trabajadores</button>
      <button class="btn-sm" style="border:none;border-radius:7px;padding:7px 16px;font-weight:700;cursor:pointer;background:${sub==='puestos'?'var(--gold-primary)':'transparent'};color:${sub==='puestos'?'#1a1a1a':'var(--text-secondary)'};" onclick="switchEmpleadosTab('puestos')">💼 Puestos</button>
    </div>`;
  const main = eid('main-view');
  main.innerHTML = `${seg}<div id="empleados-sub"></div>`;
  if (sub === 'puestos') return renderPuestosCatalogo();
  return renderTrabajadoresLista();
}

async function renderTrabajadoresLista() {
  try {
    const [trabajadores, sucursales] = await Promise.all([
      db.getTrabajadores(),
      db.getSucursales(false),
    ]);
    const sucursalesBranch = sucursales.filter(s => s.tipo !== 'matriz');
    const activos = trabajadores.filter(t => t.estado === 'activo');
    const bajas   = trabajadores.filter(t => t.estado !== 'activo');

    const filasTrabajador = (lista) => {
      if (!lista.length) return `<tr><td colspan="6"><div class="empty-state" style="padding:20px 0;"><div class="empty-state-icon" style="font-size:1.6rem;">👤</div><div class="empty-state-title" style="font-size:.9rem;">Sin registros</div></div></td></tr>`;
      return lista.map(t => {
        const dias = diasParaVencimiento(t.fecha_vencimiento_contrato);
        const vencBadge = dias !== null && dias <= 15
          ? `<br><span style="font-size:.72rem;font-weight:700;color:${dias<=3?'var(--red-warn)':'#f39c12'};">⏰ ${dias<0?'VENCIDO':dias===0?'Vence hoy':'Vence en '+dias+'d'}</span>`
          : '';
        return `<tr data-nombre="${(t.nombre||'').toLowerCase()}" data-sucursal="${t.sucursal_id || 'matriz'}">
          <td><strong>${t.nombre}</strong></td>
          <td>${badgeCalidad(t.tipo_contrato)}${vencBadge}</td>
          <td>${t.puesto || '—'}</td>
          <td><span style="font-size:.8rem;color:var(--text-secondary);">${t.sucursales?.nombre || 'Matriz'}</span></td>
          <td>${formatDateShort(t.fecha_ingreso)}</td>
          <td><div class="actions">
            <button class="btn-secondary btn-sm" onclick="navigate('empleado','${t.id}')">Ver perfil</button>
          </div></td>
        </tr>`;
      }).join('');
    };

    const tablaHTML = (id, lista) => `
      <div class="table-wrap">
        <table class="data-table tabla-empleados" id="${id}">
          <thead><tr><th>Trabajador</th><th>Calidad</th><th>Puesto</th><th>Centro de Trabajo</th><th>Ingreso</th><th>Acciones</th></tr></thead>
          <tbody>${filasTrabajador(lista)}</tbody>
        </table>
      </div>`;

    const main = eid('empleados-sub') || eid('main-view');
    main.innerHTML = `
      <div class="view-header animate-in">
        <div><div class="view-title">Trabajadores</div></div>
        <div style="display:flex;gap:8px;">
          <button class="btn-secondary" onclick="showModalImportacion()"><svg class="ic"><use href="#i-download"></use></svg> Importación masiva</button>
          <button class="btn-primary" onclick="showModalAltaEmpleado()"><svg class="ic"><use href="#i-plus"></use></svg> Alta de Trabajador</button>
        </div>
      </div>
      <div class="search-bar animate-in">
        <input type="search" class="search-input" placeholder="Buscar por nombre…" id="search-trab" oninput="filtrarTabla()" />
        ${sucursalesBranch.length > 0 ? `
        <select class="form-select" style="max-width:200px;" id="filtro-sucursal" onchange="filtrarTabla()">
          <option value="">Todas las sucursales</option>
          <option value="matriz">Matriz</option>
          ${sucursalesBranch.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
        </select>` : ''}
      </div>

      <!-- Sección Activos -->
      <div class="seccion-trabajadores animate-in">
        <div class="seccion-header" onclick="toggleSeccion('sec-activos', this)">
          <span>▼ Activos <span class="badge-count">(${activos.length})</span></span>
        </div>
        <div id="sec-activos" class="seccion-body">
          ${tablaHTML('tabla-activos', activos)}
        </div>
      </div>

      <!-- Sección Bajas -->
      <div class="seccion-trabajadores animate-in">
        <div class="seccion-header seccion-header--baja" onclick="toggleSeccion('sec-bajas', this)">
          <span>▶ Dados de baja <span class="badge-count">(${bajas.length})</span></span>
        </div>
        <div id="sec-bajas" class="seccion-body" style="display:none;">
          ${tablaHTML('tabla-bajas', bajas)}
        </div>
      </div>
    `;
  } catch(e) { showError(e); }
}

function toggleSeccion(id, headerEl) {
  const body = eid(id);
  if (!body) return;
  const collapsed = body.style.display === 'none';
  body.style.display = collapsed ? '' : 'none';
  const span = headerEl?.querySelector('span');
  if (span) span.innerHTML = span.innerHTML.replace(collapsed ? '▶' : '▼', collapsed ? '▼' : '▶');
}

function filtrarTabla() {
  const q        = eid('search-trab')?.value.toLowerCase() || '';
  const sucursal = eid('filtro-sucursal')?.value || '';
  document.querySelectorAll('.tabla-empleados tbody tr[data-nombre]').forEach(tr => {
    const matchNombre   = tr.dataset.nombre.includes(q);
    const matchSucursal = !sucursal || tr.dataset.sucursal === sucursal;
    tr.style.display = (matchNombre && matchSucursal) ? '' : 'none';
  });
}

// ── MODAL UNIFICADO ALTA / EDICIÓN ──────────────────────────────────────────
async function showModalAltaEmpleado() {
  // Precheck de límite del plan (UX; el trigger del backend es el candado real)
  const max = limiteDe('trabajadores');
  if (max !== null) {
    const trabs = await db.getTrabajadores();
    const activos = trabs.filter(t => t.estado === 'activo').length;
    if (activos >= max) {
      showToast(`🔒 Tu plan permite máximo ${max} trabajadores activos.`, 'warn', 6000);
      showModalPlanes('limite_trabajadores');
      return;
    }
  }
  showModalTrabajador(null);
}

async function showModalTrabajador(id = null) {
  const [sucursales, puestos, trab] = await Promise.all([
    db.getSucursales(true),
    db.getPuestos(true),
    id ? db.getTrabajador(id) : Promise.resolve(null),
  ]);
  const sucBranch = sucursales.filter(s => s.tipo !== 'matriz');
  _puestosCache = puestos;
  const puestoActualId  = trab?.puesto_id || '';
  const puestoActualTxt = trab?.puesto || '';
  const puestoEnCatalogo = puestos.some(p => p.id === puestoActualId);
  const esEdicion = !!trab;
  const hoy = new Date().toISOString().split('T')[0];
  const v = (k, fb = '') => { const val = trab?.[k]; return val === null || val === undefined ? fb : val; };

  // Prestaciones de empresa: en ALTA el fondo de ahorro viene preseleccionado
  // con el % configurado (se puede quitar o ajustar por trabajador aquí mismo)
  const _prestEmp    = prestacionesEmpresa();
  const fondoDefOn   = esEdicion ? !!v('fondo_ahorro_activo') : _prestEmp.fondoAhorro.activo;
  const fondoDefPct  = esEdicion
    ? parseFloat(v('fondo_ahorro_pct') || 0.13)
    : (_prestEmp.fondoAhorro.activo ? _prestEmp.fondoAhorro.pctTrabajador : 0.13);

  const optsEdoCivil = ['Soltero/a','Casado/a','Unión libre','Divorciado/a','Viudo/a'];
  const optsTipoId   = ['INE/IFE','Pasaporte','Cédula Profesional','Otro'];
  const optsSangre   = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];
  const diasSem      = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
  const diasPres     = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const tipoContr    = v('tipo_contrato', 'indeterminado');
  const diasSemArr   = v('dias_semana', []);
  const diasPresArr  = v('dias_presentacion', []);

  showModal(`
    <div class="modal animate-in" style="max-width:780px;width:96vw;padding:0;display:flex;flex-direction:column;max-height:90vh;">
      <!-- Header -->
      <div class="modal-header" style="padding:18px 24px 14px;flex-shrink:0;">
        <div>
          <div class="modal-title">${esEdicion ? '✏️ Editar Trabajador' : '+ Alta de Trabajador'}</div>
          <p style="font-size:.82rem;color:var(--text-muted);margin-top:3px;">${esEdicion ? trab.nombre : 'El contrato PDF se genera automáticamente'}</p>
        </div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>

      <!-- Tabs nav -->
      <div class="modal-tabs">
        <button class="modal-tab active" onclick="switchModalTab(this,'mtab-personal')">👤 Personal</button>
        <button class="modal-tab" onclick="switchModalTab(this,'mtab-laboral')">💼 Laboral</button>
        <button class="modal-tab" onclick="switchModalTab(this,'mtab-jornada')">🕐 Jornada</button>
        <button class="modal-tab" onclick="switchModalTab(this,'mtab-contactos')">📞 Contactos</button>
      </div>

      <!-- ── TAB 1: PERSONAL ── -->
      <div id="mtab-personal" class="modal-tab-content">
        <div class="form-grid">
          <div class="form-group span-2">
            <label class="form-label">Nombre Completo <span class="req">*</span></label>
            <input id="n-nombre" type="text" class="form-input" value="${v('nombre')}" placeholder="Nombre(s) Apellido Paterno Apellido Materno" />
          </div>
          <div class="form-group">
            <label class="form-label">RFC</label>
            <input id="n-rfc" type="text" class="form-input" value="${v('rfc')}" placeholder="LOHM900415XY2" maxlength="13" style="text-transform:uppercase;" />
          </div>
          <div class="form-group">
            <label class="form-label">CURP</label>
            <input id="n-curp" type="text" class="form-input" value="${v('curp')}" placeholder="LOHM900415MDFPRL09" maxlength="18" style="text-transform:uppercase;" />
          </div>
          <div class="form-group">
            <label class="form-label">NSS (IMSS)</label>
            <input id="n-nss" type="text" class="form-input" value="${v('nss')}" placeholder="12345678901" maxlength="11" />
          </div>
          <div class="form-group">
            <label class="form-label">Edad</label>
            <input id="n-edad" type="number" class="form-input" value="${v('edad')}" min="14" max="99" placeholder="Años" />
          </div>
          <div class="form-group">
            <label class="form-label">Estado Civil</label>
            <select id="n-civil" class="form-select">
              <option value="">— Seleccionar —</option>
              ${optsEdoCivil.map(o=>`<option value="${o}" ${v('estado_civil')===o?'selected':''}>${o}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Nacionalidad</label>
            <input id="n-nacionalidad" type="text" class="form-input" value="${v('nacionalidad','Mexicana')}" />
          </div>
          <div class="form-group span-2">
            <label class="form-label">Domicilio Particular</label>
            <input id="n-domicilio-part" type="text" class="form-input" value="${v('domicilio')}" placeholder="Calle, número, colonia, ciudad" />
          </div>
          <div class="form-group">
            <label class="form-label">Tipo de Identificación</label>
            <select id="n-tipo-id" class="form-select">
              <option value="">— Seleccionar —</option>
              ${optsTipoId.map(o=>`<option value="${o}" ${v('tipo_identificacion')===o?'selected':''}>${o}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Número de Identificación</label>
            <input id="n-num-id" type="text" class="form-input" value="${v('num_identificacion')}" placeholder="Número en el documento" />
          </div>
          <div class="form-group">
            <label class="form-label">Tipo de Sangre</label>
            <select id="n-sangre" class="form-select">
              <option value="">— Seleccionar —</option>
              ${optsSangre.map(o=>`<option value="${o}" ${v('tipo_sangre')===o?'selected':''}>${o}</option>`).join('')}
            </select>
          </div>
          <div class="form-group span-2">
            <label class="form-label">Enfermedades Crónicas / Condiciones Médicas</label>
            <textarea id="n-enfermedades" class="form-textarea" rows="2" placeholder="Ninguna">${v('enfermedades_cronicas')}</textarea>
          </div>
        </div>
      </div>

      <!-- ── TAB 2: LABORAL ── -->
      <div id="mtab-laboral" class="modal-tab-content" style="display:none;">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Puesto / Cargo <span class="req">*</span></label>
            <div style="display:flex;gap:6px;">
              <select id="n-puesto" class="form-select" style="flex:1;" onchange="_onPuestoSeleccionado()">
                <option value="" ${!puestoActualId && !puestoActualTxt ? 'selected' : ''} disabled>— Selecciona un puesto —</option>
                ${(puestoActualTxt && !puestoEnCatalogo) ? `<option value="__keep__" selected>${puestoActualTxt} (actual)</option>` : ''}
                ${puestos.map(p => `<option value="${p.id}" ${puestoActualId === p.id ? 'selected' : ''}>${p.nombre}</option>`).join('')}
              </select>
              <button type="button" class="btn-secondary btn-sm" title="Crear un puesto nuevo" onclick="_toggleNuevoPuestoPanel(true)">＋ Nuevo</button>
            </div>
            <div class="helper-text">Elige una plantilla de puesto o crea una nueva.</div>
          </div>
          <div class="form-group span-2" id="n-nuevo-puesto-panel" style="display:none;background:rgba(245,166,35,.05);border:1.5px solid var(--gold-border);border-radius:var(--radius-md);padding:14px 16px;">
            <div style="font-size:.78rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--gold-primary);margin-bottom:10px;">＋ Nuevo puesto</div>
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">Nombre del puesto <span class="req">*</span></label>
                <input id="np-nombre" type="text" class="form-input" placeholder="Ej. Coordinador de Ventas" />
              </div>
              <div class="form-group">
                <label class="form-label">Departamento / Área</label>
                <input id="np-dept" type="text" class="form-input" placeholder="Ej. Comercial" />
              </div>
              <div class="form-group">
                <label class="form-label">Salario sugerido</label>
                <input id="np-salario" type="number" class="form-input" min="0" step="0.01" placeholder="20000" />
              </div>
              <div class="form-group">
                <label class="form-label">Periodo de pago</label>
                <select id="np-periodo" class="form-select">
                  <option value="mensual">Mensual</option>
                  <option value="quincenal">Quincenal</option>
                  <option value="semanal">Semanal</option>
                </select>
              </div>
              <div class="form-group span-2">
                <label class="form-label">Funciones del puesto</label>
                <textarea id="np-funciones" class="form-textarea" rows="2" placeholder="Funciones principales del puesto."></textarea>
              </div>
            </div>
            <div id="np-error" class="error-msg" style="display:none;margin:6px 0;"></div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
              <button type="button" class="btn-secondary btn-sm" onclick="_toggleNuevoPuestoPanel(false)">Cancelar</button>
              <button type="button" class="btn-primary btn-sm" onclick="_guardarNuevoPuestoInline()">💾 Guardar puesto</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Departamento / Área</label>
            <input id="n-dept" type="text" class="form-input" value="${v('departamento')}" placeholder="Ej. Comercial" />
          </div>
          <div class="form-group">
            <label class="form-label">Fecha de Ingreso <span class="req">*</span></label>
            <input id="n-ingreso" type="date" class="form-input" value="${v('fecha_ingreso', hoy)}" />
          </div>
          <div class="form-group">
            <label class="form-label">Fecha de Antigüedad Reconocida</label>
            <input id="n-antig" type="date" class="form-input" value="${v('fecha_ingreso_reconocida')}" />
            <div class="helper-text">Si difiere de la fecha de ingreso formal</div>
          </div>
          <div class="form-group">
            <label class="form-label">
              Salario <span id="n-salario-label-periodo">${_labelPeriodoSalario(v('periodo_salario','mensual'))}</span> <span class="req">*</span>
            </label>
            <input id="n-salario" type="number" class="form-input" value="${v('salario_mensual')}" placeholder="20000" min="1" step="0.01"
                   oninput="_actualizarPreviewSalario()" />
          </div>
          <div class="form-group">
            <label class="form-label">Periodo de Pago</label>
            <select id="n-periodo" class="form-select" onchange="_actualizarPreviewSalario()">
              <option value="mensual" ${v('periodo_salario','mensual')==='mensual'?'selected':''}>Mensual</option>
              <option value="quincenal" ${v('periodo_salario')==='quincenal'?'selected':''}>Quincenal</option>
              <option value="semanal" ${v('periodo_salario')==='semanal'?'selected':''}>Semanal</option>
            </select>
          </div>
          <div class="form-group span-2">
            <div id="n-salario-preview" style="font-size:.78rem;color:var(--text-muted);padding:8px 12px;
                 background:rgba(245,166,35,.08);border:1px solid rgba(245,166,35,.25);border-radius:6px;">
              Captura el <strong>salario del periodo de pago seleccionado</strong>. Abajo verás el salario diario y el equivalente mensual.
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Zona SMG</label>
            <select id="n-smg" class="form-select">
              <option value="general" ${v('smg_zone','general')==='general'?'selected':''}>Área General — $315.04/día</option>
              <option value="frontera" ${v('smg_zone')==='frontera'?'selected':''}>Zona Frontera Norte — $419.88/día</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Centro de Trabajo</label>
            <select id="n-sucursal" class="form-select">
              <option value="" ${!v('sucursal_id')?'selected':''}>Matriz (sede principal)</option>
              ${sucBranch.map(s=>`<option value="${s.id}" ${v('sucursal_id')===s.id?'selected':''}>${s.nombre}${s.clave?' ('+s.clave+')':''}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Tipo de Contrato <span class="req">*</span></label>
            <select id="n-contrato" class="form-select" onchange="onTipoContratoChange()">
              <option value="indeterminado" ${(tipoContr==='indeterminado'||tipoContr==='indefinido')?'selected':''}>Por Tiempo Indeterminado</option>
              <option value="determinado" ${tipoContr==='determinado'?'selected':''}>Por Tiempo Determinado</option>
              <option value="obra" ${tipoContr==='obra'?'selected':''}>Por Obra o Servicio</option>
              <option value="temporada" ${tipoContr==='temporada'?'selected':''}>Por Temporada</option>
              <option value="comision" ${tipoContr==='comision'?'selected':''}>Por Comisión</option>
            </select>
          </div>
          <div class="form-group span-2">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.85rem;"
              title="Al vencer el periodo de prueba o de capacitación inicial sin terminación expresa, la relación continúa por tiempo indeterminado y se computa la antigüedad desde el inicio (Art. 39-A LFT).">
              <input type="checkbox" id="n-es-direccion" ${v('es_puesto_direccion')?'checked':''} onchange="_actualizarLimitesPrueba()"
                style="width:16px;height:16px;accent-color:var(--gold-primary);" />
              Puesto de dirección, confianza o técnico/profesional especializado (Art. 39-A/39-B LFT)
            </label>
            <div class="helper-text">Estos puestos pueden pactar hasta 180 días de periodo a prueba o de capacitación inicial; el resto, los topes generales de ley.</div>
          </div>
          <div class="form-group" id="grupo-prueba" style="display:none;">
            <label class="form-label">Duración del período a prueba (días)</label>
            <input id="n-prueba" type="number" class="form-input" min="1" value="${v('periodo_prueba_dias',30)}" onchange="calcularFechaVencimiento()" />
            <div class="helper-text" id="n-prueba-hint">Máximo 30 días (Art. 39-A LFT). La fecha de vencimiento se calcula automáticamente.</div>
          </div>
          <div class="form-group">
            <label class="form-label">Días de capacitación inicial pactados <span style="font-size:.68rem;color:var(--text-muted);">(Art. 39-B LFT, opcional)</span></label>
            <input id="n-capacitacion" type="number" class="form-input" min="0" value="${v('capacitacion_inicial_dias')||''}" placeholder="Ej. 90" />
            <div class="helper-text" id="n-capacitacion-hint">Máximo 90 días (180 en puestos de dirección/técnicos especializados).</div>
          </div>
          <div class="form-group">
            <label class="form-label">Forma de Pago</label>
            <select id="n-forma-pago" class="form-select">
              <option value="deposito" ${v('forma_pago','deposito')==='deposito'?'selected':''}>Depósito bancario</option>
              <option value="efectivo" ${v('forma_pago')==='efectivo'?'selected':''}>Efectivo</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Días de Pago</label>
            <input id="n-dias-pago" type="text" class="form-input" value="${v('dias_pago')}" placeholder="Ej. Viernes de cada semana" />
          </div>
          <div class="form-group span-2">
            <label class="form-label">Funciones del Puesto</label>
            <textarea id="n-funciones" class="form-textarea" rows="3" placeholder="Describe las funciones principales. Se incluirá en el contrato.">${v('funciones')}</textarea>
            <div class="helper-text">Se incluirá en el contrato de trabajo</div>
          </div>
          ${esEdicion ? `
          <div class="form-group span-2" id="grupo-motivo-salario">
            <label class="form-label">Motivo del ajuste salarial <span style="font-weight:400;color:var(--text-muted);">(si cambiaste el salario)</span></label>
            <input id="n-motivo-salario" type="text" class="form-input" placeholder="Ej. Revisión anual, Promoción, Ajuste inflación" />
          </div>` : ''}
        </div>

        <!-- ── Configuración de Nómina ── -->
        <div style="margin-top:18px;padding:14px 16px;background:rgba(245,166,35,.05);border:1.5px solid var(--gold-border);border-radius:var(--radius-md);">
          <div style="font-size:.78rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--gold-primary);margin-bottom:14px;">
            ⚙️ Configuración de Nómina
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Tipo de salario</label>
              <select id="n-tipo-salario" class="form-select" onchange="_toggleNominaConfig()">
                <option value="fijo"     ${v('tipo_salario','fijo')==='fijo'    ?'selected':''}>Fijo</option>
                <option value="comision" ${v('tipo_salario')==='comision'       ?'selected':''}>Por comisión</option>
                <option value="mixto"    ${v('tipo_salario')==='mixto'          ?'selected':''}>Mixto (base + comisión)</option>
              </select>
            </div>
            <div class="form-group" id="ng-pct-com" style="display:${['comision','mixto'].includes(v('tipo_salario'))?'':'none'};">
              <label class="form-label">% Comisión habitual</label>
              <input id="n-pct-comision" type="number" class="form-input" min="0" max="100" step="0.01"
                value="${parseFloat(v('pct_comision')||0)*100}"
                placeholder="ej. 5 = 5%" />
            </div>

            <!-- Fondo de ahorro -->
            <div class="form-group span-2" style="border-top:1px solid var(--border);padding-top:12px;margin-top:2px;">
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:.88rem;">
                <input type="checkbox" id="n-fondo-activo" style="width:16px;height:16px;accent-color:var(--gold-primary);"
                  ${fondoDefOn?'checked':''} onchange="_toggleNominaConfig()" />
                <span><strong>Fondo de ahorro activo</strong> <span style="font-size:.72rem;color:var(--text-muted);">(Art. 110 fr. IV LFT)</span></span>
              </label>
              ${!esEdicion && _prestEmp.fondoAhorro.activo
                ? '<div class="helper-text" style="margin-top:4px;">Preseleccionado por la configuración de prestaciones de la empresa. Puedes ajustar el % o desmarcarlo para este trabajador.</div>'
                : ''}
            </div>
            <div class="form-group" id="ng-fondo-pct" style="display:${fondoDefOn?'':'none'};">
              <label class="form-label">% Descuento obrero</label>
              <input id="n-fondo-pct" type="number" class="form-input" min="0" max="20" step="0.01"
                value="${(fondoDefPct*100).toFixed(1)}"
                placeholder="13" />
            </div>

            <!-- INFONAVIT -->
            <div class="form-group span-2" style="border-top:1px solid var(--border);padding-top:12px;margin-top:2px;">
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:.88rem;">
                <input type="checkbox" id="n-info-activo" style="width:16px;height:16px;accent-color:var(--gold-primary);"
                  ${v('infonavit_activo')?'checked':''} onchange="_toggleNominaConfig()" />
                <span><strong>INFONAVIT activo</strong> <span style="font-size:.72rem;color:var(--text-muted);">(Art. 97 Ley INFONAVIT)</span></span>
              </label>
            </div>
            <div class="form-group" id="ng-info-tipo" style="display:${v('infonavit_activo')?'':'none'};">
              <label class="form-label">Tipo de descuento</label>
              <select id="n-info-tipo" class="form-select">
                <option value="factor"     ${v('infonavit_tipo')==='factor'    ?'selected':''}>Factor × UMA diaria</option>
                <option value="cuota_fija" ${v('infonavit_tipo','cuota_fija')==='cuota_fija'?'selected':''}>Cuota fija mensual</option>
                <option value="pct"        ${v('infonavit_tipo')==='pct'       ?'selected':''}>% del salario</option>
              </select>
            </div>
            <div class="form-group" id="ng-info-val" style="display:${v('infonavit_activo')?'':'none'};">
              <label class="form-label">Valor</label>
              <input id="n-info-valor" type="number" class="form-input" min="0" step="0.0001"
                value="${v('infonavit_valor')||0}"
                placeholder="ej. 0.1 factor / 500 cuota fija / 0.05 pct" />
            </div>

            <!-- Pensión alimenticia -->
            <div class="form-group span-2" style="border-top:1px solid var(--border);padding-top:12px;margin-top:2px;">
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:.88rem;">
                <input type="checkbox" id="n-pension-activa" style="width:16px;height:16px;accent-color:var(--gold-primary);"
                  ${v('pension_activa')?'checked':''} onchange="_toggleNominaConfig()" />
                <span><strong>Pensión alimenticia activa</strong> <span style="font-size:.72rem;color:var(--text-muted);">(Art. 110 fr. V LFT)</span></span>
              </label>
            </div>
            <div class="form-group" id="ng-pension-tipo" style="display:${v('pension_activa')?'':'none'};">
              <label class="form-label">Tipo</label>
              <select id="n-pension-tipo" class="form-select">
                <option value="pct"  ${v('pension_tipo','pct')==='pct' ?'selected':''}>% del neto</option>
                <option value="fijo" ${v('pension_tipo')==='fijo'      ?'selected':''}>Monto fijo</option>
              </select>
            </div>
            <div class="form-group" id="ng-pension-val" style="display:${v('pension_activa')?'':'none'};">
              <label class="form-label">Valor</label>
              <input id="n-pension-valor" type="number" class="form-input" min="0" step="0.01"
                value="${v('pension_valor')||0}"
                placeholder="ej. 0.30 para 30% / 1500 fijo" />
            </div>
          </div>
        </div>
      </div>

      <!-- ── TAB 3: JORNADA ── -->
      <div id="mtab-jornada" class="modal-tab-content" style="display:none;">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Hora de Inicio</label>
            <input id="n-hora-ini" type="time" class="form-input" value="${v('hora_inicio')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Hora de Fin</label>
            <input id="n-hora-fin" type="time" class="form-input" value="${v('hora_fin')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Inicio Descanso / Comida</label>
            <input id="n-des-ini" type="time" class="form-input" value="${v('hora_descanso_inicio')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Fin Descanso / Comida</label>
            <input id="n-des-fin" type="time" class="form-input" value="${v('hora_descanso_fin')}" />
          </div>
          <div class="form-group span-2">
            <label class="form-label">Días Laborales</label>
            <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;">
              ${diasSem.map(d=>`
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:.88rem;color:var(--text-secondary);">
                  <input type="checkbox" name="dias-semana" value="${d}" style="width:15px;height:15px;accent-color:var(--gold-primary);"
                    ${Array.isArray(diasSemArr)&&diasSemArr.includes(d)?'checked':''}> ${d}
                </label>`).join('')}
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Día de Descanso Semanal</label>
            <select id="n-dia-descanso" class="form-select">
              <option value="">— Seleccionar —</option>
              ${['Domingo','Sábado','Lunes','Otro'].map(o=>`<option value="${o}" ${v('dia_descanso')===o?'selected':''}>${o}</option>`).join('')}
            </select>
          </div>
        </div>

        <div id="cond-determinado" style="display:none;margin-top:8px;">
          <div style="height:1px;background:var(--border);margin-bottom:16px;"></div>
          <div class="form-group">
            <label class="form-label">Fecha de vencimiento calculada</label>
            <input id="n-vencimiento" type="date" class="form-input" value="${v('fecha_vencimiento_contrato')}" />
            <div class="helper-text">Ajustable manualmente si se requiere una fecha distinta</div>
          </div>
        </div>

        <div id="cond-obra" style="display:none;margin-top:8px;">
          <div style="height:1px;background:var(--border);margin-bottom:16px;"></div>
          <div class="form-grid">
            <div class="form-group span-2">
              <label class="form-label">Nombre / Descripción del Proyecto <span class="req">*</span></label>
              <textarea id="n-proyecto" class="form-textarea" rows="2" placeholder="Describe la obra o servicio determinado">${v('nombre_proyecto')}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Fecha Estimada de Término <span class="req">*</span></label>
              <input id="n-fin-proyecto" type="date" class="form-input" value="${v('fecha_fin_proyecto')}" />
            </div>
          </div>
        </div>

        <div id="cond-temporada" style="display:none;margin-top:8px;">
          <div style="height:1px;background:var(--border);margin-bottom:16px;"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <label class="form-label">Temporadas <span class="req">*</span></label>
            <button class="btn-secondary btn-sm" onclick="agregarTemporada()">+ Agregar temporada</button>
          </div>
          <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:10px;">Nombre — Fecha inicio — Fecha fin</div>
          <div id="temporadas-container"></div>
        </div>

        <div id="cond-comision" style="display:none;margin-top:8px;">
          <div style="height:1px;background:var(--border);margin-bottom:16px;"></div>
          <div class="form-grid">
            <div class="form-group span-2">
              <label class="form-label">Zona Geográfica Asignada</label>
              <input id="n-zona" type="text" class="form-input" value="${v('zona_asignada')}" placeholder="Ej. Zona Metropolitana Norte" />
            </div>
            <div class="form-group span-2">
              <label class="form-label">Días de Presentación en Oficina</label>
              <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;">
                ${diasPres.map(d=>`
                  <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:.88rem;color:var(--text-secondary);">
                    <input type="checkbox" name="dias-presentacion" value="${d}" style="width:15px;height:15px;accent-color:var(--gold-primary);"
                      ${Array.isArray(diasPresArr)&&diasPresArr.includes(d)?'checked':''}> ${d}
                  </label>`).join('')}
              </div>
            </div>
            <div class="form-group span-2">
              <label class="form-label">Horario de Presentación</label>
              <input id="n-horario-pres" type="text" class="form-input" value="${v('horario_presentacion')}" placeholder="Ej. 10:00-12:00 y 16:00-18:00 hrs" />
            </div>
            <div class="form-group span-2">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <label class="form-label">Tabla de Comisiones <span class="req">*</span></label>
                <button class="btn-secondary btn-sm" onclick="agregarComision()">+ Agregar rango</button>
              </div>
              <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:10px;">Descripción del rango — Comisión aplicable</div>
              <div id="comisiones-container"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── TAB 4: CONTACTOS ── -->
      <div id="mtab-contactos" class="modal-tab-content" style="display:none;">
        <div style="font-weight:700;font-size:.92rem;margin-bottom:14px;">🚨 Contacto de Emergencia</div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Nombre Completo</label>
            <input id="n-em-nombre" type="text" class="form-input" value="${v('contacto_emergencia_nombre')}" placeholder="Nombre del contacto" />
          </div>
          <div class="form-group">
            <label class="form-label">Parentesco</label>
            <input id="n-em-parent" type="text" class="form-input" value="${v('contacto_emergencia_parentesco')}" placeholder="Ej. Cónyuge, Madre" />
          </div>
          <div class="form-group">
            <label class="form-label">Teléfono</label>
            <input id="n-em-tel" type="text" class="form-input" value="${v('contacto_emergencia_telefono')}" placeholder="55 1234 5678" />
          </div>
        </div>
        <div style="height:1px;background:var(--border);margin:20px 0;"></div>
        <div style="font-weight:700;font-size:.92rem;margin-bottom:4px;">📋 Beneficiarios (Art. 25 fracc. X LFT)</div>
        <div class="helper-text" style="margin-bottom:16px;">Personas que recibirán las prestaciones laborales en caso de fallecimiento del trabajador</div>
        <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Beneficiario 1</div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Nombre Completo</label>
            <input id="n-b1-nombre" type="text" class="form-input" value="${v('beneficiario1_nombre')}" placeholder="Nombre del beneficiario" />
          </div>
          <div class="form-group">
            <label class="form-label">Parentesco</label>
            <input id="n-b1-parent" type="text" class="form-input" value="${v('beneficiario1_parentesco')}" placeholder="Ej. Hijo/a, Cónyuge" />
          </div>
          <div class="form-group">
            <label class="form-label">Teléfono</label>
            <input id="n-b1-tel" type="text" class="form-input" value="${v('beneficiario1_telefono')}" placeholder="55 1234 5678" />
          </div>
        </div>
        <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin:14px 0 10px;">Beneficiario 2 (opcional)</div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Nombre Completo</label>
            <input id="n-b2-nombre" type="text" class="form-input" value="${v('beneficiario2_nombre')}" placeholder="Nombre del beneficiario" />
          </div>
          <div class="form-group">
            <label class="form-label">Parentesco</label>
            <input id="n-b2-parent" type="text" class="form-input" value="${v('beneficiario2_parentesco')}" placeholder="Ej. Hijo/a, Cónyuge" />
          </div>
          <div class="form-group">
            <label class="form-label">Teléfono</label>
            <input id="n-b2-tel" type="text" class="form-input" value="${v('beneficiario2_telefono')}" placeholder="55 1234 5678" />
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div id="trab-modal-error" class="error-msg" style="display:none;margin:0 24px 8px;flex-shrink:0;"></div>
      <div class="modal-footer" style="flex-shrink:0;">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="handleGuardarTrabajador('${id||''}')">
          💾 ${esEdicion ? 'Guardar cambios' : 'Guardar y generar contrato'}
        </button>
      </div>
    </div>
  `);

  onTipoContratoChange();
  _actualizarLimitesPrueba();
  _actualizarPreviewSalario();
  if (trab?.temporadas?.length) trab.temporadas.forEach(t => agregarTemporada(t));
  if (trab?.tabla_comisiones?.length) trab.tabla_comisiones.forEach(c => agregarComision(c));
}

function switchModalTab(btn, tabId) {
  document.querySelectorAll('.modal-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.modal-tab-content').forEach(el => el.style.display = 'none');
  const tab = eid(tabId);
  if (tab) tab.style.display = '';
}

function onTipoContratoChange() {
  const tipo = eid('n-contrato')?.value || 'indeterminado';
  const show = id => { const el = eid(id); if (el) el.style.display = ''; };
  const hide = id => { const el = eid(id); if (el) el.style.display = 'none'; };
  tipo === 'determinado' ? show('grupo-prueba') : hide('grupo-prueba');
  tipo === 'determinado' ? show('cond-determinado') : hide('cond-determinado');
  tipo === 'obra'        ? show('cond-obra')        : hide('cond-obra');
  tipo === 'temporada'   ? show('cond-temporada')   : hide('cond-temporada');
  tipo === 'comision'    ? show('cond-comision')     : hide('cond-comision');
  if (tipo === 'temporada' && eid('temporadas-container') && !eid('temporadas-container').children.length) agregarTemporada();
  if (tipo === 'comision'  && eid('comisiones-container') && !eid('comisiones-container').children.length) agregarComision();
  if (tipo === 'determinado') calcularFechaVencimiento();
}

/** Actualiza los textos de ayuda de los topes legales de prueba/capacitación
 *  según si el puesto es de dirección/confianza (Art. 39-A/39-B LFT). */
function _actualizarLimitesPrueba() {
  const esDireccion = eid('n-es-direccion')?.checked || false;
  const hintPrueba = eid('n-prueba-hint');
  if (hintPrueba) {
    hintPrueba.textContent = esDireccion
      ? 'Máximo 180 días para puestos de dirección/confianza (Art. 39-A LFT). La fecha de vencimiento se calcula automáticamente.'
      : 'Máximo 30 días (Art. 39-A LFT). La fecha de vencimiento se calcula automáticamente.';
  }
  const hintCap = eid('n-capacitacion-hint');
  if (hintCap) {
    hintCap.textContent = esDireccion
      ? 'Máximo 180 días para puestos de dirección/técnicos especializados (Art. 39-B LFT).'
      : 'Máximo 90 días (180 en puestos de dirección/técnicos especializados) (Art. 39-B LFT).';
  }
}

/**
 * Valida los topes legales de periodo a prueba (Art. 39-A LFT) y capacitación
 * inicial (Art. 39-B LFT): 30/90 días para puestos generales, 180 días para
 * puestos de dirección, confianza o técnicos/profesionales especializados.
 * Regresa un mensaje de error (bloqueante) o null si todo está en regla.
 */
function _validarPeriodosContrato(esDireccion, pruebaDias, capacitacionDias) {
  const maxPrueba = esDireccion ? 180 : 30;
  if (pruebaDias && pruebaDias > maxPrueba) {
    return `El periodo a prueba (${pruebaDias} días) excede el máximo de ${maxPrueba} días para este tipo de puesto (Art. 39-A LFT). ` +
      'Al vencer el periodo de prueba sin terminación expresa, la relación continúa por tiempo indeterminado y se computa la antigüedad desde el inicio.';
  }
  const maxCapacitacion = esDireccion ? 180 : 90;
  if (capacitacionDias && capacitacionDias > maxCapacitacion) {
    return `La capacitación inicial (${capacitacionDias} días) excede el máximo de ${maxCapacitacion} días para este tipo de puesto (Art. 39-B LFT).`;
  }
  return null;
}

function calcularFechaVencimiento() {
  const dias   = parseInt(eid('n-prueba')?.value) || 30;
  const ingreso = eid('n-ingreso')?.value;
  if (!ingreso) return;
  const fecha = new Date(ingreso + 'T00:00:00');
  fecha.setDate(fecha.getDate() + dias);
  const venc = eid('n-vencimiento');
  if (venc && !venc.dataset.manual) venc.value = fecha.toISOString().split('T')[0];
}

document.addEventListener('change', e => {
  if (e.target?.id === 'n-vencimiento') e.target.dataset.manual = '1';
  if (e.target?.id === 'n-ingreso' || e.target?.id === 'n-prueba') {
    const venc = eid('n-vencimiento');
    if (venc) delete venc.dataset.manual;
    calcularFechaVencimiento();
  }
});

function agregarTemporada(data = {}) {
  const c = eid('temporadas-container');
  if (!c || c.children.length >= 5) return;
  const div = document.createElement('div');
  div.className = 'dyn-row dyn-row-3';
  div.innerHTML = `
    <input type="text" class="form-input" name="temp-nombre" placeholder="Ej. Temporada Alta" value="${data.nombre||''}" />
    <input type="date" class="form-input" name="temp-inicio" value="${data.inicio||''}" />
    <input type="date" class="form-input" name="temp-fin" value="${data.fin||''}" />
    <button class="btn-danger btn-sm dyn-row" onclick="this.closest('.dyn-row').remove()" title="Eliminar">🗑</button>
  `;
  c.appendChild(div);
}

function agregarComision(data = {}) {
  const c = eid('comisiones-container');
  if (!c) return;
  const div = document.createElement('div');
  div.className = 'dyn-row dyn-row-2';
  div.innerHTML = `
    <input type="text" class="form-input" name="com-rango" placeholder="Ej. De 1 a 3 ventas" value="${data.rango||''}" />
    <input type="text" class="form-input" name="com-valor" placeholder="Ej. $50 por venta" value="${data.comision||''}" />
    <button class="btn-danger btn-sm dyn-row" onclick="this.closest('.dyn-row').remove()" title="Eliminar">🗑</button>
  `;
  c.appendChild(div);
}

function _toggleNominaConfig() {
  const tipo    = document.getElementById('n-tipo-salario')?.value || 'fijo';
  const fondo   = document.getElementById('n-fondo-activo')?.checked;
  const info    = document.getElementById('n-info-activo')?.checked;
  const pension = document.getElementById('n-pension-activa')?.checked;
  const show = (id, vis) => { const el = document.getElementById(id); if (el) el.style.display = vis ? '' : 'none'; };
  show('ng-pct-com',      ['comision','mixto'].includes(tipo));
  show('ng-fondo-pct',    fondo);
  show('ng-info-tipo',    info);
  show('ng-info-val',     info);
  show('ng-pension-tipo', pension);
  show('ng-pension-val',  pension);
}

function validarCamposLegales({ rfc, curp, nss }) {
  if (rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc))
    return 'RFC inválido. Formato esperado: 4 letras + 6 dígitos + 3 alfanuméricos (ej. GOEO801231AB1).';
  if (curp && !/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(curp))
    return 'CURP inválida. Debe tener 18 caracteres en el formato oficial (ej. LOHM900415MDFPRL09).';
  if (nss && !/^\d{11}$/.test(nss))
    return 'NSS inválido. Debe contener exactamente 11 dígitos numéricos.';
  return null;
}

// ── Puestos dentro del alta: cache, autollenado y creación inline ───────────
let _puestosCache = [];

// Al elegir un puesto del catálogo, prellena el tab Laboral. Los campos de texto
// (departamento, funciones, salario) solo se llenan si están vacíos, para no
// pisar lo que el usuario ya haya capturado; los selects toman el valor de la
// plantilla si ésta lo define.
function _onPuestoSeleccionado() {
  const id = eid('n-puesto')?.value;
  if (!id || id === '__keep__') return;
  const p = _puestosCache.find(x => x.id === id);
  if (!p) return;
  const setIfEmpty = (elId, val) => { const el = eid(elId); if (el && !el.value && val != null && val !== '') el.value = val; };
  const setSel     = (elId, val) => { const el = eid(elId); if (el && val) el.value = val; };
  setIfEmpty('n-dept', p.departamento);
  setIfEmpty('n-funciones', p.funciones);
  setIfEmpty('n-salario', p.salario_sugerido);
  setSel('n-periodo', p.periodo_salario);
  setSel('n-smg', p.smg_zone);
  if (p.tipo_contrato) { const c = eid('n-contrato'); if (c) { c.value = p.tipo_contrato; if (typeof onTipoContratoChange === 'function') onTipoContratoChange(); } }
  if (p.tipo_salario) { const ts = eid('n-tipo-salario'); if (ts) { ts.value = p.tipo_salario; if (typeof _toggleNominaConfig === 'function') _toggleNominaConfig(); } }
  if (p.pct_comision) { const pc = eid('n-pct-comision'); if (pc && !pc.value) pc.value = parseFloat(p.pct_comision) * 100; }
  if (p.es_puesto_direccion) { const dir = eid('n-es-direccion'); if (dir) { dir.checked = true; if (typeof _actualizarLimitesPrueba === 'function') _actualizarLimitesPrueba(); } }
  if (typeof _actualizarPreviewSalario === 'function') _actualizarPreviewSalario();
}

function _toggleNuevoPuestoPanel(mostrar) {
  const panel = eid('n-nuevo-puesto-panel');
  if (panel) panel.style.display = mostrar ? '' : 'none';
  if (mostrar) {
    // Semilla: reusar lo ya capturado en el tab Laboral
    const np = eid('np-nombre'); if (np && !np.value) np.value = '';
    const nd = eid('np-dept'); if (nd && !nd.value) nd.value = eid('n-dept')?.value || '';
    const nf = eid('np-funciones'); if (nf && !nf.value) nf.value = eid('n-funciones')?.value || '';
    const ns = eid('np-salario'); if (ns && !ns.value) ns.value = eid('n-salario')?.value || '';
    eid('np-nombre')?.focus();
  }
}

// Crea el puesto en el catálogo, lo añade al select, lo selecciona y autollena.
async function _guardarNuevoPuestoInline() {
  const err = eid('np-error');
  if (err) err.style.display = 'none';
  const nombre = eid('np-nombre')?.value.trim();
  if (!nombre) { if (err) { err.textContent = 'El nombre del puesto es obligatorio.'; err.style.display = ''; } return; }
  const salario = parseFloat(eid('np-salario')?.value);
  const datos = {
    nombre,
    departamento:     eid('np-dept')?.value.trim() || null,
    funciones:        eid('np-funciones')?.value.trim() || null,
    salario_sugerido: isNaN(salario) ? null : salario,
    periodo_salario:  eid('np-periodo')?.value || 'mensual',
  };
  try {
    const nuevo = await db.createPuesto(datos, CTX.empresa.id);
    _puestosCache.push(nuevo);
    const sel = eid('n-puesto');
    if (sel) {
      const opt = document.createElement('option');
      opt.value = nuevo.id; opt.textContent = nuevo.nombre;
      sel.appendChild(opt);
      sel.value = nuevo.id;
    }
    _toggleNuevoPuestoPanel(false);
    _onPuestoSeleccionado();
    if (typeof showToast === 'function') showToast('✅ Puesto creado y guardado en el catálogo.', 'success', 3500);
  } catch (e) {
    if (err) { err.textContent = e.message; err.style.display = ''; }
  }
}

async function handleGuardarTrabajador(id = '') {
  const err = eid('trab-modal-error');
  err.style.display = 'none';

  const nombre  = eid('n-nombre')?.value.trim();
  // El puesto se elige del catálogo: el value del select es el puesto_id
  // (o '__keep__' para conservar el texto de un trabajador legado).
  const puestoSel = eid('n-puesto');
  const puestoId  = puestoSel && puestoSel.value && puestoSel.value !== '__keep__' ? puestoSel.value : null;
  const puestoTxt = puestoSel && puestoSel.value
    ? (puestoSel.options[puestoSel.selectedIndex]?.textContent || '').replace(/\s*\(actual\)\s*$/, '').trim()
    : '';
  const puesto  = puestoTxt;
  const ingreso = eid('n-ingreso')?.value;
  const salario = parseFloat(eid('n-salario')?.value);

  if (!nombre) {
    err.textContent = 'El nombre es obligatorio (Tab Datos Personales).';
    err.style.display = '';
    switchModalTab(document.querySelector('.modal-tab'), 'mtab-personal');
    return;
  }
  if (!puesto || !ingreso || !salario) {
    err.textContent = 'Puesto, Fecha de ingreso y Salario son obligatorios (Tab Laboral).';
    err.style.display = '';
    return;
  }

  const errLegal = validarCamposLegales({
    rfc:  eid('n-rfc')?.value.trim().toUpperCase() || '',
    curp: eid('n-curp')?.value.trim().toUpperCase() || '',
    nss:  eid('n-nss')?.value.trim() || '',
  });
  if (errLegal) {
    err.textContent = errLegal;
    err.style.display = '';
    switchModalTab(document.querySelector('.modal-tab'), 'mtab-personal');
    return;
  }

  const esPuestoDireccion = eid('n-es-direccion')?.checked || false;
  const errPeriodos = _validarPeriodosContrato(
    esPuestoDireccion,
    parseInt(eid('n-prueba')?.value) || null,
    parseInt(eid('n-capacitacion')?.value) || null,
  );
  if (errPeriodos) {
    err.textContent = errPeriodos;
    err.style.display = '';
    return;
  }

  const dias_semana       = [...document.querySelectorAll('input[name="dias-semana"]:checked')].map(cb => cb.value);
  const dias_presentacion = [...document.querySelectorAll('input[name="dias-presentacion"]:checked')].map(cb => cb.value);

  const temporadas = [...document.querySelectorAll('.temporada-row, .dyn-row-3')].map(row => ({
    nombre: row.querySelector('[name="temp-nombre"]')?.value.trim(),
    inicio: row.querySelector('[name="temp-inicio"]')?.value,
    fin:    row.querySelector('[name="temp-fin"]')?.value,
  })).filter(t => t.nombre);

  const tabla_comisiones = [...document.querySelectorAll('.comision-row, .dyn-row-2')].map(row => ({
    rango:    row.querySelector('[name="com-rango"]')?.value.trim(),
    comision: row.querySelector('[name="com-valor"]')?.value.trim(),
  })).filter(c => c.rango);

  const nv = id => eid(id)?.value || null;

  const datos = {
    nombre, puesto,
    puesto_id:      puestoId,
    rfc:            eid('n-rfc')?.value.trim().toUpperCase() || null,
    curp:           eid('n-curp')?.value.trim().toUpperCase() || null,
    nss:            eid('n-nss')?.value.trim() || null,
    departamento:   eid('n-dept')?.value.trim() || null,
    fecha_ingreso:  ingreso,
    salario_mensual:        salario,
    periodo_salario:        nv('n-periodo') || 'mensual',
    tipo_contrato:          nv('n-contrato') || 'indeterminado',
    smg_zone:               nv('n-smg') || 'general',
    sucursal_id:            nv('n-sucursal') || null,
    edad:                   parseInt(eid('n-edad')?.value) || null,
    estado_civil:           nv('n-civil'),
    nacionalidad:           eid('n-nacionalidad')?.value.trim() || 'Mexicana',
    domicilio:              eid('n-domicilio-part')?.value.trim() || null,
    tipo_identificacion:    nv('n-tipo-id'),
    num_identificacion:     eid('n-num-id')?.value.trim() || null,
    tipo_sangre:            nv('n-sangre'),
    enfermedades_cronicas:  eid('n-enfermedades')?.value.trim() || null,
    fecha_ingreso_reconocida: nv('n-antig'),
    es_puesto_direccion:    esPuestoDireccion,
    periodo_prueba_dias:    parseInt(nv('n-prueba')) || 30,
    capacitacion_inicial_dias: parseInt(nv('n-capacitacion')) || null,
    funciones:              eid('n-funciones')?.value.trim() || null,
    forma_pago:             nv('n-forma-pago') || 'deposito',
    dias_pago:              eid('n-dias-pago')?.value.trim() || null,
    hora_inicio:            nv('n-hora-ini'),
    hora_fin:               nv('n-hora-fin'),
    hora_descanso_inicio:   nv('n-des-ini'),
    hora_descanso_fin:      nv('n-des-fin'),
    dias_semana:            dias_semana.length ? dias_semana : null,
    dia_descanso:           nv('n-dia-descanso'),
    fecha_vencimiento_contrato: nv('n-vencimiento'),
    nombre_proyecto:        eid('n-proyecto')?.value.trim() || null,
    fecha_fin_proyecto:     nv('n-fin-proyecto'),
    temporadas:             temporadas.length ? temporadas : null,
    zona_asignada:          eid('n-zona')?.value.trim() || null,
    dias_presentacion:      dias_presentacion.length ? dias_presentacion : null,
    horario_presentacion:   eid('n-horario-pres')?.value.trim() || null,
    tabla_comisiones:       tabla_comisiones.length ? tabla_comisiones : null,
    tipo_salario:         nv('n-tipo-salario') || 'fijo',
    pct_comision:         parseFloat(eid('n-pct-comision')?.value || 0) / 100 || 0,
    fondo_ahorro_activo:  eid('n-fondo-activo')?.checked || false,
    fondo_ahorro_pct:     parseFloat(eid('n-fondo-pct')?.value || 13) / 100 || 0.13,
    infonavit_activo:     eid('n-info-activo')?.checked || false,
    infonavit_tipo:       nv('n-info-tipo') || null,
    infonavit_valor:      parseFloat(eid('n-info-valor')?.value || 0) || 0,
    pension_activa:       eid('n-pension-activa')?.checked || false,
    pension_tipo:         nv('n-pension-tipo') || null,
    pension_valor:        parseFloat(eid('n-pension-valor')?.value || 0) || 0,
    contacto_emergencia_nombre:     eid('n-em-nombre')?.value.trim() || null,
    contacto_emergencia_parentesco: eid('n-em-parent')?.value.trim() || null,
    contacto_emergencia_telefono:   eid('n-em-tel')?.value.trim() || null,
    beneficiario1_nombre:     eid('n-b1-nombre')?.value.trim() || null,
    beneficiario1_parentesco: eid('n-b1-parent')?.value.trim() || null,
    beneficiario1_telefono:   eid('n-b1-tel')?.value.trim() || null,
    beneficiario2_nombre:     eid('n-b2-nombre')?.value.trim() || null,
    beneficiario2_parentesco: eid('n-b2-parent')?.value.trim() || null,
    beneficiario2_telefono:   eid('n-b2-tel')?.value.trim() || null,
  };

  const btn = document.querySelector('#modal-container .btn-primary');
  if (btn) { btn.textContent = 'Guardando…'; btn.disabled = true; }

  try {
    if (id) {
      const trabActual = await db.getTrabajador(id);
      await db.updateTrabajador(id, datos);
      if (trabActual && datos.salario_mensual !== trabActual.salario_mensual) {
        const motivo = eid('n-motivo-salario')?.value.trim() || null;
        await db.registrarCambioSalario(id, trabActual.salario_mensual, datos.salario_mensual, motivo, CTX.empresa.id).catch(() => {});
      }
      // Migración 19: si cambió el salario, registrar movimiento IMSS de
      // modificación de salario con el SBC anterior y el nuevo.
      if (trabActual && datos.salario_mensual !== trabActual.salario_mensual && typeof calcularSBC === 'function') {
        const sbcAnterior = typeof calcularSBC === 'function' ? calcularSBC(trabActual) : null;
        const sbcNuevo     = calcularSBC({ ...trabActual, ...datos });
        const { error: errSbc } = await window.supabase.from('trabajadores').update({ sbc: sbcNuevo, fecha_ultimo_sbc: new Date().toISOString().split('T')[0] }).eq('id', id);
        if (errSbc) console.warn('No se pudo actualizar el SBC:', errSbc.message);
        await registrarMovimientoIMSS(CTX.empresa.id, id, 'modificacion_salario', { sbcAnterior, sbcNuevo });
      }
      closeModal();
      navigate('empleado', id);
    } else {
      const trab     = await db.createTrabajador(datos, CTX.empresa.id);
      await db.createContrato({ trabajador_id: trab.id, tipo: datos.tipo_contrato }, CTX.empresa.id);
      const sucursal = datos.sucursal_id ? await db.getSucursal(datos.sucursal_id) : null;
      generateContratoPDF(CTX.empresa, trab, sucursal);
      // Migración 19: alta de trabajador → movimiento IMSS 'alta' pendiente.
      if (typeof registrarMovimientoIMSS === 'function') {
        const sbcInicial = typeof calcularSBC === 'function' ? calcularSBC(trab) : null;
        const { error: errSbc } = await window.supabase.from('trabajadores').update({ sbc: sbcInicial, fecha_ultimo_sbc: new Date().toISOString().split('T')[0] }).eq('id', trab.id);
        if (errSbc) console.warn('No se pudo actualizar el SBC:', errSbc.message);
        await registrarMovimientoIMSS(CTX.empresa.id, trab.id, 'alta', { sbcNuevo: sbcInicial });
      }
      closeModal();
      navigate('empleados');
    }
  } catch(e) {
    err.textContent = e.message;
    err.style.display = '';
    if (btn) { btn.textContent = '💾 Guardar'; btn.disabled = false; }
  }
}

// ═══════════════════════════════════════════════════════
//  PERFIL DE EMPLEADO
// ═══════════════════════════════════════════════════════
async function renderPerfilEmpleado(id) {
  if (!id) { navigate('empleados'); return; }
  try {
    const [trab, actas, contratos, asistencia, histSalarios] = await Promise.all([
      db.getTrabajador(id),
      db.getActas({ trabajadorId: id }),
      db.getContratos(id),
      db.getAsistencia(id, mesActual()),
      db.getHistorialSalarios(id).catch(() => []),
    ]);
    const sucursal = trab.sucursal_id ? await db.getSucursal(trab.sucursal_id) : null;
    if (!trab) { navigate('empleados'); return; }

    const start = new Date(trab.fecha_ingreso + 'T00:00:00');
    const end   = trab.estado === 'baja' && trab.fecha_baja ? new Date(trab.fecha_baja+'T00:00:00') : new Date();
    const antiguedad = antiguedadLabel(start, end);
    const faltas30 = await db.getFaltasRecientes30Dias(id);

    const dias      = diasParaVencimiento(trab.fecha_vencimiento_contrato);
    const necesitaRenovar = (trab.tipo_contrato === 'determinado') && dias !== null;

    const main = eid('main-view');
    main.innerHTML = `
      <button class="btn-secondary btn-sm" onclick="navigate('empleados')" style="margin-bottom:16px;">← Volver</button>

      <div class="perfil-header animate-in">
        <div style="display:flex;align-items:center;gap:16px;">
          <div class="perfil-avatar">${iniciales(trab.nombre)}</div>
          <div class="perfil-info">
            <div class="perfil-nombre">${trab.nombre} ${badgeCalidad(trab.tipo_contrato)}</div>
            <div class="perfil-meta">${trab.puesto || '—'}${trab.departamento ? ' · ' + trab.departamento : ''} · Ingreso: ${formatDateShort(trab.fecha_ingreso)} · ${antiguedad}</div>
            ${trab.fecha_vencimiento_contrato && dias !== null ? `
            <div style="margin-top:6px;font-size:.82rem;">
              📅 Vencimiento: <strong>${formatDateShort(trab.fecha_vencimiento_contrato)}</strong>
              <span style="margin-left:8px;font-weight:700;color:${dias<=3?'var(--red-warn)':dias<=7?'#f39c12':'var(--gold-primary)'};">
                ${dias < 0 ? '⚠️ VENCIDO' : dias === 0 ? '⚠️ Vence HOY' : `⏰ ${dias} día${dias!==1?'s':''} restante${dias!==1?'s':''}`}
              </span>
            </div>` : ''}
          </div>
        </div>
        <div class="perfil-actions">
          <button class="btn-secondary" onclick="showModalTrabajador('${id}')">✏️ Editar datos</button>
          ${necesitaRenovar ? `
            <button class="btn-secondary" style="border-color:var(--green-ok);color:var(--green-ok);"
              onclick="renovarAPlanta('${id}')">🏭 Renovar a Planta</button>
          ` : ''}
          ${trab.estado === 'activo' ? `
            <button class="btn-secondary" onclick="showModalActa('${id}')">⚠️ Nueva acta</button>
            <button class="btn-primary" onclick="navigate('bajas','${id}')">🚪 Procesar baja</button>
          ` : '<span class="badge badge-baja" style="padding:8px 14px;">Dado de baja</span>'}
        </div>
      </div>

      ${alertaVencHTML(dias, trab.tipo_contrato)}

      ${faltas30.length >= 3 ? `
        <div class="alert alert-danger animate-in">
          <span>⚠️</span>
          <span><strong>Atención:</strong> ${trab.nombre} acumula <strong>${faltas30.length} faltas injustificadas</strong> en los últimos 30 días (Art. 47 Fracc. X LFT).
          <button class="btn-danger btn-sm" style="margin-left:12px;" onclick="showModalActa('${id}','rescisoria','asistencia')">Generar acta</button></span>
        </div>
      ` : ''}

      <div class="tabs animate-in">
        <button class="tab-btn active" onclick="switchTab(this,'tab-datos')">📋 Datos</button>
        <button class="tab-btn" onclick="switchTab(this,'tab-asistencia')">🗓 Asistencia (${asistencia.length})</button>
        <button class="tab-btn" onclick="switchTab(this,'tab-actas')">⚠️ Actas (${actas.length})</button>
        <button class="tab-btn" onclick="switchTab(this,'tab-contratos')">📄 Contratos (${contratos.length})</button>
        <button class="tab-btn" onclick="switchTab(this,'tab-salarios')">💵 Salarios (${histSalarios.length})</button>
        <button class="tab-btn" onclick="switchTab(this,'tab-expediente');renderTabExpediente('${id}')">🗂️ Expediente</button>
        <button class="tab-btn" onclick="switchTab(this,'tab-descuentos');renderTabDescuentos('${id}')">💳 Descuentos</button>
        <button class="tab-btn" onclick="switchTab(this,'tab-prestaciones');renderTabPrestaciones('${id}')">🎁 Prestaciones</button>
        <button class="tab-btn" onclick="switchTab(this,'tab-resguardos');renderTabResguardos('${id}')">🧰 Resguardos</button>
      </div>

      <div id="tab-datos" class="animate-in">
        <div class="card" style="margin-bottom:14px;">
          <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px;">Datos Personales</div>
          <div class="form-grid">
            ${filaInfo('RFC', trab.rfc)} ${filaInfo('CURP', trab.curp)}
            ${filaInfo('NSS', trab.nss)} ${filaInfo('Edad', trab.edad ? trab.edad + ' años' : null)}
            ${filaInfo('Estado civil', trab.estado_civil)} ${filaInfo('Nacionalidad', trab.nacionalidad)}
            ${filaInfo('Tipo de sangre', trab.tipo_sangre)} ${filaInfo('Identificación', trab.tipo_identificacion ? `${trab.tipo_identificacion}: ${trab.num_identificacion||''}` : null)}
            ${trab.domicilio ? filaInfo('Domicilio', trab.domicilio) : ''}
            ${trab.enfermedades_cronicas ? filaInfo('Condiciones médicas', trab.enfermedades_cronicas) : ''}
          </div>
        </div>
        <div class="card" style="margin-bottom:14px;">
          <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px;">Datos Laborales</div>
          <div class="form-grid">
            ${filaInfo(`Salario ${_labelPeriodoSalario(trab.periodo_salario||'mensual').toLowerCase()}`, fmt(trab.salario_mensual))}
            ${filaInfo('Salario diario (Art. 89 LFT)', fmt(calcSalarioDiario(trab.salario_mensual, trab.periodo_salario || 'mensual')))}
            ${filaInfo('SDI estimado', fmt((() => { const pr = prestacionesEmpresa(); return calcSDI(calcSalarioDiario(trab.salario_mensual, trab.periodo_salario || 'mensual'), vacDaysForYear(1, pr.vacDiasExtra), pr.primaVacPct, pr.aguinaldoDias); })()))}
            ${filaInfo('SBC vigente (Art. 27 LSS)', `
              ${trab.sbc ? fmt(trab.sbc) : '<span style="color:var(--text-muted);">Sin calcular</span>'}
              <span style="font-size:.7rem;color:var(--text-muted);margin-left:6px;">
                ${typeof calcularFactorIntegracion === 'function' ? 'Factor ' + calcularFactorIntegracion(trab).toFixed(4) : ''}
                ${trab.fecha_ultimo_sbc ? ' · actualizado ' + formatDateShort(trab.fecha_ultimo_sbc) : ''}
              </span>
              <button class="btn-secondary btn-sm" style="margin-left:8px;" onclick="_recalcularSBCYRefrescar('${id}')">🔄 Recalcular SBC</button>
            `)}
            ${filaInfo('Tipo de contrato', {indeterminado:'Tiempo Indeterminado',indefinido:'Tiempo Indeterminado',determinado:'Tiempo Determinado',obra:'Obra o Servicio',temporada:'Temporada',comision:'Por Comisión'}[trab.tipo_contrato]||trab.tipo_contrato)}
            ${filaInfo('Zona SMG', trab.smg_zone === 'frontera' ? 'Frontera Norte' : 'Área General')}
            ${filaInfo('Centro de Trabajo', sucursal ? `${sucursal.nombre}${sucursal.ciudad ? ' — ' + sucursal.ciudad : ''}` : 'Matriz')}
            ${filaInfo('Forma de pago', trab.forma_pago === 'efectivo' ? 'Efectivo' : 'Depósito bancario')}
            ${trab.dias_pago ? filaInfo('Días de pago', trab.dias_pago) : ''}
            ${trab.funciones ? filaInfo('Funciones', trab.funciones) : ''}
            ${trab.hora_inicio ? filaInfo('Horario', `${trab.hora_inicio} – ${trab.hora_fin||''}${trab.hora_descanso_inicio ? '  |  Comida: '+trab.hora_descanso_inicio+' – '+(trab.hora_descanso_fin||'') : ''}`) : ''}
            ${trab.dias_semana?.length ? filaInfo('Días laborales', trab.dias_semana.join(', ')) : ''}
            ${trab.estado === 'baja' ? filaInfo('Fecha de baja', formatDateShort(trab.fecha_baja)) + filaInfo('Tipo de baja', trab.tipo_baja) : ''}
          </div>
        </div>
        ${trab.estado === 'activo' ? _cardCostoYSalida(trab) : ''}
        ${(trab.contacto_emergencia_nombre || trab.beneficiario1_nombre) ? `
        <div class="card">
          <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px;">Contactos</div>
          <div class="form-grid">
            ${trab.contacto_emergencia_nombre ? filaInfo('Emergencia', `${trab.contacto_emergencia_nombre} (${trab.contacto_emergencia_parentesco||''}) — ${trab.contacto_emergencia_telefono||''}`) : ''}
            ${trab.beneficiario1_nombre ? filaInfo('Beneficiario 1', `${trab.beneficiario1_nombre} (${trab.beneficiario1_parentesco||''})`) : ''}
            ${trab.beneficiario2_nombre ? filaInfo('Beneficiario 2', `${trab.beneficiario2_nombre} (${trab.beneficiario2_parentesco||''})`) : ''}
          </div>
        </div>` : ''}
      </div>

      <div id="tab-asistencia" style="display:none;" class="animate-in">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <strong>Mes actual: ${mesActual()}</strong>
          ${trab.estado === 'activo' ? `<button class="btn-primary btn-sm" onclick="showModalAsistencia('${id}')">+ Registrar incidencia</button>` : ''}
        </div>
        ${tablaAsistencia(asistencia)}
      </div>

      <div id="tab-actas" style="display:none;" class="animate-in">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <strong>Historial de actas</strong>
          ${trab.estado === 'activo' ? `<button class="btn-primary btn-sm" onclick="showModalActa('${id}')">+ Nueva acta</button>` : ''}
        </div>
        ${tablaActas(actas, trab)}
      </div>

      <div id="tab-contratos" style="display:none;" class="animate-in">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <strong>Contratos generados</strong>
          <button class="btn-secondary btn-sm" onclick="reGenerarContrato('${id}')">🖨 Re-generar contrato</button>
        </div>
        ${contratos.length === 0
          ? `<div class="empty-state"><div class="empty-state-icon">📄</div><div class="empty-state-title">Sin contratos registrados</div></div>`
          : `<div class="table-wrap"><table class="data-table"><thead><tr><th>Tipo</th><th>Fecha generación</th></tr></thead><tbody>
              ${contratos.map(c=>`<tr><td>${{indefinido:'Tiempo Indeterminado',determinado:'Tiempo Determinado',obra:'Obra o Servicio',temporada:'Temporada'}[c.tipo]||c.tipo}</td><td>${formatDateShort(c.fecha_generacion)}</td></tr>`).join('')}
            </tbody></table></div>`
        }
      </div>

      <div id="tab-salarios" style="display:none;" class="animate-in">
        <div style="margin-bottom:14px;">
          <strong>Historial de ajustes salariales</strong>
          <div style="font-size:.8rem;color:var(--text-muted);margin-top:4px;">Se registra automáticamente cada vez que se modifica el salario del trabajador.</div>
        </div>
        ${histSalarios.length === 0
          ? `<div class="empty-state"><div class="empty-state-icon">💵</div><div class="empty-state-title">Sin ajustes salariales registrados</div><p style="font-size:.82rem;color:var(--text-muted);margin-top:8px;">Los cambios futuros al salario quedarán registrados aquí.</p></div>`
          : `<div class="table-wrap"><table class="data-table">
              <thead><tr><th>Fecha</th><th>Salario anterior</th><th>Salario nuevo</th><th>Variación</th><th>Motivo</th></tr></thead>
              <tbody>${histSalarios.map(h => {
                const variacion = ((h.salario_nuevo - h.salario_anterior) / h.salario_anterior * 100).toFixed(1);
                const color = h.salario_nuevo >= h.salario_anterior ? 'var(--green-ok)' : 'var(--red-warn)';
                const signo = h.salario_nuevo >= h.salario_anterior ? '+' : '';
                return `<tr>
                  <td>${formatDateShort(h.fecha_cambio)}</td>
                  <td>$${parseFloat(h.salario_anterior).toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                  <td><strong>$${parseFloat(h.salario_nuevo).toLocaleString('es-MX',{minimumFractionDigits:2})}</strong></td>
                  <td style="color:${color};font-weight:700;">${signo}${variacion}%</td>
                  <td style="color:var(--text-muted);font-size:.82rem;">${h.motivo || '—'}</td>
                </tr>`;
              }).join('')}</tbody>
            </table></div>`
        }
      </div>

      <div id="tab-expediente" style="display:none;" class="animate-in"></div>
      <div id="tab-descuentos" style="display:none;" class="animate-in"></div>
      <div id="tab-prestaciones" style="display:none;" class="animate-in"></div>
      <div id="tab-resguardos" style="display:none;" class="animate-in"></div>
    `;

    window._perfilActivoId = id;
    window._perfilActivoTrab = trab;
  } catch(e) { showError(e); }
}

function filaInfo(label, value) {
  return `<div class="form-group"><label class="form-label">${label}</label><div style="padding:10px 0;font-size:.95rem;font-weight:600;">${value || '—'}</div></div>`;
}

/**
 * Card "Costo y escenarios de salida" del perfil:
 * · Costo real mensual para la empresa (costoTotalEmpleado — migración 32)
 * · Simulador de despido: liquidación (injustificado) vs finiquito (renuncia)
 *   con el mismo motor que usa el módulo de Bajas. Todo informativo.
 */
function _cardCostoYSalida(trab) {
  if (typeof costoTotalEmpleado !== 'function' || typeof calcLiquidacion !== 'function') return '';
  let c, liq, fin;
  try {
    c = costoTotalEmpleado(trab);
    const params = {
      startDate:      new Date(trab.fecha_ingreso + 'T00:00:00'),
      endDate:        new Date(),
      salario:        parseFloat(trab.salario_mensual) || 0,
      monthlySalary:  parseFloat(trab.salario_mensual) || 0,
      periodoSalario: trab.periodo_salario || 'mensual',
      smgZone:        trab.smg_zone || 'general',
      diasPendientes: 0,
    };
    liq = calcLiquidacion(params);
    fin = calcFiniquito(params);
  } catch(e) { console.warn('costo/salida:', e.message); return ''; }

  const filaEscenario = (titulo, sub, r, color) => `
    <div style="flex:1;min-width:240px;border:1px solid var(--border);border-radius:var(--radius-md);padding:14px 16px;">
      <div style="font-weight:700;">${titulo}</div>
      <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:8px;">${sub}</div>
      <div style="font-size:1.35rem;font-weight:800;color:${color};">${fmt(r.total)}</div>
      <div style="font-size:.75rem;color:var(--text-muted);margin-top:8px;">
        ${r.items.filter(i => i.amount > 0).map(i => `${i.name.replace(/\s*\(Art[^)]*\)/,'')}: <strong>${fmt(i.amount)}</strong>`).join(' · ')}
      </div>
    </div>`;

  return `
    <div class="card" style="margin-bottom:14px;">
      <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px;">
        💰 Costo y escenarios de salida <span style="font-weight:400;text-transform:none;letter-spacing:0;">(informativo — cifras de hoy)</span>
      </div>
      <div class="form-grid" style="margin-bottom:14px;">
        ${filaInfo('Costo real mensual para la empresa', `${fmt(c.total)} <span style="font-size:.75rem;color:var(--text-muted);">(× ${c.factorSobreSalario} del salario)</span>`)}
        ${filaInfo('Cuotas IMSS patronales / mes', fmt(c.imssPatronal))}
        ${filaInfo('INFONAVIT 5% + ISN / mes', fmt(c.infonavit + c.isn))}
        ${filaInfo('Provisiones aguinaldo + vacaciones + prima / mes', fmt(c.provAguinaldo + c.provVacaciones + c.provPrimaVac))}
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        ${filaEscenario('Despido injustificado', 'Liquidación — Art. 50 LFT (3 meses + 20 días/año + prima antigüedad + proporcionales)', liq, 'var(--red-warn)')}
        ${filaEscenario('Renuncia voluntaria', 'Finiquito — proporcionales devengados', fin, 'var(--green-ok)')}
      </div>
      <div style="font-size:.72rem;color:var(--text-muted);margin-top:10px;">
        Mismo motor de cálculo que el módulo de Bajas (SDI ${fmt(liq.sdi)}, antigüedad ${liq.frac.toFixed(2)} años). No incluye salarios pendientes ni vacaciones de años anteriores no gozadas — captúralos al procesar la baja real.
      </div>
    </div>`;
}

function tablaAsistencia(items) {
  if (!items.length) return `<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-title">Sin incidencias este mes</div></div>`;
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Justificada</th><th>Observaciones</th><th></th></tr></thead><tbody>
    ${items.map(a=>`<tr>
      <td>${formatDateShort(a.fecha)}</td>
      <td><span class="badge ${a.tipo==='falta'?'badge-falta':'badge-retardo'}">${a.tipo==='falta'?'Falta':'Retardo'}</span></td>
      <td>${a.justificada?'<span style="color:var(--green-ok)">✓ Sí</span>':'<span style="color:var(--red-warn)">✗ No</span>'}</td>
      <td style="color:var(--text-muted);font-size:.82rem;">${a.observaciones||'—'}</td>
      <td><button class="btn-danger btn-sm" onclick="eliminarAsistencia('${a.id}')">🗑</button></td>
    </tr>`).join('')}
  </tbody></table></div>`;
}

function tablaActas(items, trab) {
  if (!items.length) return `<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-title">Sin actas registradas</div></div>`;
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Falta</th><th>Acciones</th></tr></thead><tbody>
    ${items.map(a=>`<tr>
      <td>${formatDateShort(a.fecha)}</td>
      <td>${badgeActa(a.tipo)}</td>
      <td style="font-size:.82rem;color:var(--text-muted);">${a.tipo_falta_label||a.tipo_falta||'—'}</td>
      <td><button class="btn-secondary btn-sm" onclick="reDescargarActa('${a.id}','${trab.id}')">⬇ PDF</button></td>
    </tr>`).join('')}
  </tbody></table></div>`;
}

function switchTab(btn, tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['tab-datos','tab-asistencia','tab-actas','tab-contratos','tab-salarios','tab-expediente','tab-descuentos','tab-prestaciones','tab-resguardos'].forEach(id => {
    const el = eid(id); if (el) el.style.display = id === tabId ? '' : 'none';
  });
}

async function reGenerarContrato(trabId) {
  const trab = await db.getTrabajador(trabId);
  await generateContrato(trabId, trab.tipo_contrato || 'indeterminado');
}

async function renovarAPlanta(trabId) {
  if (!confirm('¿Confirmas renovar al trabajador como empleado De Planta (Tiempo Indeterminado)?\n\nSe actualizará su perfil y se generará el contrato correspondiente.')) return;
  try {
    await db.updateTrabajador(trabId, {
      tipo_contrato:              'indeterminado',
      fecha_vencimiento_contrato: null,
      periodo_prueba_dias:        null,
    });
    await db.createContrato({ trabajador_id: trabId, tipo: 'indeterminado' }, CTX.empresa.id);
    await generateContrato(trabId, 'indeterminado');
    navigate('empleado', trabId);
  } catch(e) { alert('Error al renovar: ' + e.message); }
}

async function reDescargarActa(actaId, trabId) {
  const [acta, trab] = await Promise.all([db.getActa(actaId), db.getTrabajador(trabId)]);
  const sucursal = trab.sucursal_id ? await db.getSucursal(trab.sucursal_id) : null;
  generateActaPDF(acta, CTX.empresa, trab, sucursal);
}

async function eliminarAsistencia(id) {
  if (!confirm('¿Eliminar este registro de asistencia?')) return;
  await db.deleteAsistencia(id);
  navigate('empleado', window._perfilActivoId);
}
