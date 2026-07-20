/**
 * Capital Humano MX — Calendario de obligaciones patronales
 *
 * Card del Dashboard con lo que hay que pagar o presentar este mes. No usa
 * base de datos: son reglas fijas de ley más la configuración de la empresa.
 *
 * Fechas de referencia:
 *   · Cuotas IMSS mensuales — día 17 del mes siguiente (Art. 39 LSS)
 *   · RCV + INFONAVIT bimestrales — día 17 del mes siguiente al bimestre
 *     (Arts. 39 LSS y 29 Ley INFONAVIT). Bimestres: ene-feb, mar-abr, …
 *   · Variabilidad del SBC — primeros 5 días hábiles de enero, marzo, mayo,
 *     julio, septiembre y noviembre (Art. 34 fr. III LSS)
 *   · Prima de riesgo — declaración anual, a más tardar el último día de
 *     febrero (Art. 74 LSS)
 *   · Aguinaldo — antes del 20 de diciembre (Art. 87 LFT)
 *   · PTU — dentro de los 60 días siguientes a la declaración anual
 *     (Art. 122 LFT): 30 de mayo si eres persona moral, 29 de junio si física
 *   · ISN — estatal; la mayoría de los estados cobra el día 17, pero la fecha
 *     y la tasa varían. Se marca como "verifica en tu estado".
 *
 * Depende de: app.js (CTX, navigate), calculo.js (MESES), festivos.js (esFestivo)
 */

const MESES_BIMESTRE = [0, 2, 4, 6, 8, 10]; // ene, mar, may, jul, sep, nov

// ─── Helpers de fechas ───────────────────────────────────────────────────────

function _esHabil(d) {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  if (typeof esFestivo === 'function') {
    try { return !esFestivo(d.toISOString().split('T')[0]); } catch { /* sin festivos cargados */ }
  }
  return true;
}

/** Si la fecha cae en fin de semana o festivo, se recorre al siguiente día hábil. */
function _siguienteHabil(d) {
  const r = new Date(d);
  let guard = 0;
  while (!_esHabil(r) && guard++ < 14) r.setDate(r.getDate() + 1);
  return r;
}

/** N-ésimo día hábil del mes (1 = primero). */
function _nHabilDelMes(anio, mes, n) {
  const d = new Date(anio, mes, 1);
  let contados = 0, guard = 0;
  while (guard++ < 40) {
    if (_esHabil(d)) { contados++; if (contados === n) return new Date(d); }
    d.setDate(d.getDate() + 1);
  }
  return new Date(anio, mes, 5);
}

function _ultimoDiaDelMes(anio, mes) { return new Date(anio, mes + 1, 0); }

function _diasEntre(a, b) {
  const ms = new Date(b.getFullYear(), b.getMonth(), b.getDate())
           - new Date(a.getFullYear(), a.getMonth(), a.getDate());
  return Math.round(ms / 86400000);
}

/** ¿La empresa es persona moral? El RFC de 12 caracteres lo es; el de 13 es física. */
function _esPersonaMoral(empresa) {
  const rfc = (empresa?.rfc || '').replace(/[\s-]/g, '');
  return rfc.length === 12;
}

// ─── Cálculo de obligaciones ─────────────────────────────────────────────────

/**
 * Obligaciones vigentes alrededor de `hoy`: las que vencen este mes más las
 * vencidas del mes pasado que probablemente sigan pendientes.
 * @returns {Array} { id, titulo, detalle, fecha, fundamento, ruta }
 */
function calcularObligaciones(hoy = new Date(), empresa = null) {
  const e     = empresa || (typeof CTX !== 'undefined' && CTX?.empresa) || {};
  const anio  = hoy.getFullYear();
  const mes   = hoy.getMonth();
  const items = [];
  const nombreMes = m => (typeof MESES !== 'undefined' ? MESES[(m + 12) % 12] : '');

  // Se revisa el mes anterior, el actual y el siguiente, y luego se filtra por
  // ventana: así aparecen tanto lo vencido reciente como lo que ya viene.
  for (const offset of [-1, 0, 1]) {
    const d    = new Date(anio, mes + offset, 1);
    const a    = d.getFullYear();
    const m    = d.getMonth();
    const dia17 = _siguienteHabil(new Date(a, m, 17));

    // 1. Cuotas IMSS del mes anterior
    items.push({
      id: `imss-${a}-${m}`,
      titulo: 'Pago de cuotas IMSS',
      detalle: `Cuotas obrero-patronales de ${nombreMes(m - 1)}`,
      fecha: dia17,
      fundamento: 'Art. 39 LSS — a más tardar el día 17 del mes siguiente',
      ruta: 'reportes',
    });

    // 2. RCV + INFONAVIT del bimestre anterior (se pagan en meses impares)
    if (MESES_BIMESTRE.includes(m)) {
      items.push({
        id: `bimestral-${a}-${m}`,
        titulo: 'Pago bimestral RCV e INFONAVIT',
        detalle: `Retiro, cesantía y vejez + aportaciones INFONAVIT del bimestre ${nombreMes(m - 2)}–${nombreMes(m - 1)}`,
        fecha: dia17,
        fundamento: 'Art. 39 LSS y Art. 29 Ley INFONAVIT',
        ruta: 'reportes',
      });

      // 3. Variabilidad del SBC — primeros 5 días hábiles del mes impar
      items.push({
        id: `variabilidad-${a}-${m}`,
        titulo: 'Presentar variabilidad del SBC',
        detalle: `Recalcular el salario base de cotización con las percepciones variables del bimestre ${nombreMes(m - 2)}–${nombreMes(m - 1)} (horas extra, primas, comisiones, premios)`,
        fecha: _nHabilDelMes(a, m, 5),
        fundamento: 'Art. 34 fr. III LSS — primeros 5 días hábiles',
        ruta: 'imss',
      });
    }

    // 4. ISN estatal (solo si la empresa lo tiene configurado)
    if (parseFloat(e.isn_pct) > 0) {
      items.push({
        id: `isn-${a}-${m}`,
        titulo: 'Pago del Impuesto Sobre Nómina',
        detalle: `ISN de ${nombreMes(m - 1)}${e.entidad_federativa ? ' — ' + e.entidad_federativa : ''}. Verifica la fecha exacta en tu estado: varía.`,
        fecha: dia17,
        fundamento: 'Impuesto estatal — la tasa y el vencimiento cambian por entidad',
        ruta: 'reportes',
      });
    }

    // 5. Prima de riesgo — declaración anual de febrero
    if (m === 1) {
      items.push({
        id: `prima-riesgo-${a}`,
        titulo: 'Declaración anual de prima de riesgo',
        detalle: 'Determina tu prima de riesgo de trabajo del año y preséntala ante el IMSS. Actualízala luego en Mi Empresa para que el costo patronal cuadre.',
        fecha: _ultimoDiaDelMes(a, 1),
        fundamento: 'Art. 74 LSS — durante febrero',
        ruta: 'empresa',
      });
    }

    // 6. PTU — 60 días tras la declaración anual (Art. 122 LFT)
    const esPM = _esPersonaMoral(e);
    if ((esPM && m === 4) || (!esPM && m === 5)) {
      items.push({
        id: `ptu-${a}`,
        titulo: 'Pago de la PTU',
        detalle: esPM
          ? 'Reparto de utilidades del ejercicio anterior (persona moral: dentro de los 60 días tras la declaración del 31 de marzo)'
          : 'Reparto de utilidades del ejercicio anterior (persona física: dentro de los 60 días tras la declaración del 30 de abril)',
        fecha: esPM ? new Date(a, 4, 30) : new Date(a, 5, 29),
        fundamento: 'Art. 122 LFT',
        ruta: 'ptu',
      });
    }

    // 7. Aguinaldo
    if (m === 11) {
      items.push({
        id: `aguinaldo-${a}`,
        titulo: 'Pago del aguinaldo',
        detalle: 'Mínimo 15 días de salario a todos los trabajadores, incluidos los que ya no laboran (proporcional)',
        fecha: new Date(a, 11, 20),
        fundamento: 'Art. 87 LFT — antes del 20 de diciembre',
        ruta: 'aguinaldo',
      });
    }
  }

  // Ventana: de 20 días atrás (lo vencido que aún duele) a 45 días adelante
  return items
    .filter(o => { const d = _diasEntre(hoy, o.fecha); return d >= -20 && d <= 45; })
    .sort((a, b) => a.fecha - b.fecha);
}

// ─── Vista ───────────────────────────────────────────────────────────────────

function _estadoObligacion(hoy, fecha) {
  const d = _diasEntre(hoy, fecha);
  if (d < 0)  return { cls:'vencida',  label: d === -1 ? 'Venció ayer' : `Venció hace ${-d} días`, color:'var(--red-warn)',  bg:'rgba(192,57,43,.1)',  borde:'rgba(192,57,43,.3)' };
  if (d === 0) return { cls:'hoy',     label:'Vence HOY',                                          color:'var(--red-warn)',  bg:'rgba(192,57,43,.12)', borde:'rgba(192,57,43,.35)' };
  if (d <= 7)  return { cls:'semana',  label: d === 1 ? 'Vence mañana' : `En ${d} días`,           color:'var(--amber-warn)',          bg:'rgba(217,138,43,.1)', borde:'rgba(217,138,43,.3)' };
  return         { cls:'proxima', label:`En ${d} días`,                                            color:'var(--text-muted)',bg:'transparent',         borde:'var(--border)' };
}

/** HTML de la card "Obligaciones del mes" para el Dashboard. */
function renderObligacionesHTML(hoy = new Date()) {
  const obligaciones = calcularObligaciones(hoy);
  // Vencida y "por vencer" no son lo mismo: mezclarlas en un solo contador
  // haría creer que algo aún da tiempo cuando en realidad ya se pasó.
  const vencidas  = obligaciones.filter(o => _diasEntre(hoy, o.fecha) <  0).length;
  const porVencer = obligaciones.filter(o => { const d = _diasEntre(hoy, o.fecha); return d >= 0 && d <= 7; }).length;

  if (!obligaciones.length) {
    return `<div class="card animate-in" style="margin-top:16px;">
      <div class="card-header"><span class="card-title" style="display:inline-flex;align-items:center;gap:8px;">
        <svg class="ic" style="color:var(--text-muted);"><use href="#i-calendar"></use></svg> Obligaciones del mes
      </span></div>
      <div class="empty-state" style="padding:24px;">
        <div class="empty-state-icon"><svg class="ic"><use href="#i-check-circle"></use></svg></div>
        <div class="empty-state-title">Sin vencimientos próximos</div>
      </div>
    </div>`;
  }

  return `
  <div class="card animate-in" style="margin-top:16px;">
    <div class="card-header" style="margin-bottom:14px;">
      <span class="card-title" style="display:inline-flex;align-items:center;gap:8px;">
        <svg class="ic" style="color:var(--text-muted);"><use href="#i-calendar"></use></svg> Obligaciones del mes
        ${vencidas > 0 ? `<span style="background:var(--red-warn);color:#fff;font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:100px;">${vencidas} vencida${vencidas !== 1 ? 's' : ''}</span>` : ''}
        ${porVencer > 0 ? `<span style="background:var(--amber-warn);color:#1a2230;font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:100px;">${porVencer} por vencer</span>` : ''}
      </span>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${obligaciones.map(o => {
        const st = _estadoObligacion(hoy, o.fecha);
        return `
        <div style="display:flex;align-items:flex-start;gap:12px;padding:11px 14px;border-radius:var(--radius-md);
                    border:1px solid ${st.borde};background:${st.bg};${o.ruta ? 'cursor:pointer;' : ''}"
             ${o.ruta ? `onclick="navigate('${o.ruta}')"` : ''} title="${o.fundamento}">
          <div style="min-width:52px;text-align:center;">
            <div style="font-size:1.1rem;font-weight:700;line-height:1.1;color:${st.color};">${o.fecha.getDate()}</div>
            <div style="font-size:.66rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);">
              ${typeof MESES !== 'undefined' ? MESES[o.fecha.getMonth()].slice(0,3) : ''}
            </div>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:.88rem;">${o.titulo}</div>
            <div style="font-size:.78rem;color:var(--text-muted);margin-top:2px;">${o.detalle}</div>
            <div style="font-size:.7rem;color:var(--text-muted);opacity:.75;margin-top:3px;">${o.fundamento}</div>
          </div>
          <span style="font-size:.72rem;font-weight:700;color:${st.color};white-space:nowrap;">${st.label}</span>
        </div>`;
      }).join('')}
    </div>
    <div style="font-size:.72rem;color:var(--text-muted);margin-top:10px;">
      Fechas de referencia según la ley federal; las que caen en fin de semana o festivo se recorren al siguiente día hábil.
      El ISN es estatal y su vencimiento cambia por entidad — confírmalo con tu contador.
    </div>
  </div>`;
}
