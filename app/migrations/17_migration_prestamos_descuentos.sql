-- ============================================================
--  Capital Humano MX — Migración 17: Préstamos y descuentos
--  recurrentes (INFONAVIT, FONACOT, pensión alimenticia, préstamo
--  de empresa) con saldo, historial y tope del Art. 110 LFT.
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--
--  Idempotente: puede ejecutarse múltiples veces sin error.
--
--  NOTA DE DISEÑO: trabajadores.infonavit_activo/tipo/valor y
--  .pension_activa/tipo/valor (migración 02) YA aplicaban estos dos
--  descuentos automáticamente en cada nómina, pero como un valor
--  plano sin saldo ni historial. Esta migración copia (una sola vez)
--  esa configuración a filas de descuentos_trabajador para que a
--  partir de ahora tengan saldo, historial y el tope legal, sin
--  perder la configuración ya existente. El fondo de ahorro
--  (fondo_ahorro_activo/pct) NO se migra aquí: es una prestación de
--  ahorro, no una deuda, y su tratamiento fiscal se atiende en la
--  migración 18 (prestaciones_fiscal) manteniendo su almacenamiento
--  actual — moverlo aquí duplicaría su descuento en la nómina.
-- ============================================================

-- 1. Tabla descuentos_trabajador ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.descuentos_trabajador (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID REFERENCES public.empresas(id) NOT NULL,
  trabajador_id   UUID REFERENCES public.trabajadores(id) ON DELETE CASCADE NOT NULL,
  tipo            TEXT NOT NULL CHECK (tipo IN ('infonavit','fonacot','pension_alimenticia','prestamo_empresa','caja_ahorro','otro')),
  descripcion     TEXT,
  modalidad       TEXT NOT NULL CHECK (modalidad IN ('porcentaje','cuota_fija','vsm')),  -- vsm = veces UMA (INFONAVIT)
  valor           NUMERIC NOT NULL,           -- % si porcentaje, monto si cuota_fija, factor si vsm
  monto_total     NUMERIC,                    -- NULL = sin fin (pensión alimenticia, INFONAVIT %)
  saldo_restante  NUMERIC,
  numero_credito  TEXT,                       -- núm. crédito INFONAVIT/FONACOT o expediente judicial
  fecha_inicio    DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin       DATE,
  activo          BOOLEAN DEFAULT true,
  prioridad       INT DEFAULT 100,            -- pensión alimenticia = 1 (orden judicial, se aplica primero)
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS descuentos_trabajador_trab_idx ON public.descuentos_trabajador (trabajador_id, activo);

ALTER TABLE public.descuentos_trabajador ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "descuentos_trabajador_own" ON public.descuentos_trabajador;
CREATE POLICY "descuentos_trabajador_own" ON public.descuentos_trabajador FOR ALL
  USING  (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()));

-- 2. Tabla descuentos_aplicados (historial) ───────────────────────
CREATE TABLE IF NOT EXISTS public.descuentos_aplicados (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descuento_id    UUID REFERENCES public.descuentos_trabajador(id) ON DELETE CASCADE NOT NULL,
  empresa_id      UUID REFERENCES public.empresas(id) NOT NULL,
  periodo_id      UUID REFERENCES public.periodos_nomina(id),
  monto_aplicado  NUMERIC NOT NULL,
  saldo_despues   NUMERIC,
  fecha_aplicacion TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS descuentos_aplicados_desc_idx ON public.descuentos_aplicados (descuento_id);

ALTER TABLE public.descuentos_aplicados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "descuentos_aplicados_own" ON public.descuentos_aplicados;
CREATE POLICY "descuentos_aplicados_own" ON public.descuentos_aplicados FOR ALL
  USING  (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()));

-- 3. Columna para tipos de descuento sin columna dedicada en el recibo
--    (FONACOT, caja de ahorro vía descuento, otro).
ALTER TABLE public.recibos_nomina
  ADD COLUMN IF NOT EXISTS descuentos_detalle JSONB DEFAULT '[]';

-- 4. Migración de datos: preservar configuración ya existente ─────
-- 4.a INFONAVIT (trabajadores.infonavit_activo/tipo/valor)
INSERT INTO public.descuentos_trabajador
  (empresa_id, trabajador_id, tipo, descripcion, modalidad, valor, numero_credito, prioridad)
SELECT
  t.empresa_id, t.id, 'infonavit', 'Crédito INFONAVIT (migrado de configuración previa)',
  CASE t.infonavit_tipo WHEN 'factor' THEN 'vsm' WHEN 'pct' THEN 'porcentaje' ELSE 'cuota_fija' END,
  COALESCE(t.infonavit_valor, 0),
  NULL, 50
FROM public.trabajadores t
WHERE t.infonavit_activo = true
  AND NOT EXISTS (
    SELECT 1 FROM public.descuentos_trabajador d
    WHERE d.trabajador_id = t.id AND d.tipo = 'infonavit' AND d.activo = true
  );

-- 4.b Pensión alimenticia (trabajadores.pension_activa/tipo/valor) — prioridad 1
INSERT INTO public.descuentos_trabajador
  (empresa_id, trabajador_id, tipo, descripcion, modalidad, valor, prioridad)
SELECT
  t.empresa_id, t.id, 'pension_alimenticia', 'Pensión alimenticia (migrada de configuración previa)',
  CASE t.pension_tipo WHEN 'pct' THEN 'porcentaje' ELSE 'cuota_fija' END,
  COALESCE(t.pension_valor, 0),
  1
FROM public.trabajadores t
WHERE t.pension_activa = true
  AND NOT EXISTS (
    SELECT 1 FROM public.descuentos_trabajador d
    WHERE d.trabajador_id = t.id AND d.tipo = 'pension_alimenticia' AND d.activo = true
  );
