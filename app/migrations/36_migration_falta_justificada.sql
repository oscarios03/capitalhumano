-- ============================================================================
-- Migración 36 — Nómina: descuento por falta justificada
-- ============================================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--
-- Contexto: hasta la migración 35 el recibo solo tenía línea de deducción para
-- faltas INJUSTIFICADAS (dias_falta/monto_faltas) y permiso sin goce
-- (dias_permiso_sin/monto_permiso_sin). La falta JUSTIFICADA (asistencia.tipo
-- = 'falta_justif') no se descontaba en ningún lado del motor de nómina, así
-- que se pagaba el día completo — idéntico a un permiso CON goce.
--
-- Decisión de negocio (jul 2026): una falta justificada excusa la sanción
-- (Art. 47 fr. X LFT: no cuenta para la rescisión) pero NO genera salario
-- (principio "sin trabajo no hay salario", Arts. 82-84 LFT). Por eso se
-- descuenta como línea propia, separada de la injustificada, para no
-- contaminar el conteo de faltas que alimenta el tablero de riesgo Art. 47.
--
-- Estas columnas replican el patrón de dias_permiso_sin/monto_permiso_sin.
-- El motor (nomina.js generarNominaPeriodo) ya las escribe; aplicar esta
-- migración ANTES de desplegar el nuevo nomina.js.
--
-- Idempotente.
-- ============================================================================

ALTER TABLE public.recibos_nomina
  ADD COLUMN IF NOT EXISTS dias_falta_justif  INTEGER       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_falta_justif NUMERIC(12,2) DEFAULT 0;
