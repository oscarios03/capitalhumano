/**
 * Capital Humano MX — Autenticación y Sesión
 * Requiere: config.js cargado antes
 */

// ─── INICIALIZACIÓN ───────────────────────────────────────────────────────────
// Guardamos la librería, creamos el cliente y lo dejamos como window.supabase
// para que db.js y app.js puedan usar `supabase.from(...)` sin conflicto.
;(function () {
  const lib = window.supabase;
  if (!lib) { console.error('Librería Supabase no cargó. Verifica tu internet.'); return; }

  const factory = typeof lib.createClient === 'function' ? lib.createClient : lib;
  try {
    window.supabase = factory(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.error('Error creando cliente Supabase:', e);
  }
})();

// Alias corto para no repetir window.supabase en cada función
const _sb = () => window.supabase;

// ─── SESIÓN ───────────────────────────────────────────────────────────────────
async function getSession() {
  const { data } = await _sb().auth.getSession();
  return data.session;
}

async function getUser() {
  const session = await getSession();
  return session?.user || null;
}

async function getContexto() {
  const user = await getUser();
  if (!user) return null;
  const { data: perfil } = await _sb()
    .from('perfiles').select('empresa_id, nombre, rol, sucursal_id, empresas(*)')
    .eq('id', user.id).single();
  return {
    user, perfil,
    empresa: perfil?.empresas || null,
    // Rol del usuario (migración 33). El gating de la UI que se apoya en esto
    // es cosmético: el candado real son las políticas RLS de Postgres.
    rol:        perfil?.rol || 'admin',
    sucursalId: perfil?.sucursal_id || null,
  };
}

// ─── AUTH ACTIONS ─────────────────────────────────────────────────────────────
async function login(email, password) {
  const { data, error } = await _sb().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function register(email, password, nombre, redirectTo) {
  const { data, error } = await _sb().auth.signUp({
    email, password,
    options: {
      data: { full_name: nombre },
      emailRedirectTo: redirectTo || window.location.href.split('?')[0].split('#')[0],
    }
  });
  if (error) throw error;
  return data;
}

async function logout() {
  await _sb().auth.signOut();
  window.location.href = 'index.html';
}

async function actualizarEmpresa(id, datos) {
  const { error } = await _sb().from('empresas').update(datos).eq('id', id);
  if (error) throw error;
}

// ─── GUARD ────────────────────────────────────────────────────────────────────
async function requireAuth() {
  const user = await getUser();
  if (!user) { window.location.href = 'index.html'; return null; }
  return user;
}
