-- ============================================================
--  Capital Humano MX — Migración 26: fixes de prioridad ALTA (auditoría 2026-07-10)
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--
--  Idempotente: puede ejecutarse múltiples veces sin error.
--
--  Cubre, de la Tanda 2 acordada con el usuario:
--    A-5  registrar_checada() tenía el mismo patrón TOCTOU (SELECT-then-
--         INSERT sin lock) que ya se corrigió en generar_alertas() —
--         pg_advisory_xact_lock(hashtext(p_trabajador_id::text)) al inicio,
--         serializa por trabajador (no por empresa, para no bloquear
--         checadas de otros trabajadores mientras se procesa una).
--    A-4  Nueva tabla checador_intentos_fallidos + lógica de rate-limit en
--         el Edge Function checador-kiosco (código en el propio archivo
--         .ts, desplegado por separado — ver deploy_edge_function).
--
--  A-3 (agente-ia) no requiere cambios de base de datos, solo del código de
--  la Edge Function.
--
--  NOTA (verificado 2026-07-10): ninguna de las 4 Edge Functions estaba
--  desplegada todavía en el proyecto real — se despliegan por primera vez
--  ya con las correcciones de A-3/A-4 incluidas, sin ventana insegura.
-- ============================================================


-- ────────────────────────────────────────────────────────────
--  A-5. registrar_checada(): advisory lock por trabajador
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.registrar_checada(
  p_empresa_id uuid,
  p_trabajador_id uuid,
  p_sucursal_id uuid,
  p_ts timestamp with time zone,
  p_origen text,
  p_dispositivo text DEFAULT NULL::text
)
RETURNS TABLE(tipo text, hora time without time zone, festivo_desc text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fecha           DATE;
  v_hora_local      TIME;
  v_tipo            TEXT;
  v_hora_inicio     TIME;
  v_tolerancia      INTEGER;
  v_minutos_retardo INTEGER;
  v_asist_tipo      TEXT;
  v_es_domingo      BOOLEAN;
  v_festivo_desc    TEXT;
BEGIN
  -- Serializa pulsos concurrentes del MISMO trabajador (reintento de red del
  -- puente ZKTeco, doble tap en el kiosco, kiosco + checador físico casi
  -- simultáneos). No bloquea checadas de otros trabajadores. Se libera solo
  -- al terminar la transacción — mismo patrón que generar_alertas().
  PERFORM pg_advisory_xact_lock(hashtext(p_trabajador_id::text));

  v_fecha      := (p_ts AT TIME ZONE 'America/Mexico_City')::date;
  v_hora_local := (p_ts AT TIME ZONE 'America/Mexico_City')::time;
  v_es_domingo := EXTRACT(DOW FROM v_fecha) = 0;

  SELECT descripcion INTO v_festivo_desc
    FROM public.dias_festivos
    WHERE fecha = v_fecha
      AND (empresa_id IS NULL OR empresa_id = p_empresa_id)
    ORDER BY empresa_id NULLS FIRST
    LIMIT 1;

  -- ¿Ya hay un pulso de entrada hoy para este trabajador?
  IF EXISTS (
    SELECT 1 FROM public.checadas
    WHERE trabajador_id = p_trabajador_id
      AND (ts AT TIME ZONE 'America/Mexico_City')::date = v_fecha
  ) THEN
    v_tipo := 'salida';
  ELSE
    v_tipo := 'entrada';
  END IF;

  INSERT INTO public.checadas (empresa_id, sucursal_id, trabajador_id, tipo, ts, origen, dispositivo)
  VALUES (p_empresa_id, p_sucursal_id, p_trabajador_id, v_tipo, p_ts, p_origen, p_dispositivo);

  SELECT hora_inicio INTO v_hora_inicio FROM public.trabajadores WHERE id = p_trabajador_id;
  SELECT tolerancia_retardo_min INTO v_tolerancia FROM public.empresas WHERE id = p_empresa_id;
  v_tolerancia := COALESCE(v_tolerancia, 10);

  IF v_tipo = 'entrada' THEN
    v_asist_tipo := 'asistencia';
    v_minutos_retardo := 0;
    IF v_hora_inicio IS NOT NULL AND v_hora_local > (v_hora_inicio + (v_tolerancia || ' minutes')::interval) THEN
      v_asist_tipo := 'retardo';
      v_minutos_retardo := GREATEST(0, EXTRACT(EPOCH FROM (v_hora_local - v_hora_inicio))::integer / 60);
    END IF;

    INSERT INTO public.asistencia
      (empresa_id, trabajador_id, fecha, tipo, hora_entrada, minutos_retardo, origen, trabajo_festivo, trabajo_domingo)
    VALUES
      (p_empresa_id, p_trabajador_id, v_fecha, v_asist_tipo, v_hora_local, v_minutos_retardo, p_origen,
       v_festivo_desc IS NOT NULL, v_es_domingo)
    ON CONFLICT (trabajador_id, fecha) DO UPDATE
      SET hora_entrada    = EXCLUDED.hora_entrada,
          tipo             = EXCLUDED.tipo,
          minutos_retardo  = EXCLUDED.minutos_retardo,
          origen           = EXCLUDED.origen,
          trabajo_festivo  = EXCLUDED.trabajo_festivo,
          trabajo_domingo  = EXCLUDED.trabajo_domingo;
  ELSE
    UPDATE public.asistencia
      SET hora_salida = v_hora_local,
          origen      = p_origen
      WHERE trabajador_id = p_trabajador_id AND fecha = v_fecha;
  END IF;

  RETURN QUERY SELECT v_tipo, v_hora_local, v_festivo_desc;
END;
$function$;


-- ────────────────────────────────────────────────────────────
--  A-4. Tabla de intentos fallidos para rate-limit de PIN en el kiosco
--  (la lógica de conteo/bloqueo vive en checador-kiosco/index.ts)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.checador_intentos_fallidos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_token TEXT NOT NULL,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checador_intentos_token_fecha
  ON public.checador_intentos_fallidos (kiosco_token, creado_en);

-- Solo el Edge Function (service_role) la usa; sin políticas para
-- authenticated/anon = acceso denegado por RLS por diseño, igual que
-- config_valores (ver patrón estándar del proyecto).
ALTER TABLE public.checador_intentos_fallidos ENABLE ROW LEVEL SECURITY;
