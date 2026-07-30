-- ═══════════════════════════════════════════════════════════════════════════
--  Migración 39 — Auditoría de seguridad y cumplimiento pre-lanzamiento
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--
--  NUMERACIÓN: se salta el 38 a propósito. La rama de "bajas documentadas como
--  renuncia" tiene reservada la 38 y todavía no está integrada; usar 39 aquí
--  evita una colisión de nombres al hacer merge.
--
--  Idempotente: se puede correr varias veces sin efecto acumulativo.
--
--  Cubre:
--    1. Rate limiting y auditoría de consumo del Agente IA        (Fase 4)
--    2. Registro de consentimiento legal en el alta               (Fase 9)
--    3. Bitácora de auditoría de eventos sensibles                (Fase 6, A09)
--    4. Constraints de integridad faltantes                       (Fase 3)
--    5. Coherencia de fechas de baja vs. ingreso                  (Fase 7)
--
--  NO incluye (decisión deliberada, ver AUDITORIA_SEGURIDAD.md):
--    · FORCE ROW LEVEL SECURITY — rompería las funciones SECURITY DEFINER
--      (registrar_checada, setup_empresa, …) que son propiedad de `postgres`
--      y que hoy dependen de NO estar sujetas a RLS. Alto riesgo y beneficio
--      nulo en esta arquitectura: nada de la app se conecta como owner; el
--      frontend usa `authenticated` y las Edge Functions usan `service_role`,
--      que ya tiene BYPASSRLS por atributo de rol, no por ownership.
--    · Cambios a políticas RLS existentes — se auditaron las 34 tablas contra
--      producción y todas filtran correctamente por `mi_empresa_id()`.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
--  1. AGENTE IA — consumo, rate limiting y auditoría de costo
--     El endpoint más caro de la plataforma. Sin freno, cualquier usuario con
--     el feature habilitado puede invocarlo en bucle directamente (no hace
--     falta pasar por agente.js) y facturar contra la cuenta de Anthropic
--     compartida. Se registra cada invocación para poder auditar el gasto.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agente_ia_uso (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  usuario_id   UUID NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  tipo_doc     TEXT,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agente_ia_uso_usuario_fecha_idx
  ON public.agente_ia_uso (usuario_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS agente_ia_uso_empresa_fecha_idx
  ON public.agente_ia_uso (empresa_id, creado_en DESC);

ALTER TABLE public.agente_ia_uso ENABLE ROW LEVEL SECURITY;

-- Solo lectura para el propio tenant (para poder mostrar "te quedan N usos").
-- No hay política de INSERT/UPDATE/DELETE a propósito: la única escritura
-- legítima es vía la función SECURITY DEFINER de abajo, así el usuario no
-- puede borrar su propio historial para resetear el límite.
DROP POLICY IF EXISTS agente_ia_uso_select ON public.agente_ia_uso;
CREATE POLICY agente_ia_uso_select ON public.agente_ia_uso
  FOR SELECT TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id()));

-- Límites configurables sin redeploy (tabla config_valores, migración 15).
INSERT INTO public.config_valores (clave, valor, vigencia_desde)
SELECT v.clave, v.valor, DATE '2026-01-01'
FROM (VALUES
  ('agente_ia_limite_usuario_hora', 20),
  ('agente_ia_limite_usuario_dia',  60),
  ('agente_ia_limite_empresa_hora', 60),
  ('agente_ia_limite_empresa_dia',  200)
) AS v(clave, valor)
WHERE NOT EXISTS (SELECT 1 FROM public.config_valores c WHERE c.clave = v.clave);

-- Consume una unidad de cuota del Agente IA para el usuario autenticado.
-- Devuelve permitido=false (sin registrar consumo) si se excedió cualquiera de
-- los 4 límites. El chequeo y el registro ocurren en la misma transacción, con
-- advisory lock por usuario, para que N llamadas simultáneas no se cuelen
-- todas leyendo el mismo contador viejo.
CREATE OR REPLACE FUNCTION public.agente_ia_consumir_cuota(p_tipo_doc TEXT DEFAULT NULL)
RETURNS TABLE (
  permitido       BOOLEAN,
  motivo          TEXT,
  usos_usuario_h  INT,
  usos_usuario_d  INT,
  usos_empresa_h  INT,
  usos_empresa_d  INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user     UUID := auth.uid();
  v_empresa  UUID;
  v_lim_u_h  INT;
  v_lim_u_d  INT;
  v_lim_e_h  INT;
  v_lim_e_d  INT;
  v_u_h      INT;
  v_u_d      INT;
  v_e_h      INT;
  v_e_d      INT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT p.empresa_id INTO v_empresa FROM public.perfiles p WHERE p.id = v_user;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'El usuario no tiene empresa activa';
  END IF;

  -- Serializa las llamadas concurrentes del mismo usuario hasta el COMMIT.
  PERFORM pg_advisory_xact_lock(hashtext('agente_ia:' || v_user::text));

  v_lim_u_h := COALESCE((SELECT c.valor FROM public.config_valores c
                         WHERE c.clave = 'agente_ia_limite_usuario_hora'
                         ORDER BY c.vigencia_desde DESC LIMIT 1), 20)::INT;
  v_lim_u_d := COALESCE((SELECT c.valor FROM public.config_valores c
                         WHERE c.clave = 'agente_ia_limite_usuario_dia'
                         ORDER BY c.vigencia_desde DESC LIMIT 1), 60)::INT;
  v_lim_e_h := COALESCE((SELECT c.valor FROM public.config_valores c
                         WHERE c.clave = 'agente_ia_limite_empresa_hora'
                         ORDER BY c.vigencia_desde DESC LIMIT 1), 60)::INT;
  v_lim_e_d := COALESCE((SELECT c.valor FROM public.config_valores c
                         WHERE c.clave = 'agente_ia_limite_empresa_dia'
                         ORDER BY c.vigencia_desde DESC LIMIT 1), 200)::INT;

  SELECT
    COUNT(*) FILTER (WHERE u.usuario_id = v_user    AND u.creado_en > now() - INTERVAL '1 hour'),
    COUNT(*) FILTER (WHERE u.usuario_id = v_user),
    COUNT(*) FILTER (WHERE u.creado_en  > now() - INTERVAL '1 hour'),
    COUNT(*)
  INTO v_u_h, v_u_d, v_e_h, v_e_d
  FROM public.agente_ia_uso u
  WHERE u.empresa_id = v_empresa
    AND u.creado_en > now() - INTERVAL '1 day';

  IF v_u_h >= v_lim_u_h THEN
    RETURN QUERY SELECT false, 'limite_usuario_hora'::TEXT, v_u_h, v_u_d, v_e_h, v_e_d; RETURN;
  END IF;
  IF v_u_d >= v_lim_u_d THEN
    RETURN QUERY SELECT false, 'limite_usuario_dia'::TEXT, v_u_h, v_u_d, v_e_h, v_e_d; RETURN;
  END IF;
  IF v_e_h >= v_lim_e_h THEN
    RETURN QUERY SELECT false, 'limite_empresa_hora'::TEXT, v_u_h, v_u_d, v_e_h, v_e_d; RETURN;
  END IF;
  IF v_e_d >= v_lim_e_d THEN
    RETURN QUERY SELECT false, 'limite_empresa_dia'::TEXT, v_u_h, v_u_d, v_e_h, v_e_d; RETURN;
  END IF;

  INSERT INTO public.agente_ia_uso (empresa_id, usuario_id, tipo_doc)
  VALUES (v_empresa, v_user, LEFT(COALESCE(p_tipo_doc, ''), 60));

  RETURN QUERY SELECT true, NULL::TEXT, v_u_h + 1, v_u_d + 1, v_e_h + 1, v_e_d + 1;
END; $$;

-- Lección del proyecto: Supabase otorga EXECUTE directo a anon/authenticated en
-- funciones nuevas, así que `REVOKE ... FROM PUBLIC` NO basta — hay que revocar
-- de `anon` explícitamente.
REVOKE ALL ON FUNCTION public.agente_ia_consumir_cuota(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agente_ia_consumir_cuota(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.agente_ia_consumir_cuota(TEXT) TO authenticated;


-- ───────────────────────────────────────────────────────────────────────────
--  2. CONSENTIMIENTO LEGAL EN EL ALTA
--     Requisito de la Ley Federal de Protección de Datos Personales en
--     Posesión de los Particulares: poder acreditar QUIÉN aceptó QUÉ VERSIÓN
--     del aviso de privacidad y de los términos, CUÁNDO y desde dónde.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consentimientos_legales (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  documento    TEXT NOT NULL CHECK (documento IN ('aviso_privacidad', 'terminos', 'cookies')),
  version      TEXT NOT NULL,
  aceptado     BOOLEAN NOT NULL DEFAULT true,
  ip           TEXT,
  user_agent   TEXT,
  aceptado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consentimientos_usuario_idx
  ON public.consentimientos_legales (usuario_id, documento, aceptado_en DESC);

ALTER TABLE public.consentimientos_legales ENABLE ROW LEVEL SECURITY;

-- El usuario puede ver y agregar SU propio consentimiento. No hay UPDATE ni
-- DELETE a propósito: un registro de consentimiento que se puede alterar no
-- sirve como prueba. Una rectificación se hace agregando otro registro.
DROP POLICY IF EXISTS consentimientos_select ON public.consentimientos_legales;
CREATE POLICY consentimientos_select ON public.consentimientos_legales
  FOR SELECT TO authenticated USING (usuario_id = auth.uid());

DROP POLICY IF EXISTS consentimientos_insert ON public.consentimientos_legales;
CREATE POLICY consentimientos_insert ON public.consentimientos_legales
  FOR INSERT TO authenticated WITH CHECK (usuario_id = auth.uid());


-- ───────────────────────────────────────────────────────────────────────────
--  3. BITÁCORA DE AUDITORÍA DE EVENTOS SENSIBLES
--     Para un producto de cumplimiento laboral la trazabilidad es requisito
--     legal y argumento de venta. Se registran los eventos con consecuencia
--     jurídica o de privacidad: bajas de trabajadores, alta/borrado de
--     documentos del expediente, y cambios de rol.
--
--     LÍMITE CONOCIDO: los intentos de login fallidos NO se pueden capturar
--     desde Postgres — viven en el esquema `auth` de Supabase, que no admite
--     triggers de usuario. Ver AUDITORIA_SEGURIDAD.md → verificación manual.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bitacora_auditoria (
  id           BIGSERIAL PRIMARY KEY,
  empresa_id   UUID,
  usuario_id   UUID,
  evento       TEXT NOT NULL,
  entidad      TEXT NOT NULL,
  entidad_id   UUID,
  detalle      JSONB,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bitacora_empresa_fecha_idx
  ON public.bitacora_auditoria (empresa_id, creado_en DESC);

ALTER TABLE public.bitacora_auditoria ENABLE ROW LEVEL SECURITY;

-- Solo lectura, y solo para administradores de la propia empresa. Sin
-- INSERT/UPDATE/DELETE para `authenticated`: escribe únicamente el trigger
-- SECURITY DEFINER, así la bitácora no se puede falsear ni borrar desde la app.
DROP POLICY IF EXISTS bitacora_select ON public.bitacora_auditoria;
CREATE POLICY bitacora_select ON public.bitacora_auditoria
  FOR SELECT TO authenticated
  USING (empresa_id = (SELECT public.mi_empresa_id()) AND (SELECT public.es_admin()));

CREATE OR REPLACE FUNCTION public.zz_bitacora_registrar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fila     RECORD;
  v_empresa  UUID;
  v_id       UUID;
  v_detalle  JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN v_fila := OLD; ELSE v_fila := NEW; END IF;

  -- empresa_id y id se leen de forma tolerante: no todas las tablas
  -- auditadas tienen exactamente las mismas columnas.
  BEGIN v_empresa := to_jsonb(v_fila) ->> 'empresa_id'; EXCEPTION WHEN OTHERS THEN v_empresa := NULL; END;
  BEGIN v_id      := to_jsonb(v_fila) ->> 'id';         EXCEPTION WHEN OTHERS THEN v_id      := NULL; END;

  -- IF/ELSIF y no una expresión CASE: en plpgsql una expresión CASE se compila
  -- como una sola consulta y planifica TODAS las ramas, así que una rama que
  -- mencione OLD reventaría al dispararse el trigger en un INSERT (donde OLD
  -- no está asignado). Con IF/ELSIF solo se compila la rama que se ejecuta.
  IF TG_ARGV[0] = 'bajas' THEN
    v_detalle := jsonb_build_object(
      'trabajador_id', to_jsonb(v_fila) ->> 'trabajador_id',
      'tipo_baja',     to_jsonb(v_fila) ->> 'tipo_baja',
      'fecha_baja',    to_jsonb(v_fila) ->> 'fecha_baja');
  ELSIF TG_ARGV[0] = 'documentos_trabajador' THEN
    v_detalle := jsonb_build_object(
      'trabajador_id',  to_jsonb(v_fila) ->> 'trabajador_id',
      'nombre_archivo', to_jsonb(v_fila) ->> 'nombre_archivo');
  ELSIF TG_ARGV[0] = 'perfiles' THEN
    v_detalle := jsonb_build_object(
      'perfil_id',  to_jsonb(NEW) ->> 'id',
      'rol_previo', to_jsonb(OLD) ->> 'rol',
      'rol_nuevo',  to_jsonb(NEW) ->> 'rol');
  ELSE
    v_detalle := NULL;
  END IF;

  INSERT INTO public.bitacora_auditoria (empresa_id, usuario_id, evento, entidad, entidad_id, detalle)
  VALUES (v_empresa, auth.uid(), lower(TG_OP), TG_ARGV[0], v_id, v_detalle);

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END; $$;

-- Se revoca también de `authenticated`: es una función de TRIGGER, nadie debe
-- poder invocarla por RPC. Los triggers siguen disparando igual porque Postgres
-- verifica EXECUTE al CREAR el trigger, no al dispararlo — comprobado con
-- `SET LOCAL ROLE authenticated` + claims de JWT reales dentro de una
-- transacción revertida (la bitácora escribió y la validación siguió rechazando).
REVOKE ALL ON FUNCTION public.zz_bitacora_registrar() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zz_bitacora_registrar() FROM anon;
REVOKE ALL ON FUNCTION public.zz_bitacora_registrar() FROM authenticated;

DROP TRIGGER IF EXISTS zz_bitacora_bajas ON public.bajas;
CREATE TRIGGER zz_bitacora_bajas
  AFTER INSERT OR DELETE ON public.bajas
  FOR EACH ROW EXECUTE FUNCTION public.zz_bitacora_registrar('bajas');

DROP TRIGGER IF EXISTS zz_bitacora_documentos ON public.documentos_trabajador;
CREATE TRIGGER zz_bitacora_documentos
  AFTER INSERT OR DELETE ON public.documentos_trabajador
  FOR EACH ROW EXECUTE FUNCTION public.zz_bitacora_registrar('documentos_trabajador');

DROP TRIGGER IF EXISTS zz_bitacora_roles ON public.perfiles;
CREATE TRIGGER zz_bitacora_roles
  AFTER UPDATE OF rol ON public.perfiles
  FOR EACH ROW WHEN (OLD.rol IS DISTINCT FROM NEW.rol)
  EXECUTE FUNCTION public.zz_bitacora_registrar('perfiles');


-- ───────────────────────────────────────────────────────────────────────────
--  4. CONSTRAINTS DE INTEGRIDAD FALTANTES
--     Última línea de defensa: la validación del navegador es UX, no seguridad.
--     Todos se agregan como NOT VALID: se aplican a TODA escritura nueva pero
--     no revisan filas históricas, así que la migración no puede fallar por
--     datos legados ni bloquear a nadie al aplicarse.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incapacidades_rango_fechas_chk') THEN
    ALTER TABLE public.incapacidades
      ADD CONSTRAINT incapacidades_rango_fechas_chk CHECK (fecha_fin >= fecha_inicio) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incapacidades_dias_chk') THEN
    ALTER TABLE public.incapacidades
      ADD CONSTRAINT incapacidades_dias_chk CHECK (dias > 0 AND dias <= 1000) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vacaciones_rango_fechas_chk') THEN
    ALTER TABLE public.vacaciones
      ADD CONSTRAINT vacaciones_rango_fechas_chk CHECK (fecha_fin >= fecha_inicio) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vacaciones_dias_chk') THEN
    ALTER TABLE public.vacaciones
      ADD CONSTRAINT vacaciones_dias_chk CHECK (dias > 0 AND dias <= 400) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'periodos_nomina_rango_fechas_chk') THEN
    ALTER TABLE public.periodos_nomina
      ADD CONSTRAINT periodos_nomina_rango_fechas_chk CHECK (fecha_fin >= fecha_inicio) NOT VALID;
  END IF;

  -- Un salario negativo no es un error de captura recuperable: contamina el
  -- recibo, el SBC, el finiquito y el archivo del IDSE.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trabajadores_salario_chk') THEN
    ALTER TABLE public.trabajadores
      ADD CONSTRAINT trabajadores_salario_chk CHECK (salario_mensual >= 0) NOT VALID;
  END IF;

  -- Fecha de ingreso absurda (captura con año mal tecleado: 2202 en vez de 2022).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trabajadores_fecha_ingreso_chk') THEN
    ALTER TABLE public.trabajadores
      ADD CONSTRAINT trabajadores_fecha_ingreso_chk
      CHECK (fecha_ingreso >= DATE '1950-01-01' AND fecha_ingreso <= DATE '2100-01-01') NOT VALID;
  END IF;
END $$;


-- ───────────────────────────────────────────────────────────────────────────
--  4bis. RATE LIMIT DEL KIOSCO — bloqueo por credencial, no por sucursal
--
--  PROBLEMA DE DISPONIBILIDAD (no de confidencialidad) del diseño anterior:
--  `checador-kiosco` bloquea cuando hay 8 intentos fallidos en 60 s asociados
--  al `kiosco_token`. Como el token es único por SUCURSAL y está pensado para
--  difundirse (QR pegado en recepción), cualquiera que vea ese QR puede
--  teclear 8 PINes inválidos y dejar sin poder checar a TODOS los trabajadores
--  de esa sucursal, de forma indefinida mientras siga tecleando. Además, un
--  cambio de turno real con varios trabajadores equivocándose podía disparar
--  el bloqueo sin que hubiera ningún ataque.
--
--  Diseño nuevo: el freno se aplica principalmente a la CREDENCIAL concreta
--  que se está adivinando (un PIN bloqueado no afecta a los demás), con un
--  tope por IP como red de seguridad contra el barrido automatizado, y un
--  tope por sucursal mucho más alto que solo actúa ante abuso masivo.
--
--  Se guarda el HASH de la credencial, nunca la credencial: la tabla es un
--  registro de intentos fallidos, no un almacén de PINes tecleados.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.checador_intentos_fallidos
  ADD COLUMN IF NOT EXISTS credencial_hash TEXT,
  ADD COLUMN IF NOT EXISTS ip              TEXT;

CREATE INDEX IF NOT EXISTS checador_intentos_credencial_idx
  ON public.checador_intentos_fallidos (kiosco_token, credencial_hash, creado_en DESC);
CREATE INDEX IF NOT EXISTS checador_intentos_ip_idx
  ON public.checador_intentos_fallidos (ip, creado_en DESC);


-- ───────────────────────────────────────────────────────────────────────────
--  5. COHERENCIA FECHA DE BAJA vs. FECHA DE INGRESO
--     No se puede expresar como CHECK porque cruza dos tablas. Una baja con
--     fecha anterior al ingreso produce antigüedad negativa y, con ella, un
--     finiquito mal calculado.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.zz_validar_fecha_baja()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ingreso DATE;
BEGIN
  SELECT t.fecha_ingreso INTO v_ingreso
  FROM public.trabajadores t WHERE t.id = NEW.trabajador_id;

  IF v_ingreso IS NOT NULL AND NEW.fecha_baja < v_ingreso THEN
    RAISE EXCEPTION 'La fecha de baja (%) no puede ser anterior a la fecha de ingreso (%).',
      NEW.fecha_baja, v_ingreso;
  END IF;

  IF NEW.fecha_baja > CURRENT_DATE + INTERVAL '1 year' THEN
    RAISE EXCEPTION 'La fecha de baja (%) está demasiado lejos en el futuro.', NEW.fecha_baja;
  END IF;

  RETURN NEW;
END; $$;

-- Misma razón que zz_bitacora_registrar: función de trigger, no RPC.
REVOKE ALL ON FUNCTION public.zz_validar_fecha_baja() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zz_validar_fecha_baja() FROM anon;
REVOKE ALL ON FUNCTION public.zz_validar_fecha_baja() FROM authenticated;

DROP TRIGGER IF EXISTS zz_validar_fecha_baja_trg ON public.bajas;
CREATE TRIGGER zz_validar_fecha_baja_trg
  BEFORE INSERT OR UPDATE ON public.bajas
  FOR EACH ROW EXECUTE FUNCTION public.zz_validar_fecha_baja();


-- ═══════════════════════════════════════════════════════════════════════════
--  VERIFICACIÓN POST-APLICACIÓN (correr y revisar a ojo)
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT to_regclass('public.agente_ia_uso'), to_regclass('public.consentimientos_legales'),
--        to_regclass('public.bitacora_auditoria');
-- SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public'
--    AND p.proname IN ('agente_ia_consumir_cuota','zz_bitacora_registrar','zz_validar_fecha_baja');
--   -- las tres deben dar anon = false
-- SELECT conname, convalidated FROM pg_constraint WHERE conname LIKE '%_chk' AND connamespace='public'::regnamespace;
