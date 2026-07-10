-- ============================================================
--  Capital Humano MX — Biblioteca de consultas útiles (SQL Editor)
--
--  Cómo usar: copia el bloque que necesites en una New Query del SQL
--  Editor y guárdalo con el NOMBRE indicado en el título del bloque.
--  Así reemplazas los "Untitled query" por snippets con nombre.
--
--  Sugerencia de organización en el dashboard (carpetas):
--    · Diagnóstico   → bloques [DIAG-*]
--    · Nómina        → bloques [NOM-*]
--    · Alertas       → bloques [ALERTA-*]
--    · Planes        → bloques [PLAN-*]
--
--  EMPRESA: cada bloque resuelve la empresa con
--    (SELECT id FROM public.empresas LIMIT 1)
--  Si manejas MÁS DE UNA empresa, reemplaza ese subselect por el UUID
--  específico. Puedes ver los IDs con:  SELECT id, nombre FROM public.empresas;
--
--  Casi todas son SELECT de solo lectura. Las que ESCRIBEN o EJECUTAN
--  algo están marcadas con "-- ⚠️ ESCRIBE".
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- [DIAG-01] Inventario de tablas del esquema public
-- ─────────────────────────────────────────────────────────────
SELECT table_name,
       (SELECT count(*) FROM information_schema.columns c
         WHERE c.table_schema='public' AND c.table_name=t.table_name) AS columnas
  FROM information_schema.tables t
 WHERE table_schema='public' AND table_type='BASE TABLE'
 ORDER BY table_name;


-- ─────────────────────────────────────────────────────────────
-- [DIAG-02] Inventario de funciones (detecta duplicados por nombre)
-- ─────────────────────────────────────────────────────────────
SELECT p.proname AS funcion,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
 ORDER BY p.proname;


-- ─────────────────────────────────────────────────────────────
-- [DIAG-03] Políticas RLS por tabla
-- ─────────────────────────────────────────────────────────────
SELECT schemaname, tablename, policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname='public'
 ORDER BY tablename, policyname;


-- ─────────────────────────────────────────────────────────────
-- [NOM-01] Trabajadores activos: salario capturado, diario y equivalente mensual
--   (revisión de captura por frecuencia de pago — Art. 89 LFT)
-- ─────────────────────────────────────────────────────────────
SELECT nombre,
       periodo_salario,
       salario_mensual AS salario_capturado,
       round(salario_mensual / CASE periodo_salario
               WHEN 'quincenal' THEN 15
               WHEN 'semanal'   THEN 7
               ELSE 30 END, 2)                      AS salario_diario,
       round(salario_mensual / CASE periodo_salario
               WHEN 'quincenal' THEN 15
               WHEN 'semanal'   THEN 7
               ELSE 30 END * 30, 2)                 AS equivalente_mensual
  FROM public.trabajadores
 WHERE empresa_id = (SELECT id FROM public.empresas LIMIT 1)
   AND estado='activo'
 ORDER BY periodo_salario, nombre;


-- ─────────────────────────────────────────────────────────────
-- [NOM-02] Trabajadores activos sin SBC calculado (afecta IMSS por ramos)
-- ─────────────────────────────────────────────────────────────
SELECT nombre, puesto, salario_mensual, periodo_salario
  FROM public.trabajadores
 WHERE empresa_id = (SELECT id FROM public.empresas LIMIT 1)
   AND estado='activo'
   AND (sbc IS NULL OR sbc = 0)
 ORDER BY nombre;


-- ─────────────────────────────────────────────────────────────
-- [NOM-03] Períodos de nómina sin recibos generados
-- ─────────────────────────────────────────────────────────────
SELECT p.nombre, p.tipo, p.fecha_inicio, p.fecha_fin, p.fecha_pago, p.cerrado
  FROM public.periodos_nomina p
  LEFT JOIN public.recibos_nomina r ON r.periodo_id = p.id
 WHERE p.empresa_id = (SELECT id FROM public.empresas LIMIT 1)
 GROUP BY p.id
HAVING count(r.id) = 0
 ORDER BY p.fecha_inicio DESC;


-- ─────────────────────────────────────────────────────────────
-- [NOM-04] Recibos con neto negativo o cero (posible error de captura)
-- ─────────────────────────────────────────────────────────────
SELECT t.nombre, p.nombre AS periodo, r.total_percepciones,
       r.total_deducciones, r.neto_pagar
  FROM public.recibos_nomina r
  JOIN public.trabajadores t    ON t.id = r.trabajador_id
  JOIN public.periodos_nomina p ON p.id = r.periodo_id
 WHERE r.empresa_id = (SELECT id FROM public.empresas LIMIT 1)
   AND r.neto_pagar <= 0
 ORDER BY r.neto_pagar;


-- ─────────────────────────────────────────────────────────────
-- [NOM-05] Total de nómina por período (control)
-- ─────────────────────────────────────────────────────────────
SELECT p.nombre, p.tipo, count(r.id) AS recibos,
       sum(r.total_percepciones) AS percepciones,
       sum(r.total_deducciones)  AS deducciones,
       sum(r.neto_pagar)         AS neto
  FROM public.periodos_nomina p
  LEFT JOIN public.recibos_nomina r ON r.periodo_id = p.id
 WHERE p.empresa_id = (SELECT id FROM public.empresas LIMIT 1)
 GROUP BY p.id
 ORDER BY p.fecha_inicio DESC;


-- ─────────────────────────────────────────────────────────────
-- [ALERTA-01] Alertas activas de una empresa
-- ─────────────────────────────────────────────────────────────
SELECT tipo, prioridad, titulo, fecha_limite, created_at
  FROM public.alertas
 WHERE empresa_id = (SELECT id FROM public.empresas LIMIT 1)
   AND resuelta = false
 ORDER BY CASE prioridad WHEN 'critica' THEN 0 WHEN 'alta' THEN 1
                         WHEN 'media' THEN 2 ELSE 3 END, fecha_limite;


-- ─────────────────────────────────────────────────────────────
-- [ALERTA-02] Regenerar alertas de una empresa  -- ⚠️ ESCRIBE
-- ─────────────────────────────────────────────────────────────
SELECT public.generar_alertas(
         (SELECT id FROM public.empresas LIMIT 1));
SELECT public.generar_alertas_nomina(
         (SELECT id FROM public.empresas LIMIT 1));


-- ─────────────────────────────────────────────────────────────
-- [PLAN-01] Plan y suscripción vigente por usuario
--   ⚠️ Requiere la migración 21 (planes) aplicada.
--      Al 2026-07-09 las tablas planes/suscripciones NO existen en
--      este proyecto, así que esta consulta fallará hasta aplicarla.
-- ─────────────────────────────────────────────────────────────
SELECT s.usuario_id, pl.nombre AS plan, s.estado,
       s.trial_hasta, s.vigente_hasta
  FROM public.suscripciones s
  JOIN public.planes pl ON pl.id = s.plan_id
 ORDER BY s.usuario_id;
