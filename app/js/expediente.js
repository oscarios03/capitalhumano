/**
 * Capital Humano MX — Expediente Digital
 * Depende de: auth.js (CTX), db.js pattern (_q → window.supabase)
 */

const BUCKET = 'expedientes';
const _st = () => window.supabase.storage.from(BUCKET);

const expediente = {

  async subirDocumento(trabajadorId, archivo, tipoDocumento, descripcion) {
    try {
      const empresaId = CTX.empresa.id;
      const { data: { user } } = await window.supabase.auth.getUser();
      const ts = Date.now();
      const nombreSeguro = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${empresaId}/${trabajadorId}/${ts}_${nombreSeguro}`;

      const { error: upError } = await _st().upload(path, archivo, {
        cacheControl: '3600',
        upsert: false,
      });
      if (upError) return { data: null, error: upError };

      const { data, error } = await window.supabase
        .from('documentos_trabajador')
        .insert({
          empresa_id:     empresaId,
          trabajador_id:  trabajadorId,
          nombre_archivo: archivo.name,
          tipo_documento: tipoDocumento || 'otro',
          descripcion:    descripcion || null,
          storage_path:   path,
          subido_por:     user?.id || null,
        })
        .select()
        .single();

      if (error) {
        // Limpia el archivo si el registro falla
        await _st().remove([path]);
        return { data: null, error };
      }
      return { data, error: null };
    } catch (e) {
      return { data: null, error: e };
    }
  },

  async listarDocumentos(trabajadorId) {
    try {
      const { data, error } = await window.supabase
        .from('documentos_trabajador')
        .select('*')
        .eq('trabajador_id', trabajadorId)
        .order('created_at', { ascending: false });
      return { data: data || [], error };
    } catch (e) {
      return { data: [], error: e };
    }
  },

  async descargarDocumento(storagePath) {
    try {
      const { data, error } = await _st().createSignedUrl(storagePath, 3600);
      return { data, error };
    } catch (e) {
      return { data: null, error: e };
    }
  },

  async eliminarDocumento(documentoId, storagePath) {
    try {
      const { error: delStorage } = await _st().remove([storagePath]);
      if (delStorage) return { data: null, error: delStorage };

      const { error } = await window.supabase
        .from('documentos_trabajador')
        .delete()
        .eq('id', documentoId);
      return { data: !error, error };
    } catch (e) {
      return { data: null, error: e };
    }
  },
};

// ─── UI helpers ──────────────────────────────────────────────────────────────

// Los valores deben existir en el ENUM tipo_documento_enum (migraciones 12 y 34).
const TIPOS_DOCS = {
  contrato:             { icono: '', label: 'Contrato' },
  identificacion:       { icono: '', label: 'Identificación oficial (INE/pasaporte)' },
  curp_doc:             { icono: '', label: 'CURP impresa' },
  nss_doc:              { icono: '', label: 'Constancia de NSS' },
  csf:                  { icono: '', label: 'Constancia de situación fiscal' },
  acta_nacimiento:      { icono: '', label: 'Acta de nacimiento' },
  comprobante_domicilio:{ icono: '', label: 'Comprobante de domicilio' },
  titulo_cedula:        { icono: '', label: 'Título o cédula profesional' },
  examen_medico:        { icono: '', label: 'Examen médico' },
  acta:                 { icono: '', label: 'Acta administrativa' },
  justificante:         { icono: '', label: 'Justificante' },
  resguardo:            { icono: '', label: 'Carta responsiva (resguardo)' },
  otro:                 { icono: '', label: 'Otro' },
};

async function renderTabExpediente(trabajadorId) {
  const el = eid('tab-expediente');
  if (!el) return;
  el.innerHTML = `<div style="color:var(--text-muted);font-size:.85rem;padding:12px 0;">Cargando expediente…</div>`;

  const { data: docs, error } = await expediente.listarDocumentos(trabajadorId);
  if (error) {
    el.innerHTML = `<div class="alert alert-danger">Error al cargar documentos: ${friendlyError(error)}</div>`;
    return;
  }

  const listaHTML = docs.length === 0
    ? `<div class="empty-state">
         <div class="empty-state-icon"><svg class="ic"><use href="#i-file"></use></svg></div>
         <div class="empty-state-title">Aún no hay documentos en el expediente</div>
       </div>`
    : `<div class="table-wrap">
         <table class="data-table">
           <thead>
             <tr><th>Tipo</th><th>Nombre</th><th>Descripción</th><th>Fecha</th><th>Acciones</th></tr>
           </thead>
           <tbody>
             ${docs.map(d => {
               const t = TIPOS_DOCS[d.tipo_documento] || TIPOS_DOCS.otro;
               return `<tr>
                 <td><span title="${t.label}">${t.icono} <span style="font-size:.78rem;color:var(--text-muted);">${t.label}</span></span></td>
                 <td style="font-size:.88rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(d.nombre_archivo)}">${escapeHtml(d.nombre_archivo)}</td>
                 <td style="font-size:.82rem;color:var(--text-muted);">${escapeHtml(d.descripcion) || '—'}</td>
                 <td style="font-size:.82rem;white-space:nowrap;">${formatDateShort(d.created_at)}</td>
                 <td>
                   <div class="actions">
                     <button class="btn-secondary btn-sm" onclick="descargarDocExpediente('${d.id}','${d.storage_path}')">Descargar</button>
                     <button class="btn-danger btn-sm" onclick="eliminarDocExpediente('${d.id}','${d.storage_path}','${trabajadorId}')"><svg class="ic"><use href="#i-trash"></use></svg></button>
                   </div>
                 </td>
               </tr>`;
             }).join('')}
           </tbody>
         </table>
       </div>`;

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <strong>Expediente digital <span style="font-size:.8rem;font-weight:400;color:var(--text-muted);">(${docs.length} documento${docs.length !== 1 ? 's' : ''})</span></strong>
      <button class="btn-primary btn-sm" onclick="showFormSubirDocumento('${trabajadorId}')">+ Subir documento</button>
    </div>
    ${listaHTML}
    <div id="form-subir-doc" style="display:none;margin-top:18px;padding:16px;border:1.5px solid var(--border);border-radius:var(--radius-md);">
      <div style="font-weight:700;font-size:.9rem;margin-bottom:14px;">Subir nuevo documento</div>
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label" for="exp-archivo">Archivo <span class="req">*</span></label>
          <input id="exp-archivo" type="file" class="form-input" accept=".pdf,.jpg,.jpeg,.png" required aria-required="true" />
          <div class="helper-text">PDF, JPG o PNG — máximo 10 MB</div>
        </div>
        <div class="form-group">
          <label class="form-label" for="exp-tipo">Tipo de documento <span class="req">*</span></label>
          <select id="exp-tipo" class="form-select" required aria-required="true">
            ${Object.entries(TIPOS_DOCS).map(([v, t]) => `<option value="${v}">${t.icono} ${t.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group span-2">
          <label class="form-label" for="exp-desc">Descripción <span style="font-weight:400;color:var(--text-muted);">(opcional)</span></label>
          <input id="exp-desc" type="text" class="form-input" placeholder="Ej. Contrato firmado 2024, INE vigente…" maxlength="200" />
        </div>
      </div>
      <div id="exp-error" class="error-msg" role="alert" style="display:none;margin-bottom:8px;"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px;">
        <button class="btn-secondary btn-sm" onclick="cerrarFormSubirDocumento()">Cancelar</button>
        <button id="exp-btn-subir" class="btn-primary btn-sm" onclick="guardarDocExpediente('${trabajadorId}')">Subir</button>
      </div>
    </div>
  `;
}

function showFormSubirDocumento(trabajadorId) {
  const form = eid('form-subir-doc');
  if (form) { form.style.display = ''; form.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}

function cerrarFormSubirDocumento() {
  const form = eid('form-subir-doc');
  if (form) form.style.display = 'none';
}

async function guardarDocExpediente(trabajadorId) {
  const errEl = eid('exp-error');
  errEl.style.display = 'none';

  const archivoInput = eid('exp-archivo');
  const tipo         = eid('exp-tipo')?.value;
  const desc         = eid('exp-desc')?.value.trim();
  const archivo      = archivoInput?.files?.[0];

  if (!archivo) {
    errEl.textContent = 'Selecciona un archivo.';
    errEl.style.display = '';
    return;
  }
  if (archivo.size > 10 * 1024 * 1024) {
    errEl.textContent = 'El archivo excede el límite de 10 MB.';
    errEl.style.display = '';
    return;
  }

  const btn = eid('exp-btn-subir');
  btnCargando(btn, 'Subiendo…');

  const { error } = await expediente.subirDocumento(trabajadorId, archivo, tipo, desc);

  btnRestaurar(btn);

  if (error) {
    errEl.textContent = 'Error al subir: ' + friendlyError(error);
    errEl.style.display = '';
    return;
  }

  await renderTabExpediente(trabajadorId);
}

async function descargarDocExpediente(docId, storagePath) {
  const { data, error } = await expediente.descargarDocumento(storagePath);
  if (error || !data?.signedUrl) {
    alert('No se pudo generar el enlace de descarga: ' + (error ? friendlyError(error) : 'Error desconocido'));
    return;
  }
  const a = document.createElement('a');
  a.href = data.signedUrl;
  a.target = '_blank';
  a.rel = 'noopener';
  a.click();
}

async function eliminarDocExpediente(docId, storagePath, trabajadorId) {
  if (!(await showConfirmacion('¿Eliminar este documento? Esta acción no se puede deshacer.', { peligro:true, textoOk:'Eliminar' }))) return;
  const { error } = await expediente.eliminarDocumento(docId, storagePath);
  if (error) {
    alert('Error al eliminar: ' + friendlyError(error));
    return;
  }
  await renderTabExpediente(trabajadorId);
}
