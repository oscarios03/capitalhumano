-- ═══════════════════════════════════════════════════════════════════════════
--  Migración 29 — Auditoría de seguridad, severidad Media (Fase 3)
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════════════
--  M-9: el bucket `expedientes` (Supabase Storage) tenía `allowed_mime_types
--  = NULL` en producción — es decir, SIN whitelist de tipo de archivo pese a
--  que el frontend (expediente.js, resguardos.js) solo ofrece
--  accept=".pdf,.jpg,.jpeg,.png" en el input. Sin el whitelist server-side,
--  cualquiera con sesión válida podía subir cualquier tipo de archivo
--  (ej. HTML/SVG con script embebido) simplemente evadiendo el atributo
--  `accept` del input (que solo es una sugerencia de UI, no una validación
--  real). De paso se sube `file_size_limit` de 5 MB a 10 MB para que
--  coincida con el límite que ya validaba el frontend (antes el backend era
--  MÁS estricto que el frontend — un archivo de 6-9 MB pasaba la validación
--  JS y luego fallaba en el backend con un error confuso).
--
--  Idempotente: seguro de ejecutar más de una vez.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['application/pdf','image/jpeg','image/png'],
    file_size_limit     = 10485760
WHERE id = 'expedientes';
