-- Migración 09: Historial de cambios salariales
-- Aplicar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS historial_salarios (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  trabajador_id    uuid NOT NULL REFERENCES trabajadores(id) ON DELETE CASCADE,
  empresa_id       uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  salario_anterior numeric(12,2) NOT NULL,
  salario_nuevo    numeric(12,2) NOT NULL,
  motivo           text,
  fecha_cambio     date NOT NULL DEFAULT CURRENT_DATE,
  creado_en        timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_histsal_trabajador ON historial_salarios(trabajador_id);
CREATE INDEX IF NOT EXISTS idx_histsal_empresa    ON historial_salarios(empresa_id);

-- Row Level Security
ALTER TABLE historial_salarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "historial_salarios_empresa_own" ON historial_salarios
  USING (
    empresa_id IN (
      SELECT empresa_id FROM perfiles WHERE id = auth.uid()
    )
  );
