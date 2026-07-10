-- ============================================================
--  Capital Humano MX — Migración 21: Planes de suscripción (tiers)
--  Free / Pyme / Full / Despacho (+ 'legacy' para cuentas previas)
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--
--  Idempotente: puede ejecutarse múltiples veces sin error.
--
--  NOTA DE DISEÑO:
--  * La suscripción se ancla al USUARIO (auth.users), no a la empresa:
--    el plan Despacho abarca hasta 10 empresas de un mismo dueño, así
--    que UNIQUE(usuario_id) cubre los 4 planes sin duplicar estado.
--  * El estado "solo lectura" NO se almacena: se deriva en fn_plan_de()
--    (trial vencido o suscripción inactiva). No se necesita cron.
--  * El enforcement vive en TRIGGERS, no en las políticas RLS existentes:
--    menos riesgo en producción y errores propios (PLAN_SOLO_LECTURA,
--    PLAN_LIMITE_*, PLAN_FEATURE_*) que el frontend traduce a UX amigable.
--  * Todos los triggers dejan pasar escrituras con auth.uid() IS NULL
--    (SQL Editor, service_role, edge functions del checador).
--  * suscripciones NO tiene política de INSERT/UPDATE/DELETE para
--    authenticated: solo escriben funciones SECURITY DEFINER, el SQL
--    Editor o service_role. Nadie se auto-asciende de plan por consola.
-- ============================================================

-- ── 1. Catálogo de planes ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.planes (
  codigo           TEXT PRIMARY KEY,           -- 'free'|'pyme'|'full'|'despacho'|'legacy'
  nombre           TEXT NOT NULL,
  descripcion      TEXT,
  precio_mensual   NUMERIC(10,2),              -- NULL = pendiente de definir
  max_trabajadores INT,                        -- NULL = ilimitado (activos por empresa)
  max_sucursales   INT,                        -- NULL = ilimitado (tipo='sucursal' activas; la matriz no cuenta)
  max_empresas     INT NOT NULL DEFAULT 1,     -- filas en usuario_empresas por usuario
  trial_dias       INT DEFAULT 0,
  features         JSONB NOT NULL DEFAULT '{}'::jsonb,
  publico          BOOLEAN DEFAULT true,       -- false = no se muestra en el modal de planes
  orden            INT DEFAULT 0,
  creado_en        TIMESTAMPTZ DEFAULT now()
);

-- Seed del catálogo. precio_mensual se define después con:
--   UPDATE public.planes SET precio_mensual = ___ WHERE codigo = '___';
-- (a propósito NO se pisa en re-ejecuciones de esta migración).
INSERT INTO public.planes
  (codigo, nombre, descripcion, precio_mensual, max_trabajadores, max_sucursales, max_empresas, trial_dias, features, publico, orden)
VALUES
  ('free', 'Gratis', 'Prueba de 7 días: alta de trabajadores (máx. 5), actas administrativas y bajas.',
   NULL, 5, 0, 1, 7,
   '{"contratos":false,"nomina":false,"asistencia":false,"checador":false,"imss":false,"vacaciones":false,"incapacidades":false,"aguinaldo":false,"ptu":false,"organigrama":false,"reportes":false,"expediente":false,"resguardos":false,"agente_ia":false,"importacion":false}'::jsonb,
   true, 1),
  ('pyme', 'Pyme', 'Hasta 50 trabajadores y 5 sucursales. Todas las funciones excepto Agente IA.',
   NULL, 50, 5, 1, 0,
   '{"contratos":true,"nomina":true,"asistencia":true,"checador":true,"imss":true,"vacaciones":true,"incapacidades":true,"aguinaldo":true,"ptu":true,"organigrama":true,"reportes":true,"expediente":true,"resguardos":true,"agente_ia":false,"importacion":true}'::jsonb,
   true, 2),
  ('full', 'Full', 'Una empresa sin límites de trabajadores ni sucursales. Todas las funciones, incluido Agente IA.',
   NULL, NULL, NULL, 1, 0,
   '{"contratos":true,"nomina":true,"asistencia":true,"checador":true,"imss":true,"vacaciones":true,"incapacidades":true,"aguinaldo":true,"ptu":true,"organigrama":true,"reportes":true,"expediente":true,"resguardos":true,"agente_ia":true,"importacion":true}'::jsonb,
   true, 3),
  ('despacho', 'Despacho', 'Gestiona hasta 10 empresas sin límites. Acceso total, incluido Agente IA.',
   NULL, NULL, NULL, 10, 0,
   '{"contratos":true,"nomina":true,"asistencia":true,"checador":true,"imss":true,"vacaciones":true,"incapacidades":true,"aguinaldo":true,"ptu":true,"organigrama":true,"reportes":true,"expediente":true,"resguardos":true,"agente_ia":true,"importacion":true}'::jsonb,
   true, 4),
  ('legacy', 'Cliente fundador', 'Cuentas creadas antes del sistema de planes. Equivalente a Full/Despacho, sin costo.',
   0, NULL, NULL, 10, 0,
   '{"contratos":true,"nomina":true,"asistencia":true,"checador":true,"imss":true,"vacaciones":true,"incapacidades":true,"aguinaldo":true,"ptu":true,"organigrama":true,"reportes":true,"expediente":true,"resguardos":true,"agente_ia":true,"importacion":true}'::jsonb,
   false, 99)
ON CONFLICT (codigo) DO UPDATE SET
  nombre           = EXCLUDED.nombre,
  descripcion      = EXCLUDED.descripcion,
  max_trabajadores = EXCLUDED.max_trabajadores,
  max_sucursales   = EXCLUDED.max_sucursales,
  max_empresas     = EXCLUDED.max_empresas,
  trial_dias       = EXCLUDED.trial_dias,
  features         = EXCLUDED.features,
  publico          = EXCLUDED.publico,
  orden            = EXCLUDED.orden;

ALTER TABLE public.planes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "planes_select" ON public.planes;
CREATE POLICY "planes_select" ON public.planes FOR SELECT
  TO anon, authenticated USING (true);

-- ── 2. Suscripciones (una por usuario) ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.suscripciones (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_codigo        TEXT NOT NULL REFERENCES public.planes(codigo),
  estado             TEXT NOT NULL DEFAULT 'trialing'
                     CHECK (estado IN ('trialing','active','past_due','canceled')),
  trial_ends_at      TIMESTAMPTZ,              -- solo aplica a estado 'trialing'
  current_period_end TIMESTAMPTZ,              -- NULL = vigencia indefinida (activación manual)
  proveedor          TEXT NOT NULL DEFAULT 'manual'
                     CHECK (proveedor IN ('manual','mercado_pago')),
  mp_preapproval_id  TEXT,                     -- fase Mercado Pago (preapproval id)
  notas              TEXT,                     -- ref. SPEI, quién activó, etc.
  creado_en          TIMESTAMPTZ DEFAULT now(),
  actualizado_en     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.suscripciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suscripciones_select_own" ON public.suscripciones;
CREATE POLICY "suscripciones_select_own" ON public.suscripciones FOR SELECT
  USING (usuario_id = auth.uid());
-- Sin políticas de INSERT/UPDATE/DELETE a propósito (ver NOTA DE DISEÑO).

-- Índices de apoyo para los conteos de los triggers
CREATE INDEX IF NOT EXISTS trabajadores_empresa_estado_idx ON public.trabajadores (empresa_id, estado);
CREATE INDEX IF NOT EXISTS sucursales_empresa_tipo_idx     ON public.sucursales (empresa_id, tipo);
CREATE INDEX IF NOT EXISTS usuario_empresas_usuario_idx    ON public.usuario_empresas (usuario_id);

-- ── 3. Funciones helper ─────────────────────────────────────────────

-- Núcleo compartido (triggers + RPC): suscripción+plan del usuario dado,
-- con el estado efectivo derivado. Si no hay suscripción devuelve 0 filas
-- (los consumidores tratan "sin fila" como solo lectura: fail closed).
CREATE OR REPLACE FUNCTION public.fn_plan_de(p_usuario UUID)
RETURNS TABLE (plan_codigo TEXT, estado_efectivo TEXT, trial_ends_at TIMESTAMPTZ,
               max_trabajadores INT, max_sucursales INT, max_empresas INT, features JSONB)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.codigo,
         CASE
           WHEN s.estado = 'active'
                AND (s.current_period_end IS NULL OR s.current_period_end > now()) THEN 'active'
           WHEN s.estado = 'trialing' AND s.trial_ends_at > now()                  THEN 'trialing'
           ELSE 'read_only'
         END,
         s.trial_ends_at, p.max_trabajadores, p.max_sucursales, p.max_empresas, p.features
  FROM public.suscripciones s
  JOIN public.planes p ON p.codigo = s.plan_codigo
  WHERE s.usuario_id = p_usuario;
$$;
REVOKE ALL ON FUNCTION public.fn_plan_de(UUID) FROM PUBLIC, anon, authenticated;

-- RPC para el frontend: supabase.rpc('get_plan_actual')
CREATE OR REPLACE FUNCTION public.get_plan_actual()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
       'plan',   f.plan_codigo,
       'estado', f.estado_efectivo,
       'trial_ends_at', f.trial_ends_at,
       'dias_trial_restantes',
         CASE WHEN f.estado_efectivo = 'trialing'
              THEN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (f.trial_ends_at - now()))/86400))::int
              ELSE NULL END,
       'limites', jsonb_build_object('trabajadores', f.max_trabajadores,
                                     'sucursales',   f.max_sucursales,
                                     'empresas',     f.max_empresas),
       'features', f.features)
     FROM public.fn_plan_de(auth.uid()) f),
    jsonb_build_object('plan', NULL, 'estado', 'read_only', 'features', '{}'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.get_plan_actual() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_plan_actual() TO authenticated;

-- ── 4. Enforcement: solo lectura global ─────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_bloquear_solo_lectura()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_estado TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;  -- SQL Editor / service_role / checador
  SELECT estado_efectivo INTO v_estado FROM public.fn_plan_de(auth.uid());
  IF v_estado IS NULL OR v_estado = 'read_only' THEN
    RAISE EXCEPTION 'PLAN_SOLO_LECTURA: tu periodo de prueba terminó o tu suscripción está inactiva. Activa un plan para continuar.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

-- Se instala en todas las tablas de datos del negocio. Excluidas a propósito:
-- perfiles y suscripciones (necesarias para operar/upgradear), alertas y
-- config_valores (el dashboard las regenera y debe seguir funcionando en
-- modo lectura). Prefijo zz_ para ejecutarse después de otros triggers.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'trabajadores','sucursales','asistencia','actas','contratos','bajas',
    'vacaciones','incapacidades','ptu_ejercicios','ptu_detalle',
    'periodos_nomina','recibos_nomina','documentos_trabajador','checadas',
    'integraciones_checador','movimientos_imss','prestaciones_trabajador',
    'descuentos_trabajador','descuentos_aplicados','resguardos',
    'dias_festivos','empresas','usuario_empresas'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS zz_solo_lectura ON public.%I', t);
      EXECUTE format('CREATE TRIGGER zz_solo_lectura BEFORE INSERT OR UPDATE OR DELETE
                      ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trg_bloquear_solo_lectura()', t);
    END IF;
  END LOOP;
END $$;

-- ── 5. Enforcement: límites numéricos ───────────────────────────────
-- AFTER INSERT (no BEFORE): así el conteo ve las filas ya insertadas del
-- mismo statement y la importación masiva de Excel no se cuela por debajo
-- del límite. Nota de concurrencia: dos inserts simultáneos podrían rebasar
-- el límite en 1 — aceptable para este producto.

-- 5.1 Trabajadores activos por empresa (cubre también reactivar una baja)
CREATE OR REPLACE FUNCTION public.trg_limite_trabajadores()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_max INT; v_count INT;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NOT (OLD.estado <> 'activo' AND NEW.estado = 'activo') THEN
    RETURN NEW;  -- solo interesa la reactivación
  END IF;
  SELECT max_trabajadores INTO v_max FROM public.fn_plan_de(auth.uid());
  IF v_max IS NULL THEN RETURN NEW; END IF;  -- ilimitado
  SELECT count(*) INTO v_count FROM public.trabajadores
   WHERE empresa_id = NEW.empresa_id AND estado = 'activo';
  IF v_count > v_max THEN
    RAISE EXCEPTION 'PLAN_LIMITE_TRABAJADORES: tu plan permite máximo % trabajadores activos.', v_max;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS zz_limite_trabajadores ON public.trabajadores;
CREATE TRIGGER zz_limite_trabajadores AFTER INSERT OR UPDATE OF estado
  ON public.trabajadores FOR EACH ROW EXECUTE FUNCTION public.trg_limite_trabajadores();

-- 5.2 Sucursales activas por empresa (la matriz no cuenta; cubre reactivación)
CREATE OR REPLACE FUNCTION public.trg_limite_sucursales()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_max INT; v_count INT;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.tipo = 'matriz' THEN RETURN NEW; END IF;  -- get_or_create_matriz() nunca choca
  IF TG_OP = 'UPDATE' AND NOT (OLD.activa = false AND NEW.activa = true) THEN
    RETURN NEW;
  END IF;
  SELECT max_sucursales INTO v_max FROM public.fn_plan_de(auth.uid());
  IF v_max IS NULL THEN RETURN NEW; END IF;  -- ilimitado
  SELECT count(*) INTO v_count FROM public.sucursales
   WHERE empresa_id = NEW.empresa_id AND tipo = 'sucursal' AND activa = true;
  IF v_count > v_max THEN
    RAISE EXCEPTION 'PLAN_LIMITE_SUCURSALES: tu plan permite máximo % sucursales.', v_max;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS zz_limite_sucursales ON public.sucursales;
CREATE TRIGGER zz_limite_sucursales AFTER INSERT OR UPDATE OF activa
  ON public.sucursales FOR EACH ROW EXECUTE FUNCTION public.trg_limite_sucursales();

-- 5.3 Empresas por usuario (gate real de "crear empresa": usuario_empresas)
CREATE OR REPLACE FUNCTION public.trg_limite_empresas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_max INT; v_count INT;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT max_empresas INTO v_max FROM public.fn_plan_de(NEW.usuario_id);
  IF v_max IS NULL THEN RETURN NEW; END IF;  -- sin suscripción: lo frena zz_solo_lectura
  SELECT count(*) INTO v_count FROM public.usuario_empresas
   WHERE usuario_id = NEW.usuario_id;
  IF v_count > v_max THEN
    RAISE EXCEPTION 'PLAN_LIMITE_EMPRESAS: tu plan permite gestionar máximo % empresa(s).', v_max;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS zz_limite_empresas ON public.usuario_empresas;
CREATE TRIGGER zz_limite_empresas AFTER INSERT
  ON public.usuario_empresas FOR EACH ROW EXECUTE FUNCTION public.trg_limite_empresas();

-- ── 6. Enforcement: features por plan (Free sin contratos ni nómina) ─

CREATE OR REPLACE FUNCTION public.trg_requiere_feature()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_feat TEXT := TG_ARGV[0]; v_features JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT features INTO v_features FROM public.fn_plan_de(auth.uid());
  IF COALESCE(v_features->>v_feat, 'false') <> 'true' THEN
    RAISE EXCEPTION 'PLAN_FEATURE_%: tu plan no incluye esta función.', upper(v_feat);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS zz_feature_contratos ON public.contratos;
CREATE TRIGGER zz_feature_contratos BEFORE INSERT ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.trg_requiere_feature('contratos');

-- El gate en periodos_nomina basta: los recibos dependen del periodo.
DROP TRIGGER IF EXISTS zz_feature_nomina ON public.periodos_nomina;
CREATE TRIGGER zz_feature_nomina BEFORE INSERT ON public.periodos_nomina
  FOR EACH ROW EXECUTE FUNCTION public.trg_requiere_feature('nomina');

-- ── 7. Signup: suscripción Free trial automática ────────────────────
-- (Reemplaza handle_new_user de 00_setup.sql; verificada contra la
--  definición vigente en la BD remota el 2026-07-07.)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.perfiles (id, nombre)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.suscripciones (usuario_id, plan_codigo, estado, trial_ends_at)
  SELECT new.id, 'free', 'trialing', now() + COALESCE(p.trial_dias, 7) * interval '1 day'
  FROM public.planes p WHERE p.codigo = 'free'
  ON CONFLICT (usuario_id) DO NOTHING;

  RETURN new;
END; $$;

-- ── 8. setup_empresa: ahora versionada, con vínculo y gate de plan ───
-- (Basada en la definición vigente en la BD remota el 2026-07-07, que
--  solo creaba la empresa y actualizaba perfiles.empresa_id. Se agrega:
--  validación de max_empresas y alta en usuario_empresas — necesaria
--  para el conteo del plan Despacho y para el switcher de empresas.)

CREATE OR REPLACE FUNCTION public.setup_empresa(
  p_nombre TEXT, p_rfc TEXT DEFAULT NULL, p_representante TEXT DEFAULT NULL,
  p_domicilio TEXT DEFAULT NULL, p_ciudad TEXT DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa_id UUID;
  v_user_id    UUID;
  v_estado     TEXT;
  v_max        INT;
  v_count      INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT estado_efectivo, max_empresas INTO v_estado, v_max
    FROM public.fn_plan_de(v_user_id);
  IF v_estado IS NULL OR v_estado = 'read_only' THEN
    RAISE EXCEPTION 'PLAN_SOLO_LECTURA: tu periodo de prueba terminó o tu suscripción está inactiva.';
  END IF;
  SELECT count(*) INTO v_count FROM public.usuario_empresas WHERE usuario_id = v_user_id;
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'PLAN_LIMITE_EMPRESAS: tu plan permite gestionar máximo % empresa(s).', v_max;
  END IF;

  INSERT INTO public.empresas (nombre, rfc, representante, domicilio, ciudad)
  VALUES (p_nombre, p_rfc, p_representante, p_domicilio, p_ciudad)
  RETURNING id INTO v_empresa_id;

  UPDATE public.perfiles SET empresa_id = v_empresa_id WHERE id = v_user_id;

  INSERT INTO public.usuario_empresas (usuario_id, empresa_id)
  VALUES (v_user_id, v_empresa_id)
  ON CONFLICT (usuario_id, empresa_id) DO NOTHING;

  RETURN jsonb_build_object('empresa_id', v_empresa_id);
END; $$;

-- ── 9. Backfill de cuentas pre-existentes ───────────────────────────

-- Toda cuenta sin suscripción recibe el plan 'legacy' (Full sin costo).
INSERT INTO public.suscripciones (usuario_id, plan_codigo, estado, current_period_end, proveedor, notas)
SELECT u.id, 'legacy', 'active', NULL, 'manual', 'backfill migración 21 — cuenta pre-existente'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.suscripciones s WHERE s.usuario_id = u.id);

-- Vincular en usuario_empresas la empresa que ya tienen en perfiles
-- (necesario para que el conteo de empresas del plan sea veraz).
INSERT INTO public.usuario_empresas (usuario_id, empresa_id)
SELECT p.id, p.empresa_id FROM public.perfiles p
WHERE p.empresa_id IS NOT NULL
ON CONFLICT (usuario_id, empresa_id) DO NOTHING;

-- ── 10. Activación manual de planes: admin_set_plan ─────────────────
-- Solo ejecutable desde el SQL Editor (rol postgres) o service_role.
-- Uso y consultas de monitoreo: ver app/migrations/ADMIN_PLANES.md
--   SELECT admin_set_plan('cliente@correo.com', 'pyme', 'active', 1, 'SPEI ref 12345');

CREATE OR REPLACE FUNCTION public.admin_set_plan(
  p_email TEXT, p_plan TEXT, p_estado TEXT DEFAULT 'active',
  p_meses INT DEFAULT NULL, p_notas TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(p_email);
  IF v_uid IS NULL THEN
    RETURN 'ERROR: usuario no encontrado: ' || p_email;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.planes WHERE codigo = p_plan) THEN
    RETURN 'ERROR: plan inexistente: ' || p_plan;
  END IF;

  INSERT INTO public.suscripciones (usuario_id, plan_codigo, estado, current_period_end, trial_ends_at, proveedor, notas)
  VALUES (v_uid, p_plan, p_estado,
          CASE WHEN p_meses IS NULL THEN NULL ELSE now() + p_meses * interval '1 month' END,
          NULL, 'manual', p_notas)
  ON CONFLICT (usuario_id) DO UPDATE SET
    plan_codigo        = EXCLUDED.plan_codigo,
    estado             = EXCLUDED.estado,
    current_period_end = EXCLUDED.current_period_end,
    trial_ends_at      = NULL,
    proveedor          = 'manual',
    notas              = COALESCE(EXCLUDED.notas, public.suscripciones.notas),
    actualizado_en     = now();

  RETURN 'OK: ' || p_email || ' → ' || p_plan || ' (' || p_estado || ')';
END; $$;
REVOKE ALL ON FUNCTION public.admin_set_plan(TEXT,TEXT,TEXT,INT,TEXT) FROM PUBLIC, anon, authenticated;
