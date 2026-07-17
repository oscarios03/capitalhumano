-- ============================================================================
-- Migración 35 — Nómina: caja de ahorro/préstamo de caja y pago mixto
-- ============================================================================
-- Fase 6 (parcial): quedan pendientes los layouts bancarios (BBVA/Banorte/
-- Santander) hasta contar con los manuales técnicos — no se tocan aquí.
--
-- · prestamo_caja — nuevo tipo de descuento: un préstamo contra el fondo de
--   la caja de ahorro del propio trabajador, distinto de prestamo_empresa
--   (que es un préstamo directo del patrón). caja_ahorro YA existía desde
--   la migración 17 (tanto en el CHECK como en la UI de descuentos.js);
--   solo hacía falta prestamo_caja.
-- · recibos_nomina.metodo_pago / monto_efectivo — snapshot en el recibo del
--   pago mixto configurado en trabajadores (migración 34: metodo_pago/
--   monto_efectivo), con el mismo patrón que ya usan forma_pago y
--   cuenta_bancaria (se copian al generar el recibo, no se leen en vivo del
--   trabajador después). trabajadores.forma_pago NO se toca: sigue
--   determinando el texto del contrato y no tiene relación con esto.
--
-- Idempotente.
-- ============================================================================

ALTER TABLE public.descuentos_trabajador DROP CONSTRAINT IF EXISTS descuentos_trabajador_tipo_check;
ALTER TABLE public.descuentos_trabajador ADD CONSTRAINT descuentos_trabajador_tipo_check
  CHECK (tipo IN ('infonavit','fonacot','pension_alimenticia','prestamo_empresa','prestamo_caja','caja_ahorro','otro'));

ALTER TABLE public.recibos_nomina
  ADD COLUMN IF NOT EXISTS metodo_pago    TEXT DEFAULT 'transferencia',
  ADD COLUMN IF NOT EXISTS monto_efectivo NUMERIC(12,2) DEFAULT 0;
