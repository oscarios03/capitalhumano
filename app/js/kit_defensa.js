/**
 * Capital Humano MX — Kit de expediente de defensa
 *
 * Arma en un ZIP todo lo probatorio de un trabajador: contrato, recibos,
 * asistencia, actas, resguardos y los documentos del expediente digital, con
 * un índice de contenido al frente.
 *
 * Para qué: el Art. 784 LFT invierte la carga de la prueba — en un juicio
 * laboral le toca al PATRÓN demostrar la fecha de ingreso, el salario, la
 * jornada, los pagos y las causas de despido. Lo que no esté documentado se
 * presume a favor del trabajador. Cuando llega el citatorio de conciliación
 * hay días, no semanas, para juntar todo esto.
 *
 * Depende de: pdfs.js (generateContratoPDF, generateActaPDF, generarReciboNominaBlob,
 * pdfHeader), resguardos.js (generarCartaResponsivaPDF), expediente.js (expediente),
 * app.js (CTX, showModal, closeModal, showToast), JSZip y XLSX (ya cargados).
 */

let _KIT = { trabajadorId: null, trab: null, conteos: null };

// ─── Modal de selección ──────────────────────────────────────────────────────

async function showModalKitDefensa(trabajadorId) {
  if (typeof JSZip === 'undefined') { showToast('JSZip no está cargado.', 'error'); return; }

  _KIT.trabajadorId = trabajadorId;
  showModal(`<div class="modal animate-in" style="max-width:560px;">
    <div class="modal-header"><div class="modal-title">Kit de expediente de defensa</div>
      <button class="modal-close" onclick="closeModal()">×</button></div>
    <div style="padding:30px;text-align:center;color:var(--text-muted);">
      <div class="spinner" style="margin:0 auto 10px;"></div>Revisando qué hay en el expediente…
    </div></div>`);

  try {
    const sb = window.supabase;
    const [trab, actas, contratos, docs, resguardos, recibos] = await Promise.all([
      db.getTrabajador(trabajadorId),
      sb.from('actas').select('id', { count:'exact', head:true }).eq('trabajador_id', trabajadorId),
      sb.from('contratos').select('id', { count:'exact', head:true }).eq('trabajador_id', trabajadorId),
      sb.from('documentos_trabajador').select('id', { count:'exact', head:true }).eq('trabajador_id', trabajadorId),
      sb.from('resguardos').select('id', { count:'exact', head:true }).eq('trabajador_id', trabajadorId),
      sb.from('recibos_nomina').select('id', { count:'exact', head:true }).eq('trabajador_id', trabajadorId),
    ]);

    _KIT.trab = trab;
    _KIT.conteos = {
      actas: actas.count || 0, contratos: contratos.count || 0,
      docs: docs.count || 0, resguardos: resguardos.count || 0, recibos: recibos.count || 0,
    };
    _renderModalKit();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
    closeModal();
  }
}

function _renderModalKit() {
  const t = _KIT.trab, c = _KIT.conteos;
  const hoy   = new Date().toISOString().split('T')[0];
  const ingreso = t.fecha_ingreso || '2020-01-01';

  const fila = (id, icono, label, detalle, disponible, checked = true) => `
    <label style="display:flex;align-items:flex-start;gap:10px;padding:9px 12px;border:1px solid var(--border);
                  border-radius:var(--radius-md);cursor:${disponible?'pointer':'not-allowed'};opacity:${disponible?1:.5};">
      <input type="checkbox" id="kit-${id}" ${checked && disponible ? 'checked' : ''} ${disponible?'':'disabled'}
             style="margin-top:2px;width:15px;height:15px;accent-color:var(--gold-primary);" />
      <span style="flex:1;">
        <span style="font-weight:600;font-size:.86rem;">${icono} ${label}</span>
        <div style="font-size:.75rem;color:var(--text-muted);">${detalle}</div>
      </span>
    </label>`;

  showModal(`
    <div class="modal animate-in" style="max-width:600px;display:flex;flex-direction:column;max-height:90vh;">
      <div class="modal-header">
        <div>
          <div class="modal-title">Kit de expediente de defensa</div>
          <p style="font-size:.8rem;color:var(--text-muted);margin-top:3px;">${t.nombre}</p>
        </div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>

      <div style="padding:16px 24px;overflow-y:auto;">
        <div class="alert alert-info" style="margin-bottom:14px;"><svg class="ic" style="flex-shrink:0;"><use href="#i-info"></use></svg>
          <span style="font-size:.82rem;">En un juicio laboral <strong>la carga de la prueba es tuya</strong> (Art. 784 LFT):
          tú debes demostrar ingreso, salario, jornada y pagos. Esto arma un ZIP con todo lo que tienes.</span>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;">
          ${fila('contrato',  '', 'Contrato de trabajo',    'Se regenera al momento desde los datos actuales', true)}
          ${fila('recibos',   '', 'Recibos de nómina',      c.recibos ? `${c.recibos} recibo${c.recibos!==1?'s':''} — prueba de pago` : 'Sin recibos generados', c.recibos > 0)}
          ${fila('asistencia','', 'Historial de asistencia','Excel con faltas, retardos e incidencias', true)}
          ${fila('actas',     '', 'Actas administrativas',  c.actas ? `${c.actas} acta${c.actas!==1?'s':''}` : 'Sin actas', c.actas > 0)}
          ${fila('resguardos','', 'Cartas responsivas',     c.resguardos ? `${c.resguardos} resguardo${c.resguardos!==1?'s':''} de equipo` : 'Sin resguardos', c.resguardos > 0)}
          ${fila('docs',      '', 'Documentos del expediente', c.docs ? `${c.docs} archivo${c.docs!==1?'s':''} (INE, comprobantes, contratos firmados…)` : 'Sin documentos subidos', c.docs > 0)}
        </div>

        <div class="form-grid" style="margin-top:16px;">
          <div class="form-group">
            <label class="form-label">Recibos desde</label>
            <input id="kit-desde" type="date" class="form-input" value="${ingreso}" />
          </div>
          <div class="form-group">
            <label class="form-label">Recibos hasta</label>
            <input id="kit-hasta" type="date" class="form-input" value="${hoy}" />
          </div>
        </div>
        <div id="kit-progreso" style="display:none;margin-top:12px;font-size:.82rem;color:var(--text-muted);"></div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-primary" id="kit-btn" onclick="_generarKitDefensa()">Generar ZIP</button>
      </div>
    </div>
  `);
}

// ─── Generación del ZIP ──────────────────────────────────────────────────────

async function _generarKitDefensa() {
  const sel = id => document.getElementById('kit-' + id)?.checked;
  const btn = document.getElementById('kit-btn');
  const prog = document.getElementById('kit-progreso');
  const paso = txt => { if (prog) { prog.style.display = ''; prog.textContent = '' + txt; } };

  btnCargando(btn, 'Generando…');

  const t   = _KIT.trab;
  const sb  = window.supabase;
  const zip = new JSZip();
  const indice = [];   // renglones para el PDF índice
  const errores = [];

  try {
    const empresa  = CTX.empresa;
    const sucursal = t.sucursal_id ? await db.getSucursal(t.sucursal_id) : null;
    const desde = document.getElementById('kit-desde')?.value;
    const hasta = document.getElementById('kit-hasta')?.value;

    // 1. Contrato
    if (sel('contrato')) {
      paso('Generando el contrato…');
      try {
        zip.file('01-contrato/contrato-de-trabajo.pdf', generateContratoPDF(empresa, t, sucursal, { asBlob: true }));
        indice.push(['Contrato de trabajo', '01-contrato/', '1 archivo']);
      } catch(e) { errores.push('Contrato: ' + e.message); }
    }

    // 2. Recibos de nómina (prueba de pago)
    if (sel('recibos')) {
      paso('Juntando los recibos de nómina…');
      try {
        const { data: recibos } = await sb.from('recibos_nomina')
          .select('id, folio, periodos_nomina(nombre, fecha_inicio, fecha_fin)')
          .eq('trabajador_id', _KIT.trabajadorId)
          .order('created_at');
        const enRango = (recibos || []).filter(r => {
          const f = r.periodos_nomina?.fecha_fin;
          return !f || ((!desde || f >= desde) && (!hasta || f <= hasta));
        });
        let n = 0;
        for (const r of enRango) {
          paso(`Recibos de nómina… (${++n} de ${enRango.length})`);
          try {
            const blob = await generarReciboNominaBlob(r.id);
            if (blob) {
              const nom = (r.periodos_nomina?.nombre || r.folio || r.id).replace(/[^\w\s-]/g,'').replace(/\s+/g,'-').toLowerCase();
              zip.file(`02-recibos-de-nomina/${nom}.pdf`, blob);
            }
          } catch(e) { errores.push(`Recibo ${r.folio || r.id}: ${e.message}`); }
        }
        if (enRango.length) indice.push(['Recibos de nómina', '02-recibos-de-nomina/', `${enRango.length} archivo(s)`]);
      } catch(e) { errores.push('Recibos: ' + e.message); }
    }

    // 3. Asistencia (Excel)
    if (sel('asistencia')) {
      paso('Exportando el historial de asistencia…');
      try {
        const { data: asist } = await sb.from('asistencia')
          .select('fecha, tipo, justificada, observaciones, hora_entrada, hora_salida, minutos_retardo, horas_extra, origen')
          .eq('trabajador_id', _KIT.trabajadorId)
          .order('fecha', { ascending: false });
        if (asist?.length && window.XLSX) {
          const ws = XLSX.utils.json_to_sheet(asist.map(a => ({
            'Fecha': a.fecha, 'Tipo': a.tipo, 'Justificada': a.justificada ? 'Sí' : 'No',
            'Hora entrada': a.hora_entrada || '', 'Hora salida': a.hora_salida || '',
            'Minutos de retardo': a.minutos_retardo ?? '', 'Horas extra': a.horas_extra ?? '',
            'Origen del registro': a.origen || 'manual', 'Observaciones': a.observaciones || '',
          })));
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');
          const buf = XLSX.write(wb, { bookType:'xlsx', type:'array' });
          zip.file('03-asistencia/historial-de-asistencia.xlsx', buf);
          indice.push(['Historial de asistencia', '03-asistencia/', `${asist.length} registro(s)`]);
        }
      } catch(e) { errores.push('Asistencia: ' + e.message); }
    }

    // 4. Actas administrativas
    if (sel('actas')) {
      paso('Generando las actas…');
      try {
        const { data: actas } = await sb.from('actas').select('*')
          .eq('trabajador_id', _KIT.trabajadorId).order('creado_en');
        for (const a of (actas || [])) {
          try {
            const f = (a.creado_en || '').split('T')[0];
            zip.file(`04-actas/${f}-${a.tipo || 'acta'}.pdf`, generateActaPDF(a, empresa, t, sucursal, { asBlob: true }));
          } catch(e) { errores.push(`Acta ${a.id}: ${e.message}`); }
        }
        if (actas?.length) indice.push(['Actas administrativas', '04-actas/', `${actas.length} archivo(s)`]);
      } catch(e) { errores.push('Actas: ' + e.message); }
    }

    // 5. Cartas responsivas de resguardo
    if (sel('resguardos')) {
      paso('Generando las cartas responsivas…');
      try {
        const { data: res } = await sb.from('resguardos').select('*')
          .eq('trabajador_id', _KIT.trabajadorId).order('fecha_entrega');
        if (res?.length && typeof generarCartaResponsivaPDF === 'function') {
          zip.file('05-resguardos/carta-responsiva.pdf', generarCartaResponsivaPDF(empresa, t, res, { asBlob: true }));
          indice.push(['Cartas responsivas de equipo', '05-resguardos/', `${res.length} artículo(s)`]);
        }
      } catch(e) { errores.push('Resguardos: ' + e.message); }
    }

    // 6. Documentos del expediente digital (Storage)
    if (sel('docs')) {
      paso('Descargando los documentos del expediente…');
      try {
        const { data: docs } = await sb.from('documentos_trabajador').select('*')
          .eq('trabajador_id', _KIT.trabajadorId).order('subido_en', { ascending:false });
        let n = 0, bajados = 0;
        for (const d of (docs || [])) {
          paso(`Documentos del expediente… (${++n} de ${docs.length})`);
          try {
            const { data: blob, error } = await window.supabase.storage
              .from('expedientes').download(d.storage_path);
            if (error || !blob) { errores.push(`${d.nombre_archivo}: no se pudo descargar`); continue; }
            zip.file(`06-expediente/${d.tipo_documento}/${d.nombre_archivo}`, blob);
            bajados++;
          } catch(e) { errores.push(`${d.nombre_archivo}: ${e.message}`); }
        }
        if (bajados) indice.push(['Documentos del expediente', '06-expediente/', `${bajados} archivo(s)`]);
      } catch(e) { errores.push('Expediente: ' + e.message); }
    }

    // 7. Índice de contenido
    paso('Armando el índice…');
    try {
      zip.file('00-INDICE.pdf', _generarIndiceKit(t, indice, errores).output('blob'));
    } catch(e) { console.warn('índice:', e.message); }

    // Descargar
    paso('Comprimiendo…');
    const blob = await zip.generateAsync({ type:'blob' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `expediente-defensa-${(t.nombre||'trabajador').replace(/\s+/g,'-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);

    closeModal();
    showToast(errores.length
      ? `Kit generado con ${errores.length} elemento(s) que no se pudieron incluir. Revisa el índice del ZIP.`
      : 'Kit de expediente generado.', errores.length ? 'warn' : 'success', 6000);
    if (errores.length) console.warn('Kit de defensa — omitidos:', errores);

  } catch(e) {
    showToast('Error al generar el kit: ' + e.message, 'error');
    btnRestaurar(btn);
  }
}

/** PDF índice: qué trae el ZIP y qué NO se pudo incluir. */
function _generarIndiceKit(trab, filas, errores) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  const ml = 25, mr = 25;
  let y = 25;

  if (typeof pdfHeader === 'function') {
    y = pdfHeader(doc, 'EXPEDIENTE DE DEFENSA', CTX.empresa?.nombre || '', ml, mr) || 45;
  } else {
    doc.setFontSize(14); doc.text('EXPEDIENTE DE DEFENSA', ml, y); y += 10;
  }

  doc.setFontSize(10);
  doc.text(`Trabajador: ${trab.nombre}`, ml, y); y += 6;
  doc.text(`Puesto: ${trab.puesto || '—'}`, ml, y); y += 6;
  doc.text(`Fecha de ingreso: ${trab.fecha_ingreso ? formatDateLong(new Date(trab.fecha_ingreso + 'T00:00:00')) : '—'}`, ml, y); y += 6;
  doc.text(`Expediente generado el: ${formatDateLong(new Date())}`, ml, y); y += 10;

  doc.setFontSize(9);
  doc.setTextColor(90);
  const nota = doc.splitTextToSize(
    'Este expediente reúne la documentación laboral del trabajador. Conforme al Art. 784 de la Ley Federal ' +
    'del Trabajo, corresponde al patrón acreditar, entre otros, la fecha de ingreso, el salario, la jornada y ' +
    'el pago de las prestaciones. Los archivos se organizan en carpetas numeradas.', 165);
  doc.text(nota, ml, y); y += nota.length * 4.5 + 6;
  doc.setTextColor(0);

  if (typeof doc.autoTable === 'function') {
    doc.autoTable({
      startY: y, margin: { left: ml, right: mr },
      head: [['Contenido', 'Carpeta', 'Detalle']],
      body: filas.length ? filas : [['(sin contenido seleccionado)', '', '']],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [26, 34, 48] },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  if (errores.length) {
    doc.setFontSize(10);
    doc.setTextColor(180, 60, 40);
    doc.text('No se pudo incluir:', ml, y); y += 6;
    doc.setFontSize(8);
    for (const e of errores.slice(0, 20)) {
      doc.text('• ' + String(e).slice(0, 95), ml + 2, y); y += 4.5;
      if (y > 250) break;
    }
    doc.setTextColor(0);
  }

  return doc;
}
