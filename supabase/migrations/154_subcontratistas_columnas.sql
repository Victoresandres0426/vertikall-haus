-- 154: Asegura que subcontratistas tenga todas las columnas que usa la app
-- (la tabla ya existía con otra forma y CREATE TABLE IF NOT EXISTS no la completó).
-- Idempotente.

ALTER TABLE subcontratistas
  ADD COLUMN IF NOT EXISTS nombre_compania    TEXT,
  ADD COLUMN IF NOT EXISTS contacto_nombre    TEXT,
  ADD COLUMN IF NOT EXISTS telefono           TEXT,
  ADD COLUMN IF NOT EXISTS email              TEXT,
  ADD COLUMN IF NOT EXISTS direccion          TEXT,
  ADD COLUMN IF NOT EXISTS sitio_web          TEXT,
  ADD COLUMN IF NOT EXISTS especialidad       TEXT,
  ADD COLUMN IF NOT EXISTS ein                TEXT,
  ADD COLUMN IF NOT EXISTS w9_recibido        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS licencia_numero    TEXT,
  ADD COLUMN IF NOT EXISTS licencia_vence     DATE,
  ADD COLUMN IF NOT EXISTS seguro_aseguradora TEXT,
  ADD COLUMN IF NOT EXISTS seguro_poliza      TEXT,
  ADD COLUMN IF NOT EXISTS seguro_vence       DATE,
  ADD COLUMN IF NOT EXISTS workers_comp       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS metodo_pago        TEXT,
  ADD COLUMN IF NOT EXISTS datos_pago         TEXT,
  ADD COLUMN IF NOT EXISTS calificacion       SMALLINT,
  ADD COLUMN IF NOT EXISTS activo             BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notas              TEXT,
  ADD COLUMN IF NOT EXISTS created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Columnas heredadas de la primera versión del esquema (001) que la app no usa
ALTER TABLE subcontratistas
  ALTER COLUMN proveedor_id DROP NOT NULL,
  ALTER COLUMN nombre DROP NOT NULL;

-- Refresca la caché de esquema de la API
NOTIFY pgrst, 'reload schema';

-- Diagnóstico: columnas actuales de la tabla
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'subcontratistas'
ORDER BY ordinal_position;
