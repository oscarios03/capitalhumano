-- ============================================================
--  Capital Humano MX — Backfill: puestos de texto libre → catálogo
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--  Requiere: 30_migration_puestos.sql ya aplicada.
--
--  Convierte los `trabajadores.puesto` de texto libre existentes en
--  plantillas del catálogo `puestos` y enlaza `trabajadores.puesto_id`.
--  IDEMPOTENTE: se puede correr varias veces sin duplicar ni re-enlazar.
--  El texto en `trabajadores.puesto` se conserva (copiar-no-vincular).
-- ============================================================

-- Paso 1: crear una plantilla por cada (empresa, puesto distinto), tomando los
-- datos de un trabajador representativo (el de ingreso más reciente). El match
-- es case-insensitive y sin espacios sobrantes para no duplicar plantillas.
WITH rep AS (
  SELECT DISTINCT ON (empresa_id, lower(btrim(puesto)))
    empresa_id,
    btrim(puesto)   AS nombre,
    departamento,
    funciones,
    salario_mensual AS salario_sugerido,   -- monto del periodo de pago del trabajador
    periodo_salario,
    tipo_contrato,
    es_puesto_direccion,
    tipo_salario,
    pct_comision,
    smg_zone
  FROM public.trabajadores
  WHERE puesto IS NOT NULL AND btrim(puesto) <> ''
  ORDER BY empresa_id, lower(btrim(puesto)),
           fecha_ingreso DESC NULLS LAST, creado_en DESC NULLS LAST
)
INSERT INTO public.puestos
  (empresa_id, nombre, departamento, funciones, salario_sugerido,
   periodo_salario, tipo_contrato, es_puesto_direccion, tipo_salario, pct_comision, smg_zone)
SELECT
  r.empresa_id, r.nombre, r.departamento, r.funciones, r.salario_sugerido,
  COALESCE(r.periodo_salario, 'mensual'), r.tipo_contrato,
  COALESCE(r.es_puesto_direccion, false), r.tipo_salario, r.pct_comision, r.smg_zone
FROM rep r
WHERE NOT EXISTS (
  SELECT 1 FROM public.puestos p
  WHERE p.empresa_id = r.empresa_id
    AND lower(btrim(p.nombre)) = lower(btrim(r.nombre))
);

-- Paso 2: enlazar cada trabajador con su plantilla (solo los que aún no la tienen).
UPDATE public.trabajadores t
SET puesto_id = p.id
FROM public.puestos p
WHERE t.puesto_id IS NULL
  AND t.puesto IS NOT NULL AND btrim(t.puesto) <> ''
  AND p.empresa_id = t.empresa_id
  AND lower(btrim(p.nombre)) = lower(btrim(t.puesto));

-- Verificación (opcional): deben quedar 0 trabajadores con puesto de texto sin enlazar.
-- SELECT count(*) FROM public.trabajadores
-- WHERE puesto_id IS NULL AND puesto IS NOT NULL AND btrim(puesto) <> '';
