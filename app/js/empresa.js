/**
 * Capital Humano MX — Módulo Empresa
 * Depende de: app.js (CTX, eid, navigate, showModal, closeModal, db, actualizarEmpresa)
 */

// ═══════════════════════════════════════════════════════
//  MI EMPRESA
// ═══════════════════════════════════════════════════════
async function renderEmpresa() {
  const e   = CTX.empresa;
  const main = eid('main-view');

  // Estado local del repeater de festivos adicionales
  _festivosTmp = Array.isArray(e.festivos_adicionales) ? JSON.parse(JSON.stringify(e.festivos_adicionales)) : [];

  await cargarFestivos().catch(err => console.warn('dias_festivos:', err.message));
  await db.ensureMatriz(e);
  const sucursales = await db.getSucursales();
  const matriz     = sucursales.find(s => s.tipo === 'matriz');
  const branches   = sucursales.filter(s => s.tipo !== 'matriz');

  const conteos = {};
  await Promise.all(sucursales.map(async s => {
    conteos[s.id] = await db.countTrabajadoresBySucursal(s.id);
  }));
  conteos['matriz'] = await db.countTrabajadoresBySucursal(null);

  main.innerHTML = `
    <div class="view-header animate-in">
      <div><div class="view-title">🏢 Mi Empresa</div></div>
    </div>
    <div class="card animate-in" style="max-width:700px;margin-bottom:32px;">
      <div class="card-header"><span class="card-title">Datos Fiscales</span></div>
      <div class="form-grid">
        <div class="form-group span-2">
          <label class="form-label">Razón Social / Nombre del Patrón <span class="req">*</span></label>
          <input id="emp-nombre" type="text" class="form-input" value="${e.nombre||''}" />
        </div>
        <div class="form-group">
          <label class="form-label">RFC</label>
          <input id="emp-rfc" type="text" class="form-input" value="${e.rfc||''}" maxlength="13" style="text-transform:uppercase;" />
        </div>
        <div class="form-group">
          <label class="form-label">Representante Legal</label>
          <input id="emp-rep" type="text" class="form-input" value="${e.representante||''}" />
        </div>
        <div class="form-group span-2">
          <label class="form-label">Domicilio Fiscal</label>
          <input id="emp-dom" type="text" class="form-input" value="${e.domicilio||''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Ciudad <span class="req">*</span></label>
          <input id="emp-ciudad" type="text" class="form-input" value="${e.ciudad||''}" />
        </div>
      </div>
      <div id="emp-msg" style="display:none;margin-bottom:8px;"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn-primary" onclick="handleGuardarEmpresa()">💾 Guardar cambios</button>
      </div>
    </div>

    <div class="card animate-in" style="max-width:700px;margin-bottom:32px;">
      <div class="card-header"><span class="card-title">⚙️ Configuración de Nómina</span></div>
      <div style="margin-bottom:14px;">
        <label class="form-label" style="margin-bottom:10px;display:block;">
          Día de pago semanal
          <span style="font-size:.75rem;color:var(--text-muted);font-weight:400;margin-left:6px;">
            — Se usa para sugerir automáticamente las fechas al crear un período semanal
          </span>
        </label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;" id="emp-dias-pago">
          ${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map((d,i) => `
            <label style="display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;">
              <div class="dia-pago-btn ${(e.dia_pago_semanal??5)===i?'selected':''}"
                   data-dia="${i}"
                   onclick="_seleccionarDiaPago(${i})"
                   style="width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;
                          font-weight:700;font-size:.88rem;cursor:pointer;border:2px solid;
                          border-color:${(e.dia_pago_semanal??5)===i?'var(--gold-primary)':'var(--border)'};
                          background:${(e.dia_pago_semanal??5)===i?'rgba(245,166,35,.15)':'transparent'};
                          color:${(e.dia_pago_semanal??5)===i?'var(--gold-primary)':'var(--text-muted)'};
                          transition:all .15s;">
                ${d}
              </div>
            </label>`).join('')}
        </div>
      </div>
      <div style="margin:18px 0 8px;border-top:1px solid var(--border);padding-top:16px;">
        <label class="form-label" style="margin-bottom:10px;display:block;">
          Días de pago quincenal y mensual
          <span style="font-size:.75rem;color:var(--text-muted);font-weight:400;margin-left:6px;">
            — Se usan para sugerir la fecha de pago al crear períodos. Usa <strong>0</strong> para "último día del mes".
          </span>
        </label>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">1ª quincena (día del mes)</label>
            <input id="emp-pago-q1" type="number" class="form-input" min="0" max="31"
              value="${e.dia_pago_quincenal_1 ?? 15}" />
          </div>
          <div class="form-group">
            <label class="form-label">2ª quincena (0 = fin de mes)</label>
            <input id="emp-pago-q2" type="number" class="form-input" min="0" max="31"
              value="${e.dia_pago_quincenal_2 ?? 0}" />
          </div>
          <div class="form-group">
            <label class="form-label">Mensual (0 = fin de mes)</label>
            <input id="emp-pago-mensual" type="number" class="form-input" min="0" max="31"
              value="${e.dia_pago_mensual ?? 0}" />
          </div>
        </div>
      </div>
      <div id="emp-nomina-msg" style="display:none;margin-bottom:8px;"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn-primary" onclick="handleGuardarConfigNomina()">💾 Guardar configuración</button>
      </div>
    </div>

    <div class="card animate-in" style="max-width:700px;margin-bottom:32px;">
      <div class="card-header"><span class="card-title">🎁 Prestaciones y Disposiciones Particulares</span></div>
      <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:16px;">
        Prestaciones que la empresa otorga por encima de los mínimos de la LFT. Los valores precargados
        son los de ley y no pueden ser inferiores. <strong>Los cambios aplican a las nóminas que se generen
        o recalculen a partir de ahora</strong>; los recibos ya generados no se modifican.
      </p>
      <div id="presta-costo-mensual" style="margin-bottom:16px;font-size:.82rem;color:var(--text-muted);"></div>
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Días de aguinaldo</label>
          <input id="presta-aguinaldo" type="number" class="form-input" min="15" step="0.5"
            value="${e.dias_aguinaldo ?? 15}" />
          <div class="helper-text">Mínimo de ley: 15 días (Art. 87 LFT)</div>
        </div>
        <div class="form-group">
          <label class="form-label">Días extra de vacaciones</label>
          <input id="presta-vac-extra" type="number" class="form-input" min="0" step="1"
            value="${e.dias_vacaciones_extra ?? 0}" />
          <div class="helper-text">Se suman a la tabla del Art. 76 LFT 2023</div>
        </div>
        <div class="form-group">
          <label class="form-label">Prima vacacional (%)</label>
          <input id="presta-prima-vac" type="number" class="form-input" min="25" max="100" step="1"
            value="${((e.prima_vacacional_pct ?? 0.25) * 100).toFixed(0)}" />
          <div class="helper-text">Mínimo de ley: 25% (Art. 80 LFT)</div>
        </div>
        <div class="form-group">
          <label class="form-label">Prima dominical (%)</label>
          <input id="presta-prima-dom" type="number" class="form-input" min="25" max="200" step="1"
            value="${((e.prima_dominical_pct ?? 0.25) * 100).toFixed(0)}" />
          <div class="helper-text">Mínimo de ley: 25% (Art. 71 LFT)</div>
        </div>
        <div class="form-group span-2">
          <label class="form-label">Factor de pago de horas extra</label>
          <input id="presta-factor-he" type="number" class="form-input" min="2" max="4" step="0.1"
            value="${e.factor_horas_extra ?? 2}" style="max-width:140px;" />
          <div class="helper-text">2.0 = doble, mínimo de ley (Art. 67 LFT). Se aplica sobre el salario por hora (jornada de 8 hrs) a las horas extra capturadas en Asistencia.</div>
        </div>

        <div class="form-group span-2" style="border-top:1px solid var(--border);padding-top:14px;">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:.88rem;">
            <input type="checkbox" id="presta-fondo-activo" style="width:16px;height:16px;accent-color:var(--gold-primary);"
              ${e.fondo_ahorro_empresa_activo ? 'checked' : ''} onchange="_togglePrestaFondo()" />
            <span><strong>💰 Fondo de ahorro</strong> <span style="color:var(--text-muted);font-weight:400;">(Art. 110 fr. IV LFT)</span></span>
          </label>
          <div class="helper-text" style="margin-top:6px;">
            Al activarlo, aparecerá preseleccionado al dar de alta trabajadores nuevos (ahí se puede ajustar o quitar por trabajador).
            La configuración individual de cada trabajador es la que aplica en nómina.
          </div>
        </div>
        <div class="form-group" id="presta-fondo-cfg-1" style="display:${e.fondo_ahorro_empresa_activo ? '' : 'none'};">
          <label class="form-label">Aportación del trabajador (%)</label>
          <input id="presta-fondo-trab" type="number" class="form-input" min="0" max="30" step="0.5"
            value="${((e.fondo_ahorro_pct_trabajador ?? 0.13) * 100).toFixed(1)}" />
        </div>
        <div class="form-group" id="presta-fondo-cfg-2" style="display:${e.fondo_ahorro_empresa_activo ? '' : 'none'};">
          <label class="form-label">Aportación del patrón (%)</label>
          <input id="presta-fondo-patron" type="number" class="form-input" min="0" max="30" step="0.5"
            value="${((e.fondo_ahorro_pct_patron ?? 0.13) * 100).toFixed(1)}" />
        </div>

        <div class="form-group span-2" style="border-top:1px solid var(--border);padding-top:14px;">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:.88rem;">
            <input type="checkbox" id="presta-vales-activo" style="width:16px;height:16px;accent-color:var(--gold-primary);"
              ${e.vales_despensa_activo ? 'checked' : ''} onchange="_togglePrestaVales()" />
            <span><strong>🛒 Vales de despensa</strong></span>
          </label>
          <div class="helper-text" style="margin-top:6px;">
            Se aplican en nómina a los trabajadores que no tengan un monto individual configurado.
          </div>
        </div>
        <div class="form-group" id="presta-vales-cfg-1" style="display:${e.vales_despensa_activo ? '' : 'none'};">
          <label class="form-label">Tipo</label>
          <select id="presta-vales-tipo" class="form-input">
            <option value="monto" ${(e.vales_despensa_tipo ?? 'monto') === 'monto' ? 'selected' : ''}>Monto fijo por período</option>
            <option value="pct" ${e.vales_despensa_tipo === 'pct' ? 'selected' : ''}>% del salario del período</option>
          </select>
        </div>
        <div class="form-group" id="presta-vales-cfg-2" style="display:${e.vales_despensa_activo ? '' : 'none'};">
          <label class="form-label">Valor</label>
          <input id="presta-vales-valor" type="number" class="form-input" min="0" step="0.01"
            value="${e.vales_despensa_tipo === 'pct' ? ((e.vales_despensa_valor ?? 0) * 100).toFixed(1) : (e.vales_despensa_valor ?? 0)}" />
          <div class="helper-text">Si es %, captura el porcentaje (ej. 5 = 5%). Tope exento: 40% UMA/día (Art. 27 LISR).</div>
        </div>

        <div class="form-group span-2" style="border-top:1px solid var(--border);padding-top:14px;">
          <label class="form-label" style="display:block;margin-bottom:6px;">🎉 Días festivos / de descanso adicionales de la empresa</label>
          <div class="helper-text" style="margin-bottom:10px;">
            Días de descanso con goce de sueldo adicionales a los festivos oficiales (ej. 24 de diciembre, aniversario de la empresa).
            Se preseleccionan como festivo en Asistencia y se pagan como día laborado.
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
            <div>
              <label class="form-label" style="font-size:.72rem;">Fecha</label>
              <input id="presta-fest-fecha" type="date" class="form-input" style="max-width:160px;" />
            </div>
            <div style="flex:1;min-width:160px;">
              <label class="form-label" style="font-size:.72rem;">Descripción</label>
              <input id="presta-fest-desc" type="text" class="form-input" placeholder="Ej. Aniversario de la empresa" />
            </div>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:.8rem;padding-bottom:10px;">
              <input type="checkbox" id="presta-fest-rec" checked style="width:14px;height:14px;accent-color:var(--gold-primary);" />
              Cada año
            </label>
            <button class="btn-secondary btn-sm" style="margin-bottom:4px;" onclick="_agregarFestivoEmpresa()">+ Agregar</button>
          </div>
          <div id="presta-fest-lista" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">${_festivosChipsHTML()}</div>
        </div>
      </div>
      <div id="presta-msg" style="display:none;margin-bottom:8px;"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn-primary" onclick="handleGuardarPrestaciones()">💾 Guardar prestaciones</button>
      </div>
    </div>

    <div class="card animate-in" style="max-width:700px;margin-bottom:32px;">
      <div class="card-header"><span class="card-title">📅 Calendario de días festivos oficiales (Art. 74 LFT)</span></div>
      <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:16px;">
        Descansos obligatorios de ley (no editables) más los que la empresa decida otorgar
        adicionalmente (Art. 74 LFT permite pactar descansos extra, ej. costumbre del ramo).
        Trabajar un día festivo de esta lista activa el pago triple (Art. 75 LFT) en la nómina.
      </p>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
        <label class="form-label" style="margin:0;">Año</label>
        <select id="fest-anio-select" class="form-input" style="max-width:120px;" onchange="_renderFestivosOficiales()">
          ${[new Date().getFullYear(), new Date().getFullYear()+1].map(a => `<option value="${a}">${a}</option>`).join('')}
        </select>
      </div>
      <div id="fest-oficiales-lista"></div>
      <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:14px;">
        <label class="form-label" style="display:block;margin-bottom:6px;">➕ Agregar festivo propio de la empresa</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
          <div>
            <label class="form-label" style="font-size:.72rem;">Fecha</label>
            <input id="fest-nuevo-fecha" type="date" class="form-input" style="max-width:160px;" />
          </div>
          <div style="flex:1;min-width:160px;">
            <label class="form-label" style="font-size:.72rem;">Descripción</label>
            <input id="fest-nuevo-desc" type="text" class="form-input" placeholder="Ej. Día del ramo / costumbre" />
          </div>
          <button class="btn-secondary btn-sm" style="margin-bottom:4px;" onclick="_agregarFestivoOficial()">+ Agregar</button>
        </div>
      </div>
    </div>

    <div class="card animate-in" style="max-width:700px;margin-bottom:32px;">
      <div class="card-header"><span class="card-title">🔔 Notificaciones por Email</span></div>
      <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:16px;">
        Recibe un correo cuando se genere una alerta laboral de prioridad <strong>crítica</strong> o <strong>alta</strong>.
        Requiere configurar la Edge Function <code>send-emails</code> en Supabase.
      </p>
      <div class="form-grid">
        <div class="form-group span-2">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:.88rem;">
            <input type="checkbox" id="notif-activo" style="width:16px;height:16px;accent-color:var(--gold-primary);"
              ${e.notif_email_activo ? 'checked' : ''} />
            <span><strong>Activar notificaciones por email</strong></span>
          </label>
        </div>
        <div class="form-group span-2">
          <label class="form-label">Email de destino</label>
          <input id="notif-email" type="email" class="form-input"
            value="${e.notif_email_destino || ''}"
            placeholder="alertas@miempresa.com" />
          <div class="helper-text">Puede ser diferente al email de tu cuenta de usuario.</div>
        </div>
      </div>
      <div id="notif-msg" style="display:none;margin-bottom:8px;"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn-primary" onclick="handleGuardarNotificaciones()">💾 Guardar</button>
      </div>
    </div>

    <div class="view-header animate-in" style="margin-bottom:16px;">
      <div>
        <div class="view-title" style="font-size:1.2rem;">🏪 Centros de Trabajo</div>
        <div class="view-subtitle">Matriz y sucursales de la empresa</div>
      </div>
      <button class="btn-primary" onclick="showModalSucursal(null)">+ Agregar Sucursal</button>
    </div>

    ${matriz ? `
    <div class="matriz-card animate-in">
      <div class="matriz-card-header">
        <div>
          <span class="matriz-label">⭐ Matriz</span>
          <div style="font-weight:800;font-size:1.05rem;margin-top:4px;">${e.nombre}</div>
          ${e.rfc ? `<div style="font-size:.82rem;color:var(--text-muted);">RFC: ${e.rfc}</div>` : ''}
        </div>
        <button class="btn-secondary btn-sm" onclick="showModalSucursal('${matriz.id}')">✏️ Editar</button>
      </div>
      <div style="font-size:.85rem;color:var(--text-secondary);line-height:1.7;">
        ${e.domicilio ? `📍 ${e.domicilio}` : ''}
        ${e.domicilio && e.ciudad ? '<br>' : ''}
        ${e.ciudad ? `🏙 ${e.ciudad}` : ''}
        ${e.representante ? `<br>👤 ${e.representante}` : ''}
      </div>
      <div style="margin-top:12px;font-size:.8rem;color:var(--text-muted);">
        👥 ${conteos['matriz']} trabajador${conteos['matriz']!==1?'es':''} sin sucursal asignada
      </div>
    </div>` : ''}

    ${branches.length > 0 ? `
    <div class="sucursales-grid animate-in">
      ${branches.map(s => `
        <div class="sucursal-card ${!s.activa ? 'inactiva' : ''}">
          <div class="sucursal-header">
            <div>
              <div class="sucursal-nombre">${s.nombre}</div>
              ${s.clave ? `<span class="sucursal-clave">${s.clave}</span>` : ''}
            </div>
            ${!s.activa ? '<span class="badge-inactiva">Inactiva</span>' : ''}
          </div>
          <div class="sucursal-meta">
            ${s.domicilio ? `📍 ${s.domicilio}` : ''}
            ${s.ciudad    ? `<br>🏙 ${s.ciudad}${s.estado ? ', '+s.estado : ''}${s.cp ? ' C.P. '+s.cp : ''}` : ''}
            ${s.telefono  ? `<br>📞 ${s.telefono}` : ''}
            ${s.responsable_nombre ? `<br>👤 ${s.responsable_nombre}${s.responsable_puesto ? ' · '+s.responsable_puesto : ''}` : ''}
            <br>👥 <strong>${conteos[s.id]||0}</strong> trabajador${(conteos[s.id]||0)!==1?'es':''}
          </div>
          <div class="sucursal-footer">
            <button class="btn-secondary btn-sm" onclick="showModalSucursal('${s.id}')">✏️ Editar</button>
            <button class="btn-${s.activa?'danger':'secondary'} btn-sm"
              onclick="toggleSucursalStatus('${s.id}', ${!s.activa})">
              ${s.activa ? '🔴 Desactivar' : '🟢 Activar'}
            </button>
          </div>
        </div>
      `).join('')}
    </div>` : `
    <div class="empty-state animate-in" style="padding:32px;">
      <div class="empty-state-icon">🏪</div>
      <div class="empty-state-title">Sin sucursales registradas</div>
      <p style="font-size:.82rem;color:var(--text-muted);margin-top:8px;">Usa el botón "+ Agregar Sucursal" para registrar centros de trabajo adicionales.</p>
    </div>`}
  `;

  _renderFestivosOficiales();
  _renderCostoPrestaciones();
}

async function _renderCostoPrestaciones() {
  const cont = eid('presta-costo-mensual');
  if (!cont || typeof costoMensualPrestaciones !== 'function') return;
  try {
    const total = await costoMensualPrestaciones(CTX.empresa.id);
    cont.innerHTML = `💰 Costo mensual estimado de prestaciones de la plantilla: <strong style="color:var(--gold-primary);">${fmt(total)}</strong>`;
  } catch (e) {
    console.warn('costoMensualPrestaciones:', e.message);
  }
}

async function showModalSucursal(id) {
  // Precheck de límite del plan al CREAR (UX; el trigger del backend es el candado real)
  if (!id) {
    const max = limiteDe('sucursales');
    if (max !== null) {
      const sucs = await db.getSucursales(true);
      const activas = sucs.filter(s => s.tipo !== 'matriz').length;
      if (activas >= max) {
        showToast(max === 0
          ? '🔒 Tu plan no incluye sucursales adicionales.'
          : `🔒 Tu plan permite máximo ${max} sucursales.`, 'warn', 6000);
        showModalPlanes('limite_sucursales');
        return;
      }
    }
  }
  let suc = null;
  if (id) {
    suc = await db.getSucursal(id);
  }
  const esEdicion = !!suc;
  const esMatrizEdit = suc?.tipo === 'matriz';

  showModal(`
    <div class="modal animate-in" style="max-width:640px;">
      <div class="modal-header">
        <div>
          <div class="modal-title">${esEdicion ? (esMatrizEdit ? '⭐ Editar Matriz' : '✏️ Editar Sucursal') : '🏪 Nueva Sucursal'}</div>
          ${esMatrizEdit ? '<p style="font-size:.8rem;color:var(--text-muted);margin-top:4px;">Los datos de la matriz se usan en documentos cuando el trabajador no tiene sucursal asignada.</p>' : ''}
        </div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div class="form-grid">
        <div class="form-group ${esMatrizEdit ? 'span-2' : ''}">
          <label class="form-label">Nombre <span class="req">*</span></label>
          <input id="suc-nombre" type="text" class="form-input" value="${suc?.nombre||''}"
                 placeholder="${esMatrizEdit ? 'Nombre de la empresa' : 'Ej. Sucursal Monterrey'}" />
        </div>
        ${!esMatrizEdit ? `
        <div class="form-group">
          <label class="form-label">Clave interna</label>
          <input id="suc-clave" type="text" class="form-input" value="${suc?.clave||''}" placeholder="Ej. MTY-01" />
        </div>` : '<input type="hidden" id="suc-clave" value="">'}
        <div class="form-group span-2">
          <label class="form-label">Domicilio (calle y número)</label>
          <input id="suc-domicilio" type="text" class="form-input" value="${suc?.domicilio||''}" placeholder="Av. Constitución 100" />
        </div>
        <div class="form-group">
          <label class="form-label">Ciudad</label>
          <input id="suc-ciudad" type="text" class="form-input" value="${suc?.ciudad||''}" placeholder="Monterrey" />
        </div>
        <div class="form-group">
          <label class="form-label">Estado</label>
          <input id="suc-estado" type="text" class="form-input" value="${suc?.estado||''}" placeholder="Nuevo León" />
        </div>
        <div class="form-group">
          <label class="form-label">Código Postal</label>
          <input id="suc-cp" type="text" class="form-input" value="${suc?.cp||''}" placeholder="64000" maxlength="5" />
        </div>
        <div class="form-group">
          <label class="form-label">Teléfono</label>
          <input id="suc-tel" type="text" class="form-input" value="${suc?.telefono||''}" placeholder="81 1234 5678" />
        </div>
        <div class="form-group">
          <label class="form-label">Nombre del responsable</label>
          <input id="suc-resp-nombre" type="text" class="form-input" value="${suc?.responsable_nombre||''}" placeholder="Nombre del gerente o encargado" />
        </div>
        <div class="form-group">
          <label class="form-label">Puesto del responsable</label>
          <input id="suc-resp-puesto" type="text" class="form-input" value="${suc?.responsable_puesto||''}" placeholder="Ej. Gerente de Sucursal" />
        </div>
      </div>
      <div id="suc-error" class="error-msg" style="display:none;margin-bottom:8px;"></div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="handleGuardarSucursal('${id||''}')">
          💾 ${esEdicion ? 'Guardar cambios' : 'Crear Sucursal'}
        </button>
      </div>
    </div>
  `);
}

async function handleGuardarSucursal(id) {
  const err   = eid('suc-error');
  err.style.display = 'none';
  const nombre = eid('suc-nombre')?.value.trim();
  if (!nombre) { err.textContent = 'El nombre es obligatorio.'; err.style.display=''; return; }

  const datos = {
    nombre,
    clave:              eid('suc-clave')?.value.trim() || null,
    domicilio:          eid('suc-domicilio')?.value.trim() || null,
    ciudad:             eid('suc-ciudad')?.value.trim() || null,
    estado:             eid('suc-estado')?.value.trim() || null,
    cp:                 eid('suc-cp')?.value.trim() || null,
    telefono:           eid('suc-tel')?.value.trim() || null,
    responsable_nombre: eid('suc-resp-nombre')?.value.trim() || null,
    responsable_puesto: eid('suc-resp-puesto')?.value.trim() || null,
  };

  const btn = document.querySelector('#modal-container .btn-primary');
  btn.textContent = 'Guardando…'; btn.disabled = true;
  try {
    if (id) {
      await db.updateSucursal(id, datos);
    } else {
      await db.createSucursal({ ...datos, tipo:'sucursal' }, CTX.empresa.id);
    }
    closeModal();
    navigate('empresa');
  } catch(e) {
    err.textContent = e.message; err.style.display='';
    btn.textContent = '💾 Guardar'; btn.disabled = false;
  }
}

async function toggleSucursalStatus(id, activar) {
  const accion = activar ? 'activar' : 'desactivar';
  if (!confirm(`¿Deseas ${accion} esta sucursal?`)) return;
  try {
    await db.toggleSucursal(id, activar);
    navigate('empresa');
  } catch(e) { alert(e.message); }
}

let _diaPagoSeleccionado = null;

function _seleccionarDiaPago(dia) {
  _diaPagoSeleccionado = dia;
  document.querySelectorAll('.dia-pago-btn').forEach(btn => {
    const sel = parseInt(btn.dataset.dia) === dia;
    btn.style.borderColor  = sel ? 'var(--gold-primary)' : 'var(--border)';
    btn.style.background   = sel ? 'rgba(245,166,35,.15)' : 'transparent';
    btn.style.color        = sel ? 'var(--gold-primary)' : 'var(--text-muted)';
  });
}

// Envuelve actualizarEmpresa() devolviendo {error} en vez de lanzar, para poder
// reintentar sin las columnas de la migración 22 si aún no está aplicada.
async function _guardarConfigNominaSafe(datos) {
  try { await actualizarEmpresa(CTX.empresa.id, datos); return { error: null }; }
  catch(e) { return { error: e }; }
}

async function handleGuardarConfigNomina() {
  const msg = eid('emp-nomina-msg');
  msg.style.display = 'none';
  const dia = _diaPagoSeleccionado ?? CTX.empresa.dia_pago_semanal ?? 5;
  const num = (id, def) => { const v = parseInt(eid(id)?.value); return Number.isFinite(v) ? v : def; };
  const cfg = {
    dia_pago_semanal:     dia,
    dia_pago_quincenal_1: num('emp-pago-q1', 15),
    dia_pago_quincenal_2: num('emp-pago-q2', 0),
    dia_pago_mensual:     num('emp-pago-mensual', 0),
  };
  try {
    // Tolerante: si las columnas de la migración 22 aún no existen, guardar solo dia_pago_semanal
    let err;
    ({ error: err } = await _guardarConfigNominaSafe(cfg));
    if (err && /dia_pago_quincenal|dia_pago_mensual|column/i.test(err.message || '')) {
      console.warn('Columnas de días de pago quincenal/mensual no existen — aplica la migración 22_migration_nomina_programacion.sql');
      ({ error: err } = await _guardarConfigNominaSafe({ dia_pago_semanal: dia }));
    }
    if (err) throw err;
    CTX.empresa = { ...CTX.empresa, ...cfg };
    _diaPagoSeleccionado = null;
    msg.textContent = '✅ Configuración guardada.'; msg.className = 'alert alert-success'; msg.style.display = '';
  } catch(e) {
    msg.textContent = e.message; msg.className = 'error-msg'; msg.style.display = '';
  }
}

async function handleGuardarEmpresa() {
  const msg = eid('emp-msg');
  msg.style.display='none';
  const nombre = eid('emp-nombre')?.value.trim();
  const ciudad = eid('emp-ciudad')?.value.trim();
  if (!nombre || !ciudad) { msg.textContent='Razón Social y Ciudad son obligatorios.'; msg.className='error-msg'; msg.style.display=''; return; }
  try {
    await actualizarEmpresa(CTX.empresa.id, {
      nombre, rfc: eid('emp-rfc').value.trim().toUpperCase(),
      representante: eid('emp-rep').value.trim(),
      domicilio: eid('emp-dom').value.trim(), ciudad,
    });
    CTX.empresa = { ...CTX.empresa, nombre, ciudad };
    document.getElementById('topbar-empresa').textContent = nombre;
    msg.textContent = '✅ Datos guardados correctamente.'; msg.className='alert alert-success'; msg.style.display='';
  } catch(e) { msg.textContent = e.message; msg.className='error-msg'; msg.style.display=''; }
}

// ═══════════════════════════════════════════════════════
//  PRESTACIONES Y DISPOSICIONES PARTICULARES
// ═══════════════════════════════════════════════════════
let _festivosTmp = [];

function _festivosChipsHTML() {
  if (!_festivosTmp.length) {
    return '<span style="font-size:.78rem;color:var(--text-muted);">Sin festivos adicionales configurados.</span>';
  }
  return _festivosTmp.map((f, i) => `
    <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:14px;
                 background:rgba(245,166,35,.12);border:1px solid var(--gold-border);font-size:.78rem;">
      ${f.tipo === 'recurrente' ? '🔁' : '📅'} ${f.valor}${f.descripcion ? ' · ' + f.descripcion : ''}
      <span onclick="_quitarFestivoEmpresa(${i})" style="cursor:pointer;font-weight:700;color:var(--red-warn);">×</span>
    </span>`).join('');
}

function _repintarFestivos() {
  const lista = eid('presta-fest-lista');
  if (lista) lista.innerHTML = _festivosChipsHTML();
}

function _agregarFestivoEmpresa() {
  const fecha = eid('presta-fest-fecha')?.value;
  const desc  = eid('presta-fest-desc')?.value.trim() || '';
  const rec   = eid('presta-fest-rec')?.checked;
  if (!fecha) { alert('Selecciona la fecha del festivo.'); return; }
  const valor = rec ? fecha.slice(5) : fecha; // recurrente → 'MM-DD'
  if (_festivosTmp.some(f => f.valor === valor)) { alert('Esa fecha ya está agregada.'); return; }
  _festivosTmp.push({ tipo: rec ? 'recurrente' : 'fecha', valor, descripcion: desc });
  if (eid('presta-fest-fecha')) eid('presta-fest-fecha').value = '';
  if (eid('presta-fest-desc'))  eid('presta-fest-desc').value  = '';
  _repintarFestivos();
}

function _quitarFestivoEmpresa(i) {
  _festivosTmp.splice(i, 1);
  _repintarFestivos();
}

// ═══════════════════════════════════════════════════════
//  CALENDARIO OFICIAL DE DÍAS FESTIVOS (dias_festivos, migración 15)
// ═══════════════════════════════════════════════════════
function _renderFestivosOficiales() {
  const cont = eid('fest-oficiales-lista');
  if (!cont) return;
  const anio  = parseInt(eid('fest-anio-select')?.value) || new Date().getFullYear();
  const dias  = typeof festivosDelAnio === 'function' ? festivosDelAnio(anio) : [];

  if (!dias.length) {
    cont.innerHTML = '<p style="font-size:.8rem;color:var(--text-muted);">Sin festivos cargados — ejecuta la migración 15_migration_festivos.sql.</p>';
    return;
  }

  cont.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:.82rem;">
      <thead>
        <tr style="text-align:left;color:var(--text-muted);">
          <th style="padding:6px 8px;">Fecha</th><th style="padding:6px 8px;">Descripción</th>
          <th style="padding:6px 8px;">Tipo</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${dias.map(f => `
          <tr style="border-top:1px solid var(--border);">
            <td style="padding:6px 8px;white-space:nowrap;">${formatDateShort(f.fecha)}</td>
            <td style="padding:6px 8px;">${f.descripcion}</td>
            <td style="padding:6px 8px;">${f.oficial ? '<span style="color:var(--text-muted);">Oficial (Art. 74 LFT)</span>' : '<span style="color:var(--gold-primary);">Propio</span>'}</td>
            <td style="padding:6px 8px;text-align:right;">
              ${f.oficial ? '' : `<span onclick="_eliminarFestivoOficial('${f.id}')" style="cursor:pointer;font-weight:700;color:var(--red-warn);">× Eliminar</span>`}
            </td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;
}

async function _agregarFestivoOficial() {
  const fecha = eid('fest-nuevo-fecha')?.value;
  const desc  = eid('fest-nuevo-desc')?.value.trim();
  if (!fecha || !desc) { alert('Captura la fecha y la descripción del festivo.'); return; }
  try {
    await agregarFestivoEmpresa(fecha, desc);
    eid('fest-nuevo-fecha').value = '';
    eid('fest-nuevo-desc').value  = '';
    _renderFestivosOficiales();
  } catch (e) {
    alert('No se pudo agregar el festivo: ' + e.message);
  }
}

async function _eliminarFestivoOficial(id) {
  if (!confirm('¿Eliminar este festivo propio de la empresa?')) return;
  try {
    await eliminarFestivoEmpresa(id);
    _renderFestivosOficiales();
  } catch (e) {
    alert('No se pudo eliminar: ' + e.message);
  }
}

function _togglePrestaFondo() {
  const on = eid('presta-fondo-activo')?.checked;
  ['presta-fondo-cfg-1','presta-fondo-cfg-2'].forEach(id => {
    const el = eid(id); if (el) el.style.display = on ? '' : 'none';
  });
}

function _togglePrestaVales() {
  const on = eid('presta-vales-activo')?.checked;
  ['presta-vales-cfg-1','presta-vales-cfg-2'].forEach(id => {
    const el = eid(id); if (el) el.style.display = on ? '' : 'none';
  });
}

async function handleGuardarPrestaciones() {
  const msg = eid('presta-msg');
  msg.style.display = 'none';

  const aguinaldo  = parseFloat(eid('presta-aguinaldo')?.value);
  const vacExtra   = parseFloat(eid('presta-vac-extra')?.value) || 0;
  const primaVac   = parseFloat(eid('presta-prima-vac')?.value);
  const primaDom   = parseFloat(eid('presta-prima-dom')?.value);
  const factorHE   = parseFloat(eid('presta-factor-he')?.value);
  const fondoOn    = eid('presta-fondo-activo')?.checked || false;
  const fondoTrab  = parseFloat(eid('presta-fondo-trab')?.value) || 0;
  const fondoPat   = parseFloat(eid('presta-fondo-patron')?.value) || 0;
  const valesOn    = eid('presta-vales-activo')?.checked || false;
  const valesTipo  = eid('presta-vales-tipo')?.value === 'pct' ? 'pct' : 'monto';
  const valesValor = parseFloat(eid('presta-vales-valor')?.value) || 0;

  const fail = (t) => { msg.textContent = t; msg.className = 'error-msg'; msg.style.display = ''; };
  if (!Number.isFinite(aguinaldo) || aguinaldo < 15) return fail('El aguinaldo no puede ser menor a 15 días (mínimo Art. 87 LFT).');
  if (vacExtra < 0)                                  return fail('Los días extra de vacaciones no pueden ser negativos.');
  if (!Number.isFinite(primaVac) || primaVac < 25)   return fail('La prima vacacional no puede ser menor a 25% (mínimo Art. 80 LFT).');
  if (!Number.isFinite(primaDom) || primaDom < 25)   return fail('La prima dominical no puede ser menor a 25% (mínimo Art. 71 LFT).');
  if (!Number.isFinite(factorHE) || factorHE < 2)    return fail('El factor de horas extra no puede ser menor a 2.0 (pago doble, mínimo Art. 67 LFT).');
  if (fondoOn && (fondoTrab < 0 || fondoTrab > 30 || fondoPat < 0 || fondoPat > 30))
    return fail('Los porcentajes del fondo de ahorro deben estar entre 0% y 30%.');
  if (valesOn && valesValor <= 0) return fail('Captura el valor de los vales de despensa.');

  const datos = {
    dias_aguinaldo:              aguinaldo,
    dias_vacaciones_extra:       vacExtra,
    prima_vacacional_pct:        primaVac / 100,
    prima_dominical_pct:         primaDom / 100,
    factor_horas_extra:          factorHE,
    fondo_ahorro_empresa_activo: fondoOn,
    fondo_ahorro_pct_trabajador: fondoTrab / 100,
    fondo_ahorro_pct_patron:     fondoPat / 100,
    vales_despensa_activo:       valesOn,
    vales_despensa_tipo:         valesTipo,
    vales_despensa_valor:        valesTipo === 'pct' ? valesValor / 100 : valesValor,
    festivos_adicionales:        _festivosTmp,
  };

  try {
    await actualizarEmpresa(CTX.empresa.id, datos);
    CTX.empresa = { ...CTX.empresa, ...datos };
    msg.textContent = '✅ Prestaciones guardadas. Aplican a nóminas generadas o recalculadas a partir de ahora.';
    msg.className = 'alert alert-success'; msg.style.display = '';
  } catch(e) {
    if (/column|does not exist|schema cache/i.test(e.message || '')) {
      fail('Falta aplicar la migración 14_migration_prestaciones.sql en Supabase (SQL Editor).');
    } else {
      fail(e.message);
    }
  }
}

async function handleGuardarNotificaciones() {
  const msg = eid('notif-msg');
  msg.style.display = 'none';
  const activo = eid('notif-activo')?.checked || false;
  const email  = eid('notif-email')?.value.trim() || null;
  if (activo && !email) {
    msg.textContent = 'Ingresa un email de destino para activar las notificaciones.';
    msg.className = 'error-msg'; msg.style.display = ''; return;
  }
  try {
    await actualizarEmpresa(CTX.empresa.id, {
      notif_email_activo: activo,
      notif_email_destino: email,
    });
    CTX.empresa = { ...CTX.empresa, notif_email_activo: activo, notif_email_destino: email };
    msg.textContent = '✅ Configuración de notificaciones guardada.';
    msg.className = 'alert alert-success'; msg.style.display = '';
  } catch(e) { msg.textContent = e.message; msg.className = 'error-msg'; msg.style.display = ''; }
}
