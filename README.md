# Capital Humano MX

Plataforma de RRHH/nómina para México (LFT 2026). Vanilla HTML/CSS/JS, sin build tools.
Backend en Supabase.

## Estructura

- **`app/`** — La aplicación (SaaS). Este es el sitio que se despliega en Netlify.
  - `index.html` — login
  - `app.html` — SPA principal (post-login)
  - `kiosco.html` — pantalla de checador físico
  - `css/`, `js/` — estilos y lógica
  - `migrations/` — migraciones SQL numeradas (`00_setup.sql` en adelante). Ver
    `migrations/README.md` para el orden de aplicación en el SQL Editor de Supabase.
    **No se aplican automáticamente** — hay que correrlas manualmente.
  - `DEPLOY.md` — despliegue de las Edge Functions (secrets, `supabase functions deploy`)

- **`supabase/`** — Config del proyecto Supabase y Edge Functions (`agente-ia`,
  `checador-kiosco`, `checador-webhook`, `send-emails`).

- **`sitio/`** — Sitio público de marketing/herramientas, independiente de la app:
  - `landing.html` — landing de marketing de Capital Humano MX
  - `liquidalft/` — calculadora gratuita de liquidaciones/finiquitos (lead magnet)

- **`docs/`** — Documentación del proyecto (manual de usuario, integración de
  checadores físicos ZKTeco).

## Proyectos relacionados (repos separados)

- **LaborCRM** y el **servicio puente de checador** (agente Node.js que corre en una
  PC de oficina y reenvía pulsos de relojes checadores ZKTeco a la nube) viven en sus
  propios repositorios — tienen ciclos de despliegue distintos (LaborCRM tiene su
  propio backend Supabase; el puente se distribuye como `.exe` a instalar en PCs de
  clientes, no se despliega a la web).

## Deploy

`app/` se despliega en Netlify como sitio estático (`netlify.toml` en la raíz,
`publish = "app"`, sin build step). Las credenciales de Supabase en `app/js/config.js`
son la *publishable key* pública (protegida por RLS), diseñada para exponerse en el
cliente.

Para las Edge Functions y sus secrets, ver `app/DEPLOY.md`.
