-- ============================================================================
-- Migración 50 — Incapacidades y licencias: quién paga cada tipo
-- ============================================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--
-- Contexto: la nómina trataba casi igual a todas las incapacidades y con dos
-- fundamentos equivocados.
--
--  · RIESGO DE TRABAJO — el IMSS paga el 100% del salario desde el PRIMER día
--    (Art. 58 fr. I LSS). El código le pagaba además los 3 primeros días a
--    cargo del patrón: se pagaba dos veces lo mismo.
--
--  · PATERNIDAD — no es una incapacidad del IMSS y el Seguro Social no paga
--    nada. Son 5 días laborables de permiso CON GOCE a cargo del patrón
--    (Art. 132 fr. XXVII Bis LFT). El código los descontaba del salario como
--    si fueran incapacidad y no los reponía: el trabajador perdía esos 5 días.
--
--  · ENFERMEDAD GENERAL / RECAÍDA — el subsidio del IMSS es del 60% y empieza
--    el CUARTO día (Art. 96 LSS). Los 3 primeros no los cubre nadie por ley:
--    la relación de trabajo está suspendida (Art. 42 fr. II LFT) y no hay
--    obligación de pagar salario. El código los pagaba citando el Art. 42 LFT,
--    que dice justamente lo contrario. Se conserva el pago porque muchas
--    empresas lo otorgan, pero ahora es una PRESTACIÓN configurable y no una
--    obligación inventada.
--
--  · MATERNIDAD — IMSS 100% durante 84 días (Art. 101 LSS). Ya era correcto.
--
-- Además los días de incapacidad se restaban del salario contando registros de
-- `asistencia` mientras el pago salía de la tabla `incapacidades`: si solo
-- existía una de las dos fuentes, o se pagaba doble o se descontaba sin
-- reponer. Ahora la fuente única es `incapacidades` (que es la que trae el
-- tipo) y `asistencia` queda como respaldo.
--
-- Idempotente: se puede ejecutar varias veces sin efecto adicional.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Prestación de empresa: ¿se cubren los 3 primeros días de enfermedad?
-- ----------------------------------------------------------------------------
-- Default TRUE para no recortar en silencio lo que las empresas ya venían
-- pagando con el comportamiento anterior. Quien solo cubra el mínimo de ley lo
-- apaga en Mi Empresa → Prestaciones.

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS paga_primeros_3_dias_incap BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.empresas.paga_primeros_3_dias_incap IS
  'Prestación de empresa: cubrir al 100% los 3 primeros días de enfermedad general/recaída, que el IMSS no subsidia (Art. 96 LSS) ni obliga la LFT (Art. 42 fr. II).';


-- ----------------------------------------------------------------------------
-- 2. Desglose de incapacidad en el recibo
-- ----------------------------------------------------------------------------
-- dias_incapacidad: días que SUSPENDEN la relación y salen del salario base.
-- dias_paternidad:  días de permiso con goce (Art. 132 fr. XXVII Bis LFT), que
--                   NO se descuentan — se separan solo para que el recibo y los
--                   reportes de ausentismo puedan distinguirlos.

ALTER TABLE recibos_nomina
  ADD COLUMN IF NOT EXISTS dias_incapacidad    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dias_paternidad     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS incapacidad_detalle JSONB;

COMMENT ON COLUMN recibos_nomina.dias_incapacidad IS
  'Días del período con la relación suspendida por incapacidad (Art. 42 fr. II LFT). No los cubre el salario base.';
COMMENT ON COLUMN recibos_nomina.dias_paternidad IS
  'Días de licencia de paternidad pagados por el patrón (Art. 132 fr. XXVII Bis LFT). No se descuentan del salario.';
COMMENT ON COLUMN recibos_nomina.incapacidad_detalle IS
  'Desglose por tipo: días en el período, días a cargo del patrón y quién paga el resto.';


-- ----------------------------------------------------------------------------
-- 3. Recibos anteriores
-- ----------------------------------------------------------------------------
-- No se reconstruyen: no hay forma de saber a qué tipo correspondían los días
-- que se descontaron desde `asistencia`. Regenerar el período los recalcula.
-- Conviene revisar los períodos con incapacidades de RIESGO DE TRABAJO (se
-- pagaron 3 días de más) y de PATERNIDAD (se descontaron 5 días de menos):
--
--   SELECT t.nombre, i.tipo, i.fecha_inicio, i.fecha_fin, i.dias
--     FROM incapacidades i
--     JOIN trabajadores t ON t.id = i.trabajador_id
--    WHERE i.tipo IN ('riesgo_trabajo', 'paternidad')
--    ORDER BY i.fecha_inicio DESC;
