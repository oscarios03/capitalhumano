-- ═══════════════════════════════════════════════════════════════════════════
-- 42 — Jornada como parte de la plantilla de puesto
--
-- El contrato debe imprimir la jornada REALMENTE pactada con el trabajador
-- (Art. 25 fr. III LFT exige señalar la duración de la jornada). Hasta ahora
-- `_buildContratoData` (pdfs.js) fabricaba un horario genérico —09:00 a 18:00,
-- lunes a viernes, descanso el domingo— cuando el trabajador no tenía jornada
-- capturada. Eso imprime un horario ficticio en un documento que se firma.
--
-- La jornada de un puesto suele ser una condición del PUESTO (un cajero de
-- turno matutino, un vendedor de zona con horario partido), no un dato que se
-- improvise trabajador por trabajador. Se agrega al catálogo de puestos
-- (migración 30) siguiendo el mismo patrón "copiar-no-vincular" que ya usan
-- funciones y salario_sugerido: la plantilla propone, el alta copia el valor
-- si el campo está vacío, y el trabajador puede ajustarlo sin alterar la
-- plantilla.
--
-- Requiere: 30_migration_puestos.sql
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.puestos
  ADD COLUMN IF NOT EXISTS hora_inicio          TIME,
  ADD COLUMN IF NOT EXISTS hora_fin             TIME,
  ADD COLUMN IF NOT EXISTS hora_descanso_inicio TIME,
  ADD COLUMN IF NOT EXISTS hora_descanso_fin    TIME,
  ADD COLUMN IF NOT EXISTS dias_semana          TEXT[],
  ADD COLUMN IF NOT EXISTS dia_descanso          TEXT;

COMMENT ON COLUMN public.puestos.hora_inicio IS
  'Jornada estándar del puesto. Se copia al trabajador al elegirlo en el alta (solo si el campo está vacío); no se vincula.';
COMMENT ON COLUMN public.puestos.dias_semana IS
  'Días laborales estándar del puesto, p.ej. {Lunes,Martes,Miercoles,Jueves,Viernes}.';
