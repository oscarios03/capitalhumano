/**
 * Capital Humano MX — Movimientos afiliatorios IMSS y export IDSE/SUA
 * Depende de: calculo.js (calcularSBC/calcularFactorIntegracion), festivos.js
 * (getConfigValor/_umaVigente), SheetJS (XLSX, cargado en app.html)
 */

// Claves de causa de baja IMSS (catálogo de "Movimientos Afiliatorios").
// ⚠️ Verificar contra la guía oficial de IDSE vigente antes de usar en producción —
// estas claves son las de uso más común pero el catálogo puede variar.
const CAUSAS_BAJA_IMSS = {
  '01': 'Terminación de la relación o contrato de trabajo',
  '02': 'Separación voluntaria del trabajador',
  '03': 'Abandono de empleo',
  '04': 'Clausura o cierre definitivo de la empresa',
  '05': 'Defunción del trabajador',
  '06': 'Ausentismo',
  '07': 'Cambio de patrón (por fusión/venta)',
  '08': 'Otra causa',
};

function _causaBajaDesdeTipo(tipoBaja) {
  return tipoBaja === 'renuncia' ? '02' : '01';
}

/** Inserta un registro en movimientos_imss (pendiente de exportar). */
async function registrarMovimientoIMSS(empresaId, trabajadorId, tipo, { sbcAnterior = null, sbcNuevo = null, causaBaja = null, fecha = null } = {}) {
  const { error } = await window.supabase.from('movimientos_imss').insert({
    empresa_id: empresaId,
    trabajador_id: trabajadorId,
    tipo,
    fecha_movimiento: fecha || new Date().toISOString().split('T')[0],
    sbc_anterior: sbcAnterior,
    sbc_nuevo: sbcNuevo,
    causa_baja: causaBaja,
  });
  if (error) console.warn('No se pudo registrar movimiento IMSS (¿falta la migración 19?):', error.message);
}

/** Recalcula el SBC desde la ficha del trabajador y refresca la vista. */
async function _recalcularSBCYRefrescar(trabajadorId) {
  try {
    await recalcularSBC(trabajadorId);
    if (typeof renderPerfilEmpleado === 'function') await renderPerfilEmpleado(trabajadorId);
  } catch (e) {
    alert('No se pudo recalcular el SBC: ' + e.message);
  }
}

/** Recalcula y guarda el SBC vigente de un trabajador. */
async function recalcularSBC(trabajadorId) {
  const trab = await db.getTrabajador(trabajadorId);
  const sbcAnterior = parseFloat(trab.sbc || 0) || null;
  const sbcNuevo = calcularSBC(trab);
  await window.supabase.from('trabajadores').update({ sbc: sbcNuevo, fecha_ultimo_sbc: new Date().toISOString().split('T')[0] }).eq('id', trabajadorId);
  if (sbcAnterior !== sbcNuevo) {
    await registrarMovimientoIMSS(CTX.empresa.id, trabajadorId, 'modificacion_salario', { sbcAnterior, sbcNuevo });
  }
  return sbcNuevo;
}

// ═══════════════════════════════════════════════════════════════════════════
//  BANDEJA DE MOVIMIENTOS
// ═══════════════════════════════════════════════════════════════════════════
async function renderIMSS() {
  const _gen = typeof _navGen !== 'undefined' ? _navGen : 0;
  const main = eid('main-view');
  main.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;

  const { data: movimientos, error } = await window.supabase
    .from('movimientos_imss')
    .select('*, trabajadores(nombre, nss, curp, rfc)')
    .eq('empresa_id', CTX.empresa.id)
    .order('created_at', { ascending: false });

  if (typeof _navStale === 'function' && _navStale(_gen)) return;

  if (error) {
    main.innerHTML = `<div class="alert alert-danger">Error al cargar movimientos: ${error.message}
      ${/relation|schema cache/i.test(error.message||'') ? '<br>Aplica la migración 19_migration_sbc_movimientos.sql.' : ''}</div>`;
    return;
  }

  const pendientes = (movimientos || []).filter(m => m.estatus === 'pendiente');
  const exportados  = (movimientos || []).filter(m => m.estatus === 'exportado');
  const lotes = [...new Set(exportados.map(m => m.lote_exportacion))];

  const TIPO_LABEL = { alta:'🟢 Alta', baja:'🔴 Baja', modificacion_salario:'💵 Modificación salario', reingreso:'🔁 Reingreso' };

  main.innerHTML = `
    <div class="view-header animate-in">
      <div><div class="view-title">🏛 IMSS / Movimientos</div><div class="view-subtitle">Avisos afiliatorios para importar en IDSE, o capturar en SUA</div></div>
    </div>

    <div class="card animate-in" style="margin-bottom:16px;">
      <div class="card-header" style="margin-bottom:10px;">
        <span class="card-title">📋 Movimientos pendientes (${pendientes.length})</span>
        <button class="btn-primary btn-sm" ${!pendientes.length?'disabled':''} onclick="_exportarLoteIMSS()">📤 Exportar lote para IDSE</button>
      </div>
      <div class="alert alert-info" style="margin-bottom:14px;">
        <span>ℹ️</span><span>Los avisos de alta o modificación de salario deben presentarse dentro de los 5 días hábiles siguientes (Art. 15 fr. I LSS).</span>
      </div>
      ${pendientes.length === 0
        ? `<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-title">Sin movimientos pendientes</div></div>`
        : `<div class="table-wrap"><table class="data-table">
            <thead><tr><th><input type="checkbox" onchange="document.querySelectorAll('.mov-check').forEach(c=>c.checked=this.checked)" /></th><th>Trabajador</th><th>Tipo</th><th>Fecha</th><th>SBC</th><th>Antigüedad</th></tr></thead>
            <tbody>${pendientes.map(m => {
              const dias = Math.floor((Date.now() - new Date(m.created_at).getTime()) / 86400000);
              return `<tr${dias > 3 ? ' style="background:rgba(231,76,60,.08);"' : ''}>
                <td><input type="checkbox" class="mov-check" value="${m.id}" /></td>
                <td>${escapeHtml(m.trabajadores?.nombre) || '—'}</td>
                <td>${TIPO_LABEL[m.tipo] || m.tipo}${m.tipo==='baja' && m.causa_baja ? `<br><span style="font-size:.72rem;color:var(--text-muted);">${CAUSAS_BAJA_IMSS[m.causa_baja]||m.causa_baja}</span>`:''}</td>
                <td>${formatDateShort(m.fecha_movimiento)}</td>
                <td>${m.sbc_nuevo != null ? fmt(m.sbc_nuevo) : '—'}${m.sbc_anterior != null ? ` <span style="font-size:.72rem;color:var(--text-muted);">(antes ${fmt(m.sbc_anterior)})</span>` : ''}</td>
                <td>${dias > 3 ? `<span style="color:var(--red-warn);font-weight:700;">⚠️ ${dias} días</span>` : `${dias} día${dias!==1?'s':''}`}</td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>`
      }
    </div>

    <div class="card animate-in">
      <div class="card-header"><span class="card-title">📦 Lotes exportados</span></div>
      ${lotes.length === 0
        ? `<div class="empty-state" style="padding:20px;"><div class="empty-state-title">Sin lotes exportados todavía</div></div>`
        : `<div class="table-wrap"><table class="data-table">
            <thead><tr><th>Lote</th><th>Movimientos</th><th>Fecha</th><th></th></tr></thead>
            <tbody>${lotes.map(lote => {
              const items = exportados.filter(m => m.lote_exportacion === lote);
              return `<tr>
                <td style="font-family:monospace;font-size:.78rem;">${lote.slice(0,8)}…</td>
                <td>${items.length}</td>
                <td>${formatDateShort(items[0]?.exportado_at)}</td>
                <td><button class="btn-secondary btn-sm" onclick="_redescargarLoteIMSS('${lote}')">⬇ Volver a descargar</button></td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>`
      }
    </div>
  `;
}

function _fixedWidth(str, len, padChar = ' ', alignRight = false) {
  const s = String(str == null ? '' : str).toUpperCase().slice(0, len);
  return alignRight ? s.padStart(len, padChar) : s.padEnd(len, padChar);
}

function _fechaDDMMAAAA(fechaISO) {
  const d = new Date(String(fechaISO).slice(0,10) + 'T00:00:00');
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  return `${dd}${mm}${d.getFullYear()}`;
}

/**
 * Genera una línea de ancho fijo con el layout ILUSTRATIVO de importación de
 * movimientos afiliatorios de IDSE.
 * ⚠️ IMPORTANTE: verificar las posiciones exactas contra la "Guía técnica de
 * importación de movimientos" vigente de IDSE antes de usar en producción —
 * el layout real puede diferir por versión/tipo de movimiento.
 *
 * Posiciones (100 caracteres por línea):
 *   1-2    Tipo de movimiento   (01 alta, 02 baja, 07 modif. salario, 08 reingreso)
 *   3-13   Registro patronal    (11)
 *   14-24  NSS                  (11)
 *   25-42  CURP                 (18)
 *   43-82  Nombre (formato "APELLIDO PATERNO APELLIDO MATERNO/NOMBRE") (40)
 *   83-90  SBC — 6 enteros + 2 decimales, sin punto, ceros a la izquierda (8)
 *   91-98  Fecha del movimiento DDMMAAAA (8)
 *   99-100 Causa de baja (2, '00' si no aplica)
 */
function _lineaIDSE(m, registroPatronal) {
  const TIPO_COD = { alta:'01', baja:'02', modificacion_salario:'07', reingreso:'08' };
  const t = m.trabajadores || {};
  const sbcCentavos = Math.round((m.sbc_nuevo || m.sbc_anterior || 0) * 100);
  return [
    _fixedWidth(TIPO_COD[m.tipo] || '01', 2),
    _fixedWidth(registroPatronal, 11),
    _fixedWidth(t.nss, 11),
    _fixedWidth(t.curp, 18),
    _fixedWidth(t.nombre, 40),
    _fixedWidth(sbcCentavos, 8, '0', true),
    _fechaDDMMAAAA(m.fecha_movimiento),
    _fixedWidth(m.causa_baja || '00', 2),
  ].join('');
}

async function _exportarLoteIMSS() {
  const seleccion = [...document.querySelectorAll('.mov-check:checked')].map(c => c.value);
  if (!seleccion.length) { alert('Selecciona al menos un movimiento.'); return; }

  const { data: movimientos, error } = await window.supabase
    .from('movimientos_imss')
    .select('*, trabajadores(nombre, nss, curp, rfc)')
    .in('id', seleccion);
  if (error) { alert('Error: ' + error.message); return; }

  const registroPatronal = CTX.empresa.registro_patronal || '';
  if (!registroPatronal) {
    alert('Captura el registro patronal de la empresa en "Mi Empresa" antes de exportar.');
    return;
  }

  const loteId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;

  // 1. Archivo .txt ancho fijo (IDSE)
  const lineas = movimientos.map(m => _lineaIDSE(m, registroPatronal)).join('\r\n');
  const blobTxt = new Blob([lineas], { type: 'text/plain' });
  const urlTxt = URL.createObjectURL(blobTxt);
  const aTxt = document.createElement('a');
  aTxt.href = urlTxt; aTxt.download = `movimientos-idse-${loteId.slice(0,8)}.txt`;
  aTxt.click(); URL.revokeObjectURL(urlTxt);

  // 2. Excel espejo (columnas legibles) para validar o capturar en SUA
  if (typeof XLSX !== 'undefined') {
    const datos = movimientos.map(m => ({
      Tipo: m.tipo, 'Registro Patronal': registroPatronal, NSS: m.trabajadores?.nss || '',
      CURP: m.trabajadores?.curp || '', RFC: m.trabajadores?.rfc || '', Nombre: m.trabajadores?.nombre || '',
      SBC: m.sbc_nuevo || m.sbc_anterior || '', Fecha: m.fecha_movimiento,
      'Causa de baja': m.causa_baja ? `${m.causa_baja} - ${CAUSAS_BAJA_IMSS[m.causa_baja]||''}` : '',
    }));
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimientos IMSS');
    XLSX.writeFile(wb, `movimientos-imss-${loteId.slice(0,8)}.xlsx`);
  }

  // 3. Marcar como exportados
  await window.supabase.from('movimientos_imss')
    .update({ estatus: 'exportado', lote_exportacion: loteId, exportado_at: new Date().toISOString() })
    .in('id', seleccion);

  await renderIMSS();
}

async function _redescargarLoteIMSS(loteId) {
  const { data: movimientos, error } = await window.supabase
    .from('movimientos_imss')
    .select('*, trabajadores(nombre, nss, curp, rfc)')
    .eq('lote_exportacion', loteId);
  if (error) { alert('Error: ' + error.message); return; }

  const registroPatronal = CTX.empresa.registro_patronal || '';
  const lineas = movimientos.map(m => _lineaIDSE(m, registroPatronal)).join('\r\n');
  const blob = new Blob([lineas], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `movimientos-idse-${loteId.slice(0,8)}.txt`;
  a.click(); URL.revokeObjectURL(url);
}

/**
 * Genera (si no existe ya una sin resolver) una alerta informativa cuando
 * hay movimientos IMSS pendientes con más de 3 días de antigüedad
 * (Art. 15 fr. I LSS: 5 días hábiles para presentar el aviso).
 */
async function verificarMovimientosIMSSVencidos(empresaId) {
  const { data: pendientes } = await window.supabase
    .from('movimientos_imss')
    .select('id, created_at')
    .eq('empresa_id', empresaId)
    .eq('estatus', 'pendiente');

  const vencidos = (pendientes || []).filter(m => (Date.now() - new Date(m.created_at).getTime()) > 3 * 86400000);
  if (!vencidos.length) return;

  const { data: yaExiste } = await window.supabase
    .from('alertas')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('tipo', 'movimiento_imss_vencido')
    .eq('resuelta', false)
    .limit(1);
  if (yaExiste && yaExiste.length) return;

  const { error: errAlerta } = await window.supabase.from('alertas').insert({
    empresa_id: empresaId,
    tipo: 'movimiento_imss_vencido',
    titulo: `${vencidos.length} movimiento(s) IMSS pendientes de exportar`,
    descripcion: 'Hay avisos de alta/modificación de salario con más de 3 días sin exportarse a IDSE. El plazo legal es de 5 días hábiles (Art. 15 fr. I LSS).',
    prioridad: 'alta',
    articulo_lft: 'Art. 15 fr. I LSS',
    accion_sugerida: 'Ir al módulo IMSS / Movimientos y exportar el lote pendiente.',
  });
  if (errAlerta) console.warn('No se pudo generar la alerta de movimientos IMSS:', errAlerta.message);
}
