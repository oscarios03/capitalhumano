-- ============================================================
--  Capital Humano MX — Migración Trabajadores v3
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--
--  Agrega TODAS las columnas que el código JavaScript escribe en
--  la tabla `trabajadores` (empleados.js, importación masiva en
--  app.js, renovarAPlanta) y que ninguna migración previa (00–10)
--  había creado. Sin esta migración, dar de alta o editar un
--  trabajador falla con "column ... does not exist", y la función
--  generar_alertas() (migración 07) tampoco encuentra
--  fecha_vencimiento_contrato ni periodo_prueba_dias.
--
--  Idempotente: usa ADD COLUMN IF NOT EXISTS. Puede ejecutarse
--  múltiples veces sin error. No elimina ni modifica columnas.
-- ============================================================

ALTER TABLE public.trabajadores
  -- ── Datos personales / identificación ──────────────────────
  ADD COLUMN IF NOT EXISTS edad                   INTEGER,
  ADD COLUMN IF NOT EXISTS estado_civil           TEXT,
  ADD COLUMN IF NOT EXISTS nacionalidad           TEXT    DEFAULT 'Mexicana',
  ADD COLUMN IF NOT EXISTS domicilio              TEXT,
  ADD COLUMN IF NOT EXISTS tipo_identificacion    TEXT,
  ADD COLUMN IF NOT EXISTS num_identificacion     TEXT,
  ADD COLUMN IF NOT EXISTS tipo_sangre            TEXT,
  ADD COLUMN IF NOT EXISTS enfermedades_cronicas  TEXT,

  -- ── Datos laborales / contrato ─────────────────────────────
  ADD COLUMN IF NOT EXISTS periodo_salario           TEXT DEFAULT 'mensual', -- 'mensual' | 'quincenal' | 'semanal'
  ADD COLUMN IF NOT EXISTS fecha_ingreso_reconocida  DATE,                   -- antigüedad reconocida (Art. 158 LFT)
  ADD COLUMN IF NOT EXISTS periodo_prueba_dias       INTEGER,                -- 30 o 90 días (Art. 39-A LFT)
  ADD COLUMN IF NOT EXISTS fecha_vencimiento_contrato DATE,                  -- usado por generar_alertas() (mig. 07)
  ADD COLUMN IF NOT EXISTS funciones                 TEXT,                   -- descripción de funciones (contrato)
  ADD COLUMN IF NOT EXISTS forma_pago                TEXT DEFAULT 'deposito',
  ADD COLUMN IF NOT EXISTS dias_pago                 TEXT,

  -- ── Jornada / horario ──────────────────────────────────────
  ADD COLUMN IF NOT EXISTS hora_inicio           TIME,
  ADD COLUMN IF NOT EXISTS hora_fin              TIME,
  ADD COLUMN IF NOT EXISTS hora_descanso_inicio  TIME,
  ADD COLUMN IF NOT EXISTS hora_descanso_fin     TIME,
  ADD COLUMN IF NOT EXISTS dias_semana           TEXT[],   -- p.ej. {Lunes,Martes,...}
  ADD COLUMN IF NOT EXISTS dia_descanso          TEXT,

  -- ── Contrato por obra / proyecto ───────────────────────────
  ADD COLUMN IF NOT EXISTS nombre_proyecto       TEXT,
  ADD COLUMN IF NOT EXISTS fecha_fin_proyecto    DATE,

  -- ── Contrato por temporada (Art. 42 Bis LFT) ───────────────
  ADD COLUMN IF NOT EXISTS temporadas            JSONB,    -- arreglo de objetos {desde, hasta, ...}

  -- ── Contrato por comisión (Arts. 285-289 LFT) ──────────────
  ADD COLUMN IF NOT EXISTS zona_asignada         TEXT,
  ADD COLUMN IF NOT EXISTS dias_presentacion     TEXT[],
  ADD COLUMN IF NOT EXISTS horario_presentacion  TEXT,
  ADD COLUMN IF NOT EXISTS tabla_comisiones      JSONB,    -- arreglo de objetos {concepto, porcentaje, ...}

  -- ── Contacto de emergencia ─────────────────────────────────
  ADD COLUMN IF NOT EXISTS contacto_emergencia_nombre      TEXT,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_parentesco  TEXT,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_telefono    TEXT,

  -- ── Beneficiarios ──────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS beneficiario1_nombre     TEXT,
  ADD COLUMN IF NOT EXISTS beneficiario1_parentesco TEXT,
  ADD COLUMN IF NOT EXISTS beneficiario1_telefono   TEXT,
  ADD COLUMN IF NOT EXISTS beneficiario2_nombre     TEXT,
  ADD COLUMN IF NOT EXISTS beneficiario2_parentesco TEXT,
  ADD COLUMN IF NOT EXISTS beneficiario2_telefono   TEXT;

-- ============================================================
--  COLUMNAS AÑADIDAS POR ESTA MIGRACIÓN (37 en total)
--  Origen: objetos pasados a supabase.from('trabajadores')
--          .insert()/.update() en empleados.js (datos),
--          app.js (importación masiva CSV) y renovarAPlanta();
--          también leídas por agente.js, bajas.js (periodo_salario)
--          y la función SQL generar_alertas() de la migración 07
--          (fecha_vencimiento_contrato, periodo_prueba_dias).
--
--  Personales / identificación:
--    edad, estado_civil, nacionalidad, domicilio,
--    tipo_identificacion, num_identificacion, tipo_sangre,
--    enfermedades_cronicas
--
--  Laborales / contrato:
--    periodo_salario, fecha_ingreso_reconocida, periodo_prueba_dias,
--    fecha_vencimiento_contrato, funciones, forma_pago, dias_pago
--
--  Jornada / horario:
--    hora_inicio, hora_fin, hora_descanso_inicio, hora_descanso_fin,
--    dias_semana, dia_descanso
--
--  Obra / proyecto:
--    nombre_proyecto, fecha_fin_proyecto
--
--  Temporada:
--    temporadas
--
--  Comisión:
--    zona_asignada, dias_presentacion, horario_presentacion,
--    tabla_comisiones
--
--  Contacto de emergencia:
--    contacto_emergencia_nombre, contacto_emergencia_parentesco,
--    contacto_emergencia_telefono
--
--  Beneficiarios:
--    beneficiario1_nombre, beneficiario1_parentesco, beneficiario1_telefono,
--    beneficiario2_nombre, beneficiario2_parentesco, beneficiario2_telefono
-- ============================================================
