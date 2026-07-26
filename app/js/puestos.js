// ============================================================================
//  Puestos — Catálogo de plantillas de puesto
//  Vive como subvista dentro del área de Trabajadores (empleados.js).
//  Un puesto es una PLANTILLA (funciones, salario sugerido, nivel…),
//  independiente de la persona. Al dar de alta un trabajador se elige un
//  puesto y sus datos se COPIAN al trabajador (copiar-no-vincular).
// ============================================================================

const _PERIODOS_PUESTO = [
  ['mensual', 'Mensual'], ['quincenal', 'Quincenal'], ['semanal', 'Semanal'],
];

// Mismos valores (con acentos) que usa el checklist de días del alta en
// empleados.js, para que el autollenado compare y copie el mismo literal.
const _DIAS_SEMANA_PUESTO = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];

function _fmtMoneda(n) {
  if (n === null || n === undefined || n === '') return null;
  if (typeof fmt === 'function') return fmt(n);
  return '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Catálogo (se pinta dentro de #empleados-sub) ────────────────────────────
async function renderPuestosCatalogo() {
  const cont = eid('empleados-sub');
  if (!cont) return;
  cont.innerHTML = `<div class="empty-state" style="padding:24px;"><div class="empty-state-title" style="font-size:.9rem;">Cargando puestos…</div></div>`;
  try {
    const [puestos, trabajadores] = await Promise.all([
      db.getPuestos(false),
      db.getTrabajadores(),
    ]);
    // Conteo de trabajadores activos por puesto_id (una sola consulta)
    const conteo = {};
    trabajadores.forEach(t => {
      if (t.estado === 'activo' && t.puesto_id) conteo[t.puesto_id] = (conteo[t.puesto_id] || 0) + 1;
    });

    const readOnly = typeof esSoloLectura === 'function' && esSoloLectura();
    const activos = puestos.filter(p => p.activo !== false);
    const inactivos = puestos.filter(p => p.activo === false);
    const orden = [...activos, ...inactivos];

    const rango = (p) => {
      const min = _fmtMoneda(p.salario_min), max = _fmtMoneda(p.salario_max);
      if (min && max) return `Rango: ${min} – ${max}`;
      if (min) return `Desde ${min}`;
      if (max) return `Hasta ${max}`;
      return '';
    };

    cont.innerHTML = `
      <div class="view-header animate-in" style="margin-bottom:16px;">
        <div>
          <div class="view-title" style="font-size:1.2rem;">Puestos</div>
          <div class="view-subtitle">Plantillas de puesto reutilizables para dar de alta trabajadores</div>
        </div>
        <button class="btn-primary" ${readOnly ? 'disabled title="Plan en solo lectura"' : ''} onclick="showModalPuesto(null)">+ Nuevo puesto</button>
      </div>

      ${orden.length > 0 ? `
      <div class="sucursales-grid animate-in">
        ${orden.map(p => `
          <div class="sucursal-card ${p.activo === false ? 'inactiva' : ''}">
            <div class="sucursal-header">
              <div>
                <div class="sucursal-nombre">${p.nombre}</div>
                ${p.nivel ? `<span class="sucursal-clave">${p.nivel}</span>` : ''}
              </div>
              ${p.activo === false ? '<span class="badge-inactiva">Inactivo</span>' : ''}
            </div>
            <div class="sucursal-meta">
              ${p.departamento ? `${p.departamento}` : ''}
              ${p.salario_sugerido ? `<br>Sugerido: <strong>${_fmtMoneda(p.salario_sugerido)}</strong> <span style="color:var(--text-muted);">/ ${p.periodo_salario || 'mensual'}</span>` : ''}
              ${rango(p) ? `<br><span style="color:var(--text-muted);">${rango(p)}</span>` : ''}
              ${p.reporta_a ? `<br>↳ Reporta a: ${p.reporta_a}` : ''}
              ${p.funciones ? `<br><span style="color:var(--text-muted);font-size:.78rem;">${p.funciones.length > 120 ? p.funciones.slice(0, 120) + '…' : p.funciones}</span>` : ''}
              <br><strong>${conteo[p.id] || 0}</strong> trabajador${(conteo[p.id] || 0) !== 1 ? 'es' : ''}
            </div>
            <div class="sucursal-footer">
              <button class="btn-secondary btn-sm" ${readOnly ? 'disabled' : ''} onclick="showModalPuesto('${p.id}')">Editar</button>
              <button class="btn-${p.activo === false ? 'secondary' : 'danger'} btn-sm" ${readOnly ? 'disabled' : ''}
                onclick="togglePuestoStatus('${p.id}', ${p.activo === false})">
                ${p.activo === false ? '● Activar' : '● Desactivar'}
              </button>
            </div>
          </div>
        `).join('')}
      </div>` : `
      <div class="empty-state animate-in" style="padding:32px;">
        <div class="empty-state-icon"><svg class="ic"><use href="#i-file"></use></svg></div>
        <div class="empty-state-title">Sin puestos registrados</div>
        <p style="font-size:.82rem;color:var(--text-muted);margin-top:8px;">Crea plantillas de puesto para reutilizarlas al dar de alta trabajadores. También puedes crearlas directamente desde el alta.</p>
      </div>`}
    `;
  } catch (e) {
    cont.innerHTML = `<div class="error-msg" style="display:block;">${e.message}</div>`;
  }
}

// ── Modal crear / editar ────────────────────────────────────────────────────
async function showModalPuesto(id) {
  let p = null;
  if (id) p = await db.getPuesto(id);
  const esEdicion = !!p;
  const v = (k, fb = '') => { const val = p?.[k]; return val === null || val === undefined ? fb : val; };

  showModal(`
    <div class="modal animate-in" style="max-width:680px;">
      <div class="modal-header">
        <div>
          <div class="modal-title">${esEdicion ? 'Editar Puesto' : 'Nuevo Puesto'}</div>
          <p style="font-size:.8rem;color:var(--text-muted);margin-top:4px;">Plantilla del puesto (no de la persona). Se usa como base al dar de alta trabajadores.</p>
        </div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Nombre del puesto <span class="req">*</span></label>
          <input id="p-nombre" type="text" class="form-input" value="${v('nombre')}" placeholder="Ej. Coordinador de Ventas" />
        </div>
        <div class="form-group">
          <label class="form-label">Departamento / Área</label>
          <input id="p-dept" type="text" class="form-input" value="${v('departamento')}" placeholder="Ej. Comercial" />
        </div>
        <div class="form-group">
          <label class="form-label">Nivel jerárquico</label>
          <input id="p-nivel" type="text" class="form-input" value="${v('nivel')}" placeholder="Ej. Operativo, Mando medio" />
        </div>
        <div class="form-group">
          <label class="form-label">Reporta a</label>
          <input id="p-reporta" type="text" class="form-input" value="${v('reporta_a')}" placeholder="Ej. Gerente General" />
        </div>
        <div class="form-group span-2">
          <label class="form-label">Funciones del puesto</label>
          <textarea id="p-funciones" class="form-textarea" rows="3" placeholder="Describe las funciones principales. Se incluirá en el contrato al usar este puesto.">${v('funciones')}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Salario sugerido</label>
          <input id="p-salario" type="number" class="form-input" min="0" step="0.01" value="${v('salario_sugerido')}" placeholder="20000" />
        </div>
        <div class="form-group">
          <label class="form-label">Periodo de pago</label>
          <select id="p-periodo" class="form-select">
            ${_PERIODOS_PUESTO.map(([val, lbl]) => `<option value="${val}" ${v('periodo_salario', 'mensual') === val ? 'selected' : ''}>${lbl}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Salario mínimo del rango</label>
          <input id="p-salario-min" type="number" class="form-input" min="0" step="0.01" value="${v('salario_min')}" placeholder="Opcional" />
        </div>
        <div class="form-group">
          <label class="form-label">Salario máximo del rango</label>
          <input id="p-salario-max" type="number" class="form-input" min="0" step="0.01" value="${v('salario_max')}" placeholder="Opcional" />
        </div>

        <div class="form-group">
          <label class="form-label">Tipo de contrato sugerido</label>
          <select id="p-contrato" class="form-select">
            <option value="">— Sin sugerencia —</option>
            <option value="indeterminado" ${v('tipo_contrato') === 'indeterminado' ? 'selected' : ''}>Por Tiempo Indeterminado</option>
            <option value="determinado" ${v('tipo_contrato') === 'determinado' ? 'selected' : ''}>Por Tiempo Determinado</option>
            <option value="obra" ${v('tipo_contrato') === 'obra' ? 'selected' : ''}>Por Obra o Servicio</option>
            <option value="temporada" ${v('tipo_contrato') === 'temporada' ? 'selected' : ''}>Por Temporada</option>
            <option value="comision" ${v('tipo_contrato') === 'comision' ? 'selected' : ''}>Por Comisión</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Tipo de salario</label>
          <select id="p-tipo-salario" class="form-select" onchange="_togglePuestoComision()">
            <option value="fijo" ${v('tipo_salario', 'fijo') === 'fijo' ? 'selected' : ''}>Fijo</option>
            <option value="comision" ${v('tipo_salario') === 'comision' ? 'selected' : ''}>Por comisión</option>
            <option value="mixto" ${v('tipo_salario') === 'mixto' ? 'selected' : ''}>Mixto (base + comisión)</option>
          </select>
        </div>
        <div class="form-group" id="p-grupo-comision" style="display:${['comision', 'mixto'].includes(v('tipo_salario', 'fijo')) ? '' : 'none'};">
          <label class="form-label">% Comisión habitual</label>
          <input id="p-pct-comision" type="number" class="form-input" min="0" max="100" step="0.01" value="${p?.pct_comision ? parseFloat(p.pct_comision) * 100 : ''}" placeholder="ej. 5 = 5%" />
        </div>
        <div class="form-group">
          <label class="form-label">Zona SMG</label>
          <select id="p-smg" class="form-select">
            <option value="general" ${v('smg_zone', 'general') === 'general' ? 'selected' : ''}>Área General</option>
            <option value="frontera" ${v('smg_zone') === 'frontera' ? 'selected' : ''}>Zona Frontera Norte</option>
          </select>
        </div>
        <div class="form-group span-2">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.85rem;">
            <input type="checkbox" id="p-es-direccion" ${v('es_puesto_direccion') ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--gold-primary);" />
            Puesto de dirección, confianza o técnico/profesional especializado (Art. 39-A/39-B LFT)
          </label>
        </div>

        <div class="form-group span-2" style="margin-top:4px;">
          <div style="font-weight:600;font-size:.85rem;">Jornada estándar del puesto</div>
          <div class="helper-text">Se copia al trabajador al elegir este puesto en el alta (solo si el campo aún está vacío). El contrato imprime la jornada realmente capturada en el trabajador, no ésta.</div>
        </div>
        <div class="form-group">
          <label class="form-label">Hora de inicio</label>
          <input id="p-hora-ini" type="time" class="form-input" value="${v('hora_inicio')}" />
        </div>
        <div class="form-group">
          <label class="form-label">Hora de fin</label>
          <input id="p-hora-fin" type="time" class="form-input" value="${v('hora_fin')}" />
        </div>
        <div class="form-group">
          <label class="form-label">Inicio descanso / comida</label>
          <input id="p-des-ini" type="time" class="form-input" value="${v('hora_descanso_inicio')}" />
        </div>
        <div class="form-group">
          <label class="form-label">Fin descanso / comida</label>
          <input id="p-des-fin" type="time" class="form-input" value="${v('hora_descanso_fin')}" />
        </div>
        <div class="form-group span-2">
          <label class="form-label">Días laborales</label>
          <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;">
            ${_DIAS_SEMANA_PUESTO.map(d => `
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:.88rem;color:var(--text-secondary);">
                <input type="checkbox" name="p-dias-semana" value="${d}" style="width:15px;height:15px;accent-color:var(--gold-primary);"
                  ${Array.isArray(p?.dias_semana) && p.dias_semana.includes(d) ? 'checked' : ''}> ${d}
              </label>`).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Día de descanso semanal</label>
          <select id="p-dia-descanso" class="form-select">
            <option value="">— Seleccionar —</option>
            ${['Domingo','Sábado','Lunes','Otro'].map(o => `<option value="${o}" ${v('dia_descanso') === o ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="p-error" class="error-msg" style="display:none;margin-bottom:8px;"></div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="handleGuardarPuesto('${id || ''}')">
          ${esEdicion ? 'Guardar cambios' : 'Crear Puesto'}
        </button>
      </div>
    </div>
  `);
}

function _togglePuestoComision() {
  const tipo = eid('p-tipo-salario')?.value || 'fijo';
  const g = eid('p-grupo-comision');
  if (g) g.style.display = ['comision', 'mixto'].includes(tipo) ? '' : 'none';
}

// Construye el objeto de datos del puesto a partir de los inputs con prefijo `p-`.
function _leerDatosPuesto() {
  const num = (id) => { const val = parseFloat(eid(id)?.value); return isNaN(val) ? null : val; };
  return {
    nombre:              eid('p-nombre')?.value.trim(),
    departamento:        eid('p-dept')?.value.trim() || null,
    nivel:               eid('p-nivel')?.value.trim() || null,
    reporta_a:           eid('p-reporta')?.value.trim() || null,
    funciones:           eid('p-funciones')?.value.trim() || null,
    salario_sugerido:    num('p-salario'),
    periodo_salario:     eid('p-periodo')?.value || 'mensual',
    salario_min:         num('p-salario-min'),
    salario_max:         num('p-salario-max'),
    tipo_contrato:       eid('p-contrato')?.value || null,
    tipo_salario:        eid('p-tipo-salario')?.value || 'fijo',
    pct_comision:        num('p-pct-comision') !== null ? num('p-pct-comision') / 100 : null,
    smg_zone:            eid('p-smg')?.value || 'general',
    es_puesto_direccion: eid('p-es-direccion')?.checked || false,
    hora_inicio:          eid('p-hora-ini')?.value || null,
    hora_fin:             eid('p-hora-fin')?.value || null,
    hora_descanso_inicio: eid('p-des-ini')?.value || null,
    hora_descanso_fin:    eid('p-des-fin')?.value || null,
    dias_semana:          (() => { const d = [...document.querySelectorAll('input[name="p-dias-semana"]:checked')].map(cb => cb.value); return d.length ? d : null; })(),
    dia_descanso:         eid('p-dia-descanso')?.value || null,
  };
}

async function handleGuardarPuesto(id) {
  const err = eid('p-error');
  if (err) err.style.display = 'none';
  const datos = _leerDatosPuesto();
  if (!datos.nombre) {
    if (err) { err.textContent = 'El nombre del puesto es obligatorio.'; err.style.display = ''; }
    return;
  }
  const btn = document.querySelector('#modal-container .btn-primary');
  btnCargando(btn, 'Guardando…');
  try {
    if (id) await db.updatePuesto(id, datos);
    else    await db.createPuesto(datos, CTX.empresa.id);
    closeModal();
    renderPuestosCatalogo();
  } catch (e) {
    if (err) { err.textContent = e.message; err.style.display = ''; }
    btnRestaurar(btn);
  }
}

async function togglePuestoStatus(id, activar) {
  const accion = activar ? 'activar' : 'desactivar';
  if (!(await showConfirmacion(`¿Deseas ${accion} este puesto?`))) return;
  try {
    await db.togglePuesto(id, activar);
    renderPuestosCatalogo();
  } catch (e) { alert(e.message); }
}
