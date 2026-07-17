-- ============================================================================
-- Migración 34 — Trabajadores v4
-- ============================================================================
-- · fecha_nacimiento — sustituye a `edad` como fuente de verdad. La edad
--   caduca (hay que recapturarla cada año); la fecha de nacimiento no.
--   `edad` se conserva porque los contratos PDF ya la imprimen: la app la
--   sigue guardando, pero ahora calculada.
-- · sexo — se autollena desde la CURP (posición 11).
-- · telefono — teléfono del trabajador (WhatsApp). No existía: solo había
--   teléfonos de contacto de emergencia y de beneficiarios.
-- · metodo_pago / monto_efectivo — pago mixto transferencia+efectivo, común
--   en pymes del interior (lo usa la Fase 6).
--
-- Incluye backfill de fecha_nacimiento y sexo desde la CURP ya capturada.
--
-- Idempotente.
-- ============================================================================

ALTER TABLE public.trabajadores
  ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE,
  ADD COLUMN IF NOT EXISTS sexo             TEXT,
  ADD COLUMN IF NOT EXISTS telefono         TEXT,
  ADD COLUMN IF NOT EXISTS metodo_pago      TEXT DEFAULT 'transferencia',
  ADD COLUMN IF NOT EXISTS monto_efectivo   NUMERIC(12,2) DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trabajadores_sexo_chk') THEN
    ALTER TABLE public.trabajadores ADD CONSTRAINT trabajadores_sexo_chk
      CHECK (sexo IS NULL OR sexo IN ('Masculino','Femenino','No binario'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trabajadores_metodo_pago_chk') THEN
    ALTER TABLE public.trabajadores ADD CONSTRAINT trabajadores_metodo_pago_chk
      CHECK (metodo_pago IS NULL OR metodo_pago IN ('transferencia','efectivo','mixto'));
  END IF;
END $$;

-- ── Backfill desde la CURP ──────────────────────────────────────────────────
-- El siglo se deduce del carácter 17 (homoclave): dígito = 1900s, letra = 2000s
-- (así lo asigna RENAPO desde el año 2000). Solo se tocan las filas con CURP
-- bien formada y fecha coherente; el resto queda para captura manual.
UPDATE public.trabajadores
   SET fecha_nacimiento = to_date(
         (CASE WHEN substring(curp, 17, 1) ~ '^\d$' THEN '19' ELSE '20' END)
         || substring(curp, 5, 6), 'YYYYMMDD')
 WHERE fecha_nacimiento IS NULL
   AND curp IS NOT NULL
   AND curp ~ '^[A-Z]{4}\d{6}[HMX][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9]\d$'
   AND substring(curp, 7, 2) BETWEEN '01' AND '12'
   AND substring(curp, 9, 2) BETWEEN '01' AND '31';

UPDATE public.trabajadores
   SET sexo = CASE substring(curp, 11, 1)
                WHEN 'H' THEN 'Masculino'
                WHEN 'M' THEN 'Femenino'
                WHEN 'X' THEN 'No binario'
              END
 WHERE sexo IS NULL
   AND curp IS NOT NULL
   AND curp ~ '^[A-Z]{4}\d{6}[HMX][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9]\d$';

-- Si no había CURP pero sí edad capturada, se estima la fecha de nacimiento
-- para no perder el dato. Es una aproximación (1 de enero del año estimado):
-- se marca como tal para que el usuario la corrija.
UPDATE public.trabajadores
   SET fecha_nacimiento = make_date(EXTRACT(YEAR FROM now())::int - edad, 1, 1)
 WHERE fecha_nacimiento IS NULL
   AND edad IS NOT NULL AND edad BETWEEN 14 AND 99;

CREATE INDEX IF NOT EXISTS trabajadores_telefono_idx ON public.trabajadores (telefono)
  WHERE telefono IS NOT NULL;

-- ── Tipos de documento del expediente ───────────────────────────────────────
-- BUG PREEXISTENTE: expediente.js ofrece el tipo 'resguardo' en su selector,
-- pero el ENUM de la migración 12 solo tiene contrato/identificacion/acta/
-- justificante/otro — subir una carta responsiva firmada fallaba siempre con
-- un error de enum. Se agrega 'resguardo' y los tipos que necesita el semáforo
-- de completitud del expediente (los que pide un expediente laboral bien
-- integrado y que se vuelven prueba en un juicio).
-- Nota: ALTER TYPE ... ADD VALUE no admite ir dentro de un bloque con
-- manejador de excepciones (abre una subtransacción), así que van sueltas.
-- `IF NOT EXISTS` ya las hace idempotentes.
ALTER TYPE tipo_documento_enum ADD VALUE IF NOT EXISTS 'resguardo';             -- carta responsiva de equipo
ALTER TYPE tipo_documento_enum ADD VALUE IF NOT EXISTS 'comprobante_domicilio';
ALTER TYPE tipo_documento_enum ADD VALUE IF NOT EXISTS 'acta_nacimiento';
ALTER TYPE tipo_documento_enum ADD VALUE IF NOT EXISTS 'csf';                   -- constancia de situación fiscal (SAT)
ALTER TYPE tipo_documento_enum ADD VALUE IF NOT EXISTS 'curp_doc';
ALTER TYPE tipo_documento_enum ADD VALUE IF NOT EXISTS 'nss_doc';               -- constancia de NSS del IMSS
ALTER TYPE tipo_documento_enum ADD VALUE IF NOT EXISTS 'titulo_cedula';
ALTER TYPE tipo_documento_enum ADD VALUE IF NOT EXISTS 'examen_medico';
