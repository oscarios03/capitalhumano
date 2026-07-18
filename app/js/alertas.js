/**
 * Capital Humano MX — Motor de Alertas Legales
 * Detecta riesgos laborales pendientes y los muestra en el Dashboard.
 */

// ── Config visual por tipo ───────────────────────────────────────────────────
const ALERTA_CFG = {
  contrato_vencimiento:  { icono:'📄', ruta:'contratos',    label:'Contrato por vencer'          },
  periodo_prueba:        { icono:'⏱️', ruta:'empleado',     label:'Período de prueba'             },
  capacitacion_inicial:  { icono:'🎓', ruta:'empleado',     label:'Capacitación inicial'          },
  vacaciones_pendientes: { icono:'🌴', ruta:'empleados',    label:'Vacaciones pendientes'         },
  aniversario:           { icono:'🎂', ruta:'empleado',     label:'Aniversario laboral'           },
  aguinaldo:             { icono:'🎄', ruta:'bajas',        label:'Aguinaldo por pagar'           },
  ptu:                   { icono:'💰', ruta:'bajas',        label:'PTU por distribuir'            },
  prima_antiguedad_15:   { icono:'🏅', ruta:'empleado',     label:'Prima antigüedad 15 años'      },
  revision_salarial:     { icono:'💵', ruta:'empleado',     label:'Revisión salarial'             },
  nomina_por_pagar:      { icono:'💰', ruta:'nomina',      label:'Nómina por pagar'              },
  nomina_por_generar:    { icono:'🗓️', ruta:'nomina',      label:'Nómina por generar'            },
  descuento_liquidado:   { icono:'✅', ruta:'nomina',      label:'Crédito liquidado'             },
};

const PRIORIDAD_CFG = {
  critica: { color:'#e74c3c', bg:'rgba(231,76,60,.12)',  border:'rgba(231,76,60,.3)',  label:'Crítica',  dot:'🔴' },
  alta:    { color:'#e67e22', bg:'rgba(230,126,34,.12)', border:'rgba(230,126,34,.3)', label:'Alta',     dot:'🟠' },
  media:   { color:'#f39c12', bg:'rgba(243,156,18,.12)', border:'rgba(243,156,18,.3)', label:'Media',    dot:'🟡' },
  baja:    { color:'#95a5a6', bg:'rgba(149,165,166,.1)', border:'rgba(149,165,166,.25)',label:'Baja',    dot:'⚪' },
};

const PRIORIDAD_ORDER = { critica:0, alta:1, media:2, baja:3 };

// ── Cache para evitar llamadas excesivas a la DB ─────────────────────────────
const CACHE_KEY      = 'alertas_last_gen';
const CACHE_MINUTES  = 10;

function _cacheEsValido() {
  const last = localStorage.getItem(CACHE_KEY);
  if (!last) return false;
  return (Date.now() - parseInt(last)) < CACHE_MINUTES * 60 * 1000;
}
function _actualizarCache() { localStorage.setItem(CACHE_KEY, Date.now()); }
function _invalidarCache()  { localStorage.removeItem(CACHE_KEY); }

// ── Estado local ─────────────────────────────────────────────────────────────
let _alertasCache    = [];
let _filtroActivo    = null;   // 'critica'|'alta'|'media'|'baja'|null
let _realtimeCh      = null;

// ═══════════════════════════════════════════════════════════════════════════
//  CARGA Y GENERACIÓN
// ═══════════════════════════════════════════════════════════════════════════
async function cargarAlertas(empresaId, forzar = false) {
  const _sb = window.supabase;

  // Solo regenerar si pasaron los minutos del caché o se fuerza
  if (!_cacheEsValido() || forzar) {
    try {
      await _sb.rpc('generar_alertas', { p_empresa_id: empresaId });
      // Alertas de nómina por generar (migración 22). Es tolerante: si la
      // función aún no existe, no rompe el resto de la generación de alertas.
      try {
        await _sb.rpc('generar_alertas_nomina', { p_empresa_id: empresaId });
      } catch(e2) {
        console.warn('generar_alertas_nomina no disponible — aplica la migración 22_migration_nomina_programacion.sql:', e2.message);
      }
      _actualizarCache();
    } catch(e) {
      console.warn('generar_alertas falló (puede ser normal en primer uso):', e.message);
    }
  }

  const { data, error } = await _sb
    .from('alertas')
    .select('*, trabajadores(id, nombre, puesto)')
    .eq('empresa_id', empresaId)
    .eq('resuelta', false)
    .order('created_at', { ascending: false });

  // Si la tabla no existe aún (migración pendiente), devolver lista vacía sin romper el dashboard
  if (error) {
    if (error.message?.includes('schema cache') || error.code === '42P01' || error.message?.includes("relation") || error.message?.includes("alertas")) {
      console.warn('Tabla alertas no encontrada — ejecuta migration_alertas.sql en Supabase:', error.message);
      _alertasCache = [];
      _actualizarBadge();
      return [];
    }
    throw error;
  }

  // Ordenar por prioridad, luego por fecha_limite
  _alertasCache = (data || []).sort((a, b) => {
    const po = (PRIORIDAD_ORDER[a.prioridad] ?? 9) - (PRIORIDAD_ORDER[b.prioridad] ?? 9);
    if (po !== 0) return po;
    if (!a.fecha_limite) return 1;
    if (!b.fecha_limite) return -1;
    return a.fecha_limite.localeCompare(b.fecha_limite);
  });

  _actualizarBadge();
  return _alertasCache;
}

async function resolverAlerta(alertaId) {
  const { error } = await window.supabase
    .from('alertas')
    .update({ resuelta: true, fecha_resolucion: new Date().toISOString() })
    .eq('id', alertaId);
  if (error) { alert('Error al resolver: ' + error.message); return; }
  _invalidarCache();
  // Quitar del cache local y re-renderizar sin llamar a la DB
  _alertasCache = _alertasCache.filter(a => a.id !== alertaId);
  _actualizarBadge();
  _reRenderAlertas();
}

// ═══════════════════════════════════════════════════════════════════════════
//  BADGE EN SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════
function _actualizarBadge() {
  const urgentes = _alertasCache.filter(a =>
    a.prioridad === 'critica' || a.prioridad === 'alta'
  ).length;
  const badge = document.getElementById('badge-alertas');
  if (!badge) return;
  if (urgentes > 0) {
    badge.textContent = urgentes > 99 ? '99+' : urgentes;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  REALTIME SUBSCRIPTION
// ═══════════════════════════════════════════════════════════════════════════
function suscribirseAlertas(empresaId) {
  if (_realtimeCh) { window.supabase.removeChannel(_realtimeCh); }
  _realtimeCh = window.supabase
    .channel(`alertas-${empresaId}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'alertas',
      filter: `empresa_id=eq.${empresaId}`,
    }, () => {
      // Solo actualizar badge — no recargar toda la vista
      cargarAlertas(empresaId, false).then(_actualizarBadge);
    })
    .subscribe();
}

// ═══════════════════════════════════════════════════════════════════════════
//  RENDER — RESUMEN (4 tarjetas de prioridad)
// ═══════════════════════════════════════════════════════════════════════════
function renderResumenAlertas(alertas) {
  const conteos = { critica:0, alta:0, media:0, baja:0 };
  alertas.forEach(a => { if (conteos[a.prioridad] !== undefined) conteos[a.prioridad]++; });
  const total = alertas.length;

  return `
    <div class="alertas-resumen animate-in">
      ${['critica','alta','media','baja'].map(p => {
        const cfg = PRIORIDAD_CFG[p];
        const n   = conteos[p];
        const activo = _filtroActivo === p;
        return `
          <div class="alerta-kpi ${activo ? 'activo' : ''}"
               style="--ac:${cfg.color};--abg:${cfg.bg};--aborder:${cfg.border};"
               onclick="filtrarAlertas('${p}')">
            <div class="alerta-kpi-dot">${cfg.dot}</div>
            <div class="alerta-kpi-num">${n}</div>
            <div class="alerta-kpi-label">${cfg.label}</div>
          </div>`;
      }).join('')}
      ${_filtroActivo ? `
        <button class="btn-secondary btn-sm" style="align-self:center;"
          onclick="filtrarAlertas(null)">Todas (${total})</button>` : ''}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  RENDER — LISTA DE ALERTAS
// ═══════════════════════════════════════════════════════════════════════════
function renderListaAlertas(alertas) {
  const visibles = _filtroActivo
    ? alertas.filter(a => a.prioridad === _filtroActivo)
    : alertas;

  if (visibles.length === 0) {
    return `
      <div class="empty-state" style="padding:32px;">
        <div class="empty-state-icon">✅</div>
        <div class="empty-state-title">${_filtroActivo ? 'Sin alertas de prioridad ' + PRIORIDAD_CFG[_filtroActivo]?.label : 'Sin alertas pendientes'}</div>
        <p style="font-size:.82rem;color:var(--text-muted);margin-top:6px;">
          ${_filtroActivo ? '' : 'El sistema revisará los riesgos laborales automáticamente.'}
        </p>
      </div>`;
  }

  return visibles.map(a => {
    const cfg     = PRIORIDAD_CFG[a.prioridad] || PRIORIDAD_CFG.baja;
    const tipoCfg = ALERTA_CFG[a.tipo]         || { icono:'⚠️', ruta:'dashboard', label:a.tipo };
    const hoy     = new Date(); hoy.setHours(0,0,0,0);
    const venc    = a.fecha_limite ? new Date(a.fecha_limite + 'T00:00:00') : null;
    const diasRest = venc ? Math.ceil((venc - hoy) / 86400000) : null;
    const vencColor = diasRest !== null && diasRest <= 7
      ? 'var(--red-warn)' : diasRest !== null && diasRest <= 15
      ? '#f39c12' : 'var(--text-muted)';
    const vencTxt = diasRest === null ? '' : diasRest < 0 ? '⚠️ Vencida'
      : diasRest === 0 ? '⚠️ Vence hoy'
      : diasRest === 1 ? '⏰ Mañana'
      : `📅 ${diasRest} días`;

    // Botón de acción rápida
    const accionBtn = a.trabajadores?.id
      ? `<button class="btn-secondary btn-sm" onclick="navigate('${tipoCfg.ruta}','${a.trabajadores.id}')">Ver expediente</button>`
      : tipoCfg.ruta !== 'dashboard'
        ? `<button class="btn-secondary btn-sm" onclick="navigate('${tipoCfg.ruta}')">Ir al módulo</button>`
        : '';

    return `
      <div class="alerta-item" style="--ac:${cfg.color};--abg:${cfg.bg};--aborder:${cfg.border};"
           id="alerta-${a.id}">
        <div class="alerta-left">
          <div class="alerta-icono">${tipoCfg.icono}</div>
        </div>
        <div class="alerta-body">
          <div class="alerta-cabecera">
            <span class="alerta-titulo">${escapeHtml(a.titulo)}</span>
            <span class="alerta-prioridad-badge" style="background:${cfg.bg};color:${cfg.color};border-color:${cfg.border};">
              ${cfg.dot} ${cfg.label}
            </span>
          </div>
          ${a.trabajadores?.nombre ? `
            <div class="alerta-trabajador" onclick="navigate('empleado','${a.trabajadores.id}')"
                 role="button" tabindex="0" style="cursor:pointer;color:var(--blue-accent);">
              👤 ${escapeHtml(a.trabajadores.nombre)}${a.trabajadores.puesto ? ' — ' + escapeHtml(a.trabajadores.puesto) : ''}
            </div>` : ''}
          <div class="alerta-desc">${escapeHtml(a.descripcion) || ''}</div>
          <div class="alerta-footer">
            ${a.articulo_lft ? `<span class="alerta-articulo">${escapeHtml(a.articulo_lft)}</span>` : ''}
            ${a.accion_sugerida ? `<span class="alerta-accion">→ ${escapeHtml(a.accion_sugerida)}</span>` : ''}
            ${vencTxt ? `<span style="font-size:.75rem;font-weight:700;color:${vencColor};">${vencTxt}</span>` : ''}
          </div>
        </div>
        <div class="alerta-acciones">
          ${accionBtn}
          <button class="btn-secondary btn-sm" style="color:var(--green-ok);border-color:var(--green-ok);"
            onclick="resolverAlerta('${a.id}')">✓ Resolver</button>
        </div>
      </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
//  CONTRATOS POR VENCER — sección dedicada con acciones (Art. 37/39-A/39-B LFT)
// ═══════════════════════════════════════════════════════════════════════════
const _TIPOS_VENC_CONTRATO = ['contrato_vencimiento', 'periodo_prueba', 'capacitacion_inicial'];

function contratosPorVencer(alertas) {
  return (alertas || []).filter(a => _TIPOS_VENC_CONTRATO.includes(a.tipo));
}

function renderContratosPorVencer(alertas) {
  const items = contratosPorVencer(alertas);
  if (!items.length) {
    return `
      <div class="empty-state" style="padding:24px;">
        <div class="empty-state-icon">✅</div>
        <div class="empty-state-title">Sin contratos por vencer en los próximos días</div>
      </div>`;
  }

  return `
    <div class="alertas-lista">
      ${items.map(a => {
        const cfg   = ALERTA_CFG[a.tipo] || { icono:'⚠️', label:a.tipo };
        const hoy   = new Date(); hoy.setHours(0,0,0,0);
        const venc  = a.fecha_limite ? new Date(a.fecha_limite + 'T00:00:00') : null;
        const dias  = venc ? Math.ceil((venc - hoy) / 86400000) : null;
        const vencTxt = dias === null ? '—'
          : dias < 0  ? `<span style="color:var(--red-warn);font-weight:800;">VENCIDO hace ${Math.abs(dias)} día${Math.abs(dias)!==1?'s':''}</span>`
          : dias === 0 ? `<span style="color:var(--red-warn);font-weight:800;">Vence hoy</span>`
          : `<span style="color:${dias<=3?'var(--red-warn)':'#f39c12'};font-weight:700;">${dias} día${dias!==1?'s':''} restantes</span>`;
        const trabId = a.trabajadores?.id || a.trabajador_id;

        return `
          <div class="alerta-item" id="alerta-venc-${a.id}">
            <div class="alerta-left"><div class="alerta-icono">${cfg.icono}</div></div>
            <div class="alerta-body">
              <div class="alerta-cabecera">
                <span class="alerta-titulo">${escapeHtml(a.trabajadores?.nombre || a.titulo)}</span>
                <span class="alerta-articulo">${cfg.label}${a.articulo_lft ? ' · ' + escapeHtml(a.articulo_lft) : ''}</span>
              </div>
              <div class="alerta-desc">${vencTxt}</div>
            </div>
            <div class="alerta-acciones" style="flex-wrap:wrap;gap:6px;">
              <button class="btn-secondary btn-sm" onclick="_prorrogarContrato('${trabId}')">📄 Prorrogar/renovar</button>
              <button class="btn-secondary btn-sm" style="color:var(--gold-primary);border-color:var(--gold-border);"
                onclick="_convertirAIndeterminado('${trabId}','${a.id}')">🔄 Convertir a indeterminado</button>
              <button class="btn-secondary btn-sm" style="color:var(--red-warn);border-color:var(--red-warn);"
                onclick="_iniciarBajaDesdeAlerta('${trabId}')">🚪 Iniciar baja</button>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

/** "Prorrogar/renovar contrato" → abre el flujo de edición del trabajador
 *  (empleados.js) precargado, para actualizar fecha_vencimiento_contrato
 *  y regenerar el contrato. */
function _prorrogarContrato(trabId) {
  if (typeof showModalTrabajador === 'function') showModalTrabajador(trabId);
  else navigate('empleado', trabId);
}

/** "Convertir a indeterminado" → actualiza tipo_contrato y genera, vía el
 *  Agente IA, el convenio de conversión a tiempo indeterminado. */
async function _convertirAIndeterminado(trabId, alertaId) {
  if (!confirm('¿Convertir este contrato a tiempo indeterminado? Se limpiará la fecha de vencimiento del contrato.')) return;
  try {
    await db.updateTrabajador(trabId, { tipo_contrato: 'indeterminado', fecha_vencimiento_contrato: null });
    if (alertaId) await resolverAlerta(alertaId);
    if (typeof abrirAgenteIA === 'function') await abrirAgenteIA(trabId, 'convenio_conversion_indeterminado');
    if (typeof showToast === 'function') showToast('✅ Contrato convertido a tiempo indeterminado', 'success');
  } catch (e) {
    alert('No se pudo convertir el contrato: ' + e.message);
  }
}

/** "Iniciar baja" → navega al módulo de bajas con el trabajador preseleccionado. */
function _iniciarBajaDesdeAlerta(trabId) {
  navigate('bajas', trabId);
}

// ═══════════════════════════════════════════════════════════════════════════
//  FILTRO Y RE-RENDER PARCIAL
// ═══════════════════════════════════════════════════════════════════════════
function filtrarAlertas(prioridad) {
  _filtroActivo = _filtroActivo === prioridad ? null : prioridad;
  _reRenderAlertas();
}

function _reRenderAlertas() {
  const resWrap  = document.getElementById('alertas-resumen-wrap');
  const listaWrap = document.getElementById('alertas-lista-wrap');
  if (resWrap)   resWrap.innerHTML   = renderResumenAlertas(_alertasCache);
  if (listaWrap) listaWrap.innerHTML = renderListaAlertas(_alertasCache);
}
