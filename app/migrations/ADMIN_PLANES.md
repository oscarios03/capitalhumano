# Administración de planes de suscripción

Todo se ejecuta en: **Supabase Dashboard → SQL Editor → New Query**.
Requiere haber aplicado `21_migration_planes.sql`.

## Planes disponibles

| Código | Trabajadores | Sucursales | Empresas | Trial | Agente IA |
|---|---|---|---|---|---|
| `free` | 5 | 0 | 1 | 7 días | ✗ |
| `pyme` | 50 | 5 | 1 | — | ✗ |
| `full` | ilimitado | ilimitado | 1 | — | ✓ |
| `despacho` | ilimitado | ilimitado | 10 | — | ✓ |
| `legacy` | ilimitado | ilimitado | 10 | — | ✓ (cuentas pre-existentes, no público) |

## Activar / cambiar el plan de un cliente

```sql
-- Plan Pyme por 1 mes (pagó por SPEI):
SELECT admin_set_plan('cliente@correo.com', 'pyme', 'active', 1, 'SPEI ref 12345 — jul 2026');

-- Plan Full sin fecha de corte (vigencia indefinida hasta que lo cambies):
SELECT admin_set_plan('cliente@correo.com', 'full');

-- Plan Despacho por 12 meses:
SELECT admin_set_plan('despacho@correo.com', 'despacho', 'active', 12, 'Transferencia anual');
```

Parámetros: `admin_set_plan(email, plan, estado='active', meses=NULL, notas=NULL)`.
Con `meses = NULL` la vigencia es indefinida; con un número, `current_period_end`
queda a `now() + N meses` y al vencer la cuenta pasa sola a **solo lectura**.

## Suspender / cancelar

```sql
-- Suspender por falta de pago (pasa a solo lectura de inmediato):
SELECT admin_set_plan('cliente@correo.com', 'pyme', 'past_due', NULL, 'Pago vencido jul 2026');

-- Cancelar definitivamente (solo lectura; sus datos no se tocan):
SELECT admin_set_plan('cliente@correo.com', 'free', 'canceled', NULL, 'Baja voluntaria');
```

## Extender un trial

```sql
UPDATE public.suscripciones
SET trial_ends_at = now() + interval '7 days', actualizado_en = now()
WHERE usuario_id = (SELECT id FROM auth.users WHERE email = 'cliente@correo.com');
```

## Definir precios (pendiente)

```sql
UPDATE public.planes SET precio_mensual = 499  WHERE codigo = 'pyme';
UPDATE public.planes SET precio_mensual = 999  WHERE codigo = 'full';
UPDATE public.planes SET precio_mensual = 1999 WHERE codigo = 'despacho';
```

## Consultas de monitoreo

```sql
-- Estado de todas las suscripciones (con estado efectivo derivado):
SELECT u.email, s.plan_codigo, s.estado, s.trial_ends_at, s.current_period_end,
       f.estado_efectivo, s.notas
FROM public.suscripciones s
JOIN auth.users u ON u.id = s.usuario_id
CROSS JOIN LATERAL public.fn_plan_de(s.usuario_id) f
ORDER BY s.actualizado_en DESC;

-- Trials que vencen en los próximos 3 días (candidatos a contactar):
SELECT u.email, s.trial_ends_at
FROM public.suscripciones s JOIN auth.users u ON u.id = s.usuario_id
WHERE s.estado = 'trialing' AND s.trial_ends_at BETWEEN now() AND now() + interval '3 days';

-- Suscripciones de pago que vencen este mes:
SELECT u.email, s.plan_codigo, s.current_period_end
FROM public.suscripciones s JOIN auth.users u ON u.id = s.usuario_id
WHERE s.estado = 'active' AND s.current_period_end IS NOT NULL
  AND s.current_period_end < now() + interval '30 days'
ORDER BY s.current_period_end;

-- Uso vs límites de un cliente:
SELECT u.email, f.plan_codigo, f.max_trabajadores, f.max_sucursales, f.max_empresas,
       (SELECT count(*) FROM public.trabajadores t
         JOIN public.usuario_empresas ue ON ue.empresa_id = t.empresa_id
        WHERE ue.usuario_id = u.id AND t.estado = 'activo') AS trabajadores_activos,
       (SELECT count(*) FROM public.usuario_empresas ue WHERE ue.usuario_id = u.id) AS empresas
FROM auth.users u
CROSS JOIN LATERAL public.fn_plan_de(u.id) f
WHERE u.email = 'cliente@correo.com';
```

## Notas técnicas

- Los límites se hacen cumplir con **triggers en Postgres** (errores
  `PLAN_SOLO_LECTURA`, `PLAN_LIMITE_*`, `PLAN_FEATURE_*`) — el frontend solo
  da la experiencia amable. Ni por consola del navegador ni por la API REST
  se pueden brincar.
- Las escrituras **sin JWT de usuario** (SQL Editor, service_role, edge
  functions del checador) NO pasan por los gates — por diseño.
- La tabla `suscripciones` no acepta escrituras de usuarios autenticados
  (sin políticas de INSERT/UPDATE/DELETE): solo `admin_set_plan`,
  `handle_new_user` (trial automático en signup) y service_role.
- El Agente IA se verifica además dentro de la edge function `agente-ia`
  (HTTP 403 si el plan no lo incluye).
