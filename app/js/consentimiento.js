/**
 * Capital Humano MX — Consentimiento de cookies y registro de aceptación legal
 *
 * Dos responsabilidades separadas:
 *
 *  A) Banner de cookies. Google Ads y Meta Pixel NO deben dispararse antes de
 *     que la persona acepte. `initTracking()` (tracking.js) solo se llama si
 *     hay consentimiento previo guardado.
 *
 *  B) Registro de la aceptación del Aviso de Privacidad y los Términos en el
 *     alta, para poder acreditar quién aceptó qué versión y cuándo.
 *
 * REGLA DE ORO heredada de tracking.js: nada de esto puede romper el registro,
 * el login ni el pago. Todas las funciones atrapan sus propios errores.
 *
 * Requiere js/config.js (LEGAL_VERSION, TRACKING_CONFIG) cargado antes.
 */

const _CONSENT_KEY = 'ch_consent_cookies_v1';

// ═══════════════════════════════════════════════════════════════════════════
//  A) COOKIES DE MEDICIÓN
// ═══════════════════════════════════════════════════════════════════════════

/** 'aceptado' | 'rechazado' | null (sin decidir). Nunca lanza. */
function consentimientoCookies() {
  try { return localStorage.getItem(_CONSENT_KEY); } catch (_e) { return null; }
}

/**
 * Arranca el tracking SOLO si ya hay consentimiento. Sustituye a la llamada
 * directa a initTracking() que había en index.html y en las landings.
 */
function initTrackingConConsentimiento() {
  try {
    if (consentimientoCookies() === 'aceptado' && typeof initTracking === 'function') {
      initTracking();
    }
  } catch (e) {
    console.warn('consentimiento: no se pudo iniciar el tracking:', e);
  }
}

function _guardarConsentimiento(valor) {
  try { localStorage.setItem(_CONSENT_KEY, valor); } catch (_e) { /* modo privado */ }
  const banner = document.getElementById('ch-cookie-banner');
  if (banner) banner.remove();
  if (valor === 'aceptado') initTrackingConConsentimiento();
}

function aceptarCookies()  { _guardarConsentimiento('aceptado'); }
function rechazarCookies() { _guardarConsentimiento('rechazado'); }

/**
 * Pinta el banner si la persona todavía no decidió. Se llama en el
 * DOMContentLoaded de las páginas públicas (index.html y landings).
 * No se muestra dentro de la app autenticada: ahí no hay pixeles de medición,
 * solo almacenamiento técnicamente necesario para la sesión.
 */
function mostrarBannerCookies() {
  try {
    if (consentimientoCookies() !== null) return;          // ya decidió
    if (document.getElementById('ch-cookie-banner')) return; // ya está puesto
    // Si el tracking está apagado por configuración, no hay nada que consentir.
    if (typeof TRACKING_CONFIG === 'undefined' || !TRACKING_CONFIG?.TRACKING_ENABLED) return;

    const banner = document.createElement('div');
    banner.id = 'ch-cookie-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Consentimiento de cookies');
    banner.style.cssText =
      'position:fixed;left:16px;right:16px;bottom:16px;z-index:9998;max-width:720px;margin:0 auto;' +
      'background:#fff;border:1px solid var(--border,#dfe4ea);border-radius:12px;' +
      'box-shadow:0 8px 30px rgba(15,25,35,.16);padding:16px 18px;' +
      'display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;';

    const texto = document.createElement('p');
    texto.style.cssText = 'margin:0;flex:1 1 320px;font-size:.85rem;line-height:1.5;color:var(--text-secondary,#5a6672);';
    texto.textContent = 'Usamos cookies de medición de Google y Meta para entender qué campañas funcionan. Son opcionales: si las rechazas, la plataforma funciona igual. ';
    const enlace = document.createElement('a');
    // Las landings viven en /landing/, un nivel más abajo que el aviso.
    enlace.href = (window.location.pathname.includes('/landing/') ? '../' : '') + 'aviso-privacidad.html';
    enlace.textContent = 'Ver aviso de privacidad';
    enlace.style.fontSize = '.85rem';
    texto.appendChild(enlace);

    const acciones = document.createElement('div');
    acciones.style.cssText = 'display:flex;gap:8px;flex-shrink:0;';

    const btnRechazar = document.createElement('button');
    btnRechazar.type = 'button';
    btnRechazar.className = 'btn-secondary';
    btnRechazar.textContent = 'Rechazar';
    btnRechazar.addEventListener('click', rechazarCookies);

    const btnAceptar = document.createElement('button');
    btnAceptar.type = 'button';
    btnAceptar.className = 'btn-primary';
    btnAceptar.textContent = 'Aceptar';
    btnAceptar.addEventListener('click', aceptarCookies);

    // "Rechazar" primero y con el mismo peso visual que "Aceptar": un banner
    // que esconde el rechazo no obtiene un consentimiento válido.
    acciones.appendChild(btnRechazar);
    acciones.appendChild(btnAceptar);
    banner.appendChild(texto);
    banner.appendChild(acciones);
    document.body.appendChild(banner);
  } catch (e) {
    console.warn('consentimiento: no se pudo mostrar el banner:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  B) ACEPTACIÓN DEL AVISO DE PRIVACIDAD Y LOS TÉRMINOS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Registra en `consentimientos_legales` (migración 39) la aceptación del
 * usuario ya autenticado. Idempotente por versión: si ya existe un registro
 * de esa versión y documento, no duplica.
 *
 * Sobre la IP: el navegador no conoce su propia IP pública y NO se consulta a
 * ningún servicio externo para averiguarla — eso sería una transferencia de
 * datos nueva, no declarada, solo para llenar una columna. La columna `ip`
 * queda nula desde el cliente; la IP real de cada alta está en los logs de
 * Supabase Auth y se puede correlacionar por usuario_id + marca de tiempo.
 *
 * Best-effort: si falla, se loguea y NUNCA se interrumpe el flujo — a estas
 * alturas la cuenta ya está creada y bloquear al usuario sería peor. La
 * aceptación además queda duplicada en los metadatos del usuario en el alta
 * (ver `metadatosConsentimiento()`), que es el respaldo cuando el registro
 * requiere confirmación de correo y todavía no hay sesión.
 */
async function registrarConsentimientoLegal(sb) {
  try {
    if (!sb) return;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const version = typeof LEGAL_VERSION !== 'undefined' ? LEGAL_VERSION : 'desconocida';

    const { data: previos, error: errSel } = await sb
      .from('consentimientos_legales')
      .select('id')
      .eq('usuario_id', user.id)
      .eq('version', version)
      .limit(1);
    if (errSel) { console.warn('consentimiento: no se pudo consultar previos:', errSel.message); return; }
    if (previos?.length) return;

    const filas = ['aviso_privacidad', 'terminos'].map(doc => ({
      usuario_id: user.id,
      documento:  doc,
      version:    version,
      aceptado:   true,
      user_agent: (navigator.userAgent || '').slice(0, 400),
    }));

    const { error } = await sb.from('consentimientos_legales').insert(filas);
    if (error) console.warn('consentimiento: no se pudo registrar la aceptación:', error.message);
  } catch (e) {
    console.warn('consentimiento: error registrando aceptación (ignorado):', e);
  }
}

/**
 * Metadatos de aceptación para adjuntar a `signUp({ options: { data } })`.
 * Quedan en el usuario de Supabase Auth desde el instante del alta, incluso
 * si la confirmación de correo impide que haya sesión en ese momento.
 */
function metadatosConsentimiento() {
  return {
    legal_version:      typeof LEGAL_VERSION !== 'undefined' ? LEGAL_VERSION : 'desconocida',
    legal_aceptado_en:  new Date().toISOString(),
    legal_user_agent:   (navigator.userAgent || '').slice(0, 400),
  };
}
