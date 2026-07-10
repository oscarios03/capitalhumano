-- ============================================================
--  Capital Humano MX — Migración: Módulo Multi-Sucursal
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
--  Solo si ya tienes la base de datos creada con setup.sql
-- ============================================================

-- 1. Crear tabla sucursales
CREATE TABLE IF NOT EXISTS public.sucursales (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID REFERENCES public.empresas(id) NOT NULL,
  nombre              TEXT NOT NULL,
  clave               TEXT,
  tipo                TEXT DEFAULT 'sucursal' CHECK (tipo IN ('matriz','sucursal')),
  domicilio           TEXT,
  ciudad              TEXT,
  estado              TEXT,
  cp                  TEXT,
  telefono            TEXT,
  responsable_nombre  TEXT,
  responsable_puesto  TEXT,
  activa              BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- 2. Agregar columna sucursal_id a trabajadores
ALTER TABLE public.trabajadores
  ADD COLUMN IF NOT EXISTS sucursal_id UUID REFERENCES public.sucursales(id);

-- 3. RLS para sucursales
ALTER TABLE public.sucursales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sucursales_own" ON public.sucursales;
CREATE POLICY "sucursales_own" ON public.sucursales FOR ALL
  USING (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.perfiles WHERE id = auth.uid()));

-- 4. Función RPC: obtener o crear la matriz de la empresa actual
CREATE OR REPLACE FUNCTION public.get_or_create_matriz()
RETURNS UUID AS $$
DECLARE
  v_empresa_id UUID;
  v_matriz_id  UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_id
    FROM public.perfiles WHERE id = auth.uid();

  SELECT id INTO v_matriz_id
    FROM public.sucursales
    WHERE empresa_id = v_empresa_id AND tipo = 'matriz'
    LIMIT 1;

  IF v_matriz_id IS NULL THEN
    INSERT INTO public.sucursales (empresa_id, nombre, tipo)
    SELECT v_empresa_id, e.nombre, 'matriz'
      FROM public.empresas e WHERE e.id = v_empresa_id
    RETURNING id INTO v_matriz_id;
  END IF;

  RETURN v_matriz_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
