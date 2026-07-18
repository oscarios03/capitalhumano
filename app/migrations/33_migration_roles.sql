-- ============================================================================
-- Migración 33 — Roles y permisos (enforcement real en RLS)
-- ============================================================================
-- Cuatro roles, del más al menos privilegiado:
--   · admin      — todo, incluidos datos de la empresa y gestión de usuarios
--   · gerente    — todo excepto configuración de empresa, usuarios e
--                  integraciones del checador (llaves de API). Aprueba vacaciones.
--   · capturista — captura asistencia y checadas (opcionalmente limitado a una
--                  sucursal) y registra solicitudes de vacaciones. Lee el resto.
--   · consulta   — solo lectura (p. ej. el contador, o el cliente de un despacho)
--
-- El candado REAL vive aquí (RLS). El gating de la UI (plan.js/app.js) es solo
-- experiencia de usuario: un usuario técnico puede llamar a PostgREST directo
-- con su JWT, y ahí es donde estas políticas lo detienen.
--
-- Sustituye las políticas `FOR ALL` de tabla-por-empresa por cuatro políticas
-- separadas (SELECT / INSERT / UPDATE / DELETE). La regla de aislamiento
-- multiempresa (`empresa_id = mi_empresa_id()`) NO cambia: se conserva íntegra
-- en las cuatro.
--
-- CIERRA ADEMÁS DOS HUECOS DE SEGURIDAD PREEXISTENTES:
--   1. `usuario_empresas` tenía `FOR ALL USING (usuario_id = auth.uid())` sin
--      WITH CHECK. En Postgres, cuando se omite WITH CHECK en una política
--      FOR ALL, la expresión de USING se usa también para el INSERT: cualquier
--      usuario autenticado podía insertarse a sí mismo en CUALQUIER empresa
--      (con solo conocer su UUID) y luego llamar a set_empresa_activa() para
--      leer y escribir todos sus datos. Ahora solo un admin de esa empresa
--      puede crear el vínculo.
--   2. `perfiles` no permitía a un admin ver a los usuarios de su propia
--      empresa (USING id = auth.uid()), lo que hacía imposible administrarlos.
--
-- Idempotente: puede correrse múltiples veces.
-- ============================================================================

-- ── 1. Columnas y catálogo de roles ─────────────────────────────────────────

ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL;

-- Normalizar datos existentes antes de imponer el CHECK (los perfiles previos
-- traen 'admin' por default; cualquier valor desconocido se conserva como admin
-- para no degradar a nadie al migrar).
UPDATE public.perfiles
   SET rol = 'admin'
 WHERE rol IS NULL OR rol NOT IN ('admin','gerente','capturista','consulta');

UPDATE public.usuario_empresas
   SET rol = 'admin'
 WHERE rol IS NULL OR rol NOT IN ('admin','gerente','capturista','consulta');

ALTER TABLE public.perfiles          ALTER COLUMN rol SET DEFAULT 'admin';
ALTER TABLE public.usuario_empresas  ALTER COLUMN rol SET DEFAULT 'admin';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perfiles_rol_chk') THEN
    ALTER TABLE public.perfiles ADD CONSTRAINT perfiles_rol_chk
      CHECK (rol IN ('admin','gerente','capturista','consulta'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuario_empresas_rol_chk') THEN
    ALTER TABLE public.usuario_empresas ADD CONSTRAINT usuario_empresas_rol_chk
      CHECK (rol IN ('admin','gerente','capturista','consulta'));
  END IF;
END $$;

-- ── 2. Helpers de contexto ──────────────────────────────────────────────────
-- SECURITY DEFINER a propósito: leen `perfiles` saltándose RLS. Sin esto, una
-- política sobre `perfiles` que llamara a get_mi_rol() (que a su vez lee
-- `perfiles`) provocaría recursión infinita de políticas.
-- STABLE permite a Postgres evaluarlas una sola vez por consulta cuando se
-- envuelven en (SELECT ...), en vez de una vez por fila.

CREATE OR REPLACE FUNCTION public.mi_empresa_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT empresa_id FROM public.perfiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_mi_rol()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(rol, 'admin') FROM public.perfiles WHERE id = auth.uid();
$$;

-- NULL = sin restricción de sucursal (ve y captura todas)
CREATE OR REPLACE FUNCTION public.mi_sucursal_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sucursal_id FROM public.perfiles WHERE id = auth.uid();
$$;

/** ¿El usuario actual puede escribir datos operativos? (admin o gerente) */
CREATE OR REPLACE FUNCTION public.puede_gestionar()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(rol, 'admin') IN ('admin','gerente') FROM public.perfiles WHERE id = auth.uid();
$$;

/** ¿El usuario actual es admin de su empresa? */
CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(rol, 'admin') = 'admin' FROM public.perfiles WHERE id = auth.uid();
$$;

-- Postgres otorga EXECUTE a PUBLIC por defecto, así que revocar solo de `anon`
-- no serviría de nada: hay que quitárselo a PUBLIC y otorgarlo explícitamente.
REVOKE EXECUTE ON FUNCTION public.mi_empresa_id(), public.get_mi_rol(),
                            public.mi_sucursal_id(), public.puede_gestionar(),
                            public.es_admin() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mi_empresa_id(), public.get_mi_rol(),
                            public.mi_sucursal_id(), public.puede_gestionar(),
                            public.es_admin() TO authenticated;

-- ── 3. Trigger de perfiles: permitir el cambio de rol por vía autorizada ────
-- Supersede a zz_perfiles_bloquear_cambio_empresa() de la auditoría previa,
-- que ya impedía a un usuario cambiarse su propio rol o su empresa. Se agrega
-- la compuerta `app.allow_rol_change`, que solo activa admin_set_rol().
-- Sin esto, ni siquiera un admin podría cambiar el rol de otro usuario: el
-- trigger dispara para cualquier UPDATE con auth.uid() no nulo, sea propio o no.

CREATE OR REPLACE FUNCTION public.zz_perfiles_bloquear_cambio_empresa()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
     AND current_setting('app.allow_empresa_change', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'No puedes cambiar tu empresa directamente. Usa set_empresa_activa().';
  END IF;

  IF (NEW.rol IS DISTINCT FROM OLD.rol OR NEW.sucursal_id IS DISTINCT FROM OLD.sucursal_id)
     AND current_setting('app.allow_rol_change', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'No puedes cambiar roles directamente. Usa admin_set_rol().';
  END IF;

  RETURN NEW;
END; $$;

-- ── 4. Invitaciones ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invitaciones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  rol         TEXT NOT NULL DEFAULT 'consulta'
              CHECK (rol IN ('admin','gerente','capturista','consulta')),
  sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL,
  invitada_por UUID REFERENCES auth.users(id),
  usada       BOOLEAN NOT NULL DEFAULT false,
  usada_por   UUID REFERENCES auth.users(id),
  usada_en    TIMESTAMPTZ,
  expira_en   TIMESTAMPTZ NOT NULL DEFAULT now() + interval '14 days',
  creada_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invitaciones_email_idx   ON public.invitaciones (lower(email)) WHERE NOT usada;
CREATE INDEX IF NOT EXISTS invitaciones_empresa_idx ON public.invitaciones (empresa_id);

ALTER TABLE public.invitaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invitaciones_select ON public.invitaciones;
CREATE POLICY invitaciones_select ON public.invitaciones FOR SELECT TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id()));

DROP POLICY IF EXISTS invitaciones_insert ON public.invitaciones;
CREATE POLICY invitaciones_insert ON public.invitaciones FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT public.mi_empresa_id()) AND (SELECT public.es_admin()));

DROP POLICY IF EXISTS invitaciones_delete ON public.invitaciones;
CREATE POLICY invitaciones_delete ON public.invitaciones FOR DELETE TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id()) AND (SELECT public.es_admin()));
-- Sin política de UPDATE: solo handle_new_user() (SECURITY DEFINER) marca `usada`.

-- ── 5. handle_new_user: consumir la invitación al registrarse ───────────────
-- ⚠️ SUPERSEDE la definición de la migración 21 (planes). Incluye su alta de
-- suscripción de prueba, condicionada a que la tabla exista, para que esta
-- versión funcione con o sin la 21 aplicada. Si algún día se re-aplica la 21
-- por separado, hay que volver a correr ESTA migración (ver README).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv public.invitaciones%ROWTYPE;
BEGIN
  SELECT * INTO v_inv
    FROM public.invitaciones
   WHERE lower(email) = lower(new.email)
     AND NOT usada
     AND expira_en > now()
   ORDER BY creada_en DESC
   LIMIT 1;

  -- Sin invitación: perfil suelto que creará su propia empresa (flujo actual).
  -- Con invitación: entra a la empresa que lo invitó, con el rol asignado.
  INSERT INTO public.perfiles (id, nombre, empresa_id, rol, sucursal_id)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    v_inv.empresa_id,
    COALESCE(v_inv.rol, 'admin'),
    v_inv.sucursal_id
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_inv.id IS NOT NULL THEN
    UPDATE public.invitaciones
       SET usada = true, usada_por = new.id, usada_en = now()
     WHERE id = v_inv.id;

    INSERT INTO public.usuario_empresas (usuario_id, empresa_id, rol)
    VALUES (new.id, v_inv.empresa_id, v_inv.rol)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Suscripción de prueba (migración 21). El IF evita romper el registro
  -- cuando la 21 todavía no se ha aplicado: plpgsql no resuelve la tabla
  -- hasta que la rama se ejecuta.
  IF to_regclass('public.suscripciones') IS NOT NULL THEN
    INSERT INTO public.suscripciones (usuario_id, plan_codigo, estado, trial_ends_at)
    SELECT new.id, 'free', 'trialing', now() + COALESCE(p.trial_dias, 7) * interval '1 day'
      FROM public.planes p WHERE p.codigo = 'free'
    ON CONFLICT (usuario_id) DO NOTHING;
  END IF;

  RETURN new;
END; $$;

-- ── 6. admin_set_rol: única vía para cambiar el rol de alguien ─────────────

CREATE OR REPLACE FUNCTION public.admin_set_rol(
  p_usuario_id UUID, p_rol TEXT, p_sucursal_id UUID DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa   UUID := public.mi_empresa_id();
  v_admins    INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'ROL_NO_AUTORIZADO: solo un administrador puede cambiar roles.';
  END IF;
  IF p_rol NOT IN ('admin','gerente','capturista','consulta') THEN
    RAISE EXCEPTION 'Rol inválido: %', p_rol;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.perfiles WHERE id = p_usuario_id AND empresa_id = v_empresa) THEN
    RAISE EXCEPTION 'Ese usuario no pertenece a tu empresa.';
  END IF;
  -- La sucursal, si se indica, debe ser de la misma empresa
  IF p_sucursal_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.sucursales WHERE id = p_sucursal_id AND empresa_id = v_empresa) THEN
    RAISE EXCEPTION 'Esa sucursal no pertenece a tu empresa.';
  END IF;

  -- No dejar a la empresa sin ningún administrador
  IF p_rol <> 'admin' THEN
    SELECT COUNT(*) INTO v_admins
      FROM public.perfiles WHERE empresa_id = v_empresa AND rol = 'admin' AND id <> p_usuario_id;
    IF v_admins = 0 THEN
      RAISE EXCEPTION 'ROL_ULTIMO_ADMIN: la empresa quedaría sin administrador. Nombra otro admin antes de cambiar este.';
    END IF;
  END IF;

  PERFORM set_config('app.allow_rol_change', 'true', true);
  UPDATE public.perfiles
     SET rol = p_rol,
         sucursal_id = CASE WHEN p_rol = 'capturista' THEN p_sucursal_id ELSE NULL END
   WHERE id = p_usuario_id;

  UPDATE public.usuario_empresas
     SET rol = p_rol
   WHERE usuario_id = p_usuario_id AND empresa_id = v_empresa;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_set_rol(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_rol(UUID, TEXT, UUID) TO authenticated;

/** Usuarios de mi empresa, para la pantalla de administración. */
CREATE OR REPLACE FUNCTION public.listar_usuarios_empresa()
RETURNS TABLE (id UUID, nombre TEXT, email TEXT, rol TEXT, sucursal_id UUID, sucursal_nombre TEXT, es_yo BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.nombre, u.email::text, p.rol, p.sucursal_id, s.nombre, p.id = auth.uid()
    FROM public.perfiles p
    JOIN auth.users u ON u.id = p.id
    LEFT JOIN public.sucursales s ON s.id = p.sucursal_id
   WHERE p.empresa_id = public.mi_empresa_id()
     AND public.es_admin()
   ORDER BY p.nombre;
$$;

REVOKE EXECUTE ON FUNCTION public.listar_usuarios_empresa() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.listar_usuarios_empresa() TO authenticated;

-- ── 7. Políticas estándar por tabla ────────────────────────────────────────
-- Lectura: cualquier rol de la empresa. Escritura: admin y gerente.
-- Se eliminan primero TODAS las políticas previas de cada tabla (sus nombres
-- varían: *_own, trab_own, nomina_own…) y se recrean las cuatro nuevas.

DO $$
DECLARE
  t    TEXT;
  pol  TEXT;
  tablas TEXT[] := ARRAY[
    'actas','alertas','bajas','contratos','descuentos_aplicados','descuentos_trabajador',
    'documentos_trabajador','email_queue','historial_salarios','incapacidades',
    'movimientos_imss','periodos_nomina','prestaciones_trabajador','ptu_ejercicios',
    'puestos','recibos_nomina','resguardos','sucursales','trabajadores'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
    END LOOP;

    EXECUTE format($f$
      CREATE POLICY %1$I ON public.%2$I FOR SELECT TO authenticated
        USING (empresa_id = (SELECT public.mi_empresa_id()))$f$, t || '_select', t);

    EXECUTE format($f$
      CREATE POLICY %1$I ON public.%2$I FOR INSERT TO authenticated
        WITH CHECK (empresa_id = (SELECT public.mi_empresa_id())
                    AND (SELECT public.puede_gestionar()))$f$, t || '_insert', t);

    EXECUTE format($f$
      CREATE POLICY %1$I ON public.%2$I FOR UPDATE TO authenticated
        USING (empresa_id = (SELECT public.mi_empresa_id())
               AND (SELECT public.puede_gestionar()))
        WITH CHECK (empresa_id = (SELECT public.mi_empresa_id())
                    AND (SELECT public.puede_gestionar()))$f$, t || '_update', t);

    EXECUTE format($f$
      CREATE POLICY %1$I ON public.%2$I FOR DELETE TO authenticated
        USING (empresa_id = (SELECT public.mi_empresa_id())
               AND (SELECT public.puede_gestionar()))$f$, t || '_delete', t);
  END LOOP;
END $$;

-- ── 8. Tablas con reglas propias ───────────────────────────────────────────

-- 8.1 asistencia y checadas — el capturista SÍ escribe (es su trabajo).
--     Si tiene sucursal asignada, solo sobre trabajadores de esa sucursal.
--     (El kiosco y los relojes físicos entran por Edge Functions con
--      service_role y registrar_checada(), que ignoran RLS: no se ven afectados.)
DO $$
DECLARE
  t TEXT; pol TEXT;
  cond_escribe TEXT := $c$(
      (SELECT public.puede_gestionar())
      OR ((SELECT public.get_mi_rol()) = 'capturista' AND (
            (SELECT public.mi_sucursal_id()) IS NULL
            OR trabajador_id IN (SELECT id FROM public.trabajadores
                                  WHERE sucursal_id = (SELECT public.mi_sucursal_id()))
      ))
  )$c$;
BEGIN
  FOREACH t IN ARRAY ARRAY['asistencia','checadas'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
    END LOOP;

    EXECUTE format($f$
      CREATE POLICY %1$I ON public.%2$I FOR SELECT TO authenticated
        USING (empresa_id = (SELECT public.mi_empresa_id()))$f$, t || '_select', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
         WITH CHECK (empresa_id = (SELECT public.mi_empresa_id()) AND %s)',
      t || '_insert', t, cond_escribe);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING (empresa_id = (SELECT public.mi_empresa_id()) AND %s)
         WITH CHECK (empresa_id = (SELECT public.mi_empresa_id()) AND %s)',
      t || '_update', t, cond_escribe, cond_escribe);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
         USING (empresa_id = (SELECT public.mi_empresa_id()) AND %s)',
      t || '_delete', t, cond_escribe);
  END LOOP;
END $$;

-- 8.2 vacaciones — el capturista registra la solicitud; solo admin/gerente
--     aprueba o rechaza (UPDATE) y borra.
DO $$
DECLARE pol TEXT;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='vacaciones' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.vacaciones', pol);
  END LOOP;
END $$;

CREATE POLICY vacaciones_select ON public.vacaciones FOR SELECT TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id()));
CREATE POLICY vacaciones_insert ON public.vacaciones FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT public.mi_empresa_id())
              AND (SELECT public.get_mi_rol()) IN ('admin','gerente','capturista'));
CREATE POLICY vacaciones_update ON public.vacaciones FOR UPDATE TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id()) AND (SELECT public.puede_gestionar()))
  WITH CHECK (empresa_id = (SELECT public.mi_empresa_id()) AND (SELECT public.puede_gestionar()));
CREATE POLICY vacaciones_delete ON public.vacaciones FOR DELETE TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id()) AND (SELECT public.puede_gestionar()));

-- 8.3 empresas — solo el admin edita los datos fiscales y la config patronal
DO $$
DECLARE pol TEXT;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='empresas' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.empresas', pol);
  END LOOP;
END $$;

CREATE POLICY empresas_select ON public.empresas FOR SELECT TO authenticated
  USING (id = (SELECT public.mi_empresa_id()));
CREATE POLICY empresas_update ON public.empresas FOR UPDATE TO authenticated
  USING (id = (SELECT public.mi_empresa_id()) AND (SELECT public.es_admin()))
  WITH CHECK (id = (SELECT public.mi_empresa_id()) AND (SELECT public.es_admin()));
-- INSERT bloqueado: las empresas se crean solo por setup_empresa() (SECURITY DEFINER),
-- que aplica los límites del plan. Se conserva el candado previo.
CREATE POLICY empresas_insert ON public.empresas FOR INSERT TO authenticated
  WITH CHECK (false);

-- 8.4 integraciones_checador — contiene hashes de llaves de API: solo admin
DO $$
DECLARE pol TEXT;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='integraciones_checador' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.integraciones_checador', pol);
  END LOOP;
END $$;

CREATE POLICY integraciones_checador_select ON public.integraciones_checador FOR SELECT TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id()) AND (SELECT public.es_admin()));
CREATE POLICY integraciones_checador_write ON public.integraciones_checador FOR ALL TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id()) AND (SELECT public.es_admin()))
  WITH CHECK (empresa_id = (SELECT public.mi_empresa_id()) AND (SELECT public.es_admin()));

-- 8.5 ptu_detalle — no tiene empresa_id; cuelga de ptu_ejercicios
DO $$
DECLARE pol TEXT;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='ptu_detalle' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.ptu_detalle', pol);
  END LOOP;
END $$;

CREATE POLICY ptu_detalle_select ON public.ptu_detalle FOR SELECT TO authenticated
  USING (ptu_ejercicio_id IN (SELECT id FROM public.ptu_ejercicios
                               WHERE empresa_id = (SELECT public.mi_empresa_id())));
CREATE POLICY ptu_detalle_write ON public.ptu_detalle FOR ALL TO authenticated
  USING (ptu_ejercicio_id IN (SELECT id FROM public.ptu_ejercicios
                               WHERE empresa_id = (SELECT public.mi_empresa_id()))
         AND (SELECT public.puede_gestionar()))
  WITH CHECK (ptu_ejercicio_id IN (SELECT id FROM public.ptu_ejercicios
                                    WHERE empresa_id = (SELECT public.mi_empresa_id()))
              AND (SELECT public.puede_gestionar()));

-- 8.6 dias_festivos — los oficiales (empresa_id NULL) los ve todo el mundo;
--     los propios los administra admin/gerente
DO $$
DECLARE pol TEXT;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='dias_festivos' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.dias_festivos', pol);
  END LOOP;
END $$;

CREATE POLICY dias_festivos_select ON public.dias_festivos FOR SELECT TO authenticated
  USING (empresa_id IS NULL OR empresa_id = (SELECT public.mi_empresa_id()));
CREATE POLICY dias_festivos_insert ON public.dias_festivos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT public.mi_empresa_id()) AND (SELECT public.puede_gestionar()));
CREATE POLICY dias_festivos_update ON public.dias_festivos FOR UPDATE TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id()) AND (SELECT public.puede_gestionar()))
  WITH CHECK (empresa_id = (SELECT public.mi_empresa_id()) AND (SELECT public.puede_gestionar()));
CREATE POLICY dias_festivos_delete ON public.dias_festivos FOR DELETE TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id()) AND (SELECT public.puede_gestionar()));

-- 8.7 perfiles — cada quien ve y edita su propia fila (nombre); un admin ve
--     además a los usuarios de su empresa. El rol solo se mueve por
--     admin_set_rol() (lo impone el trigger zz_perfiles_bloquear_cambio).
DO $$
DECLARE pol TEXT;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='perfiles' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.perfiles', pol);
  END LOOP;
END $$;

CREATE POLICY perfiles_select ON public.perfiles FOR SELECT TO authenticated
  USING (id = auth.uid()
         OR (empresa_id = (SELECT public.mi_empresa_id()) AND (SELECT public.es_admin())));
CREATE POLICY perfiles_insert ON public.perfiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY perfiles_update ON public.perfiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- 8.8 usuario_empresas — CIERRE DEL HUECO: antes cualquiera podía vincularse
--     a sí mismo con cualquier empresa. Ahora se ven los vínculos propios (para
--     el switcher) y solo un admin de la empresa destino puede crearlos.
DO $$
DECLARE pol TEXT;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='usuario_empresas' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.usuario_empresas', pol);
  END LOOP;
END $$;

CREATE POLICY usuario_empresas_select ON public.usuario_empresas FOR SELECT TO authenticated
  USING (usuario_id = auth.uid()
         OR (empresa_id = (SELECT public.mi_empresa_id()) AND (SELECT public.es_admin())));
CREATE POLICY usuario_empresas_insert ON public.usuario_empresas FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT public.mi_empresa_id()) AND (SELECT public.es_admin()));
CREATE POLICY usuario_empresas_update ON public.usuario_empresas FOR UPDATE TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id()) AND (SELECT public.es_admin()))
  WITH CHECK (empresa_id = (SELECT public.mi_empresa_id()) AND (SELECT public.es_admin()));
CREATE POLICY usuario_empresas_delete ON public.usuario_empresas FOR DELETE TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id()) AND (SELECT public.es_admin()));

-- ── 9. Índices de apoyo ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS perfiles_empresa_idx ON public.perfiles (empresa_id);

-- ── 10. Cerrar funciones SECURITY DEFINER preexistentes al rol `anon` ──────
-- El linter de Supabase las reportaba como ejecutables SIN iniciar sesión
-- (vía /rest/v1/rpc/...), porque Postgres otorga EXECUTE a PUBLIC por default.
-- Todas requieren auth.uid(), así que un anónimo no lograría nada útil, pero
-- no hay razón para dejarlas expuestas.
--   · handle_new_user  — es función de trigger; llamarla por RPC ni siquiera
--     funcionaría, pero se cierra para quitar el ruido del linter.
--   · setup_empresa / get_or_create_matriz — las usa el onboarding ya
--     autenticado, así que `authenticated` basta.
DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.handle_new_user()',
    'public.get_or_create_matriz()',
    'public.setup_empresa(text,text,text,text,text)'
  ] LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'Función % no existe todavía — se omite', fn;
    END;
  END LOOP;
END $$;
