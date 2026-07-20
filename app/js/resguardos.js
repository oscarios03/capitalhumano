/**
 * Capital Humano MX — Resguardos de herramientas, uniformes y equipo
 * Depende de: db.js pattern, expediente.js (subirDocumento, bucket 'expedientes'),
 * pdfs.js (pdfHeader, pdfLine, np, npDate, fmt)
 */

async function _listarResguardos(trabajadorId) {
  const { data, error } = await window.supabase
    .from('resguardos')
    .select('*')
    .eq('trabajador_id', trabajadorId)
    .order('activo', { ascending: false })
    .order('fecha_entrega', { ascending: false });
  return { data: data || [], error };
}

async function renderTabResguardos(trabajadorId) {
  const el = eid('tab-resguardos');
  if (!el) return;
  el.innerHTML = `<div style="color:var(--text-muted);font-size:.85rem;padding:12px 0;">Cargando resguardos…</div>`;

  const { data: resguardos, error } = await _listarResguardos(trabajadorId);
  if (error) {
    el.innerHTML = `<div class="alert alert-danger">Error al cargar resguardos: ${friendlyError(error)}
      ${/relation|schema cache/i.test(error.message||'') ? '<br>Aplica la migración 20_migration_resguardos.sql.' : ''}</div>`;
    return;
  }

  const activos   = resguardos.filter(r => r.activo);
  const devueltos = resguardos.filter(r => !r.activo);
  const ESTADO_ENTREGA_LABEL = { nuevo:'Nuevo', buen_estado:'Buen estado', usado:'Usado' };

  const filaActivo = r => `
    <tr>
      <td><input type="checkbox" class="res-check" value="${r.id}" /></td>
      <td>${escapeHtml(r.articulo)}${r.descripcion ? `<br><span style="font-size:.75rem;color:var(--text-muted);">${escapeHtml(r.descripcion)}</span>` : ''}</td>
      <td style="font-size:.82rem;color:var(--text-muted);">${escapeHtml(r.numero_serie) || '—'}</td>
      <td>${r.cantidad}</td>
      <td>${r.valor_estimado ? fmt(r.valor_estimado) : '—'}</td>
      <td style="font-size:.82rem;">${ESTADO_ENTREGA_LABEL[r.estado_entrega] || '—'}</td>
      <td style="font-size:.82rem;">${formatDateShort(r.fecha_entrega)}</td>
      <td><button class="btn-danger btn-sm" onclick="_mostrarFormDevolucion('${r.id}','${trabajadorId}')">↩ Devolución</button></td>
    </tr>`;

  const filaDevuelto = r => `
    <tr style="opacity:.6;">
      <td></td>
      <td>${escapeHtml(r.articulo)}</td>
      <td style="font-size:.82rem;color:var(--text-muted);">${escapeHtml(r.numero_serie) || '—'}</td>
      <td>${r.cantidad}</td>
      <td>${r.valor_estimado ? fmt(r.valor_estimado) : '—'}</td>
      <td style="font-size:.82rem;">Devuelto: ${{completo:'Completo',danado:'Dañado',no_devuelto:'● No devuelto'}[r.estado_devolucion] || r.estado_devolucion || '—'}</td>
      <td style="font-size:.82rem;">${formatDateShort(r.fecha_devolucion)}</td>
      <td></td>
    </tr>`;

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
      <strong>Resguardos de herramienta/equipo <span style="font-size:.8rem;font-weight:400;color:var(--text-muted);">(${activos.length} activo${activos.length!==1?'s':''})</span></strong>
      <div style="display:flex;gap:8px;">
        <button class="btn-secondary btn-sm" onclick="_generarCartaDeSeleccion('${trabajadorId}')">Generar carta responsiva</button>
        <button class="btn-primary btn-sm" onclick="_mostrarFormEntrega('${trabajadorId}')">+ Nueva entrega</button>
      </div>
    </div>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th></th><th>Artículo</th><th>Núm. serie</th><th>Cant.</th><th>Valor est.</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr></thead>
      <tbody>${activos.map(filaActivo).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:16px;">Sin resguardos activos</td></tr>'}
      ${devueltos.map(filaDevuelto).join('')}</tbody>
    </table></div>
    <div id="form-entrega-resguardo" style="display:none;margin-top:18px;padding:16px;border:1.5px solid var(--border);border-radius:var(--radius-md);"></div>
    <div id="form-devolucion-resguardo" style="display:none;margin-top:18px;padding:16px;border:1.5px solid var(--border);border-radius:var(--radius-md);"></div>
    <div id="form-carta-resguardo" style="display:none;margin-top:18px;padding:16px;border:1.5px solid var(--border);border-radius:var(--radius-md);"></div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
//  NUEVA ENTREGA (uno o varios artículos, misma fecha)
// ═══════════════════════════════════════════════════════════════════════════
let _filasEntregaResguardo = 0;

function _mostrarFormEntrega(trabajadorId) {
  const form = eid('form-entrega-resguardo');
  if (!form) return;
  form.style.display = '';
  _filasEntregaResguardo = 0;
  form.innerHTML = `
    <div style="font-weight:700;font-size:.9rem;margin-bottom:14px;">Nueva entrega de artículos</div>
    <div id="filas-entrega-resguardo"></div>
    <button class="btn-secondary btn-sm" onclick="_agregarFilaEntrega()" style="margin-top:8px;">+ Agregar artículo</button>
    <div id="entr-error" class="error-msg" role="alert" style="display:none;margin:10px 0;"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
      <button class="btn-secondary btn-sm" onclick="_cerrarFormEntrega()">Cancelar</button>
      <button id="entr-btn-guardar" class="btn-primary btn-sm" onclick="_guardarEntregaResguardos('${trabajadorId}')">Guardar entrega</button>
    </div>
  `;
  _agregarFilaEntrega();
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _agregarFilaEntrega() {
  const cont = eid('filas-entrega-resguardo');
  if (!cont) return;
  const i = _filasEntregaResguardo++;
  const row = document.createElement('div');
  row.className = 'resguardo-entrega-row';
  row.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr auto;gap:8px;margin-bottom:8px;align-items:end;';
  row.innerHTML = `
    <div><label class="form-label" style="font-size:.7rem;">Artículo</label><input name="art-nombre" type="text" class="form-input" placeholder="Ej. Laptop Dell" /></div>
    <div><label class="form-label" style="font-size:.7rem;">Núm. serie</label><input name="art-serie" type="text" class="form-input" /></div>
    <div><label class="form-label" style="font-size:.7rem;">Cantidad</label><input name="art-cant" type="number" class="form-input" value="1" min="1" /></div>
    <div><label class="form-label" style="font-size:.7rem;">Valor est.</label><input name="art-valor" type="number" class="form-input" min="0" step="0.01" /></div>
    <div><label class="form-label" style="font-size:.7rem;">Estado</label>
      <select name="art-estado" class="form-select">
        <option value="nuevo">Nuevo</option>
        <option value="buen_estado" selected>Buen estado</option>
        <option value="usado">Usado</option>
      </select>
    </div>
    <button class="btn-danger btn-sm" onclick="this.parentElement.remove()"><svg class="ic"><use href="#i-trash"></use></svg></button>
  `;
  cont.appendChild(row);
}

function _cerrarFormEntrega() {
  const form = eid('form-entrega-resguardo');
  if (form) form.style.display = 'none';
}

async function _guardarEntregaResguardos(trabajadorId) {
  const errEl = eid('entr-error');
  errEl.style.display = 'none';

  const filas = [...document.querySelectorAll('#filas-entrega-resguardo .resguardo-entrega-row')].map(row => ({
    articulo:       row.querySelector('[name="art-nombre"]')?.value.trim(),
    numero_serie:   row.querySelector('[name="art-serie"]')?.value.trim() || null,
    cantidad:       parseInt(row.querySelector('[name="art-cant"]')?.value) || 1,
    valor_estimado: parseFloat(row.querySelector('[name="art-valor"]')?.value) || null,
    estado_entrega: row.querySelector('[name="art-estado"]')?.value || 'buen_estado',
  })).filter(f => f.articulo);

  if (!filas.length) {
    errEl.textContent = 'Agrega al menos un artículo con nombre.';
    errEl.style.display = '';
    return;
  }

  const btn = eid('entr-btn-guardar');
  btnCargando(btn, 'Guardando…');

  const fechaEntrega = new Date().toISOString().split('T')[0];
  const { data: creados, error } = await window.supabase.from('resguardos')
    .insert(filas.map(f => ({ ...f, empresa_id: CTX.empresa.id, trabajador_id: trabajadorId, fecha_entrega: fechaEntrega })))
    .select();

  btnRestaurar(btn);

  if (error) {
    errEl.textContent = 'Error al guardar: ' + friendlyError(error);
    errEl.style.display = '';
    return;
  }

  _cerrarFormEntrega();
  await renderTabResguardos(trabajadorId);
  if (await showConfirmacion(`Se registraron ${creados.length} artículo(s). ¿Generar la carta responsiva ahora?`, { titulo:'Entrega registrada', textoOk:'Generar carta', textoCancelar:'Ahora no' })) {
    await _generarCartaResponsiva(trabajadorId, creados.map(r => r.id));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CARTA RESPONSIVA (PDF + subir escaneado firmado)
// ═══════════════════════════════════════════════════════════════════════════
async function _generarCartaDeSeleccion(trabajadorId) {
  const seleccion = [...document.querySelectorAll('.res-check:checked')].map(c => c.value);
  if (!seleccion.length) { alert('Selecciona al menos un resguardo activo (checkbox en la tabla).'); return; }
  await _generarCartaResponsiva(trabajadorId, seleccion);
}

async function _generarCartaResponsiva(trabajadorId, resguardoIds) {
  const trab = await db.getTrabajador(trabajadorId);
  const { data: items } = await window.supabase.from('resguardos').select('*').in('id', resguardoIds);
  if (!items?.length) { alert('No se encontraron los resguardos seleccionados.'); return; }

  generarCartaResponsivaPDF(CTX.empresa, trab, items);

  // Ofrecer subir el escaneado firmado al expediente digital
  const form = eid('form-carta-resguardo');
  if (form) {
    form.style.display = '';
    form.innerHTML = `
      <div style="font-weight:700;font-size:.9rem;margin-bottom:10px;">Subir carta responsiva firmada (opcional)</div>
      <div class="form-grid">
        <div class="form-group span-2">
          <label class="form-label" for="carta-res-archivo">Archivo escaneado</label>
          <input id="carta-res-archivo" type="file" class="form-input" accept=".pdf,.jpg,.jpeg,.png" />
        </div>
      </div>
      <div id="carta-res-error" class="error-msg" role="alert" style="display:none;margin-bottom:8px;"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn-secondary btn-sm" onclick="eid('form-carta-resguardo').style.display='none'">Cerrar</button>
        <button class="btn-primary btn-sm" onclick='_subirCartaFirmada("${trabajadorId}", ${JSON.stringify(resguardoIds)})'>Subir al expediente</button>
      </div>
    `;
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

async function _subirCartaFirmada(trabajadorId, resguardoIds) {
  const errEl = eid('carta-res-error');
  errEl.style.display = 'none';
  const archivo = eid('carta-res-archivo')?.files?.[0];
  if (!archivo) { errEl.textContent = 'Selecciona un archivo.'; errEl.style.display = ''; return; }
  if (archivo.size > 10 * 1024 * 1024) {
    errEl.textContent = 'El archivo excede el límite de 10 MB.';
    errEl.style.display = '';
    return;
  }

  const { data, error } = await expediente.subirDocumento(trabajadorId, archivo, 'resguardo', `Carta responsiva — ${resguardoIds.length} artículo(s)`);
  if (error) { errEl.textContent = 'Error al subir: ' + friendlyError(error); errEl.style.display = ''; return; }

  await window.supabase.from('resguardos').update({ documento_url: data.storage_path }).in('id', resguardoIds);
  eid('form-carta-resguardo').style.display = 'none';
  await renderTabResguardos(trabajadorId);
  if (typeof showToast === 'function') showToast('Carta responsiva guardada en el expediente digital', 'success');
}

function generarCartaResponsivaPDF(empresa, trab, items) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  const ml = 25, mr = 25;
  const pw = doc.internal.pageSize.getWidth();
  const tw = pw - ml - mr;
  let y = pdfHeader(doc, 'CARTA RESPONSIVA DE RESGUARDO', 'Entrega de herramienta, equipo y/o uniforme', ml, mr);

  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(60,60,60);
  doc.text(`${np(empresa.ciudad || '')}, a ${npDate(new Date())}`, pw - mr, y, { align:'right' }); y += 10;

  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(20,20,20);
  doc.text(np((empresa.nombre||'').toUpperCase()), ml, y); y += 6;
  if (empresa.representante) { doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.text(`Representante: ${np(empresa.representante)}`, ml, y); y += 6; }
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(60,60,60);
  doc.text(`Trabajador: ${np(trab.nombre)}${trab.puesto ? ' — ' + np(trab.puesto) : ''}`, ml, y); y += 10;

  doc.autoTable({
    startY: y, margin:{ left:ml, right:mr },
    head:[['Artículo','Núm. serie','Cant.','Valor est.','Estado de entrega']],
    body: items.map(r => [np(r.articulo), np(r.numero_serie || '—'), String(r.cantidad), r.valor_estimado ? fmt(r.valor_estimado) : '—', {nuevo:'Nuevo',buen_estado:'Buen estado',usado:'Usado'}[r.estado_entrega] || '—']),
    styles:{ fontSize:9, cellPadding:3 },
    headStyles:{ fillColor:[39,50,80], textColor:[255,255,255], fontStyle:'bold' },
    theme:'grid',
  });
  y = doc.lastAutoTable.finalY + 10;

  doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(40,40,40);
  const clausulas = [
    'El trabajador recibe de conformidad el/los artículo(s) descritos en la tabla anterior y se compromete a su conservación y uso adecuado durante la relación laboral, en cumplimiento de la obligación de cuidar los materiales y útiles que se le den para el trabajo (Art. 134 fracc. VI LFT).',
    'El trabajador se obliga a restituir el/los artículo(s) a la empresa al término de la relación laboral, por cualquier causa, en el estado en que razonablemente corresponda a su uso normal.',
    'La pérdida o el daño del/de los artículo(s) por causa imputable al trabajador podrá generar la responsabilidad correspondiente en los términos de la legislación aplicable, la cual será determinada y, en su caso, cobrada conforme a los procedimientos y requisitos legales respectivos (no aplica descuento automático en nómina sin que medie el consentimiento del trabajador y la comprobación de la responsabilidad, Art. 110 fracc. I LFT).',
  ];
  clausulas.forEach((c, i) => {
    const l = doc.splitTextToSize(`${i+1}. ${c}`, tw);
    doc.text(l, ml, y); y += l.length * 5 + 6;
  });

  y += 10;
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  doc.line(ml, y, ml + 75, y);
  doc.line(pw - mr - 75, y, pw - mr, y);
  y += 5;
  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(30,30,30);
  doc.text('Firma del trabajador', ml, y);
  doc.text('Firma del representante', pw - mr - 75, y);
  y += 5;
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(80,80,80);
  doc.text(np(trab.nombre), ml, y);
  doc.text(np(empresa.representante || empresa.nombre || ''), pw - mr - 75, y);

  const ph = doc.internal.pageSize.getHeight();
  doc.setFontSize(7); doc.setTextColor(160,160,160);
  doc.text('Documento generado por Capital Humano MX | Referencial — no sustituye asesoria legal', pw/2, ph-10, { align:'center' });

  doc.save(`carta-responsiva-${(trab.nombre||'trabajador').replace(/\s+/g,'-').toLowerCase()}.pdf`);
}

// ═══════════════════════════════════════════════════════════════════════════
//  DEVOLUCIÓN
// ═══════════════════════════════════════════════════════════════════════════
function _mostrarFormDevolucion(resguardoId, trabajadorId) {
  const form = eid('form-devolucion-resguardo');
  if (!form) return;
  form.style.display = '';
  form.innerHTML = `
    <div style="font-weight:700;font-size:.9rem;margin-bottom:14px;">↩ Registrar devolución</div>
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label" for="dev-estado">Estado de devolución <span class="req">*</span></label>
        <select id="dev-estado" class="form-select" required aria-required="true">
          <option value="completo">Completo</option>
          <option value="danado">Dañado</option>
          <option value="no_devuelto">● No devuelto</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="dev-fecha">Fecha de devolución</label>
        <input id="dev-fecha" type="date" class="form-input" value="${new Date().toISOString().split('T')[0]}" />
      </div>
      <div class="form-group span-2">
        <label class="form-label" for="dev-notas">Notas</label>
        <input id="dev-notas" type="text" class="form-input" placeholder="Observaciones sobre el estado del artículo" />
      </div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
      <button class="btn-secondary btn-sm" onclick="eid('form-devolucion-resguardo').style.display='none'">Cancelar</button>
      <button class="btn-primary btn-sm" onclick="_guardarDevolucion('${resguardoId}','${trabajadorId}')">Guardar</button>
    </div>
  `;
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function _guardarDevolucion(resguardoId, trabajadorId) {
  const estado = eid('dev-estado')?.value;
  const fecha  = eid('dev-fecha')?.value || new Date().toISOString().split('T')[0];
  const notas  = eid('dev-notas')?.value.trim() || null;

  const { error } = await window.supabase.from('resguardos').update({
    estado_devolucion: estado, fecha_devolucion: fecha, notas_devolucion: notas,
  }).eq('id', resguardoId);

  if (error) { alert('Error: ' + friendlyError(error)); return; }
  await renderTabResguardos(trabajadorId);
}

/**
 * Constancia de devolución de equipo — documento separado del recibo de
 * finiquito/liquidación (para no modificar ese cálculo compartido). Detalla
 * el estado de devolución de cada artículo resguardado; no descuenta
 * automáticamente ningún valor.
 */
function generarConstanciaDevolucionPDF(empresa, trab, resguardos) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  const ml = 25, mr = 25;
  const pw = doc.internal.pageSize.getWidth();
  const tw = pw - ml - mr;
  let y = pdfHeader(doc, 'CONSTANCIA DE DEVOLUCIÓN DE EQUIPO', 'Anexo al finiquito/liquidación', ml, mr);

  doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(60,60,60);
  doc.text(`Trabajador: ${np(trab.nombre)} — Fecha de baja: ${npDate(trab.fecha_baja || new Date())}`, ml, y); y += 10;

  const ESTADO_LABEL = { completo:'Completo', danado:'Dañado', no_devuelto:'No devuelto' };
  doc.autoTable({
    startY: y, margin:{ left:ml, right:mr },
    head:[['Artículo','Núm. serie','Entregado','Estado de devolución','Notas']],
    body: resguardos.map(r => [
      np(r.articulo), np(r.numero_serie || '—'), npDate(r.fecha_entrega),
      r.estado_devolucion ? (ESTADO_LABEL[r.estado_devolucion] || r.estado_devolucion) : 'Pendiente',
      np(r.notas_devolucion || '—'),
    ]),
    styles:{ fontSize:9, cellPadding:3 },
    headStyles:{ fillColor:[39,50,80], textColor:[255,255,255], fontStyle:'bold' },
    theme:'grid',
  });
  y = doc.lastAutoTable.finalY + 10;

  const noDevueltos = resguardos.filter(r => !r.estado_devolucion || r.estado_devolucion !== 'completo');
  if (noDevueltos.length) {
    doc.setFont('helvetica','italic'); doc.setFontSize(9); doc.setTextColor(80,80,80);
    const nota = `Los artículos no devueltos o dañados quedan documentados para su seguimiento; no se aplica descuento automático en el finiquito por este concepto (la retención unilateral requiere responsabilidad comprobada y consentimiento, Art. 110 fracc. I LFT).`;
    const l = doc.splitTextToSize(nota, tw);
    doc.text(l, ml, y); y += l.length * 5 + 6;
  }

  const ph = doc.internal.pageSize.getHeight();
  doc.setFontSize(7); doc.setTextColor(160,160,160);
  doc.text('Documento generado por Capital Humano MX | Referencial — no sustituye asesoria legal', pw/2, ph-10, { align:'center' });

  doc.save(`constancia-devolucion-${(trab.nombre||'trabajador').replace(/\s+/g,'-').toLowerCase()}.pdf`);
}

/** Resguardos activos (no devueltos) de un trabajador — usado por bajas.js. */
async function resguardosPendientes(trabajadorId) {
  const { data } = await window.supabase.from('resguardos').select('*').eq('trabajador_id', trabajadorId).eq('activo', true);
  return data || [];
}
