-- ═══════════════════════════════════════════════════════════════════════════
-- 41 — Alertas de plazos fatales de la rescisión (P0-2)
--
-- Requiere la migración 40 (tabla `rescisiones`).
--
-- Los formatos los genera cualquiera; lo que ningún competidor hace bien es
-- avisar de los plazos. Éstos son los dos que más rescisiones justificadas
-- tumban en juicio:
--
--   Art. 517 fr. I — el patrón tiene UN MES para ejercer la acción de
--   rescisión, contado desde el día siguiente a aquel en que tuvo conocimiento
--   de la causa. El patrón "junta expediente" tres meses y, cuando por fin
--   rescinde, la causa ya prescribió.
--
--   Art. 47 — si el trabajador se niega a recibir el aviso, el patrón debe
--   comunicarlo al Tribunal dentro de los CINCO DÍAS HÁBILES siguientes,
--   proporcionando el último domicilio registrado. Su falta presume la
--   separación injustificada, salvo prueba en contrario.
--
-- Sigue el patrón de generar_alertas_nomina (migración 22): función aparte que
-- borra sólo sus propios tipos, para que generar_alertas —que borra todas las
-- no resueltas al inicio— pueda seguir ejecutándose antes sin pisarlas.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Días hábiles ────────────────────────────────────────────────────────
-- Calendario deliberadamente conservador: sábados, domingos y los festivos
-- OFICIALES del art. 74 LFT (empresa_id IS NULL). No se descuentan los días
-- de descanso propios de cada empresa: el plazo del art. 47 corre ante el
-- Tribunal, y su calendario no es el del patrón. Contar de más adelantaría la
-- fecha límite y haría perder el plazo.
CREATE OR REPLACE FUNCTION public.dias_habiles_transcurridos(p_desde date, p_hasta date)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(COUNT(*), 0)::int
  FROM generate_series(p_desde + 1, p_hasta, interval '1 day') AS d(dia)
  WHERE EXTRACT(ISODOW FROM d.dia) < 6          -- 6 = sábado, 7 = domingo
    AND NOT EXISTS (
      SELECT 1 FROM public.dias_festivos f
      WHERE f.empresa_id IS NULL
        AND f.fecha = d.dia::date
    );
$$;

COMMENT ON FUNCTION public.dias_habiles_transcurridos(date, date) IS
  'Días hábiles entre dos fechas, exclusivo del día inicial. Excluye sábados, domingos y festivos oficiales del art. 74 LFT, no los propios de la empresa.';

-- Fecha límite tras N días hábiles a partir de una fecha dada.
CREATE OR REPLACE FUNCTION public.fecha_limite_habil(p_desde date, p_dias integer)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fecha  date := p_desde;
  v_conteo int  := 0;
BEGIN
  WHILE v_conteo < p_dias LOOP
    v_fecha := v_fecha + 1;
    IF EXTRACT(ISODOW FROM v_fecha) < 6
       AND NOT EXISTS (SELECT 1 FROM public.dias_festivos f
                        WHERE f.empresa_id IS NULL AND f.fecha = v_fecha) THEN
      v_conteo := v_conteo + 1;
    END IF;
  END LOOP;
  RETURN v_fecha;
END;
$$;

-- ── 2. Generación de alertas ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generar_alertas_rescision(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_empresa_id::text));

  -- Sólo los tipos propios: generar_alertas ya borró el resto al inicio.
  DELETE FROM public.alertas
   WHERE empresa_id = p_empresa_id
     AND resuelta   = false
     AND tipo IN ('prescripcion_517', 'aviso_tribunal_47', 'vigencias_caducas');

  -- ─────────────────────────────────────────────────────────────────────
  -- 1. PRESCRIPCIÓN DEL ART. 517 fr. I — un mes desde el conocimiento
  --    Amarilla a los 20 días, roja a los 25, crítica una vez vencida.
  -- ─────────────────────────────────────────────────────────────────────
  INSERT INTO public.alertas
    (empresa_id, trabajador_id, tipo, titulo, descripcion,
     prioridad, fecha_limite, articulo_lft, accion_sugerida)
  SELECT
    p_empresa_id,
    r.trabajador_id,
    'prescripcion_517',
    CASE
      WHEN CURRENT_DATE > r.fecha_conocimiento_causa + INTERVAL '1 month'
        THEN 'Causa de rescisión posiblemente prescrita: ' || t.nombre
      ELSE 'Prescripción de la acción de rescisión: ' || t.nombre
    END,
    'La causa se conoció el ' || TO_CHAR(r.fecha_conocimiento_causa, 'DD/MM/YYYY') ||
    '. El artículo 517 fracción I concede un mes para ejercer la acción, contado desde el día siguiente. ' ||
    CASE
      WHEN CURRENT_DATE > r.fecha_conocimiento_causa + INTERVAL '1 month'
        THEN 'El plazo venció el ' ||
             TO_CHAR((r.fecha_conocimiento_causa + INTERVAL '1 month')::date, 'DD/MM/YYYY') ||
             '. Rescindir fuera de plazo hace que el despido se considere injustificado.'
      ELSE 'Vence el ' ||
           TO_CHAR((r.fecha_conocimiento_causa + INTERVAL '1 month')::date, 'DD/MM/YYYY') ||
           ' (faltan ' || ((r.fecha_conocimiento_causa + INTERVAL '1 month')::date - CURRENT_DATE)::text || ' días).'
    END,
    CASE
      WHEN CURRENT_DATE > r.fecha_conocimiento_causa + INTERVAL '1 month' THEN 'critica'
      WHEN CURRENT_DATE >= r.fecha_conocimiento_causa + 25 THEN 'critica'
      WHEN CURRENT_DATE >= r.fecha_conocimiento_causa + 20 THEN 'alta'
      ELSE 'media'
    END,
    (r.fecha_conocimiento_causa + INTERVAL '1 month')::date,
    'Art. 517 fr. I LFT',
    'Consulta a tu abogado antes de continuar si el plazo está por vencer o ya venció.'
  FROM public.rescisiones r
  JOIN public.trabajadores t ON t.id = r.trabajador_id
  WHERE r.empresa_id = p_empresa_id
    AND r.fecha_rescision IS NULL             -- aún no se ha ejercido
    AND CURRENT_DATE >= r.fecha_conocimiento_causa + 20;

  -- ─────────────────────────────────────────────────────────────────────
  -- 2. AVISO AL TRIBUNAL — cinco días hábiles desde la rescisión
  --    Roja desde el día 1: el plazo es fatal y corto.
  -- ─────────────────────────────────────────────────────────────────────
  INSERT INTO public.alertas
    (empresa_id, trabajador_id, tipo, titulo, descripcion,
     prioridad, fecha_limite, articulo_lft, accion_sugerida)
  SELECT
    p_empresa_id,
    r.trabajador_id,
    'aviso_tribunal_47',
    'Aviso al Tribunal pendiente: ' || t.nombre,
    'El trabajador se negó a recibir el aviso de rescisión del ' ||
    TO_CHAR(r.fecha_rescision, 'DD/MM/YYYY') ||
    '. Debe hacerse del conocimiento del Tribunal dentro de los cinco días hábiles siguientes, ' ||
    'proporcionando el último domicilio registrado. Transcurridos: ' ||
    public.dias_habiles_transcurridos(r.fecha_rescision, CURRENT_DATE)::text ||
    ' día(s) hábil(es) de 5. ' ||
    CASE
      WHEN public.dias_habiles_transcurridos(r.fecha_rescision, CURRENT_DATE) > 5
        THEN 'EL PLAZO YA VENCIÓ: la falta de aviso presume la separación injustificada.'
      ELSE 'Fecha límite: ' || TO_CHAR(public.fecha_limite_habil(r.fecha_rescision, 5), 'DD/MM/YYYY') || '.'
    END,
    'critica',
    public.fecha_limite_habil(r.fecha_rescision, 5),
    'Art. 47 LFT',
    'Presenta el escrito de aviso al Tribunal Laboral con copia del aviso y del acta de negativa.'
  FROM public.rescisiones r
  JOIN public.trabajadores t ON t.id = r.trabajador_id
  WHERE r.empresa_id                = p_empresa_id
    AND r.aviso_rechazado           = true
    AND r.aviso_tribunal_presentado = false
    AND r.fecha_rescision          IS NOT NULL;

  -- ─────────────────────────────────────────────────────────────────────
  -- 3. VIGENCIAS FISCALES SIN ACTUALIZAR
  --    CONASAMI publica el salario mínimo con vigencia del 1 de enero;
  --    INEGI la UMA del 1 de febrero. Se avisa en enero y febrero, que es
  --    cuando el dato viejo todavía se está usando para calcular.
  -- ─────────────────────────────────────────────────────────────────────
  INSERT INTO public.alertas
    (empresa_id, trabajador_id, tipo, titulo, descripcion,
     prioridad, fecha_limite, articulo_lft, accion_sugerida)
  SELECT
    p_empresa_id,
    NULL,
    'vigencias_caducas',
    'Valores fiscales sin actualizar para ' || EXTRACT(YEAR FROM CURRENT_DATE)::text,
    'Faltan por registrar: ' || string_agg(faltante.clave, ', ') ||
    '. Mientras no se capturen, la aplicación no generará documentos con cálculos legales ' ||
    '(prima de antigüedad, exención de ISR y cuotas del IMSS dependen de ellos).',
    'alta',
    MAKE_DATE(EXTRACT(YEAR FROM CURRENT_DATE)::int, 2, 28),
    'Art. 162 fr. II LFT / Art. 93 fr. XIII LISR',
    'Registra el salario mínimo y la UMA vigentes en Configuración → Valores vigentes.'
  FROM (
    SELECT c.clave
    FROM (VALUES ('salario_minimo_general', 1), ('salario_minimo_frontera', 1), ('uma_diaria', 2)) AS c(clave, mes_vigencia)
    WHERE EXTRACT(MONTH FROM CURRENT_DATE) <= 2
      AND CURRENT_DATE >= MAKE_DATE(EXTRACT(YEAR FROM CURRENT_DATE)::int, c.mes_vigencia, 1)
      AND NOT EXISTS (
        SELECT 1 FROM public.config_valores v
        WHERE v.clave = c.clave
          AND v.vigencia_desde >= MAKE_DATE(EXTRACT(YEAR FROM CURRENT_DATE)::int, c.mes_vigencia, 1)
      )
  ) AS faltante
  HAVING COUNT(*) > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generar_alertas_rescision(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dias_habiles_transcurridos(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fecha_limite_habil(date, integer) TO authenticated;

COMMENT ON FUNCTION public.generar_alertas_rescision(uuid) IS
  'Alertas de plazos fatales: prescripción del art. 517 fr. I, aviso al Tribunal del art. 47 y vigencias fiscales caducas. Debe invocarse DESPUÉS de generar_alertas.';
