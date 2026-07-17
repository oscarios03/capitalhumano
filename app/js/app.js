/**
 * Capital Humano MX — App Principal
 * Router SPA + todas las vistas
 */

let CTX = null; // { user, perfil, empresa }

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth();
  if (!user) return;

  CTX = await getContexto();
  if (!CTX?.empresa) { window.location.href = 'index.html'; return; }

  document.getElementById('topbar-empresa').textContent = CTX.empresa.nombre;
  document.getElementById('topbar-user').textContent    = CTX.perfil?.nombre || CTX.user.email;

  // Plan de suscripción: gates de UI y banner (plan.js)
  await cargarPlan();
  aplicarGatesUI();
  renderBannerPlan();

  // Rol del usuario: candados de menú y badge (roles.js). Cosmético — el
  // candado real son las políticas RLS (migración 33).
  if (typeof aplicarGatesRol === 'function') aplicarGatesRol();

  // Multiempresa: mostrar switcher si tiene más de una empresa
  getEmpresasUsuario().then(list => {
    if (list.length > 1) {
      const btn = document.getElementById('btn-switch-empresa');
      if (btn) btn.style.display = '';
    }
  }).catch(() => {});

  // Router por hash
  window.addEventListener('hashchange', routeFromHash);
  routeFromHash();
});

function routeFromHash() {
  const hash = window.location.hash.replace('#','') || 'dashboard';
  const parts = hash.split('/');
  navigate(parts[0], parts[1]);
}

function navigate(route, param) {
  window.location.hash = param ? `${route}/${param}` : route;
  // Update sidebar
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.route === route);
  });
  const main = document.getElementById('main-view');
  main.innerHTML = `<div class="loading"><div class="spinner"></div> Cargando…</div>`;

  const views = {
    dashboard:     renderDashboard,
    empleados:     renderEmpleados,
    empleado:      () => renderPerfilEmpleado(param),
    contratos:     renderContratos,
    asistencia:    renderAsistencia,
    checador:      renderChecador,
    nomina:        renderNomina,
    disciplinario: renderDisciplinario,
    bajas:         renderBajas,
    imss:          renderIMSS,
    empresa:       renderEmpresa,
    vacaciones:    renderVacaciones,
    incapacidades: renderIncapacidades,
    aguinaldo:     renderAguinaldo,
    ptu:           renderPTU,
    organigrama:   renderOrganigrama,
    reportes:      renderReportes,
    manual:        renderManual,
  };
  // Gate central de plan: si la ruta requiere una feature no incluida,
  // se muestra la vista bloqueada (el enforcement real son los triggers)
  const feat = ROUTE_FEATURE[route];
  if (feat && !puedeUsar(feat)) { main.innerHTML = htmlVistaBloqueada(feat); return; }

  // Gate central de rol: idem, pero por rol del usuario (el enforcement real
  // son las políticas RLS de la migración 33)
  if (typeof puedeVerRuta === 'function' && !puedeVerRuta(route)) {
    main.innerHTML = htmlRutaBloqueadaPorRol(route); return;
  }

  const fn = views[route];
  if (fn) fn(); else main.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><p>Vista no encontrada</p></div>`;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const eid = id => document.getElementById(id);

function loadingHTML() { return `<div class="loading"><div class="spinner"></div> Cargando…</div>`; }

// ─── BÚSQUEDA GLOBAL ──────────────────────────────────────────────────────────
let _busquedaTimer = null;
async function busquedaGlobal(q) {
  const box = eid('global-results');
  if (!box) return;
  if (!q || q.trim().length < 2) { box.style.display = 'none'; return; }
  clearTimeout(_busquedaTimer);
  _busquedaTimer = setTimeout(async () => {
    try {
      const lista = await db.getTrabajadores({ search: q.trim() });
      if (!lista.length) {
        box.innerHTML = `<div class="global-result-item" style="color:var(--text-muted);cursor:default;">Sin resultados</div>`;
      } else {
        box.innerHTML = lista.slice(0, 8).map(t => `
          <div class="global-result-item" onclick="eid('global-search').value='';eid('global-results').style.display='none';navigate('empleado','${t.id}')">
            <div style="width:32px;height:32px;border-radius:50%;background:var(--gold-dim);display:grid;place-items:center;font-size:.78rem;font-weight:800;color:var(--gold-primary);flex-shrink:0;">${iniciales(t.nombre)}</div>
            <div>
              <div class="global-result-name">${t.nombre}</div>
              <div class="global-result-meta">${t.puesto || '—'} · ${badgeEstado(t.estado)}</div>
            </div>
          </div>`).join('');
      }
      box.style.display = '';
    } catch { box.style.display = 'none'; }
  }, 280);
}

document.addEventListener('click', e => {
  const wrap = eid('topbar-search-wrap');
  if (wrap && !wrap.contains(e.target)) {
    const box = eid('global-results');
    if (box) box.style.display = 'none';
  }
});

// Escape cierra modales y agente IA
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const mc = eid('modal-container');
  if (mc && mc.innerHTML.trim()) { closeModal(); return; }
  const agente = eid('modal-agente');
  if (agente && agente.style.display !== 'none') closeModalAgente();
});

function showModal(html) {
  const c = eid('modal-container');
  c.innerHTML = `<div class="modal-overlay" onclick="if(event.target===this)closeModal()">${html}</div>`;
}
function closeModal() { eid('modal-container').innerHTML = ''; }

function badgeActa(tipo) {
  const map = { amonestacion:'<span class="badge badge-amon">Amonestación</span>', formal:'<span class="badge badge-formal">Formal</span>', rescisoria:'<span class="badge badge-rescis">Rescisoria</span>' };
  return map[tipo] || tipo;
}
function badgeEstado(estado) {
  return estado === 'activo' ? '<span class="badge badge-activo">Activo</span>' : '<span class="badge badge-baja">Baja</span>';
}

// ── Calidad / tipo de contrato ────────────────────────────────────────────────
const _CALIDAD = {
  indeterminado: { label:'De Planta',      cls:'calidad-planta'    },
  indefinido:    { label:'De Planta',      cls:'calidad-planta'    },
  determinado:   { label:'A Prueba',       cls:'calidad-prueba'    },
  obra:          { label:'Por Obra',       cls:'calidad-obra'      },
  temporada:     { label:'Por Temporada',  cls:'calidad-temporada' },
  comision:      { label:'Por Comisión',   cls:'calidad-comision'  },
};

function badgeCalidad(tipo) {
  const c = _CALIDAD[tipo] || { label: tipo || 'Sin definir', cls:'calidad-obra' };
  return `<span class="badge-calidad ${c.cls}">${c.label}</span>`;
}

// ── Días para vencimiento de contrato ─────────────────────────────────────────
function diasParaVencimiento(fechaVenc) {
  if (!fechaVenc) return null;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const v   = new Date(fechaVenc + 'T00:00:00');
  return Math.ceil((v - hoy) / 86400000);
}

function alertaVencHTML(dias, tipo) {
  if (dias === null) return '';
  const tipoLabel = _CALIDAD[tipo]?.label || tipo;
  let cls, icono, msg;
  if      (dias < 0)  { cls='alert-danger'; icono='🔴'; msg=`Contrato <strong>${tipoLabel}</strong> vencido hace <strong>${Math.abs(dias)} día${Math.abs(dias)!==1?'s':''}</strong>.`; }
  else if (dias === 0){ cls='alert-danger'; icono='🔴'; msg=`Contrato <strong>${tipoLabel}</strong> vence <strong>HOY</strong>.`; }
  else if (dias === 1){ cls='alert-danger'; icono='🔴'; msg=`Contrato <strong>${tipoLabel}</strong> vence <strong>mañana</strong>.`; }
  else if (dias <= 3) { cls='alert-danger'; icono='🔴'; msg=`Contrato <strong>${tipoLabel}</strong> vence en <strong>${dias} días</strong>.`; }
  else if (dias <= 7) { cls='alert-warn';   icono='🟡'; msg=`Contrato <strong>${tipoLabel}</strong> vence en <strong>${dias} días</strong>.`; }
  else if (dias <= 15){ cls='alert-warn';   icono='🟡'; msg=`Contrato <strong>${tipoLabel}</strong> vence en <strong>${dias} días</strong>.`; }
  else return '';
  return `<div class="alert ${cls} animate-in" style="margin-bottom:14px;"><span>${icono}</span><span>${msg}</span></div>`;
}

function iniciales(nombre) {
  return (nombre||'?').split(' ').slice(0,2).map(p=>p[0]).join('').toUpperCase();
}

function mesActual() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
}

// ═══════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════
async function renderDashboard() {
  try {
    // Cargar todo en paralelo
    const [kpis, recientes, alertas, nominaPendiente] = await Promise.all([
      db.getKPIs(),
      db.getIncidenciasRecientes(),
      cargarAlertas(CTX.empresa.id).catch(e => { console.warn('alertas:', e.message); return []; }),
      db.getNominaPendiente(CTX.empresa.id).catch(() => null),
      cargarConfigValores().catch(e => { console.warn('config_valores:', e.message); return {}; }),
      cargarFestivos().catch(e => { console.warn('dias_festivos:', e.message); return new Map(); }),
    ]);

    if (typeof verificarMovimientosIMSSVencidos === 'function') {
      verificarMovimientosIMSSVencidos(CTX.empresa.id).catch(() => {});
    }

    // Iniciar suscripción realtime (idempotente)
    suscribirseAlertas(CTX.empresa.id);

    const urgentes = alertas.filter(a => a.prioridad === 'critica' || a.prioridad === 'alta').length;

    const main = eid('main-view');
    main.innerHTML = `
      <div class="view-header animate-in">
        <div>
          <div class="view-title">Panel de Control</div>
          <div class="view-subtitle">Resumen de ${CTX.empresa.nombre}</div>
        </div>
      </div>

      ${nominaPendiente ? `
      <div class="alert alert-warn animate-in" onclick="navigate('nomina')"
           style="cursor:pointer;margin-bottom:8px;">
        <svg class="ic"><use href="#i-wallet"></use></svg>
        <span>Nómina pendiente: <strong>${nominaPendiente.nombre}</strong> — vence el <strong>${formatDateShort(nominaPendiente.fecha_fin)}</strong>. Haz clic para ir a Nómina →</span>
      </div>` : ''}

      <!-- KPIs operativos -->
      <div class="kpi-grid animate-in">
        ${kpis.nominaMes ? `
        <div class="kpi-card kpi-clickable" onclick="navigate('nomina')"
             style="border-color:var(--gold-border);"
             title="Percepciones brutas del mes (${fmt(kpis.nominaMes.bruto)})${kpis.nominaMes.parcial ? '' : ` + cuotas patronales IMSS, INFONAVIT e ISN (${fmt(kpis.nominaMes.patronal)})`}. Neto pagado a trabajadores: ${fmt(kpis.nominaMes.neto)}">
          <div class="kpi-icon" style="color:var(--gold-primary);"><svg class="ic"><use href="#i-pie"></use></svg></div>
          <div class="kpi-num" style="font-size:1.3rem;color:var(--gold-primary);">${fmt(kpis.nominaMes.total)}</div>
          <div class="kpi-label">Nómina del mes${kpis.nominaMes.parcial ? '' : ' (costo total)'}</div>
          <div class="kpi-hint">${kpis.nominaMes.recibos} recibo${kpis.nominaMes.recibos !== 1 ? 's' : ''} → ver nómina</div>
        </div>` : ''}
        <div class="kpi-card kpi-clickable" onclick="navigate('empleados')" title="Ver trabajadores">
          <div class="kpi-icon"><svg class="ic"><use href="#i-user"></use></svg></div>
          <div class="kpi-num">${kpis.empleadosActivos}</div>
          <div class="kpi-label">Empleados activos</div>
          <div class="kpi-hint">Ver todos los trabajadores →</div>
        </div>
        <div class="kpi-card kpi-clickable" onclick="navigate('asistencia')" title="Ver asistencia">
          <div class="kpi-icon"><svg class="ic"><use href="#i-calendar"></use></svg></div>
          <div class="kpi-num">${kpis.faltasMes}</div>
          <div class="kpi-label">Faltas este mes</div>
          <div class="kpi-hint">Ver registro de asistencia →</div>
        </div>
        <div class="kpi-card kpi-clickable" onclick="navigate('disciplinario')" title="Ver actas">
          <div class="kpi-icon"><svg class="ic"><use href="#i-alert"></use></svg></div>
          <div class="kpi-num">${kpis.actasMes}</div>
          <div class="kpi-label">Actas este mes</div>
          <div class="kpi-hint">Ver actas administrativas →</div>
        </div>
        <div class="kpi-card kpi-clickable" onclick="navigate('bajas')" title="Ver bajas">
          <div class="kpi-icon"><svg class="ic"><use href="#i-exit"></use></svg></div>
          <div class="kpi-num">${kpis.bajasMes}</div>
          <div class="kpi-label">Bajas este mes</div>
          <div class="kpi-hint">Ver registro de bajas →</div>
        </div>
      </div>

      <!-- ALERTAS LEGALES -->
      <div class="card animate-in" style="margin-top:8px;${urgentes > 0 ? 'border-color:rgba(192,57,43,.4);' : ''}">
        <div class="card-header" style="margin-bottom:14px;">
          <span class="card-title" style="display:inline-flex;align-items:center;gap:8px;">
            <svg class="ic" style="color:var(--text-muted);"><use href="#i-alert"></use></svg> Alertas Legales
            ${urgentes > 0 ? `<span style="background:var(--red-warn);color:#fff;font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:100px;">${urgentes} urgentes</span>` : ''}
          </span>
          <button class="btn-secondary btn-sm" onclick="cargarAlertas('${CTX.empresa.id}', true).then(()=>renderDashboard())"
            title="Vuelve a revisar contratos, períodos de prueba, faltas y vencimientos para detectar riesgos nuevos">
            Buscar nuevos riesgos
          </button>
        </div>
        <div id="alertas-resumen-wrap">${renderResumenAlertas(alertas)}</div>
        <div id="alertas-lista-wrap" style="margin-top:14px;">${renderListaAlertas(alertas)}</div>
      </div>

      <!-- OBLIGACIONES DEL MES (obligaciones.js) -->
      ${typeof renderObligacionesHTML === 'function' ? renderObligacionesHTML() : ''}

      <!-- CONTRATOS POR VENCER -->
      <div class="card animate-in" style="margin-top:16px;">
        <div class="card-header" style="margin-bottom:14px;">
          <span class="card-title" style="display:inline-flex;align-items:center;gap:8px;">
            <svg class="ic" style="color:var(--text-muted);"><use href="#i-clock"></use></svg> Contratos por vencer
            ${contratosPorVencer(alertas).length > 0 ? `<span style="background:var(--accent);color:#fff;font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:100px;">${contratosPorVencer(alertas).length}</span>` : ''}
          </span>
        </div>
        ${renderContratosPorVencer(alertas)}
      </div>

      <!-- Incidencias recientes -->
      <div class="card animate-in" style="margin-top:16px;">
        <div class="card-header">
          <span class="card-title" style="display:inline-flex;align-items:center;gap:8px;">
            <svg class="ic" style="color:var(--text-muted);"><use href="#i-file"></use></svg> Incidencias recientes de asistencia
          </span>
          <button class="btn-secondary btn-sm" onclick="navigate('asistencia')">Ver todas</button>
        </div>
        ${recientes.length === 0
          ? `<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-title">Sin incidencias registradas</div></div>`
          : `<div class="table-wrap"><table class="data-table">
              <thead><tr><th>Trabajador</th><th>Tipo</th><th>Fecha</th><th>Justificada</th></tr></thead>
              <tbody>${recientes.map(r => `
                <tr>
                  <td><strong>${r.trabajadores?.nombre || '—'}</strong></td>
                  <td><span class="badge ${r.tipo==='falta'?'badge-falta':'badge-retardo'}">${r.tipo==='falta'?'Falta':'Retardo'}</span></td>
                  <td>${formatDateShort(r.fecha)}</td>
                  <td>${r.justificada ? '<span style="color:var(--green-ok)">✓ Sí</span>' : '<span style="color:var(--red-warn)">✗ No</span>'}</td>
                </tr>`).join('')}
              </tbody></table></div>`
        }
      </div>

      <!-- Accesos rápidos -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;" class="animate-in">
        <div class="card" style="cursor:pointer;" onclick="navigate('empleados')">
          <div style="font-size:2rem;margin-bottom:10px;">👤</div>
          <div style="font-weight:700;">Registrar nuevo trabajador</div>
          <div style="font-size:.82rem;color:var(--text-muted);margin-top:4px;">Alta + contrato automático</div>
        </div>
        <div class="card" style="cursor:pointer;" onclick="navigate('disciplinario')">
          <div style="font-size:2rem;margin-bottom:10px;">⚠️</div>
          <div style="font-weight:700;">Levantar acta administrativa</div>
          <div style="font-size:.82rem;color:var(--text-muted);margin-top:4px;">Amonestación, formal o rescisoria</div>
        </div>
      </div>
    `;
  } catch(e) { showError(e); }
}

async function renderAsistencia() { await renderAsistenciaModulo(); }

// ── Módulos extraídos a archivos separados ──────────────
// empleados.js  → renderEmpleados, renderPerfilEmpleado, showModalTrabajador, handleGuardarTrabajador, etc.
// disciplinario.js → renderDisciplinario, showModalActa, handleGuardarActa
// contratos.js  → renderContratos, toggleContratoMenu, descargarContrato
// bajas.js      → renderBajas, handleProcesarBaja, _confirmarBaja, showResumenBaja
// empresa.js    → renderEmpresa, showModalSucursal, handleGuardarSucursal, handleGuardarEmpresa, handleGuardarNotificaciones
// ────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════
//  MANUAL DE USO
// ═══════════════════════════════════════════════════════
function renderManual() {
  const main = document.getElementById('main-view');

  const secciones = [
    { id:'intro',        icon:'📖', num:'1',  titulo:'Introducción' },
    { id:'acceso',       icon:'🔐', num:'2',  titulo:'Acceso al sistema' },
    { id:'dashboard',    icon:'📊', num:'3',  titulo:'Panel de Control' },
    { id:'trabajadores', icon:'👥', num:'4',  titulo:'Trabajadores' },
    { id:'contratos',    icon:'📄', num:'5',  titulo:'Contratos' },
    { id:'asistencia',   icon:'🗓', num:'6',  titulo:'Asistencia' },
    { id:'nomina',       icon:'💰', num:'7',  titulo:'Nómina' },
    { id:'actas',        icon:'⚠️', num:'8',  titulo:'Actas Administrativas' },
    { id:'bajas',        icon:'🚪', num:'9',  titulo:'Bajas' },
    { id:'prestaciones', icon:'🎁', num:'10', titulo:'Prestaciones' },
    { id:'empresa',      icon:'🏢', num:'11', titulo:'Mi Empresa' },
    { id:'organigrama',  icon:'🏗', num:'12', titulo:'Organigrama' },
    { id:'reportes',     icon:'📈', num:'13', titulo:'Reportes' },
    { id:'faq',          icon:'❓', num:'14', titulo:'Preguntas Frecuentes' },
  ];

  const contenido = {
    intro: `
      <p><strong>Capital Humano MX</strong> es un sistema de gestión de recursos humanos diseñado para empresas mexicanas. Permite administrar trabajadores, contratos, asistencia, nómina, prestaciones y cumplimiento legal (LFT / IMSS / ISR 2026) desde una sola plataforma web.</p>
      <h4 style="margin:16px 0 8px;font-family:'Montserrat',sans-serif;color:var(--navy-deep);">Perfiles de usuario</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px;">
        <div style="border:2px solid var(--gold-primary);border-radius:10px;padding:16px;">
          <div style="font-size:22px;margin-bottom:6px;">👑</div>
          <strong style="font-family:'Montserrat',sans-serif;">Administrador</strong>
          <ul style="margin-top:8px;font-size:.85rem;padding-left:16px;">
            <li>Configura la empresa y sucursales</li>
            <li>Define el día de pago semanal</li>
            <li>Acceso total a todos los módulos</li>
            <li>Cierra y aprueba períodos de nómina</li>
            <li>Genera reportes ejecutivos</li>
          </ul>
        </div>
        <div style="border:2px solid var(--border);border-radius:10px;padding:16px;">
          <div style="font-size:22px;margin-bottom:6px;">📋</div>
          <strong style="font-family:'Montserrat',sans-serif;">Operativo (RH)</strong>
          <ul style="margin-top:8px;font-size:.85rem;padding-left:16px;">
            <li>Da de alta y edita trabajadores</li>
            <li>Registra asistencia e incidencias</li>
            <li>Genera y revisa períodos de nómina</li>
            <li>Emite actas administrativas</li>
            <li>Procesa bajas y liquidaciones</li>
          </ul>
        </div>
      </div>`,

    acceso: `
      <ol style="padding-left:0;list-style:none;">
        ${['Abre tu navegador (Chrome o Edge recomendado) y ve a la URL de la aplicación.','Ingresa tu correo electrónico y contraseña.','Haz clic en <strong>Iniciar sesión</strong>.','Si tienes más de una empresa, elige con cuál trabajar en el selector.'].map((s,i)=>`<li style="display:flex;gap:12px;margin-bottom:10px;align-items:flex-start;"><span style="background:var(--gold-primary);color:var(--navy-deep);font-family:'Montserrat',sans-serif;font-weight:900;font-size:.8rem;min-width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">${i+1}</span><span>${s}</span></li>`).join('')}
      </ol>
      <div style="border-left:4px solid var(--gold-primary);background:rgba(245,166,35,.07);padding:12px 16px;border-radius:0 8px 8px 0;margin-top:12px;font-size:.88rem;">
        <strong>💡 Multiempresa:</strong> Cambia de empresa en cualquier momento con el botón <strong>🔄</strong> en la barra superior, sin cerrar sesión.
      </div>`,

    dashboard: `
      <p>El Panel de Control muestra un resumen ejecutivo en tiempo real:</p>
      <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:.88rem;">
        <thead><tr style="background:var(--navy-deep);color:#fff;"><th style="padding:8px 12px;text-align:left;">Indicador</th><th style="padding:8px 12px;text-align:left;">Descripción</th></tr></thead>
        <tbody>
          <tr style="border-bottom:1px solid var(--border);"><td style="padding:8px 12px;">📊 Nómina del mes</td><td style="padding:8px 12px;"><strong>Lo que la nómina le cuesta a la empresa</strong>: percepciones brutas más cuotas patronales IMSS, INFONAVIT e ISN. Pasa el cursor encima para ver el desglose y el neto que reciben los trabajadores.</td></tr>
          <tr style="border-bottom:1px solid var(--border);background:rgba(255,255,255,.03);"><td style="padding:8px 12px;">👤 Empleados activos</td><td style="padding:8px 12px;">Total de trabajadores en plantilla</td></tr>
          <tr style="border-bottom:1px solid var(--border);"><td style="padding:8px 12px;">🗓 Faltas este mes</td><td style="padding:8px 12px;">Faltas injustificadas del mes actual</td></tr>
          <tr style="border-bottom:1px solid var(--border);background:rgba(255,255,255,.03);"><td style="padding:8px 12px;">⚠️ Actas este mes</td><td style="padding:8px 12px;">Actas administrativas emitidas en el mes</td></tr>
          <tr><td style="padding:8px 12px;">🚪 Bajas este mes</td><td style="padding:8px 12px;">Trabajadores que causaron baja en el mes</td></tr>
        </tbody>
      </table>
      <p style="margin-top:12px;font-size:.88rem;"><strong>🔔 Alertas Legales:</strong> el sistema genera automáticamente avisos sobre contratos por vencer, vacaciones pendientes y períodos de prueba. El botón <strong>"Buscar nuevos riesgos"</strong> vuelve a revisarlo todo en el momento.</p>
      <p style="margin-top:10px;font-size:.88rem;"><strong>📅 Obligaciones del mes:</strong> el calendario de lo que hay que pagar o presentar — cuotas IMSS (día 17), el bimestral de RCV e INFONAVIT, la variabilidad del SBC, el ISN, la prima de riesgo de febrero, la PTU y el aguinaldo. Lo <span style="color:#e74c3c;font-weight:700;">vencido</span> se marca en rojo y lo <span style="color:#f39c12;font-weight:700;">por vencer</span> en naranja; haz clic para ir al módulo que corresponde.</p>
      <div style="border-left:4px solid var(--gold-primary);background:rgba(245,166,35,.07);padding:12px 16px;border-radius:0 8px 8px 0;margin-top:10px;font-size:.85rem;">
        <strong>💡 Sobre las fechas:</strong> las que caen en sábado, domingo o día festivo se recorren solas al siguiente día hábil. La fecha de la PTU depende de si eres persona moral (30 de mayo) o física (29 de junio): el sistema lo deduce de tu RFC. El <strong>ISN es estatal</strong>, así que su vencimiento y su tasa cambian según tu entidad — confírmalos con tu contador.
      </div>`,

    trabajadores: `
      <h4 style="margin:0 0 10px;font-family:'Montserrat',sans-serif;color:var(--navy-deep);">Alta de Trabajador</h4>
      <ol style="padding-left:0;list-style:none;">
        ${['Clic en <strong>"+ Nuevo Trabajador"</strong>.','Completa datos personales: nombre, RFC, CURP, NSS.','Define puesto, departamento y sucursal.','Configura salario y <strong>tipo de período de pago</strong> (Semanal / Quincenal / Mensual). Este campo determina cómo se calcula su nómina.','Selecciona el tipo de contrato.','Configura prestaciones opcionales: vales, bono fijo, fondo de ahorro, INFONAVIT, pensión alimenticia.','Clic en <strong>"Guardar"</strong>. El contrato se genera automáticamente.'].map((s,i)=>`<li style="display:flex;gap:12px;margin-bottom:8px;align-items:flex-start;"><span style="background:var(--gold-primary);color:var(--navy-deep);font-family:'Montserrat',sans-serif;font-weight:900;font-size:.8rem;min-width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">${i+1}</span><span style="font-size:.88rem;">${s}</span></li>`).join('')}
      </ol>
      <div style="border-left:4px solid var(--gold-primary);background:rgba(245,166,35,.07);padding:12px 16px;border-radius:0 8px 8px 0;margin-top:4px;font-size:.85rem;">
        <strong>⚙️ Campo clave:</strong> Si el trabajador cobra semanalmente, selecciona <em>Semanal</em>. El sistema lo incluirá en períodos semanales y calculará su salario correctamente.
      </div>`,

    contratos: `
      <table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:.88rem;">
        <thead><tr style="background:var(--navy-deep);color:#fff;"><th style="padding:8px 12px;text-align:left;">Tipo</th><th style="padding:8px 12px;text-align:left;">Descripción</th><th style="padding:8px 12px;text-align:left;">Alertas</th></tr></thead>
        <tbody>
          <tr style="border-bottom:1px solid var(--border);"><td style="padding:8px 12px;"><strong>De Planta</strong></td><td style="padding:8px 12px;">Sin fecha de vencimiento</td><td style="padding:8px 12px;">No aplica</td></tr>
          <tr style="border-bottom:1px solid var(--border);background:rgba(255,255,255,.03);"><td style="padding:8px 12px;"><strong>A Prueba</strong></td><td style="padding:8px 12px;">Tiempo determinado (Art. 35 LFT)</td><td style="padding:8px 12px;">15 días antes</td></tr>
          <tr style="border-bottom:1px solid var(--border);"><td style="padding:8px 12px;"><strong>Por Obra</strong></td><td style="padding:8px 12px;">Para trabajo específico</td><td style="padding:8px 12px;">15 días antes</td></tr>
          <tr style="border-bottom:1px solid var(--border);background:rgba(255,255,255,.03);"><td style="padding:8px 12px;"><strong>Por Temporada</strong></td><td style="padding:8px 12px;">Actividades estacionales</td><td style="padding:8px 12px;">15 días antes</td></tr>
          <tr><td style="padding:8px 12px;"><strong>Por Comisión</strong></td><td style="padding:8px 12px;">Remuneración por comisiones (Art. 285 LFT)</td><td style="padding:8px 12px;">No aplica</td></tr>
        </tbody>
      </table>
      <p style="font-size:.88rem;margin-top:10px;">El PDF del contrato se genera automáticamente al dar de alta al trabajador. Puedes regenerarlo desde el perfil del trabajador o desde el módulo Contratos.</p>`,

    asistencia: `
      <table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:.88rem;">
        <thead><tr style="background:var(--navy-deep);color:#fff;"><th style="padding:8px 12px;text-align:left;">Tipo</th><th style="padding:8px 12px;text-align:left;">Efecto en nómina</th><th style="padding:8px 12px;text-align:left;">Fundamento</th></tr></thead>
        <tbody>
          <tr style="border-bottom:1px solid var(--border);"><td style="padding:8px 12px;">❌ Falta</td><td style="padding:8px 12px;">Descuenta el día del salario</td><td style="padding:8px 12px;">Art. 59 LFT</td></tr>
          <tr style="border-bottom:1px solid var(--border);background:rgba(255,255,255,.03);"><td style="padding:8px 12px;">⏰ Retardo</td><td style="padding:8px 12px;">Solo registro disciplinario</td><td style="padding:8px 12px;">Art. 59 LFT</td></tr>
          <tr style="border-bottom:1px solid var(--border);"><td style="padding:8px 12px;">✅ Permiso con goce</td><td style="padding:8px 12px;">No descuenta el salario</td><td style="padding:8px 12px;">Art. 132 fr. X LFT</td></tr>
          <tr><td style="padding:8px 12px;">🔴 Permiso sin goce</td><td style="padding:8px 12px;">Descuenta el día del salario</td><td style="padding:8px 12px;">Art. 59 LFT</td></tr>
        </tbody>
      </table>
      <div style="border-left:4px solid var(--gold-primary);background:rgba(245,166,35,.07);padding:12px 16px;border-radius:0 8px 8px 0;margin-top:8px;font-size:.85rem;">
        <strong>💡 Vinculación automática:</strong> Al generar un período de nómina, el sistema consulta las incidencias del rango de fechas de cada trabajador y descuenta los días automáticamente.
      </div>`,

    nomina: `
      <p style="font-size:.88rem;margin-bottom:12px;">Motor de cálculo con <strong>ISR 2026</strong> (tarifas del Anexo 8 RMF por periodicidad: semanal, quincenal y mensual), <strong>subsidio al empleo</strong>, <strong>cuotas IMSS obrero y patronales</strong> e <strong>ISN estatal</strong>. El módulo tiene cuatro pestañas:</p>
      <h4 style="font-family:'Montserrat',sans-serif;color:var(--navy-deep);margin-bottom:8px;">7.1 Períodos — Crear un período</h4>
      <ol style="padding-left:0;list-style:none;">
        ${['Clic en <strong>"+ Nuevo Período"</strong>.','El sistema detecta el tipo dominante entre los trabajadores activos y pre-selecciona Semanal, Quincenal o Mensual.','Para nómina <strong>Semanal</strong>: las fechas se calculan según el día de pago configurado en <em>Mi Empresa</em>.','Elige modo <strong>Automático</strong> (genera todos los recibos) o <strong>Manual</strong> (período vacío).','Clic en <strong>"⚡ Crear y generar nómina"</strong>.'].map((s,i)=>`<li style="display:flex;gap:12px;margin-bottom:8px;align-items:flex-start;"><span style="background:var(--gold-primary);color:var(--navy-deep);font-family:'Montserrat',sans-serif;font-weight:900;font-size:.8rem;min-width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">${i+1}</span><span style="font-size:.88rem;">${s}</span></li>`).join('')}
      </ol>
      <h4 style="font-family:'Montserrat',sans-serif;color:var(--navy-deep);margin:14px 0 6px;">7.2 Detalle del Período</h4>
      <p style="font-size:.88rem;">Muestra KPIs y la tabla de recibos. Edita cualquier recibo con ✏️ para capturar comisiones, deducciones especiales y extras. El ISR e IMSS se recalculan en tiempo real.</p>
      <p style="font-size:.88rem;">El KPI <strong>"Costo total para la empresa"</strong> suma las percepciones brutas más lo que pagas encima: cuotas patronales IMSS, aportación INFONAVIT del 5% e ISN estatal. Es lo que la nómina te cuesta de verdad — configura tu prima de riesgo y tu tasa de ISN en <em>Mi Empresa</em> para que la cifra sea exacta.</p>
      <h4 style="font-family:'Montserrat',sans-serif;color:var(--navy-deep);margin:14px 0 6px;">7.3 Historial por Trabajador</h4>
      <p style="font-size:.88rem;">Acumulado anual por trabajador: percepciones, ISR retenido, IMSS obrero y neto. Descarga cualquier recibo individual en PDF.</p>
      <h4 style="font-family:'Montserrat',sans-serif;color:var(--navy-deep);margin:14px 0 6px;">7.4 Ajuste anual de ISR (Art. 97 LISR)</h4>
      <p style="font-size:.88rem;">En diciembre estás obligado a comparar el ISR que retuviste durante el año contra el que realmente corresponde según la tarifa anual, y a cobrar o devolver la diferencia. Esta pestaña lo calcula por trabajador y aplica el resultado en el recibo de diciembre con un clic.</p>
      <p style="font-size:.88rem;">La ley excluye del ajuste a quien ganó más de $400,000 en el año o a quien entró o salió durante el ejercicio: el sistema los detecta y los marca solo. Si alguien te avisa por escrito que presentará su declaración anual por su cuenta, desmárcalo a mano en la columna "Aplica".</p>
      <div style="border-left:4px solid #e74c3c;background:rgba(231,76,60,.06);padding:12px 16px;border-radius:0 8px 8px 0;margin-top:10px;font-size:.85rem;">
        <strong>⛔ Cerrar vs. Eliminar:</strong> <em>Cerrar</em> marca el período como pagado (irreversible, queda en historial). <em>Eliminar</em> borra el período y todos sus recibos de forma permanente.
      </div>
      <div style="border-left:4px solid var(--gold-primary);background:rgba(245,166,35,.07);padding:12px 16px;border-radius:0 8px 8px 0;margin-top:10px;font-size:.85rem;">
        <strong>💡 Si regeneras diciembre:</strong> el ajuste anual se borra al regenerar la nómina de ese período. Vuelve a aplicarlo desde la pestaña 7.4 después de regenerar.
      </div>`,

    actas: `
      <table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:.88rem;">
        <thead><tr style="background:var(--navy-deep);color:#fff;"><th style="padding:8px 12px;text-align:left;">Tipo</th><th style="padding:8px 12px;text-align:left;">Uso</th></tr></thead>
        <tbody>
          <tr style="border-bottom:1px solid var(--border);"><td style="padding:8px 12px;">📝 <strong>Amonestación</strong></td><td style="padding:8px 12px;">Primera infracción o falta leve</td></tr>
          <tr style="border-bottom:1px solid var(--border);background:rgba(255,255,255,.03);"><td style="padding:8px 12px;">📋 <strong>Formal</strong></td><td style="padding:8px 12px;">Reincidencia o falta de mayor gravedad</td></tr>
          <tr><td style="padding:8px 12px;">🚫 <strong>Rescisoria</strong></td><td style="padding:8px 12px;">Falta grave que justifica rescisión (Art. 47 LFT)</td></tr>
        </tbody>
      </table>
      <ol style="padding-left:0;list-style:none;margin-top:12px;">
        ${['Ve a <strong>Actas Admin.</strong> → <strong>"+ Nueva Acta"</strong>.','Selecciona trabajador y tipo de acta.','Elige el tipo de falta y la causal legal del catálogo.','Captura descripción, lugar, hora y datos de testigos.','Indica si el trabajador acepta o niega firmar.','Clic en <strong>"Generar Acta"</strong> — se crea el PDF listo para firma.'].map((s,i)=>`<li style="display:flex;gap:12px;margin-bottom:8px;align-items:flex-start;"><span style="background:var(--gold-primary);color:var(--navy-deep);font-family:'Montserrat',sans-serif;font-weight:900;font-size:.8rem;min-width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">${i+1}</span><span style="font-size:.88rem;">${s}</span></li>`).join('')}
      </ol>`,

    bajas: `
      <table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:.88rem;">
        <thead><tr style="background:var(--navy-deep);color:#fff;"><th style="padding:8px 12px;text-align:left;">Tipo de baja</th><th style="padding:8px 12px;text-align:left;">Documentos generados</th></tr></thead>
        <tbody>
          <tr style="border-bottom:1px solid var(--border);"><td style="padding:8px 12px;"><strong>Renuncia voluntaria</strong></td><td style="padding:8px 12px;">Carta de Renuncia + Recibo de Finiquito</td></tr>
          <tr style="border-bottom:1px solid var(--border);background:rgba(255,255,255,.03);"><td style="padding:8px 12px;"><strong>Rescisión sin responsabilidad</strong></td><td style="padding:8px 12px;">Aviso de Rescisión + Recibo de Liquidación (3 meses + 20 días/año + partes proporcionales)</td></tr>
          <tr><td style="padding:8px 12px;"><strong>Mutuo acuerdo</strong></td><td style="padding:8px 12px;">Recibo de Finiquito con prestaciones proporcionales</td></tr>
        </tbody>
      </table>
      <div style="border-left:4px solid var(--gold-primary);background:rgba(245,166,35,.07);padding:12px 16px;border-radius:0 8px 8px 0;margin-top:10px;font-size:.85rem;">
        <strong>💡 Proporcionales automáticos:</strong> El sistema calcula vacaciones, prima y aguinaldo proporcionales basándose en la fecha de ingreso del trabajador. Verifica que esté correcta antes de procesar la baja.
      </div>`,

    prestaciones: `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div style="border:1.5px solid var(--border);border-radius:8px;padding:14px;">
          <div style="font-weight:700;font-family:'Montserrat',sans-serif;margin-bottom:6px;">🏖 Vacaciones</div>
          <p style="font-size:.83rem;margin:0;">Cálculo automático por antigüedad (LFT reforma 2023: mín. 12 días el 1er año). Genera recibo de prima vacacional (25% mínimo, Art. 80 LFT).</p>
        </div>
        <div style="border:1.5px solid var(--border);border-radius:8px;padding:14px;">
          <div style="font-weight:700;font-family:'Montserrat',sans-serif;margin-bottom:6px;">🏥 Incapacidades</div>
          <p style="font-size:.83rem;margin:0;">Registra enfermedad general, maternidad o riesgo de trabajo. Calcula subsidio IMSS y se refleja en nómina automáticamente.</p>
        </div>
        <div style="border:1.5px solid var(--border);border-radius:8px;padding:14px;">
          <div style="font-weight:700;font-family:'Montserrat',sans-serif;margin-bottom:6px;">🎄 Aguinaldo</div>
          <p style="font-size:.83rem;margin:0;">Mínimo 15 días de salario (Art. 87 LFT). Proporcional para trabajadores con menos de un año. Plazo: <strong>20 de diciembre</strong>. Los primeros 30 días de UMA están exentos de ISR; sobre el excedente se retiene con el procedimiento del Art. 174 RLISR.</p>
        </div>
        <div style="border:1.5px solid var(--border);border-radius:8px;padding:14px;">
          <div style="font-weight:700;font-family:'Montserrat',sans-serif;margin-bottom:6px;">📊 PTU</div>
          <p style="font-size:.83rem;margin:0;">Distribución por días trabajados y salarios (Art. 117-131 LFT). Plazo: 60 días después de la declaración anual. Aplica el tope individual de 3 meses de salario (Art. 127 fr. VIII) y la exención de ISR de 15 días de UMA.</p>
        </div>
      </div>`,

    empresa: `
      <h4 style="font-family:'Montserrat',sans-serif;color:var(--navy-deep);margin-bottom:8px;">Datos Fiscales</h4>
      <p style="font-size:.88rem;margin-bottom:14px;">Mantén actualizados: Razón Social, RFC, Representante Legal, Domicilio y Ciudad. Estos datos aparecen en todos los documentos generados.</p>
      <h4 style="font-family:'Montserrat',sans-serif;color:var(--navy-deep);margin-bottom:8px;">⚙️ Configuración de Nómina — Día de Pago Semanal</h4>
      <ol style="padding-left:0;list-style:none;">
        ${['Localiza la sección <strong>"⚙️ Configuración de Nómina"</strong>.','Haz clic en el día de la semana en que pagas (Dom, Lun, Mar, Mié, Jue, <strong>Vie</strong>, Sáb).','Clic en <strong>"💾 Guardar configuración"</strong>.'].map((s,i)=>`<li style="display:flex;gap:12px;margin-bottom:8px;align-items:flex-start;"><span style="background:var(--gold-primary);color:var(--navy-deep);font-family:'Montserrat',sans-serif;font-weight:900;font-size:.8rem;min-width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">${i+1}</span><span style="font-size:.88rem;">${s}</span></li>`).join('')}
      </ol>
      <div style="border-left:4px solid var(--gold-primary);background:rgba(245,166,35,.07);padding:12px 16px;border-radius:0 8px 8px 0;margin-top:4px;font-size:.85rem;">
        <strong>💡 ¿Cómo funciona?</strong> Al crear un período semanal, el sistema calcula el rango de 7 días que termina el día anterior al pago. Ej: pago el <strong>viernes</strong> → período sábado a viernes anterior.
      </div>
      <h4 style="font-family:'Montserrat',sans-serif;color:var(--navy-deep);margin:16px 0 8px;">👥 Usuarios y permisos</h4>
      <p style="font-size:.88rem;">Puedes dar acceso a más personas sin darles el control total. Cada usuario tiene uno de cuatro roles:</p>
      <table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:.85rem;">
        <thead><tr style="background:var(--navy-deep);color:#fff;"><th style="padding:8px 12px;text-align:left;">Rol</th><th style="padding:8px 12px;text-align:left;">Qué puede hacer</th></tr></thead>
        <tbody>
          <tr style="border-bottom:1px solid var(--border);"><td style="padding:8px 12px;"><strong>Administrador</strong></td><td style="padding:8px 12px;">Todo, incluidos los datos de la empresa y la gestión de usuarios. Es tu rol.</td></tr>
          <tr style="border-bottom:1px solid var(--border);background:rgba(255,255,255,.03);"><td style="padding:8px 12px;"><strong>Gerente</strong></td><td style="padding:8px 12px;">Opera todo: nómina, altas, bajas, actas, y aprueba vacaciones. No toca la configuración de la empresa ni a los usuarios.</td></tr>
          <tr style="border-bottom:1px solid var(--border);"><td style="padding:8px 12px;"><strong>Capturista</strong></td><td style="padding:8px 12px;">Captura asistencia y registra solicitudes de vacaciones. Puedes limitarlo a una sola sucursal. Lo demás lo ve, pero no lo edita.</td></tr>
          <tr><td style="padding:8px 12px;"><strong>Solo consulta</strong></td><td style="padding:8px 12px;">Lee todo, no cambia nada. El rol para tu contador — o, si eres despacho, para tu cliente.</td></tr>
        </tbody>
      </table>
      <p style="font-size:.88rem;margin-top:8px;">Para dar acceso: <strong>Invitar usuario</strong> → captura su correo y elige el rol → cópiale la liga. La persona crea su cuenta <strong>con ese mismo correo</strong> y entra directo a tu empresa con el rol que le diste. Las invitaciones vencen a los 14 días.</p>
      <div style="border-left:4px solid var(--gold-primary);background:rgba(245,166,35,.07);padding:12px 16px;border-radius:0 8px 8px 0;margin-top:10px;font-size:.85rem;">
        <strong>🔒 Nadie puede cambiarse el rol a sí mismo</strong>, ni siquiera un administrador: es justo lo que impide que alguien se auto-promueva. Si necesitas cambiar el tuyo, pídeselo a otro admin. Por lo mismo, el sistema no te deja quitar el último administrador de la empresa.
      </div>

      <h4 style="font-family:'Montserrat',sans-serif;color:var(--navy-deep);margin:16px 0 8px;">Costo patronal — Prima de riesgo e ISN</h4>
      <p style="font-size:.88rem;">En la misma sección de Configuración de Nómina captura dos datos que determinan cuánto te cuesta realmente tu nómina:</p>
      <ul style="font-size:.88rem;margin-top:6px;padding-left:18px;">
        <li><strong>Prima de riesgo de trabajo:</strong> la de tu declaración anual ante el IMSS de febrero. Si nunca la has presentado o apenas inicias, va la mínima de clase I (0.54355%).</li>
        <li><strong>ISN (Impuesto Sobre Nómina):</strong> lo cobra tu estado, no la federación, y la tasa varía (típicamente entre 2% y 4%). Selecciona tu entidad y captura la tasa vigente; si no aplica en tu caso, deja 0.</li>
      </ul>
      <p style="font-size:.88rem;margin-top:8px;">Con estos datos, cada nómina te muestra su costo total real y cada trabajador su costo mensual completo (salario + cuotas patronales + provisiones de aguinaldo, vacaciones y prima).</p>`,

    organigrama: `
      <p style="font-size:.88rem;">El organigrama se genera automáticamente a partir de los <strong>departamentos y puestos</strong> registrados en los trabajadores activos. No requiere configuración adicional.</p>
      <ul style="font-size:.88rem;margin-top:10px;padding-left:18px;">
        <li>Muestra la estructura jerárquica de la empresa de forma visual.</li>
        <li>Se actualiza en tiempo real al agregar o modificar trabajadores.</li>
        <li>Útil para presentaciones internas y auditorías organizacionales.</li>
      </ul>`,

    reportes: `
      <table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:.88rem;">
        <thead><tr style="background:var(--navy-deep);color:#fff;"><th style="padding:8px 12px;text-align:left;">Reporte</th><th style="padding:8px 12px;text-align:left;">Contenido</th></tr></thead>
        <tbody>
          <tr style="border-bottom:1px solid var(--border);"><td style="padding:8px 12px;"><strong>Nómina</strong></td><td style="padding:8px 12px;">Percepciones, deducciones y neto por período y trabajador</td></tr>
          <tr style="border-bottom:1px solid var(--border);background:rgba(255,255,255,.03);"><td style="padding:8px 12px;"><strong>Asistencia</strong></td><td style="padding:8px 12px;">Faltas, retardos y permisos por rango de fechas</td></tr>
          <tr style="border-bottom:1px solid var(--border);"><td style="padding:8px 12px;"><strong>Prestaciones</strong></td><td style="padding:8px 12px;">Vacaciones tomadas y pendientes, aguinaldo, PTU</td></tr>
          <tr><td style="padding:8px 12px;"><strong>Movimientos de Personal</strong></td><td style="padding:8px 12px;">Altas, bajas, tipos de contrato, antigüedad</td></tr>
        </tbody>
      </table>`,

    faq: `
      ${[
        ['¿Por qué el período semanal sugiere fechas incorrectas?', 'Ve a <strong>Mi Empresa → Configuración de Nómina</strong> y selecciona el día de pago correcto. Guarda y vuelve a crear el período.'],
        ['¿Puedo tener trabajadores con distintos tipos de período?', 'Sí. Cada trabajador tiene su propio tipo (semanal, quincenal o mensual). Al crear un período, el sistema detecta el tipo dominante pero puedes cambiarlo manualmente.'],
        ['¿Puedo cambiar el salario de un trabajador ya registrado?', 'Sí. Edita el perfil del trabajador y guarda. El cambio aplica al <strong>siguiente período que generes</strong>; los recibos ya emitidos no se modifican.'],
        ['¿Qué diferencia hay entre "Cerrar" y "Eliminar" un período?', '<strong>Cerrar</strong> lo marca como pagado (solo lectura, queda en historial). <strong>Eliminar</strong> borra el período y todos sus recibos permanentemente.'],
        ['¿El ISR se calcula automáticamente?', 'Sí. El sistema aplica las tablas ISR 2026 (Art. 96 LISR) y el subsidio al empleo. Solo define el salario y el tipo de período del trabajador.'],
        ['¿Cómo exporto la nómina para pagar por SPEI?', 'En <strong>Nómina → Períodos</strong>, haz clic en el botón <strong>"SPEI"</strong> del período correspondiente.'],
        ['¿Qué pasa si registro una falta después de generar la nómina?', 'Registra la falta en Asistencia y luego en el período usa <strong>"🔄 Recalcular todo"</strong> para regenerar los recibos con la información actualizada.'],
      ].map(([q,a])=>`
        <div style="border:1.5px solid var(--border);border-radius:8px;margin-bottom:10px;overflow:hidden;">
          <div style="background:rgba(255,255,255,.04);padding:10px 14px;font-family:'Montserrat',sans-serif;font-weight:700;font-size:.88rem;color:var(--text-primary);">❓ ${q}</div>
          <div style="padding:10px 14px;font-size:.85rem;">${a}</div>
        </div>`).join('')}`,
  };

  main.innerHTML = `
    <div class="view-header animate-in">
      <div>
        <div class="view-title">📖 Manual de Uso</div>
        <div class="view-subtitle">Capital Humano MX — Guía completa del sistema</div>
      </div>
      <button class="btn-primary" onclick="window.open('manual.html','_blank')"
              title="Abre el manual completo en una nueva pestaña para imprimir o guardar como PDF">
        ⬇️ Descargar PDF
      </button>
    </div>

    <div style="display:grid;grid-template-columns:220px 1fr;gap:20px;align-items:start;" class="animate-in">

      <!-- Índice lateral -->
      <div style="position:sticky;top:16px;background:var(--bg-surface);border:1.5px solid var(--border);border-radius:12px;overflow:hidden;">
        <div style="background:var(--navy-deep);padding:12px 16px;font-family:'Montserrat',sans-serif;font-weight:800;font-size:.85rem;color:#fff;">
          Índice
        </div>
        ${secciones.map(s=>`
          <div onclick="_manualIrA('${s.id}')"
               id="toc-${s.id}"
               style="padding:9px 14px;cursor:pointer;display:flex;gap:8px;align-items:center;
                      border-bottom:1px solid var(--border);font-size:.83rem;
                      transition:background .15s;"
               onmouseover="this.style.background='rgba(245,166,35,.08)'"
               onmouseout="this.style.background=this.dataset.active==='1'?'rgba(245,166,35,.1)':''">
            <span>${s.icon}</span>
            <span><strong style="color:var(--gold-primary);margin-right:4px;">${s.num}.</strong>${s.titulo}</span>
          </div>`).join('')}
      </div>

      <!-- Contenido -->
      <div id="manual-body" style="min-height:70vh;">
        ${secciones.map(s=>`
          <div id="sec-${s.id}" class="card animate-in" style="margin-bottom:20px;scroll-margin-top:20px;">
            <div style="background:var(--navy-deep);margin:-20px -20px 18px;padding:16px 20px;border-radius:var(--radius-md) var(--radius-md) 0 0;display:flex;align-items:center;gap:12px;">
              <span style="font-size:22px;">${s.icon}</span>
              <div>
                <div style="font-size:.72rem;font-weight:700;color:var(--gold-primary);text-transform:uppercase;letter-spacing:1px;font-family:'Montserrat',sans-serif;">Sección ${s.num}</div>
                <div style="font-family:'Montserrat',sans-serif;font-weight:900;font-size:1rem;color:#fff;">${s.titulo}</div>
              </div>
            </div>
            ${contenido[s.id] || ''}
          </div>`).join('')}

        <div style="text-align:center;padding:24px;color:var(--text-muted);font-size:.8rem;border-top:1px solid var(--border);margin-top:8px;">
          Capital Humano MX — Manual de Usuario v1.0 · 2026<br>
          Cumplimiento legal: LFT 2024 · LSS · Ley INFONAVIT · ISR Tablas 2026 (SAT)
        </div>
      </div>
    </div>
  `;

  // Resaltar sección activa en el índice al hacer scroll
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const id = e.target.id.replace('sec-','');
        document.querySelectorAll('[id^="toc-"]').forEach(el => {
          const active = el.id === 'toc-' + id;
          el.style.background  = active ? 'rgba(245,166,35,.1)'  : '';
          el.style.color       = active ? 'var(--gold-primary)'  : '';
          el.style.fontWeight  = active ? '700' : '';
          el.dataset.active    = active ? '1' : '';
        });
      }
    });
  }, { threshold: 0.2 });

  secciones.forEach(s => {
    const el = document.getElementById('sec-' + s.id);
    if (el) observer.observe(el);
  });
}

function _manualIrA(id) {
  const el = document.getElementById('sec-' + id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ═══════════════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════════════
// ─── NÓMINA ───────────────────────────────────────────────────────────────────
async function renderNomina() {
  if (typeof renderNominaModulo !== 'function') {
    const main = document.getElementById('main-view');
    main.innerHTML = `
      <div class="alert alert-danger" style="margin:24px;">
        <span>❌</span>
        <span>
          El módulo de Nómina no se cargó correctamente.<br>
          <strong>Solución:</strong> Abre la consola del navegador (F12) para ver el error exacto,
          luego recarga con <strong>Ctrl+Shift+R</strong> (forzar sin caché).
        </span>
      </div>`;
    console.error('renderNominaModulo no está definida — verifica que js/nomina.js carga sin errores');
    return;
  }
  try { await renderNominaModulo(); } catch(e) { showError(e); }
}

// ═══════════════════════════════════════════════════════
//  IMPORTACIÓN MASIVA DE TRABAJADORES
// ═══════════════════════════════════════════════════════
let _sucursalesImport = [];

async function showModalImportacion() {
  // Cargar sucursales para el modal
  try {
    const { data } = await window.supabase.from('sucursales').select('id,nombre').eq('empresa_id', CTX.empresa.id);
    _sucursalesImport = data || [];
  } catch(e) { _sucursalesImport = []; }

  showModal(`
    <div class="modal animate-in" style="max-width:700px;width:96vw;padding:0;display:flex;flex-direction:column;max-height:92vh;">
      <div class="modal-header" style="padding:18px 24px 14px;flex-shrink:0;">
        <div>
          <div class="modal-title">📥 Importación Masiva de Trabajadores</div>
          <p style="font-size:.82rem;color:var(--text-muted);margin-top:3px;">Importa trabajadores nuevos o con historial previo desde Excel</p>
        </div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:20px 24px;scrollbar-width:thin;">

        <div style="background:rgba(245,166,35,.06);border:1.5px solid var(--gold-border);border-radius:var(--radius-md);padding:16px;margin-bottom:20px;">
          <div style="font-weight:700;margin-bottom:6px;">① Descarga la plantilla</div>
          <p style="font-size:.84rem;color:var(--text-muted);margin-bottom:4px;">
            La plantilla incluye <strong>6 secciones</strong>: datos personales, laborales, jornada, nómina, historial de prestaciones y contactos.
            La hoja <em>Instrucciones</em> explica cada columna con los valores válidos.
          </p>
          ${_sucursalesImport.length ? `<p style="font-size:.78rem;color:var(--text-muted);margin:6px 0 12px;">Sucursales disponibles: <strong>Matriz</strong>${_sucursalesImport.map(s=>', '+s.nombre).join('')}</p>` : '<p style="margin-bottom:12px;"></p>'}
          <button class="btn-secondary btn-sm" onclick="_descargarPlantillaImport()">⬇ Descargar plantilla completa.xlsx</button>
        </div>

        <div style="margin-bottom:20px;">
          <div style="font-weight:700;margin-bottom:10px;">② Sube el archivo llenado</div>
          <label style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;
                        border:2px dashed var(--border);border-radius:var(--radius-md);padding:28px;
                        cursor:pointer;transition:border-color .2s;"
                 id="import-dropzone"
                 ondragover="event.preventDefault();this.style.borderColor='var(--gold-primary)'"
                 ondragleave="this.style.borderColor='var(--border)'"
                 ondrop="_importOnDrop(event)"
                 onclick="document.getElementById('import-file-input').click()">
            <span style="font-size:2rem;">📂</span>
            <span style="font-weight:600;">Arrastra tu archivo aquí o haz clic para seleccionar</span>
            <span style="font-size:.78rem;color:var(--text-muted);">Solo archivos .xlsx o .xls</span>
            <input type="file" id="import-file-input" accept=".xlsx,.xls" style="display:none;" onchange="_importLeerArchivo(this.files[0])" />
          </label>
        </div>

        <div id="import-preview"></div>
      </div>
    </div>
  `);
}

function _descargarPlantillaImport() {
  if (!window.XLSX) { alert('La librería XLSX no está cargada.'); return; }

  // ── Hoja 1: Trabajadores ────────────────────────────────────────────────────
  const SECCIONES = [
    // [columna_header, campo_real, descripcion, valores_validos, obligatoria]
    // § Personales
    ['nombre',                        'nombre',                     'Nombre completo del trabajador',                         'Texto libre',                                              'SI'],
    ['rfc',                           'rfc',                        'RFC con homoclave (13 caracteres)',                       'Ej. PELJ900101AB1',                                        'NO'],
    ['curp',                          'curp',                       'CURP (18 caracteres)',                                    'Ej. PELJ900101HDFRZN01',                                   'NO'],
    ['nss',                           'nss',                        'Número de Seguridad Social IMSS (11 dígitos)',            'Ej. 12345678901',                                          'NO'],
    ['edad',                          'edad',                       'Edad en años',                                           'Número entero',                                            'NO'],
    ['estado_civil',                  'estado_civil',               'Estado civil',                                           'Soltero/a | Casado/a | Unión libre | Divorciado/a | Viudo/a','NO'],
    ['nacionalidad',                  'nacionalidad',               'Nacionalidad',                                           'Ej. Mexicana',                                             'NO'],
    ['domicilio',                     'domicilio',                  'Domicilio particular completo',                          'Calle, núm, colonia, ciudad',                              'NO'],
    ['tipo_identificacion',           'tipo_identificacion',        'Tipo de identificación oficial',                         'INE/IFE | Pasaporte | Cédula Profesional | Otro',           'NO'],
    ['num_identificacion',            'num_identificacion',         'Número del documento de identificación',                 'Texto libre',                                              'NO'],
    ['tipo_sangre',                   'tipo_sangre',                'Tipo de sangre',                                         'A+ | A- | B+ | B- | AB+ | AB- | O+ | O-',                 'NO'],
    ['enfermedades_cronicas',         'enfermedades_cronicas',      'Enfermedades crónicas o condiciones médicas',            'Texto libre o "Ninguna"',                                  'NO'],
    // § Laborales
    ['puesto',                        'puesto',                     'Puesto o cargo del trabajador',                          'Texto libre',                                              'SI'],
    ['departamento',                  'departamento',               'Área o departamento',                                    'Texto libre',                                              'NO'],
    ['fecha_ingreso',                 'fecha_ingreso',              'Fecha de ingreso formal a la empresa',                   'YYYY-MM-DD  Ej. 2024-01-15',                               'SI'],
    ['fecha_ingreso_reconocida',      'fecha_ingreso_reconocida',   'Antigüedad reconocida (si difiere del ingreso formal)',   'YYYY-MM-DD  Dejar vacío si es igual a fecha_ingreso',      'NO'],
    ['salario_mensual',               'salario_mensual',            'Salario BRUTO del periodo de pago indicado en periodo_salario (si es quincenal, el monto por quincena; si es semanal, por semana)', 'Número  Ej. 18000',                    'SI'],
    ['periodo_salario',               'periodo_salario',            'Frecuencia de pago del salario (define el divisor Art. 89 LFT y a qué corresponde salario_mensual)', 'mensual | quincenal | semanal',        'NO'],
    ['tipo_contrato',                 'tipo_contrato',              'Modalidad de contratación',                              'indeterminado | determinado | obra | temporada | comision', 'NO'],
    ['fecha_vencimiento_contrato',    'fecha_vencimiento_contrato', 'Vencimiento para contratos determinados',                'YYYY-MM-DD  Solo si tipo_contrato=determinado',            'NO'],
    ['nombre_proyecto',               'nombre_proyecto',            'Nombre del proyecto u obra',                             'Solo si tipo_contrato=obra',                               'NO'],
    ['fecha_fin_proyecto',            'fecha_fin_proyecto',         'Fecha estimada de término del proyecto',                 'YYYY-MM-DD  Solo si tipo_contrato=obra',                   'NO'],
    ['smg_zone',                      'smg_zone',                   'Zona de salario mínimo',                                 'general | frontera',                                       'NO'],
    ['sucursal',                      'sucursal',                   'Centro de trabajo',                                      'Matriz | o nombre exacto de la sucursal',                  'NO'],
    ['forma_pago',                    'forma_pago',                 'Forma de pago del salario',                              'deposito | efectivo',                                      'NO'],
    ['dias_pago',                     'dias_pago',                  'Días de pago (texto descriptivo)',                       'Ej. Viernes de cada semana',                               'NO'],
    ['funciones',                     'funciones',                  'Descripción de las funciones del puesto',                'Texto libre',                                              'NO'],
    // § Jornada
    ['hora_inicio',                   'hora_inicio',                'Hora de entrada',                                        'HH:MM  Ej. 09:00',                                         'NO'],
    ['hora_fin',                      'hora_fin',                   'Hora de salida',                                         'HH:MM  Ej. 18:00',                                         'NO'],
    ['hora_descanso_inicio',          'hora_descanso_inicio',       'Inicio del descanso / comida',                           'HH:MM  Ej. 14:00',                                         'NO'],
    ['hora_descanso_fin',             'hora_descanso_fin',          'Fin del descanso / comida',                              'HH:MM  Ej. 15:00',                                         'NO'],
    ['dias_semana',                   'dias_semana',                'Días laborales separados por coma',                      'Ej. Lunes,Martes,Miércoles,Jueves,Viernes',                'NO'],
    ['dia_descanso',                  'dia_descanso',               'Día de descanso semanal',                                'Domingo | Sábado | Lunes | Otro',                          'NO'],
    // § Config nómina
    ['tipo_salario',                  'tipo_salario',               'Esquema de salario',                                     'fijo | comision | mixto',                                  'NO'],
    ['pct_comision',                  'pct_comision',               'Porcentaje de comisión habitual',                        'Número  Ej. 5 (= 5%)',                                     'NO'],
    ['infonavit_activo',              'infonavit_activo',           'Tiene crédito INFONAVIT activo con descuento',           'SI | NO',                                                  'NO'],
    ['infonavit_tipo',                'infonavit_tipo',             'Tipo de descuento INFONAVIT',                            'factor | cuota_fija | pct',                                'NO'],
    ['infonavit_valor',               'infonavit_valor',            'Valor del descuento INFONAVIT',                          'Número  Ej. 0.1 factor / 500 cuota_fija / 0.05 pct',       'NO'],
    ['fondo_ahorro_activo',           'fondo_ahorro_activo',        'Tiene fondo de ahorro activo (Art.110 fr.IV LFT)',        'SI | NO',                                                  'NO'],
    ['fondo_ahorro_pct',              'fondo_ahorro_pct',           'Porcentaje de descuento fondo de ahorro',                'Número  Ej. 13 (= 13%)',                                   'NO'],
    ['pension_activa',                'pension_activa',             'Tiene pensión alimenticia activa (Art.110 fr.V LFT)',    'SI | NO',                                                  'NO'],
    ['pension_tipo',                  'pension_tipo',               'Tipo de pensión alimenticia',                            'pct | fijo',                                               'NO'],
    ['pension_valor',                 'pension_valor',              'Valor de la pensión alimenticia',                        'Número  Ej. 0.30 para 30% / 1500 para fijo',               'NO'],
    // § Historial
    ['vacaciones_pendientes_dias',    'vacaciones_pendientes_dias', 'Días de vacaciones de años anteriores sin gozar',        'Número entero  Ej. 5',                                     'NO'],
    ['vacaciones_anio_actual_usadas', 'vacaciones_anio_actual_usadas','Días de vacaciones ya tomados en el año en curso',     'Número entero  Ej. 3',                                     'NO'],
    ['aguinaldo_anio_actual_pagado',  'aguinaldo_anio_actual_pagado','El aguinaldo del año en curso ya fue pagado antes de migrar','SI | NO',                                             'NO'],
    ['ptu_ultimo_ejercicio_pagado',   'ptu_ultimo_ejercicio_pagado','El PTU del último ejercicio fiscal ya fue liquidado',     'SI | NO',                                                  'NO'],
    ['prestamo_empresa_saldo',        'prestamo_empresa_saldo',     'Saldo pendiente de préstamo de la empresa',              'Número  Ej. 5000 — se registra manualmente en nómina',     'NO'],
    // § Contactos
    ['contacto_emergencia_nombre',    'contacto_emergencia_nombre', 'Nombre del contacto de emergencia',                      'Texto libre',                                              'NO'],
    ['contacto_emergencia_parentesco','contacto_emergencia_parentesco','Parentesco del contacto de emergencia',               'Ej. Cónyuge, Madre, Padre',                                'NO'],
    ['contacto_emergencia_telefono',  'contacto_emergencia_telefono','Teléfono del contacto de emergencia',                   'Ej. 55 1234 5678',                                         'NO'],
    ['beneficiario1_nombre',          'beneficiario1_nombre',       'Nombre del beneficiario 1 (Art.25 fr.X LFT)',            'Texto libre',                                              'NO'],
    ['beneficiario1_parentesco',      'beneficiario1_parentesco',   'Parentesco del beneficiario 1',                          'Ej. Hijo/a, Cónyuge',                                      'NO'],
    ['beneficiario1_telefono',        'beneficiario1_telefono',     'Teléfono del beneficiario 1',                            'Texto libre',                                              'NO'],
    ['beneficiario2_nombre',          'beneficiario2_nombre',       'Nombre del beneficiario 2 (opcional)',                   'Texto libre',                                              'NO'],
    ['beneficiario2_parentesco',      'beneficiario2_parentesco',   'Parentesco del beneficiario 2',                          'Texto libre',                                              'NO'],
    ['beneficiario2_telefono',        'beneficiario2_telefono',     'Teléfono del beneficiario 2',                            'Texto libre',                                              'NO'],
  ];

  const headers = SECCIONES.map(s => s[0]);
  const ejemplo = [
    'Juan Pérez López','PELJ900101AB1','PELJ900101HDFRZN01','12345678901','34','Soltero/a','Mexicana','Calle 5 de Mayo 123, CDMX','INE/IFE','ABC123456','O+','Ninguna',
    'Coordinador de Ventas','Ventas','2022-03-01','2020-01-01','22000','quincenal','indeterminado','','','','general','Matriz','deposito','Viernes','Captar nuevos clientes',
    '09:00','18:00','14:00','15:00','Lunes,Martes,Miércoles,Jueves,Viernes','Domingo',
    'fijo','0','SI','cuota_fija','800','SI','13','NO','','',
    '5','2','NO','NO','3000',
    'María López','Esposa','55 9876 5432','Carlos Pérez','Hijo','','','','',
  ];

  const wsData = XLSX.utils.aoa_to_sheet([headers, ejemplo]);
  wsData['!cols'] = headers.map(() => ({ wch: 30 }));

  // Colores por sección en la fila de encabezado
  const SECCION_COLORES = [
    { desde: 0,  hasta: 11, fill: 'FF3498DB', font: 'FFFFFFFF' }, // § Personales — azul
    { desde: 12, hasta: 26, fill: 'FF27AE60', font: 'FFFFFFFF' }, // § Laborales — verde
    { desde: 27, hasta: 32, fill: 'FF8E44AD', font: 'FFFFFFFF' }, // § Jornada — morado
    { desde: 33, hasta: 44, fill: 'FFF39C12', font: 'FF000000' }, // § Nómina — naranja
    { desde: 45, hasta: 49, fill: 'FFE74C3C', font: 'FFFFFFFF' }, // § Historial — rojo
    { desde: 50, hasta: 58, fill: 'FF7F8C8D', font: 'FFFFFFFF' }, // § Contactos — gris
  ];
  headers.forEach((_, ci) => {
    const addr = XLSX.utils.encode_cell({ r: 0, c: ci });
    const sec  = SECCION_COLORES.find(s => ci >= s.desde && ci <= s.hasta);
    if (!wsData[addr]) return;
    if (!wsData[addr].s) wsData[addr].s = {};
    wsData[addr].s = {
      fill: { fgColor: { rgb: sec?.fill || 'FF333333' } },
      font: { bold: true, color: { rgb: sec?.font || 'FFFFFFFF' } },
      alignment: { horizontal: 'center', wrapText: true },
    };
  });

  // ── Hoja 2: Instrucciones ───────────────────────────────────────────────────
  const instrHead  = ['Columna', 'Descripción', 'Valores válidos', 'Obligatoria'];
  const instrRows  = SECCIONES.map(s => [s[0], s[2], s[3], s[4]]);
  const wsInstr    = XLSX.utils.aoa_to_sheet([instrHead, ...instrRows]);
  wsInstr['!cols'] = [{ wch: 32 }, { wch: 50 }, { wch: 55 }, { wch: 12 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsData,  'Trabajadores');
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones');
  XLSX.writeFile(wb, 'plantilla_importacion_trabajadores.xlsx');
}

function _importOnDrop(e) {
  e.preventDefault();
  const dz = document.getElementById('import-dropzone');
  if (dz) dz.style.borderColor = 'var(--border)';
  const file = e.dataTransfer?.files?.[0];
  if (file) _importLeerArchivo(file);
}

function _importLeerArchivo(file) {
  if (!file) return;
  if (!window.XLSX) { alert('Librería XLSX no cargada.'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const wb   = XLSX.read(ev.target.result, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      _importMostrarPreview(rows, file.name);
    } catch(err) {
      const el = document.getElementById('import-preview');
      if (el) el.innerHTML = `<div class="alert alert-danger"><span>❌</span><span>No se pudo leer el archivo: ${err.message}</span></div>`;
    }
  };
  reader.readAsArrayBuffer(file);
}

function _importNormCol(col) {
  return String(col).replace(/\s*\*.*$/, '').replace(/\s*\(.*$/, '').trim();
}

function _importMostrarPreview(rows, fileName) {
  const preview = document.getElementById('import-preview');
  if (!rows.length) {
    preview.innerHTML = `<div class="alert alert-warn"><span>⚠️</span><span>El archivo está vacío.</span></div>`;
    return;
  }

  const norm = rows.map(r => {
    const obj = {};
    for (const k of Object.keys(r)) obj[_importNormCol(k)] = r[k];
    return obj;
  });

  const errores = [];
  norm.forEach((r, i) => {
    if (!String(r.nombre||'').trim())          errores.push(`Fila ${i+2}: falta "nombre"`);
    if (!String(r.puesto||'').trim())          errores.push(`Fila ${i+2}: falta "puesto"`);
    if (!String(r.fecha_ingreso||'').trim())   errores.push(`Fila ${i+2}: falta "fecha_ingreso"`);
    if (!parseFloat(r.salario_mensual||0))     errores.push(`Fila ${i+2}: falta "salario_mensual"`);
  });

  // Resumen de datos históricos / especiales detectados
  const conInfonavit  = norm.filter(r => String(r.infonavit_activo||'').toUpperCase()==='SI').length;
  const conFondo      = norm.filter(r => String(r.fondo_ahorro_activo||'').toUpperCase()==='SI').length;
  const conPension    = norm.filter(r => String(r.pension_activa||'').toUpperCase()==='SI').length;
  const conVacPend    = norm.filter(r => parseFloat(r.vacaciones_pendientes_dias||0)>0).length;
  const conVacUsadas  = norm.filter(r => parseFloat(r.vacaciones_anio_actual_usadas||0)>0).length;
  const conPrestamo   = norm.filter(r => parseFloat(r.prestamo_empresa_saldo||0)>0).length;
  const conAguinPag   = norm.filter(r => String(r.aguinaldo_anio_actual_pagado||'').toUpperCase()==='SI').length;
  const conPTUPag     = norm.filter(r => String(r.ptu_ultimo_ejercicio_pagado||'').toUpperCase()==='SI').length;

  window._importData = norm;

  preview.innerHTML = `
    <div style="border-top:1px solid var(--border);padding-top:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
        <div>
          <strong>${norm.length} trabajador${norm.length!==1?'es':''}</strong> en <em>${fileName}</em>
          ${errores.length
            ? `<span style="margin-left:8px;color:var(--red-warn);font-size:.82rem;">⚠️ ${errores.length} error${errores.length!==1?'es':''}</span>`
            : '<span style="margin-left:8px;color:var(--green-ok);font-size:.82rem;">✅ Sin errores</span>'}
        </div>
      </div>

      ${errores.length ? `
        <div class="alert alert-danger" style="margin-bottom:12px;">
          <span>❌</span>
          <span>${errores.slice(0,5).join('<br>')}${errores.length>5?`<br>… y ${errores.length-5} más`:''}</span>
        </div>` : ''}

      ${(conInfonavit||conFondo||conPension||conVacPend||conVacUsadas||conPrestamo||conAguinPag||conPTUPag) ? `
        <div style="background:rgba(52,152,219,.06);border:1px solid rgba(52,152,219,.25);border-radius:var(--radius-md);padding:12px 14px;margin-bottom:14px;font-size:.82rem;">
          <div style="font-weight:700;margin-bottom:8px;color:#3498db;">📋 Datos históricos detectados</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px;">
            ${conInfonavit  ? `<div>🏦 INFONAVIT activo: <strong>${conInfonavit}</strong></div>` : ''}
            ${conFondo      ? `<div>💰 Fondo de ahorro: <strong>${conFondo}</strong></div>` : ''}
            ${conPension    ? `<div>⚖️ Pensión alimenticia: <strong>${conPension}</strong></div>` : ''}
            ${conVacPend    ? `<div>🏖 Vac. pendientes: <strong>${conVacPend}</strong></div>` : ''}
            ${conVacUsadas  ? `<div>📅 Vac. usadas año actual: <strong>${conVacUsadas}</strong></div>` : ''}
            ${conPrestamo   ? `<div>💳 Con préstamo: <strong>${conPrestamo}</strong></div>` : ''}
            ${conAguinPag   ? `<div>🎄 Aguinaldo ya pagado: <strong>${conAguinPag}</strong></div>` : ''}
            ${conPTUPag     ? `<div>📊 PTU ya pagado: <strong>${conPTUPag}</strong></div>` : ''}
          </div>
          ${conPrestamo ? `<div style="margin-top:8px;color:var(--text-muted);">⚠️ Los saldos de préstamo se mostrarán como advertencia al finalizar — deberás registrarlos manualmente en nómina.</div>` : ''}
          ${conAguinPag||conPTUPag ? `<div style="margin-top:4px;color:var(--text-muted);">⚠️ Aguinaldo/PTU marcados como pagados quedarán registrados en las notas del trabajador.</div>` : ''}
        </div>` : ''}

      <div class="table-wrap" style="max-height:240px;overflow-y:auto;margin-bottom:14px;">
        <table class="data-table" style="font-size:.78rem;">
          <thead><tr><th>#</th><th>Nombre</th><th>Puesto</th><th>Sucursal</th><th>Ingreso</th><th>Salario</th><th>Contrato</th><th>INFONAVIT</th><th>Vac.pend.</th></tr></thead>
          <tbody>
            ${norm.map((r,i) => `
              <tr>
                <td style="color:var(--text-muted);">${i+1}</td>
                <td><strong>${r.nombre||'—'}</strong></td>
                <td>${r.puesto||'—'}</td>
                <td style="font-size:.72rem;">${r.sucursal||'Matriz'}</td>
                <td>${r.fecha_ingreso||'—'}</td>
                <td>$${parseFloat(r.salario_mensual||0).toLocaleString('es-MX')}</td>
                <td style="font-size:.72rem;">${r.tipo_contrato||'indeterminado'}</td>
                <td style="font-size:.72rem;color:${String(r.infonavit_activo||'').toUpperCase()==='SI'?'var(--green-ok)':'var(--text-muted)'};">${String(r.infonavit_activo||'').toUpperCase()==='SI'?'✓ Sí':'—'}</td>
                <td style="font-size:.72rem;">${parseFloat(r.vacaciones_pendientes_dias||0)||'—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div id="import-prog" style="display:none;margin-bottom:12px;">
        <div style="font-size:.84rem;color:var(--text-muted);margin-bottom:6px;" id="import-prog-txt">Importando…</div>
        <div style="background:var(--border);border-radius:100px;height:7px;">
          <div id="import-prog-bar" style="background:var(--gold-primary);height:7px;border-radius:100px;width:0%;transition:width .25s;"></div>
        </div>
      </div>

      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-primary" id="import-btn-confirmar"
          ${errores.length ? 'disabled style="opacity:.5;cursor:not-allowed;"' : ''}
          onclick="_importarTrabajadores()">
          ✅ Importar ${norm.length} trabajador${norm.length!==1?'es':''}
        </button>
      </div>
    </div>
  `;
}

async function _importarTrabajadores() {
  const rows = window._importData;
  if (!rows?.length) return;

  const btn  = document.getElementById('import-btn-confirmar');
  const prog = document.getElementById('import-prog');
  const bar  = document.getElementById('import-prog-bar');
  const txt  = document.getElementById('import-prog-txt');

  btn.disabled = true;
  prog.style.display = '';

  // Construir mapa de sucursales por nombre (lower) → id
  const sucMap = {};
  for (const s of _sucursalesImport) sucMap[s.nombre.toLowerCase()] = s.id;

  let ok = 0, fail = 0, errLista = [];
  const advertencias = []; // para prestamos / aguinaldo / ptu ya pagados

  const anioActual = new Date().getFullYear();
  const sbI = () => window.supabase;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    txt.textContent = `Importando ${i+1} de ${rows.length}: ${r.nombre}…`;
    bar.style.width = `${Math.round(((i+1)/rows.length)*100)}%`;

    const siNo = v => String(v||'').toUpperCase().trim() === 'SI';
    const num  = v => parseFloat(v)||0;
    const str  = v => String(v||'').trim() || null;

    // Resolver sucursal
    const sucNombre = String(r.sucursal||'').trim().toLowerCase();
    const sucId     = sucNombre && sucNombre !== 'matriz' ? (sucMap[sucNombre] || null) : null;

    try {
      const datos = {
        // § Personales
        nombre:                   String(r.nombre||'').trim(),
        rfc:                      r.rfc  ? String(r.rfc).toUpperCase().trim()  : null,
        curp:                     r.curp ? String(r.curp).toUpperCase().trim() : null,
        nss:                      str(r.nss),
        edad:                     r.edad ? parseInt(r.edad) : null,
        estado_civil:             str(r.estado_civil),
        nacionalidad:             str(r.nacionalidad) || 'Mexicana',
        domicilio:                str(r.domicilio),
        tipo_identificacion:      str(r.tipo_identificacion),
        num_identificacion:       str(r.num_identificacion),
        tipo_sangre:              str(r.tipo_sangre),
        enfermedades_cronicas:    str(r.enfermedades_cronicas),
        // § Laborales
        puesto:                   String(r.puesto||'').trim(),
        departamento:             str(r.departamento),
        fecha_ingreso:            String(r.fecha_ingreso||'').trim(),
        fecha_ingreso_reconocida: str(r.fecha_ingreso_reconocida),
        salario_mensual:          num(r.salario_mensual),
        periodo_salario:          str(r.periodo_salario) || 'mensual',
        tipo_contrato:            str(r.tipo_contrato)   || 'indeterminado',
        fecha_vencimiento_contrato: str(r.fecha_vencimiento_contrato),
        nombre_proyecto:          str(r.nombre_proyecto),
        fecha_fin_proyecto:       str(r.fecha_fin_proyecto),
        smg_zone:                 str(r.smg_zone) || 'general',
        sucursal_id:              sucId,
        forma_pago:               str(r.forma_pago) || 'deposito',
        dias_pago:                str(r.dias_pago),
        funciones:                str(r.funciones),
        // § Jornada
        hora_inicio:              str(r.hora_inicio),
        hora_fin:                 str(r.hora_fin),
        hora_descanso_inicio:     str(r.hora_descanso_inicio),
        hora_descanso_fin:        str(r.hora_descanso_fin),
        dias_semana:              str(r.dias_semana) ? str(r.dias_semana).split(',').map(d=>d.trim()).filter(Boolean) : null,
        dia_descanso:             str(r.dia_descanso),
        // § Config nómina
        tipo_salario:             str(r.tipo_salario)   || 'fijo',
        pct_comision:             num(r.pct_comision) / 100,
        infonavit_activo:         siNo(r.infonavit_activo),
        infonavit_tipo:           str(r.infonavit_tipo),
        infonavit_valor:          num(r.infonavit_valor),
        fondo_ahorro_activo:      siNo(r.fondo_ahorro_activo),
        fondo_ahorro_pct:         num(r.fondo_ahorro_pct) / 100 || 0.13,
        pension_activa:           siNo(r.pension_activa),
        pension_tipo:             str(r.pension_tipo),
        pension_valor:            num(r.pension_valor),
        // § Contactos
        contacto_emergencia_nombre:     str(r.contacto_emergencia_nombre),
        contacto_emergencia_parentesco: str(r.contacto_emergencia_parentesco),
        contacto_emergencia_telefono:   str(r.contacto_emergencia_telefono),
        beneficiario1_nombre:     str(r.beneficiario1_nombre),
        beneficiario1_parentesco: str(r.beneficiario1_parentesco),
        beneficiario1_telefono:   str(r.beneficiario1_telefono),
        beneficiario2_nombre:     str(r.beneficiario2_nombre),
        beneficiario2_parentesco: str(r.beneficiario2_parentesco),
        beneficiario2_telefono:   str(r.beneficiario2_telefono),
      };

      const trab = await db.createTrabajador(datos, CTX.empresa.id);
      await db.createContrato({ trabajador_id: trab.id, tipo: datos.tipo_contrato }, CTX.empresa.id);

      // ── Historial de vacaciones ────────────────────────────────────────────
      const vacPend  = parseInt(r.vacaciones_pendientes_dias||0);
      const vacUsad  = parseInt(r.vacaciones_anio_actual_usadas||0);

      if (vacPend > 0) {
        await sbI().from('vacaciones').insert({
          empresa_id: CTX.empresa.id, trabajador_id: trab.id,
          tipo: 'vacacion', estado: 'aprobada',
          fecha_inicio: datos.fecha_ingreso, fecha_fin: datos.fecha_ingreso,
          dias: vacPend,
          notas: `Saldo inicial importado — ${vacPend} día${vacPend!==1?'s':''} de años anteriores sin gozar`,
        });
      }
      if (vacUsad > 0) {
        const inicioAnio = `${anioActual}-01-01`;
        await sbI().from('vacaciones').insert({
          empresa_id: CTX.empresa.id, trabajador_id: trab.id,
          tipo: 'vacacion', estado: 'aprobada',
          fecha_inicio: inicioAnio, fecha_fin: inicioAnio,
          dias: vacUsad,
          notas: `Días usados en ${anioActual} antes de migración`,
        });
      }

      // ── Advertencias para acción manual ───────────────────────────────────
      const prestamo = num(r.prestamo_empresa_saldo);
      if (prestamo > 0)           advertencias.push(`${datos.nombre}: préstamo $${prestamo.toLocaleString('es-MX')} — regístralo en nómina`);
      if (siNo(r.aguinaldo_anio_actual_pagado)) advertencias.push(`${datos.nombre}: aguinaldo ${anioActual} ya pagado — excluir al generar período de aguinaldo`);
      if (siNo(r.ptu_ultimo_ejercicio_pagado))  advertencias.push(`${datos.nombre}: PTU último ejercicio ya liquidado — tomar en cuenta en PTU`);

      ok++;
    } catch(e) {
      fail++;
      errLista.push(`${r.nombre}: ${e.message}`);
    }
  }

  bar.style.width = '100%';
  txt.textContent = `Completado: ${ok} importados${fail>0?`, ${fail} con error`:''}.`;

  setTimeout(() => {
    closeModal();
    let msg = `✅ ${ok} trabajador${ok!==1?'es':''} importado${ok!==1?'s':''}`;
    if (fail > 0) msg += `\n❌ ${fail} con error:\n${errLista.slice(0,5).join('\n')}`;
    if (advertencias.length) msg += `\n\n⚠️ ACCIÓN MANUAL REQUERIDA:\n${advertencias.join('\n')}`;
    alert(msg);
    navigate('empleados');
  }, 800);
}

// ═══════════════════════════════════════════════════════
//  MULTIEMPRESA
// ═══════════════════════════════════════════════════════
async function getEmpresasUsuario() {
  try {
    const { data } = await window.supabase
      .from('usuario_empresas')
      .select('empresa_id, rol, empresas(id,nombre,rfc)')
      .eq('usuario_id', CTX.user.id);
    return (data || []).map(r => r.empresas).filter(Boolean);
  } catch { return []; }
}

async function switchEmpresa() {
  const empresas = await getEmpresasUsuario();
  if (!empresas.length) return;
  showModal(`
    <div class="modal animate-in" style="max-width:400px;width:92vw;">
      <div class="modal-header">
        <div class="modal-title">🔄 Cambiar empresa</div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>
      <div style="padding:16px 24px 24px;display:flex;flex-direction:column;gap:10px;">
        ${empresas.map(e => `
          <button onclick="_seleccionarEmpresa('${e.id}','${e.nombre.replace(/'/g,"\\'")}','${e.rfc||''}')"
            style="background:${CTX.empresa.id===e.id?'rgba(245,166,35,.1)':'transparent'};border:1.5px solid ${CTX.empresa.id===e.id?'var(--gold-primary)':'var(--border)'};border-radius:var(--radius-md);padding:12px 16px;text-align:left;cursor:pointer;color:var(--text-primary);">
            <div style="font-weight:700;">${e.nombre}</div>
            ${e.rfc ? `<div style="font-size:.78rem;color:var(--text-muted);">${e.rfc}</div>` : ''}
            ${CTX.empresa.id===e.id ? '<div style="font-size:.72rem;color:var(--gold-primary);font-weight:700;margin-top:4px;">● Activa</div>' : ''}
          </button>
        `).join('')}
      </div>
    </div>
  `);
}

async function _seleccionarEmpresa(empresaId, nombre, rfc) {
  if (CTX.empresa.id === empresaId) { closeModal(); return; }
  CTX.empresa = { id: empresaId, nombre, rfc };
  document.getElementById('topbar-empresa').textContent = nombre;
  closeModal();
  navigate('dashboard');
}

// ── Agente IA ─────────────────────────────────────────────────────────────────
async function abrirAgenteIA(trabajadorId, tipoSugerido = null) {
  const modal = document.getElementById('modal-agente');
  if (!modal) return;
  modal.style.display = 'flex';
  await showModalAgente(trabajadorId, tipoSugerido);
}

function showError(e) {
  console.error(e);
  // Errores de los triggers de plan (PLAN_SOLO_LECTURA, PLAN_LIMITE_*, PLAN_FEATURE_*)
  if (typeof esErrorDePlan === 'function' && esErrorDePlan(e)) {
    showToast('🔒 ' + mensajeErrorPlan(e), 'warn', 6000);
    showModalPlanes('error_plan');
    return;
  }
  showToast('❌ ' + (e?.message || String(e)), 'error');
}

// ─── SISTEMA DE TOASTS (no-bloqueante) ────────────────────────────────────────
/**
 * Muestra una notificación tipo toast en la esquina inferior derecha.
 * @param {string} msg   Mensaje a mostrar
 * @param {'info'|'success'|'error'|'warn'} type  Tipo (afecta color)
 * @param {number} duration  Duración en ms (default 4000)
 */
function showToast(msg, type = 'info', duration = 4000) {
  let container = document.getElementById('_toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = '_toast-container';
    container.style.cssText =
      'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:360px;';
    document.body.appendChild(container);
  }

  const colors = {
    info:    { bg:'rgba(74,144,226,.18)',  border:'rgba(74,144,226,.5)',  icon:'ℹ️' },
    success: { bg:'rgba(46,204,113,.18)',  border:'rgba(46,204,113,.5)',  icon:'✅' },
    error:   { bg:'rgba(231,76,60,.18)',   border:'rgba(231,76,60,.5)',   icon:'❌' },
    warn:    { bg:'rgba(243,156,18,.18)',  border:'rgba(243,156,18,.5)',  icon:'⚠️' },
  };
  const c = colors[type] || colors.info;

  const toast = document.createElement('div');
  toast.style.cssText =
    `background:${c.bg};border:1px solid ${c.border};border-radius:10px;` +
    `padding:12px 16px;color:#eef0f7;font-size:.85rem;line-height:1.5;` +
    `box-shadow:0 8px 32px rgba(0,0,0,.4);backdrop-filter:blur(8px);` +
    `display:flex;align-items:flex-start;gap:10px;cursor:pointer;` +
    `animation:_toastIn .25s ease;max-width:360px;word-break:break-word;`;

  // Sanitizar msg: si viene con HTML (emoji strings), lo usamos directamente
  const msgStr = String(msg || '').replace(/<script[^>]*>.*?<\/script>/gi, '');
  toast.innerHTML =
    `<span style="flex-shrink:0;font-size:1rem;">${c.icon}</span>` +
    `<span style="flex:1;">${msgStr}</span>` +
    `<span style="flex-shrink:0;font-size:1.1rem;opacity:.5;line-height:1;margin-top:1px;">×</span>`;
  toast.addEventListener('click', () => _dismissToast(toast));
  container.appendChild(toast);

  const tid = setTimeout(() => _dismissToast(toast), duration);
  toast._tid = tid;
}

function _dismissToast(toast) {
  clearTimeout(toast._tid);
  toast.style.opacity = '0';
  toast.style.transition = 'opacity .2s ease';
  setTimeout(() => toast.remove(), 220);
}

// CSS de animación del toast (inyectado una sola vez)
(function () {
  if (document.getElementById('_toast-css')) return;
  const s = document.createElement('style');
  s.id = '_toast-css';
  s.textContent = `@keyframes _toastIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }`;
  document.head.appendChild(s);
})();

// Sobrescribir alert() nativo con toast para toda la app
window._nativeAlert = window.alert;
window.alert = function(msg) {
  const str = String(msg || '');
  // Detectar tipo por el contenido
  const type = /^✅|^🟢|^\[ok\]|^OK/i.test(str) ? 'success'
             : /^❌|^🔴|^error/i.test(str)         ? 'error'
             : /^⚠️|^🟡|^warning/i.test(str)       ? 'warn'
             : 'info';
  showToast(str, type, 5000);
};
