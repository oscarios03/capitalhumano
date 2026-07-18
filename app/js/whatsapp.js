/**
 * Capital Humano MX — Enlaces de WhatsApp (wa.me)
 * Solo abre el chat con un mensaje prellenado: nunca envía automáticamente ni
 * adjunta archivos (wa.me no lo permite). El usuario decide si lo manda y
 * adjunta el PDF a mano — decisión explícita del proyecto.
 */

/**
 * Normaliza un teléfono mexicano a formato wa.me (52 + 10 dígitos, sin '+').
 * Acepta con o sin la "1" de móvil que WhatsApp exigía antes de 2019
 * (ej. "+52 1 55 1234 5678") y con o sin espacios/guiones/paréntesis.
 * @returns {string|null} "52XXXXXXXXXX" o null si no se puede normalizar.
 */
function normalizarTelMX(tel) {
  if (!tel) return null;
  let d = String(tel).replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('521')) d = '52' + d.slice(3);
  else if (d.length === 10) d = '52' + d;
  return (d.length === 12 && d.startsWith('52')) ? d : null;
}

/** Construye el link wa.me con mensaje prellenado. null si el teléfono no es válido. */
function buildWaLink(tel, mensaje) {
  const d = normalizarTelMX(tel);
  if (!d) return null;
  return `https://wa.me/${d}?text=${encodeURIComponent(mensaje)}`;
}

/**
 * HTML de un botón/enlace de WhatsApp. Si el trabajador no tiene teléfono
 * capturado, muestra un aviso discreto en vez del botón (no bloqueante).
 */
function htmlBotonWhatsApp(tel, mensaje, opts = {}) {
  const link = buildWaLink(tel, mensaje);
  if (!link) {
    return opts.ocultarSiFalta
      ? ''
      : `<span style="font-size:.72rem;color:var(--text-muted);" title="Captura el teléfono del trabajador en su perfil para poder escribirle por WhatsApp">📱 sin teléfono</span>`;
  }
  const clase = opts.clase || 'btn-secondary btn-sm';
  return `<a class="${clase}" style="text-decoration:none;display:inline-flex;align-items:center;gap:4px;" href="${link}" target="_blank" rel="noopener">📱 WhatsApp</a>`;
}
