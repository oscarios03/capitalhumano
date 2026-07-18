/**
 * Capital Humano MX — Tracking de marketing (Google Ads + Meta Pixel)
 *
 * REGLA DE ORO: todo el tracking es best-effort. Ningún error de gtag, fbq
 * o de red puede romper el registro, el pago ni la navegación. Todas las
 * funciones atrapan sus propios errores y solo emiten console.warn.
 *
 * Requiere que js/config.js (TRACKING_CONFIG) esté cargado antes.
 *
 * API pública:
 *   initTracking()                        → inyecta gtag.js y Meta Pixel (idempotente)
 *   trackRegistro(email)                  → conversión de registro (Google + Meta)
 *   trackPago(valorMXN, planNombre, eventId) → conversión de pago con deduplicación CAPI
 *   trackLandingView(nombreLanding)       → vista de landing (ViewContent + page_view)
 */

// Bandera interna para hacer initTracking() idempotente
let _trackingInicializado = false;

/** Configuración de tracking, o null si config.js no cargó. */
function _trackingCfg() {
  try {
    if (typeof TRACKING_CONFIG === 'undefined' || !TRACKING_CONFIG) return null;
    if (!TRACKING_CONFIG.TRACKING_ENABLED) return null;
    return TRACKING_CONFIG;
  } catch (_e) {
    return null;
  }
}

/**
 * SHA-256 en hexadecimal usando la Web Crypto API.
 * Normaliza a minúsculas y sin espacios (requisito de Meta Advanced Matching
 * y de Enhanced Conversions de Google). Devuelve null si no hay soporte
 * (contexto no seguro / navegador viejo) — el tracking sigue sin el hash.
 */
async function _sha256Hex(texto) {
  try {
    if (!texto || !window.crypto || !window.crypto.subtle) return null;
    const datos  = new TextEncoder().encode(String(texto).trim().toLowerCase());
    const buffer = await window.crypto.subtle.digest('SHA-256', datos);
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (e) {
    console.warn('tracking: no se pudo hashear el email:', e);
    return null;
  }
}

/**
 * Inyecta dinámicamente gtag.js (Google Ads) y el base code del Meta Pixel.
 * Idempotente: llamadas repetidas no duplican scripts ni re-inicializan.
 * Si un adblocker bloquea los scripts, los stubs (dataLayer / cola de fbq)
 * absorben las llamadas y nada truena.
 */
function initTracking() {
  const cfg = _trackingCfg();
  if (!cfg || _trackingInicializado) return;
  _trackingInicializado = true;

  // ── Google Ads (gtag.js) ──────────────────────────────────────────────
  try {
    if (!document.getElementById('ch-gtag-js')) {
      window.dataLayer = window.dataLayer || [];
      // Stub oficial de gtag: encola llamadas hasta que cargue el script
      window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      // allow_enhanced_conversions habilita user_data (email hasheado)
      window.gtag('config', cfg.GOOGLE_ADS_ID, { allow_enhanced_conversions: true });

      const s = document.createElement('script');
      s.id    = 'ch-gtag-js';
      s.async = true;
      s.src   = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(cfg.GOOGLE_ADS_ID);
      s.onerror = () => console.warn('tracking: gtag.js bloqueado o sin red (¿adblocker?)');
      document.head.appendChild(s);
    }
  } catch (e) {
    console.warn('tracking: error inicializando gtag:', e);
  }

  // ── Meta Pixel (base code) ────────────────────────────────────────────
  try {
    if (!window.fbq) {
      // Base code oficial de Meta (crea el stub fbq con cola interna)
      !function (f, b, e, v, n, t, s) {
        if (f.fbq) return; n = f.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
        n.queue = []; t = b.createElement(e); t.async = !0; t.id = 'ch-meta-pixel';
        t.src = v; t.onerror = function () { console.warn('tracking: Meta Pixel bloqueado o sin red (¿adblocker?)'); };
        s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
      }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

      window.fbq('init', cfg.META_PIXEL_ID);
      window.fbq('track', 'PageView');
    }
  } catch (e) {
    console.warn('tracking: error inicializando Meta Pixel:', e);
  }
}

/**
 * Conversión de REGISTRO (cuenta creada).
 * - Google Ads: evento de conversión + Enhanced Conversions (email SHA-256).
 * - Meta: CompleteRegistration + Advanced Matching (parámetro em hasheado).
 * Nunca lanza: cualquier fallo se degrada a console.warn.
 */
async function trackRegistro(email) {
  const cfg = _trackingCfg();
  if (!cfg) return;

  const emailHash = await _sha256Hex(email);

  // ── Google Ads ────────────────────────────────────────────────────────
  try {
    if (typeof window.gtag === 'function') {
      if (emailHash) {
        // Enhanced Conversions: email ya hasheado en el navegador
        window.gtag('set', 'user_data', { sha256_email_address: emailHash });
      }
      window.gtag('event', 'conversion', { send_to: cfg.GOOGLE_CONVERSION_REGISTRO });
    } else {
      console.warn('tracking: gtag no disponible, se omite conversión de registro');
    }
  } catch (e) {
    console.warn('tracking: error en conversión Google de registro:', e);
  }

  // ── Meta Pixel ────────────────────────────────────────────────────────
  try {
    if (typeof window.fbq === 'function') {
      if (emailHash) {
        // Advanced Matching manual: re-init con em (Meta lo permite y lo fusiona)
        window.fbq('init', cfg.META_PIXEL_ID, { em: emailHash });
      }
      window.fbq('track', 'CompleteRegistration');
    } else {
      console.warn('tracking: fbq no disponible, se omite CompleteRegistration');
    }
  } catch (e) {
    console.warn('tracking: error en evento Meta de registro:', e);
  }
}

/**
 * Conversión de PAGO (suscripción activada).
 * @param {number} valorMXN   Monto pagado en pesos mexicanos
 * @param {string} planNombre Nombre del plan (ej. 'Pyme', 'Full', 'Despacho')
 * @param {string} eventId    id del evento de Stripe — MISMO id que envía la
 *                            Conversions API server-side para que Meta deduplique.
 */
async function trackPago(valorMXN, planNombre, eventId) {
  const cfg = _trackingCfg();
  if (!cfg) return;

  const valor = Number(valorMXN) || 0;

  // ── Google Ads ────────────────────────────────────────────────────────
  try {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'conversion', {
        send_to:        cfg.GOOGLE_CONVERSION_PAGO,
        value:          valor,
        currency:       'MXN',
        transaction_id: eventId || undefined, // deduplica recargas de la página de éxito
      });
    } else {
      console.warn('tracking: gtag no disponible, se omite conversión de pago');
    }
  } catch (e) {
    console.warn('tracking: error en conversión Google de pago:', e);
  }

  // ── Meta Pixel ────────────────────────────────────────────────────────
  try {
    if (typeof window.fbq === 'function') {
      window.fbq('track', 'Purchase',
        { value: valor, currency: 'MXN', content_name: planNombre || '' },
        eventId ? { eventID: eventId } : undefined, // deduplicación con la Conversions API
      );
    } else {
      console.warn('tracking: fbq no disponible, se omite Purchase');
    }
  } catch (e) {
    console.warn('tracking: error en evento Meta de pago:', e);
  }
}

/**
 * Vista de landing page (para públicos de remarketing y optimización).
 * @param {string} nombreLanding Identificador de la landing (ej. 'nomina-pymes')
 */
function trackLandingView(nombreLanding) {
  const cfg = _trackingCfg();
  if (!cfg) return;

  // ── Google (page_view con nombre de landing) ──────────────────────────
  try {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', {
        page_title:    nombreLanding,
        page_location: window.location.href,
      });
    } else {
      console.warn('tracking: gtag no disponible, se omite page_view');
    }
  } catch (e) {
    console.warn('tracking: error en page_view de landing:', e);
  }

  // ── Meta (ViewContent) ────────────────────────────────────────────────
  try {
    if (typeof window.fbq === 'function') {
      window.fbq('track', 'ViewContent', { content_name: nombreLanding });
    } else {
      console.warn('tracking: fbq no disponible, se omite ViewContent');
    }
  } catch (e) {
    console.warn('tracking: error en ViewContent de landing:', e);
  }
}
