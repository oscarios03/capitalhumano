/**
 * Capital Humano MX — Helper compartido de las landing pages
 *
 * propagarUTMs(nombreLanding):
 *   Reescribe los enlaces CTA (clase .cta-registro) para que lleven al
 *   registro (../index.html) los parámetros de atribución. Si la landing
 *   fue visitada con utm_* propios (viniendo de un anuncio), esos valores
 *   REEMPLAZAN los defaults del href para no perder la atribución real.
 *
 * Best-effort: cualquier error se degrada a console.warn y los CTAs
 * conservan su href original.
 */
function propagarUTMs(nombreLanding) {
  try {
    const actuales = new URLSearchParams(window.location.search);
    const llaves   = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

    document.querySelectorAll('a.cta-registro').forEach(a => {
      try {
        const url = new URL(a.getAttribute('href'), window.location.href);
        // Los utm_* de la URL actual (del anuncio) mandan sobre los defaults
        llaves.forEach(k => {
          const v = actuales.get(k);
          if (v) url.searchParams.set(k, v);
        });
        url.searchParams.set('lp', nombreLanding);
        a.setAttribute('href', url.pathname + url.search);
      } catch (e) {
        console.warn('landing: no se pudo reescribir CTA:', e);
      }
    });
  } catch (e) {
    console.warn('landing: propagarUTMs falló:', e);
  }
}
