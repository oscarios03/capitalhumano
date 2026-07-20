/**
 * Capital Humano MX — Módulo Contratos
 * Depende de: app.js (CTX, eid, navigate, db, helpers, generateContrato)
 */

// ═══════════════════════════════════════════════════════
//  CONTRATOS
// ═══════════════════════════════════════════════════════
const _TIPOS_CONTRATO = [
  { value:'indeterminado', label:'Tiempo Indeterminado' },
  { value:'determinado',   label:'Tiempo Determinado'  },
  { value:'obra',          label:'Por Obra o Proyecto'  },
  { value:'temporada',     label:'Por Temporada'        },
  { value:'comision',      label:'Por Comisión'         },
];

async function renderContratos() {
  const _gen = typeof _navGen !== 'undefined' ? _navGen : 0;
  try {
    const trabajadores = await db.getTrabajadores();
    if (typeof _navStale === 'function' && _navStale(_gen)) return;
    const main = eid('main-view');
    main.innerHTML = `
      <div class="view-header animate-in">
        <div><div class="view-title">Contratos</div><div class="view-subtitle">Genera contratos PDF para cada trabajador</div></div>
      </div>
      <div class="alert alert-info animate-in"><svg class="ic" style="flex-shrink:0;"><use href="#i-info"></use></svg><span>Selecciona el tipo de contrato a generar. El tipo predeterminado corresponde al guardado en el perfil del trabajador.</span>
      </div>
      <div class="table-wrap animate-in">
        <table class="data-table">
          <thead><tr><th>Trabajador</th><th>Puesto</th><th>Contrato actual</th><th>Ingreso</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            ${trabajadores.length === 0
              ? `<tr><td colspan="6"><div class="empty-state"><div class="empty-state-icon"><svg class="ic"><use href="#i-file"></use></svg></div><div class="empty-state-title">Sin trabajadores</div></div></td></tr>`
              : trabajadores.map(t => {
                  const tipo = t.tipo_contrato || 'indeterminado';
                  const tipoLabel = (_TIPOS_CONTRATO.find(x => x.value === tipo || (tipo==='indefinido' && x.value==='indeterminado')) || {label: tipo}).label;
                  return `<tr>
                    <td><strong>${escapeHtml(t.nombre)}</strong></td>
                    <td>${escapeHtml(t.puesto)||'—'}</td>
                    <td><span style="font-size:.8rem;color:var(--text-secondary);">${tipoLabel}</span></td>
                    <td>${formatDateShort(t.fecha_ingreso)}</td>
                    <td>${badgeEstado(t.estado)}</td>
                    <td>
                      <div class="actions" style="position:relative;">
                        <div class="contrato-dropdown" id="dd-${t.id}">
                          <button id="ddbtn-${t.id}" class="btn-primary btn-sm" onclick="toggleContratoMenu('${t.id}')"
                            aria-haspopup="true" aria-expanded="false" aria-controls="menu-${t.id}">
                            Generar contrato ▾
                          </button>
                          <div class="contrato-menu" id="menu-${t.id}" role="menu" style="display:none;">
                            ${_TIPOS_CONTRATO.map(op => `
                              <button class="contrato-menu-item ${op.value===tipo||((tipo==='indefinido'||!tipo)&&op.value==='indeterminado') ? 'activo' : ''}" role="menuitem"
                                onclick="descargarContrato('${t.id}','${op.value}',this)">
                                ${op.label}
                              </button>`).join('')}
                          </div>
                        </div>
                        <button class="btn-secondary btn-sm" style="border-color:var(--gold-border);color:var(--gold-primary);"
                          onclick="abrirAgenteIA('${t.id}','${tipo}')">IA</button>
                        <button class="btn-secondary btn-sm" onclick="navigate('empleado','${t.id}')">Ver perfil</button>
                        ${htmlBotonWhatsApp(t.telefono, `Hola ${t.nombre}, tu contrato (${tipoLabel}) ya está listo para firma. Pasa a RH o contesta este mensaje para coordinar cuándo firmarlo.`, { ocultarSiFalta: true })}
                      </div>
                    </td>
                  </tr>`;
                }).join('')
            }
          </tbody>
        </table>
      </div>
    `;
    document.addEventListener('click', _cerrarMenusContrato, { once: false });
  } catch(e) { showError(e); }
}

function _cerrarTodosMenusContrato() {
  document.querySelectorAll('.contrato-menu').forEach(m => m.style.display = 'none');
  document.querySelectorAll('.contrato-dropdown button[aria-haspopup]').forEach(b => b.setAttribute('aria-expanded', 'false'));
}

function _cerrarMenusContrato(e) {
  if (!e.target.closest('.contrato-dropdown')) _cerrarTodosMenusContrato();
}

// B-10: Escape cierra el menú de "Generar contrato" abierto (patrón consistente
// con el Escape que ya cierra modales/Agente IA en app.js).
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.querySelector('.contrato-menu[style*="block"]')) _cerrarTodosMenusContrato();
});

function toggleContratoMenu(trabId) {
  const menu = eid(`menu-${trabId}`);
  const btn  = eid(`ddbtn-${trabId}`);
  if (!menu) return;
  const visible = menu.style.display !== 'none';
  _cerrarTodosMenusContrato();
  menu.style.display = visible ? 'none' : 'block';
  if (btn) btn.setAttribute('aria-expanded', visible ? 'false' : 'true');
}

async function descargarContrato(trabId, tipo, btn) {
  document.querySelectorAll('.contrato-menu').forEach(m => m.style.display = 'none');
  const orig = btn.textContent;
  btnCargando(btn, 'Generando…');
  try {
    await generateContrato(trabId, tipo);
  } catch(e) { alert('Error: ' + e.message); }
  setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1800);
}
