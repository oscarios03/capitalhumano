-- ============================================================================
-- Migración 49 — Tiempo extraordinario doble/triple y base gravable de ISR
-- ============================================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--
-- Contexto: la nómina pagaba TODAS las horas extra con un factor plano
-- (`empresas.factor_horas_extra`, por omisión 2). Eso cumple el Art. 67 LFT
-- (100% más sobre la hora ordinaria) pero ignora el segundo párrafo del
-- Art. 68: la prolongación del tiempo extraordinario que EXCEDA de nueve
-- horas A LA SEMANA obliga al patrón a pagar el tiempo excedente con un 200%
-- más — al triple. El trabajador nunca cobraba esa diferencia.
--
-- Además el tope es SEMANAL, no del período de pago: una semana partida entre
-- dos quincenas reiniciaba el contador y regalaba hasta 9 horas al doble en
-- cada mitad. El cálculo en nomina.js ahora lee las semanas completas que
-- tocan el período y paga solo la parte cuya fecha cae dentro de él.
--
-- Estas dos columnas guardan el desglose para que el recibo pueda imprimirlo:
-- un recibo que dice "12 hrs de tiempo extra" sin decir cuántas al doble y
-- cuántas al triple no permite al trabajador verificar el importe, que es
-- justo lo que exigen los Arts. 82, 88 y 132 fr. VII LFT.
--
-- El tope semanal aplicable lo resuelve horasExtraMaxVigente() en calculo.js
-- según el Transitorio Cuarto del decreto de reducción de jornada
-- (9 h en 2026-2027, 10 en 2028, 11 en 2029, 12 desde 2030).
--
-- Idempotente: se puede ejecutar varias veces sin efecto adicional.
-- ============================================================================

ALTER TABLE recibos_nomina
  ADD COLUMN IF NOT EXISTS horas_extra_dobles  NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS horas_extra_triples NUMERIC(6,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN recibos_nomina.horas_extra_dobles IS
  'Horas extra pagadas al doble (Art. 67 LFT): las primeras 9 de cada semana en 2026-2027.';
COMMENT ON COLUMN recibos_nomina.horas_extra_triples IS
  'Horas extra pagadas al triple (Art. 68, 2do párrafo LFT): las que exceden el tope semanal.';

-- Los recibos anteriores a esta migración se calcularon con factor plano; se
-- marcan como si todo hubiera ido al doble, que es lo que efectivamente se
-- pagó. Regenerar el período los recalcula con el desglose correcto.
UPDATE recibos_nomina
   SET horas_extra_dobles = COALESCE(horas_extra, 0)
 WHERE COALESCE(horas_extra, 0) > 0
   AND horas_extra_dobles = 0
   AND horas_extra_triples = 0;


-- ----------------------------------------------------------------------------
-- Base gravable del ISR separada de la exenta (Art. 93 LISR)
-- ----------------------------------------------------------------------------
-- El ISR del período se retenía sobre el TOTAL de percepciones: se gravaban
-- íntegros los vales de despensa, el tiempo extraordinario, la prima dominical
-- y la prima vacacional, todos con exención expresa en el Art. 93 LISR. El
-- desglose de previsión social sí se calculaba (columnas prestaciones_exento /
-- prestaciones_gravado) pero se ejecutaba DESPUÉS de retener y nunca entraba a
-- la base. Resultado: sobre-retención en todos los recibos con esos conceptos.
--
-- Estas columnas guardan la separación que ya aplica desglosarExencionesNomina()
-- en calculo.js, y son la entrada del ajuste anual del Art. 97: ajuste_anual.js
-- acumulaba `total_percepciones` —con exentos incluidos— y calculaba un
-- impuesto del ejercicio superior al que realmente correspondía.
--
-- A diferencia de prestaciones_exento (solo previsión social), percepciones_exentas
-- cubre TODOS los conceptos exentos del recibo.

ALTER TABLE recibos_nomina
  ADD COLUMN IF NOT EXISTS percepciones_exentas  NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percepciones_gravadas NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exenciones_detalle    JSONB;

COMMENT ON COLUMN recibos_nomina.percepciones_exentas IS
  'Parte exenta de ISR del período (Art. 93 LISR): tiempo extra dentro del límite legal, prima dominical, prima vacacional y previsión social.';
COMMENT ON COLUMN recibos_nomina.percepciones_gravadas IS
  'Base sobre la que se aplicó la tarifa del Art. 96 LISR. Es la entrada del ajuste anual del Art. 97.';
COMMENT ON COLUMN recibos_nomina.exenciones_detalle IS
  'Desglose por concepto de la exención aplicada, para poder auditar el recibo.';

-- Recibos anteriores: se calcularon gravando todo. Se refleja tal cual (exento
-- 0, gravado = lo devengado) para no inventar cifras. Regenerar el período —o
-- correr el ajuste anual del Art. 97— devuelve al trabajador lo retenido de más.
UPDATE recibos_nomina
   SET percepciones_gravadas = GREATEST(
         COALESCE(total_percepciones, 0)
           - COALESCE(monto_faltas, 0)
           - COALESCE(monto_falta_justif, 0)
           - COALESCE(monto_permiso_sin, 0), 0)
 WHERE percepciones_gravadas = 0
   AND COALESCE(total_percepciones, 0) > 0;
