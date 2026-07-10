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
  try {
    const trabajadores = await db.getTrabajadores();
    const main = eid('main-view');
    main.innerHTML = `
      <div class="view-header animate-in">
        <div><div class="view-title">📄 Contratos</div><div class="view-subtitle">Genera contratos PDF para cada trabajador</div></div>
      </div>
      <div class="alert alert-info animate-in">
        <span>ℹ️</span><span>Selecciona el tipo de contrato a generar. El tipo predeterminado corresponde al guardado en el perfil del trabajador.</span>
      </div>
      <div class="table-wrap animate-in">
        <table class="data-table">
          <thead><tr><th>Trabajador</th><th>Puesto</th><th>Contrato actual</th><th>Ingreso</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            ${trabajadores.length === 0
              ? `<tr><td colspan="6"><div class="empty-state"><div class="empty-state-icon">📄</div><div class="empty-state-title">Sin trabajadores</div></div></td></tr>`
              : trabajadores.map(t => {
                  const tipo = t.tipo_contrato || 'indeterminado';
                  const tipoLabel = (_TIPOS_CONTRATO.find(x => x.value === tipo || (tipo==='indefinido' && x.value==='indeterminado')) || {label: tipo}).label;
                  return `<tr>
                    <td><strong>${t.nombre}</strong></td>
                    <td>${t.puesto||'—'}</td>
                    <td><span style="font-size:.8rem;color:var(--text-secondary);">${tipoLabel}</span></td>
                    <td>${formatDateShort(t.fecha_ingreso)}</td>
                    <td>${badgeEstado(t.estado)}</td>
                    <td>
                      <div class="actions" style="position:relative;">
                        <div class="contrato-dropdown" id="dd-${t.id}">
                          <button class="btn-primary btn-sm" onclick="toggleContratoMenu('${t.id}')">
                            📄 Generar contrato ▾
                          </button>
                          <div class="contrato-menu" id="menu-${t.id}" style="display:none;">
                            ${_TIPOS_CONTRATO.map(op => `
                              <button class="contrato-menu-item ${op.value===tipo||((tipo==='indefinido'||!tipo)&&op.value==='indeterminado') ? 'activo' : ''}"
                                onclick="descargarContrato('${t.id}','${op.value}',this)">
                                📄 ${op.label}
                              </button>`).join('')}
                          </div>
                        </div>
                        <button class="btn-secondary btn-sm" style="border-color:var(--gold-border);color:var(--gold-primary);"
                          onclick="abrirAgenteIA('${t.id}','${tipo}')">🤖 IA</button>
                        <button class="btn-secondary btn-sm" onclick="navigate('empleado','${t.id}')">Ver perfil</button>
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

function _cerrarMenusContrato(e) {
  if (!e.target.closest('.contrato-dropdown')) {
    document.querySelectorAll('.contrato-menu').forEach(m => m.style.display = 'none');
  }
}

function toggleContratoMenu(trabId) {
  const menu = eid(`menu-${trabId}`);
  if (!menu) return;
  const visible = menu.style.display !== 'none';
  document.querySelectorAll('.contrato-menu').forEach(m => m.style.display = 'none');
  menu.style.display = visible ? 'none' : 'block';
}

async function descargarContrato(trabId, tipo, btn) {
  document.querySelectorAll('.contrato-menu').forEach(m => m.style.display = 'none');
  const orig = btn.textContent;
  btn.textContent = '⏳ Generando…'; btn.disabled = true;
  try {
    await generateContrato(trabId, tipo);
  } catch(e) { alert('Error: ' + e.message); }
  setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1800);
}
