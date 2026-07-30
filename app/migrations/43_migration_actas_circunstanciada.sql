-- ═══════════════════════════════════════════════════════════════════════════
-- 43 — Acta administrativa → acta circunstanciada
--
-- El acta sólo registraba hora de inicio (hora_falta), testigos con nombre y
-- puesto (sin forma de citarlos si el litigio llega dos años después), y no
-- dejaba constancia de que se le dio al trabajador oportunidad de manifestar
-- su versión de los hechos ni de que la diligencia se cerró y se leyó en voz
-- alta a los presentes. Eso la deja más débil de lo que podría ser como
-- prueba: no es un requisito de forma que la LFT exija expresamente para
-- actas administrativas privadas, pero fortalece su valor probatorio y evita
-- que el trabajador alegue después que no se le dio oportunidad de hablar o
-- que la diligencia nunca se cerró formalmente.
--
-- Columnas NULLABLE a propósito: las actas ya generadas antes de esta
-- migración no tienen estos datos y generateActaPDF() sigue pudiendo
-- regenerar su PDF (reDescargarActa) sin fabricar hora de cierre ni
-- manifestación que nunca se capturaron. La captura es obligatoria sólo
-- para actas NUEVAS, a nivel de aplicación (disciplinario.js).
--
-- No se agrega "lugar_exacto": la tabla ya tiene `lugar` con el mismo
-- propósito (Ej. "Piso de producción, instalaciones de la empresa");
-- duplicar la columna no aporta nada.
--
-- Requiere: tabla `actas` (existente, sin migración numerada localizable)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.actas
  ADD COLUMN IF NOT EXISTS hora_cierre             TEXT,
  ADD COLUMN IF NOT EXISTS manifestacion_trabajador TEXT,
  ADD COLUMN IF NOT EXISTS testigo1_ine             TEXT,
  ADD COLUMN IF NOT EXISTS testigo1_domicilio       TEXT,
  ADD COLUMN IF NOT EXISTS testigo2_ine             TEXT,
  ADD COLUMN IF NOT EXISTS testigo2_domicilio       TEXT;

COMMENT ON COLUMN public.actas.hora_cierre IS
  'Hora de cierre de la diligencia. Obligatoria en el formulario para actas nuevas; NULL en actas previas a esta migración.';
COMMENT ON COLUMN public.actas.manifestacion_trabajador IS
  'Derecho de audiencia: lo que el trabajador manifestó (o que se negó a manifestar) al dársele el uso de la voz.';
