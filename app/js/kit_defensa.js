/**
 * Capital Humano MX — Kit de expediente de defensa
 *
 * Arma en un ZIP todo lo probatorio de un trabajador —contrato, recibos,
 * listas de raya, asistencia, prestaciones anuales, PTU, movimientos del IMSS,
 * actas, resguardos, capacitación, acuses de políticas y el expediente
 * digital— con un índice al frente.
 *
 * Para qué: el Art. 784 LFT invierte la carga de la prueba — en un juicio
 * laboral le toca al PATRÓN demostrar la fecha de ingreso, el salario, la
 * jornada, los pagos y las causas de despido. Lo que no esté documentado se
 * presume a favor del trabajador. Cuando llega el citatorio de conciliación
 * hay días, no semanas, para juntar todo esto.
 *
 * Lo más valioso del Kit no es el ZIP sino el DIAGNÓSTICO que lo encabeza:
 * el Art. 804 enumera lo que el patrón debe conservar y exhibir, y el Art. 805
 * presume ciertos los hechos del trabajador respecto de lo que falte, salvo
 * prueba en contrario. Los huecos se pueden llenar antes del citatorio; ese
 * aviso llega a tiempo una sola vez.
 *
 * Depende de: pdfs.js (generateContratoPDF, generateActaPDF, generarReciboNominaBlob,
 * pdfHeader), pdfs_compliance.js (generateConstanciaDC3), resguardos.js
 * (generarCartaResponsivaPDF), expediente.js (expediente), app.js (CTX,
 * showModal, closeModal, showToast), JSZip y XLSX (ya cargados).
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
    // `count: 'exact', head: true` no descarga filas: sólo el conteo. Con esto
    // el modal puede decir de entrada qué falta, que es lo que más vale del
    // Kit — más que el ZIP en sí.
    const [trab, actas, contratos, docs, resguardos, recibos,
           vacaciones, ptu, imss, capacitacion, acuses] = await Promise.all([
      db.getTrabajador(trabajadorId),
      sb.from('actas').select('id', { count:'exact', head:true }).eq('trabajador_id', trabajadorId),
      sb.from('contratos').select('id', { count:'exact', head:true }).eq('trabajador_id', trabajadorId),
      sb.from('documentos_trabajador').select('id', { count:'exact', head:true }).eq('trabajador_id', trabajadorId),
      sb.from('resguardos').select('id', { count:'exact', head:true }).eq('trabajador_id', trabajadorId),
      sb.from('recibos_nomina').select('id', { count:'exact', head:true }).eq('trabajador_id', trabajadorId),
      sb.from('vacaciones').select('id', { count:'exact', head:true }).eq('trabajador_id', trabajadorId),
      sb.from('ptu_detalle').select('id', { count:'exact', head:true }).eq('trabajador_id', trabajadorId),
      sb.from('movimientos_imss').select('id', { count:'exact', head:true }).eq('trabajador_id', trabajadorId),
      sb.from('capacitaciones').select('id', { count:'exact', head:true }).eq('trabajador_id', trabajadorId),
      sb.from('acuses_documentos').select('id', { count:'exact', head:true }).eq('trabajador_id', trabajadorId),
    ]);

    _KIT.trab = trab;
    _KIT.conteos = {
      actas: actas.count || 0, contratos: contratos.count || 0,
      docs: docs.count || 0, resguardos: resguardos.count || 0, recibos: recibos.count || 0,
      vacaciones: vacaciones.count || 0, ptu: ptu.count || 0, imss: imss.count || 0,
      capacitacion: capacitacion.count || 0, acuses: acuses.count || 0,
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
          tú debes demostrar ingreso, salario, jornada y pagos. Esto arma un ZIP con todo lo que tienes
          <strong>y un diagnóstico de lo que falta</strong> según el Art. 804.</span>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;">
          ${fila('contrato',  '', 'Contrato de trabajo',    'Art. 804 fr. I — se regenera al momento desde los datos actuales', true)}
          ${fila('recibos',   '', 'Recibos de nómina',      c.recibos ? `Art. 804 fr. II — ${c.recibos} recibo${c.recibos!==1?'s':''}` : 'Art. 804 fr. II — sin recibos generados', c.recibos > 0)}
          ${fila('raya',      '', 'Listas de raya consolidadas', c.recibos ? 'Art. 804 fr. II — nómina por período, en un solo Excel' : 'Sin recibos que consolidar', c.recibos > 0)}
          ${fila('asistencia','', 'Controles de asistencia','Art. 804 fr. III — faltas, retardos e incidencias', true)}
          ${fila('prestaciones','','Vacaciones, prima y aguinaldo', c.recibos || c.vacaciones ? 'Art. 804 fr. IV — comprobantes de prestaciones anuales' : 'Sin registros de prestaciones', (c.recibos + c.vacaciones) > 0)}
          ${fila('ptu',       '', 'Reparto de utilidades',  c.ptu ? `Art. 804 fr. IV — ${c.ptu} ejercicio${c.ptu!==1?'s':''}` : 'Art. 804 fr. IV — sin PTU registrada', c.ptu > 0)}
          ${fila('imss',      '', 'Movimientos ante el IMSS', c.imss ? `Art. 804 fr. IV — ${c.imss} movimiento${c.imss!==1?'s':''} (altas, bajas, modificaciones)` : 'Art. 804 fr. IV — sin movimientos registrados', c.imss > 0)}
          ${fila('actas',     '', 'Actas administrativas',  c.actas ? `${c.actas} acta${c.actas!==1?'s':''}` : 'Sin actas', c.actas > 0)}
          ${fila('resguardos','', 'Cartas responsivas',     c.resguardos ? `${c.resguardos} resguardo${c.resguardos!==1?'s':''} de equipo` : 'Sin resguardos', c.resguardos > 0)}
          ${fila('capacitacion','','Constancias de capacitación', c.capacitacion ? `Art. 153-V LFT — ${c.capacitacion} curso${c.capacitacion!==1?'s':''}` : 'Art. 153-V LFT — sin cursos registrados', c.capacitacion > 0)}
          ${fila('acuses',    '', 'Políticas y acuses de entrega', c.acuses ? `${c.acuses} acuse${c.acuses!==1?'s':''} (RIT, privacidad, protocolo)` : 'Sin acuses registrados', c.acuses > 0)}
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
  // Qué se encontró realmente. Alimenta el diagnóstico del Art. 804 del
  // índice: la lista de huecos vale más que el ZIP, porque es lo único que
  // se puede corregir ANTES de que llegue el citatorio.
  const hallado = {};

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
        indice.push(['Contrato de trabajo', '01-contrato/', '1 archivo']); hallado.contrato = 1;
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
        if (enRango.length) { indice.push(['Recibos de nómina', '02-recibos-de-nomina/', `${enRango.length} archivo(s)`]); hallado.recibos = enRango.length; }
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
          indice.push(['Historial de asistencia', '03-asistencia/', `${asist.length} registro(s)`]); hallado.asistencia = asist.length;
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
        if (actas?.length) { indice.push(['Actas administrativas', '04-actas/', `${actas.length} archivo(s)`]); hallado.actas = actas.length; }
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
          indice.push(['Cartas responsivas de equipo', '05-resguardos/', `${res.length} artículo(s)`]); hallado.resguardos = res.length;
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
        if (bajados) { indice.push(['Documentos del expediente', '06-expediente/', `${bajados} archivo(s)`]); hallado.docs = bajados; }
      } catch(e) { errores.push('Expediente: ' + e.message); }
    }

    // ── Carpetas del Art. 804 que faltaban ──────────────────────────────────

    // 2b. Listas de raya (Art. 804 fr. II). El artículo distingue "listas de
    // raya o nómina de personal" de los "recibos de pagos de salarios": son
    // dos supuestos, y exhibir sólo los recibos individuales deja al patrón
    // discutiendo si cumplió o no. El consolidado por período los cubre.
    if (sel('raya')) {
      paso('Consolidando las listas de raya…');
      try {
        const { data: filas } = await sb.from('recibos_nomina')
          .select('folio, dias_laborados, total_percepciones, total_deducciones, neto_pagar, fecha_pago, estado, periodos_nomina(nombre, fecha_inicio, fecha_fin, tipo)')
          .eq('trabajador_id', _KIT.trabajadorId)
          .order('created_at');
        const enRango = (filas || []).filter(r => {
          const f = r.periodos_nomina?.fecha_fin;
          return !f || ((!desde || f >= desde) && (!hasta || f <= hasta));
        });
        if (enRango.length) {
          _kitExcel(zip, '02b-listas-de-raya/lista-de-raya.xlsx', 'Lista de raya', enRango.map(r => ({
            'Período':        r.periodos_nomina?.nombre || '',
            'Tipo':           r.periodos_nomina?.tipo || '',
            'Del':            r.periodos_nomina?.fecha_inicio || '',
            'Al':             r.periodos_nomina?.fecha_fin || '',
            'Folio':          r.folio || '',
            'Días laborados': r.dias_laborados ?? '',
            'Percepciones':   r.total_percepciones ?? '',
            'Deducciones':    r.total_deducciones ?? '',
            'Neto pagado':    r.neto_pagar ?? '',
            'Fecha de pago':  r.fecha_pago || '',
            'Estado':         r.estado || '',
          })));
          indice.push(['Listas de raya (Art. 804 fr. II)', '02b-listas-de-raya/', `${enRango.length} período(s)`]);
          hallado.raya = enRango.length;
        }
      } catch(e) { errores.push('Listas de raya: ' + e.message); }
    }

    // 7. PTU (Art. 804 fr. IV)
    if (sel('ptu')) {
      paso('Reuniendo el reparto de utilidades…');
      try {
        const { data: filas } = await sb.from('ptu_detalle')
          .select('dias_trabajados, salario_promedio, parte_dias, parte_salario, total_ptu, ptu_ejercicios(ejercicio, utilidad_repartible, estado)')
          .eq('trabajador_id', _KIT.trabajadorId);
        if (filas?.length) {
          _kitExcel(zip, '07-ptu/reparto-de-utilidades.xlsx', 'PTU', filas.map(r => ({
            'Ejercicio':            r.ptu_ejercicios?.ejercicio ?? '',
            'Utilidad repartible':  r.ptu_ejercicios?.utilidad_repartible ?? '',
            'Estado del ejercicio': r.ptu_ejercicios?.estado || '',
            'Días trabajados':      r.dias_trabajados ?? '',
            'Salario promedio':     r.salario_promedio ?? '',
            'Parte por días':       r.parte_dias ?? '',
            'Parte por salario':    r.parte_salario ?? '',
            'PTU total':            r.total_ptu ?? '',
          })));
          indice.push(['Reparto de utilidades (Art. 804 fr. IV)', '07-ptu/', `${filas.length} ejercicio(s)`]);
          hallado.ptu = filas.length;
        }
      } catch(e) { errores.push('PTU: ' + e.message); }
    }

    // 8. Prestaciones anuales (Art. 804 fr. IV)
    if (sel('prestaciones')) {
      paso('Reuniendo vacaciones, prima y aguinaldo…');
      try {
        const [{ data: vac }, { data: rec }] = await Promise.all([
          sb.from('vacaciones')
            .select('tipo, fecha_inicio, fecha_fin, dias, estado, prima_vacacional, notas')
            .eq('trabajador_id', _KIT.trabajadorId).order('fecha_inicio'),
          sb.from('recibos_nomina')
            .select('folio, fecha_pago, aguinaldo_prop, prima_vacacional, periodos_nomina(nombre, fecha_fin)')
            .eq('trabajador_id', _KIT.trabajadorId).order('created_at'),
        ]);
        const pagos = (rec || []).filter(r => (r.aguinaldo_prop || 0) > 0 || (r.prima_vacacional || 0) > 0);
        let n = 0;
        if (vac?.length) {
          _kitExcel(zip, '08-prestaciones-anuales/vacaciones.xlsx', 'Vacaciones', vac.map(v => ({
            'Tipo': v.tipo || '', 'Del': v.fecha_inicio || '', 'Al': v.fecha_fin || '',
            'Días': v.dias ?? '', 'Estado': v.estado || '',
            'Prima vacacional': v.prima_vacacional ?? '', 'Notas': v.notas || '',
          })));
          n += vac.length;
        }
        if (pagos.length) {
          _kitExcel(zip, '08-prestaciones-anuales/aguinaldo-y-prima.xlsx', 'Aguinaldo y prima', pagos.map(r => ({
            'Período': r.periodos_nomina?.nombre || '', 'Fecha de pago': r.fecha_pago || r.periodos_nomina?.fecha_fin || '',
            'Folio': r.folio || '', 'Aguinaldo': r.aguinaldo_prop ?? '', 'Prima vacacional': r.prima_vacacional ?? '',
          })));
          n += pagos.length;
        }
        if (n) {
          indice.push(['Vacaciones, prima y aguinaldo (Art. 804 fr. IV)', '08-prestaciones-anuales/', `${n} registro(s)`]);
          hallado.prestaciones = n;
        }
      } catch(e) { errores.push('Prestaciones anuales: ' + e.message); }
    }

    // 9. Movimientos IMSS (Art. 804 fr. IV: "pagos, aportaciones y cuotas de
    //    seguridad social")
    if (sel('imss')) {
      paso('Reuniendo los movimientos del IMSS…');
      try {
        const { data: mov } = await sb.from('movimientos_imss')
          .select('tipo, fecha_movimiento, sbc_anterior, sbc_nuevo, causa_baja, estatus, exportado_at')
          .eq('trabajador_id', _KIT.trabajadorId).order('fecha_movimiento');
        if (mov?.length) {
          _kitExcel(zip, '09-imss/movimientos-afiliatorios.xlsx', 'IMSS', mov.map(m => ({
            'Tipo': m.tipo || '', 'Fecha del movimiento': m.fecha_movimiento || '',
            'SBC anterior': m.sbc_anterior ?? '', 'SBC nuevo': m.sbc_nuevo ?? '',
            'Causa de baja': m.causa_baja || '', 'Estatus': m.estatus || '',
            'Exportado': m.exportado_at || '',
          })));
          indice.push(['Movimientos ante el IMSS (Art. 804 fr. IV)', '09-imss/', `${mov.length} movimiento(s)`]);
          hallado.imss = mov.length;
        }
      } catch(e) { errores.push('IMSS: ' + e.message); }
    }

    // 10. Capacitación (Art. 153-V LFT, exigible por la fr. V del 804)
    if (sel('capacitacion')) {
      paso('Reuniendo las constancias de capacitación…');
      try {
        const { data: cursos } = await sb.from('capacitaciones').select('*')
          .eq('trabajador_id', _KIT.trabajadorId).order('fecha_inicio');
        if (cursos?.length) {
          _kitExcel(zip, '10-capacitacion/cursos.xlsx', 'Capacitación', cursos.map(c => ({
            'Curso': c.nombre_curso || '', 'Tipo': c.tipo || '', 'Área temática': c.area_tematica || '',
            'Horas': c.horas ?? '', 'Inicio': c.fecha_inicio || '', 'Fin': c.fecha_fin || '',
            'Instructor': c.instructor_nombre || '', 'Registro STPS': c.instructor_registro_stps || '',
            'Aprobado': c.aprobado ? 'Sí' : 'No',
          })));
          for (const c of cursos.filter(x => x.aprobado)) {
            try {
              const nom = (c.nombre_curso || c.id).replace(/[^\w\s-]/g,'').replace(/\s+/g,'-').toLowerCase().slice(0, 60);
              zip.file(`10-capacitacion/constancia-${nom}.pdf`,
                generateConstanciaDC3(empresa, t, c, sucursal, { asBlob: true }));
            } catch(e) { errores.push(`Constancia "${c.nombre_curso}": ${e.message}`); }
          }
          indice.push(['Constancias de capacitación (Art. 153-V LFT)', '10-capacitacion/', `${cursos.length} curso(s)`]);
          hallado.capacitacion = cursos.length;
        }
      } catch(e) { errores.push('Capacitación: ' + e.message); }
    }

    // 11. Políticas y acuses de entrega
    if (sel('acuses')) {
      paso('Reuniendo los acuses de políticas…');
      try {
        const { data: ac } = await sb.from('acuses_documentos')
          .select('documento, version, fecha_entrega, medio, observaciones')
          .eq('trabajador_id', _KIT.trabajadorId).order('fecha_entrega');
        if (ac?.length) {
          _kitExcel(zip, '11-politicas-y-acuses/acuses.xlsx', 'Acuses', ac.map(a => ({
            'Documento': _KIT_ETIQUETA_DOC[a.documento] || a.documento,
            'Versión': a.version || '', 'Fecha de entrega': a.fecha_entrega || '',
            'Medio': a.medio || '', 'Observaciones': a.observaciones || '',
          })));
          indice.push(['Políticas y acuses de entrega', '11-politicas-y-acuses/', `${ac.length} acuse(s)`]);
          hallado.acuses = ac.length;
          hallado.acusesPorDoc = ac.map(a => a.documento);
        }
      } catch(e) { errores.push('Acuses: ' + e.message); }
    }

    // Índice de contenido con el diagnóstico del Art. 804
    paso('Armando el índice…');
    try {
      zip.file('00-INDICE.pdf', _generarIndiceKit(t, indice, errores, hallado).output('blob'));
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

/** Etiquetas legibles de los acuses guardados en `acuses_documentos`. */
const _KIT_ETIQUETA_DOC = {
  rit: 'Reglamento Interior de Trabajo',
  protocolo_violencia: 'Protocolo de violencia laboral',
  aviso_privacidad: 'Aviso de privacidad',
  consentimiento_sensibles: 'Consentimiento de datos sensibles',
  consentimiento_monitoreo: 'Consentimiento de monitoreo',
  politica_nom035: 'Política NOM-035',
  anexo_teletrabajo: 'Anexo de teletrabajo',
  otro: 'Otro documento',
};

/** Escribe un arreglo de objetos como hoja de cálculo dentro del ZIP. */
function _kitExcel(zip, ruta, hoja, filas) {
  if (!window.XLSX || !filas?.length) return false;
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, hoja.slice(0, 31));
  zip.file(ruta, XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
  return true;
}

/**
 * Diagnóstico del Art. 804 LFT.
 *
 * El artículo enumera lo que el patrón está obligado a conservar y exhibir en
 * juicio, y el 805 sanciona la falta con la presunción de ser ciertos los
 * hechos que el trabajador afirme "en relación con tales documentos, salvo la
 * prueba en contrario". Ese "salvo prueba en contrario" importa: la presunción
 * admite desvirtuarse, pero el patrón entra al juicio con ella en contra.
 *
 * Devuelve una fila por fracción, diciendo si el ZIP la cubre y con qué.
 */
function _diagnostico804(hallado) {
  const si = (n) => (n ? `Sí — ${n}` : 'NO');
  return [
    {
      fraccion: 'I',
      documento: 'Contratos individuales de trabajo',
      cubierto: !!hallado.contrato,
      detalle: si(hallado.contrato ? '1 contrato' : 0),
      conservacion: 'Mientras dure la relación y hasta un año después.',
    },
    {
      fraccion: 'II',
      documento: 'Listas de raya o nómina, o recibos de pago de salarios',
      cubierto: !!(hallado.raya || hallado.recibos),
      detalle: [hallado.raya ? `lista de raya: ${hallado.raya} período(s)` : null,
                hallado.recibos ? `recibos: ${hallado.recibos}` : null]
                .filter(Boolean).join(' · ') || 'NO',
      conservacion: 'Último año y un año después de extinguida la relación.',
    },
    {
      fraccion: 'III',
      documento: 'Controles de asistencia',
      cubierto: !!hallado.asistencia,
      detalle: si(hallado.asistencia ? `${hallado.asistencia} registro(s)` : 0),
      conservacion: 'Último año y un año después de extinguida la relación.',
    },
    {
      fraccion: 'IV',
      documento: 'Comprobantes de PTU',
      cubierto: !!hallado.ptu,
      detalle: si(hallado.ptu ? `${hallado.ptu} ejercicio(s)` : 0),
      conservacion: 'Último año y un año después de extinguida la relación.',
    },
    {
      fraccion: 'IV',
      documento: 'Comprobantes de vacaciones, prima vacacional y aguinaldo',
      cubierto: !!hallado.prestaciones,
      detalle: si(hallado.prestaciones ? `${hallado.prestaciones} registro(s)` : 0),
      conservacion: 'Último año y un año después de extinguida la relación.',
    },
    {
      fraccion: 'IV',
      documento: 'Pagos, aportaciones y cuotas de seguridad social',
      cubierto: !!hallado.imss,
      detalle: si(hallado.imss ? `${hallado.imss} movimiento(s)` : 0),
      conservacion: 'Último año y un año después de extinguida la relación.',
    },
    {
      fraccion: 'V',
      documento: 'Constancias de capacitación (art. 153-V LFT)',
      cubierto: !!hallado.capacitacion,
      detalle: si(hallado.capacitacion ? `${hallado.capacitacion} curso(s)` : 0),
      conservacion: 'Conforme a las leyes que los rijan.',
    },
    {
      fraccion: 'V',
      documento: 'Acuses del RIT, protocolo y consentimientos de datos',
      cubierto: !!hallado.acuses,
      detalle: si(hallado.acuses ? `${hallado.acuses} acuse(s)` : 0),
      conservacion: 'Conforme a las leyes que los rijan.',
    },
  ];
}

/** PDF índice: qué trae el ZIP, qué falta según el Art. 804 y qué no se pudo incluir. */
function _generarIndiceKit(trab, filas, errores, hallado = {}) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  const ml = 25, mr = 25;
  let y = 25;

  const salto = (necesario = 20) => {
    if (y + necesario > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 22; }
  };

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
    y = doc.lastAutoTable.finalY + 12;
  }

  // ── Diagnóstico del Art. 804 ────────────────────────────────────────────
  // Va después del índice y antes de los errores: es lo que el patrón todavía
  // puede corregir. Los huecos se listan aunque el ZIP esté completo, porque
  // "completo" aquí significa "todo lo que hay", no "todo lo que se exige".
  const diag = _diagnostico804(hallado);
  const huecos = diag.filter(d => !d.cubierto);

  salto(40);
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 34, 48);
  doc.text('Diagnóstico del Art. 804 LFT', ml, y); y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90);
  const intro = doc.splitTextToSize(
    'El Art. 804 obliga al patrón a conservar y exhibir en juicio los documentos que se listan. El Art. 805 ' +
    'establece que su incumplimiento presume ciertos los hechos que el trabajador exprese en su demanda en ' +
    'relación con tales documentos, salvo prueba en contrario.', 165);
  doc.text(intro, ml, y); y += intro.length * 4.3 + 5;
  doc.setTextColor(0);

  if (typeof doc.autoTable === 'function') {
    doc.autoTable({
      startY: y, margin: { left: ml, right: mr },
      head: [['Fr.', 'Documento exigido', '¿En el expediente?', 'Plazo de conservación']],
      body: diag.map(d => [d.fraccion, d.documento, d.detalle, d.conservacion]),
      styles: { fontSize: 8, cellPadding: 2.2 },
      columnStyles: { 0: { cellWidth: 10 }, 2: { cellWidth: 34 }, 3: { cellWidth: 46 } },
      headStyles: { fillColor: [26, 34, 48] },
      // Se pinta la fila, no sólo la celda: el hueco tiene que saltar a la
      // vista de quien hojea el índice con el citatorio en la mano.
      didParseCell: (data) => {
        if (data.section === 'body' && !diag[data.row.index].cubierto) {
          data.cell.styles.fillColor = [255, 235, 230];
          data.cell.styles.textColor = [150, 45, 30];
        }
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  salto(30);
  if (huecos.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(180, 60, 40);
    doc.text(`Faltan ${huecos.length} de ${diag.length} documentos exigidos`, ml, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90);
    const adv = doc.splitTextToSize(
      'Sobre cada uno de los documentos faltantes opera la presunción del Art. 805: se tendrán por ciertos los ' +
      'hechos que el trabajador afirme respecto de ellos, salvo que se acrediten por otro medio. Reunirlos ahora ' +
      'cuesta días; hacerlo después del citatorio, normalmente ya no se puede.', 165);
    doc.text(adv, ml, y); y += adv.length * 4.3 + 6;
    doc.setTextColor(0);
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(21, 128, 61);
    doc.text('El expediente cubre los documentos del Art. 804.', ml, y); y += 8;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(0);
  }

  if (errores.length) {
    salto(20);
    doc.setFontSize(10);
    doc.setTextColor(180, 60, 40);
    doc.text('No se pudo incluir:', ml, y); y += 6;
    doc.setFontSize(8);
    for (const e of errores.slice(0, 20)) {
      salto(8);
      doc.text('• ' + String(e).slice(0, 95), ml + 2, y); y += 4.5;
    }
    doc.setTextColor(0);
  }

  return doc;
}
