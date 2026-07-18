/**
 * Capital Humano MX — Configuración Supabase
 *
 * INSTRUCCIONES:
 * 1. Ve a https://supabase.com y crea una cuenta gratuita
 * 2. Crea un nuevo proyecto
 * 3. En el dashboard ve a Settings → API
 * 4. Copia la "Project URL" y la "anon public" key abajo
 * 5. En el SQL Editor ejecuta el archivo setup.sql
 */

const SUPABASE_URL      = 'https://xqbzxkujooarntawzsoc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_AszON9V2sS11z0lKsr0gIA_eNhr04aR';

// ─── Constantes de Nómina 2026 ────────────────────────────────────────────
const UMA_DIARIA          = 113.14;   // Unidad de Medida y Actualización 2026
const IMSS_OBRERO_PCT     = 0.0225;   // 2.25% cuota obrero total simplificada
const INFONAVIT_PCT       = 0.05;     // 5% (aportación patronal — obrero no paga)
const FACTOR_INTEG_MIN    = 1.0452;   // Factor de integración mínimo LFT

// ─── Anthropic Claude API ──────────────────────────────────────────────────
// La API key vive en el servidor: supabase/functions/agente-ia/index.ts
// Configúrala con: supabase secrets set ANTHROPIC_API_KEY=sk-ant-tukey

// ─── Tracking de marketing (Google Ads + Meta Pixel) ──────────────────────
// Reemplaza los placeholders con los IDs reales antes de activar campañas.
// TRACKING_ENABLED en false desactiva toda la carga de scripts de tracking.
const TRACKING_CONFIG = {
  GOOGLE_ADS_ID:              'AW-XXXXXXXXXX',                  // ID de cuenta de Google Ads
  GOOGLE_CONVERSION_REGISTRO: 'AW-XXXXXXXXXX/etiqueta-registro', // Etiqueta de conversión: registro
  GOOGLE_CONVERSION_PAGO:     'AW-XXXXXXXXXX/etiqueta-pago',     // Etiqueta de conversión: pago
  META_PIXEL_ID:              'XXXXXXXXXXXXXXX',                 // ID del Pixel de Meta
  TRACKING_ENABLED:           true,
};
