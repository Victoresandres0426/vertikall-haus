-- ============================================================
-- 008 — SEED DEMO TRABAJADORES
-- ============================================================
-- Adds sample workers so the Personal page is not empty.
-- Run AFTER migration 001 and 003 (which seeds the company).
-- ============================================================

DO $$
DECLARE
  v_empresa_id UUID;
BEGIN
  -- Get the first empresa in the system
  SELECT id INTO v_empresa_id FROM empresas LIMIT 1;

  IF v_empresa_id IS NULL THEN
    RAISE NOTICE 'No empresa found — skipping seed';
    RETURN;
  END IF;

  INSERT INTO trabajadores (
    empresa_id, nombre_completo, codigo, especialidad,
    rol_obra, nivel_experiencia, tarifa_diaria, moneda,
    activo, fecha_ingreso
  ) VALUES
    (v_empresa_id, 'Carlos Ramírez Torres',    'T-001', 'Instalaciones eléctricas',  'electricista',  'senior', 950.00,  'MXN', true,  '2022-03-01'),
    (v_empresa_id, 'Miguel Ángel López Ruiz',  'T-002', 'Estructuras de concreto',   'albañil',       'senior', 800.00,  'MXN', true,  '2021-09-15'),
    (v_empresa_id, 'José Hernández Morales',   'T-003', 'Plomería e hidráulica',     'plomero',       'medio',  750.00,  'MXN', true,  '2023-01-10'),
    (v_empresa_id, 'Andrés García Jiménez',    'T-004', 'Acabados y pintura',        'pintor',        'medio',  650.00,  'MXN', true,  '2023-05-20'),
    (v_empresa_id, 'Roberto Martínez Soto',    'T-005', 'Soldadura y herrería',      'herrero',       'senior', 900.00,  'MXN', true,  '2022-11-01'),
    (v_empresa_id, 'Juan Pablo Díaz Cruz',     'T-006', 'Carpintería en general',    'carpintero',    'medio',  700.00,  'MXN', true,  '2023-03-15'),
    (v_empresa_id, 'Luis Fernando Reyes Paz',  'T-007', 'Ayudante general',          'ayudante',      'junior', 500.00,  'MXN', true,  '2024-02-01'),
    (v_empresa_id, 'Francisco Mendoza Ríos',   'T-008', 'Ayudante general',          'ayudante',      'junior', 500.00,  'MXN', true,  '2024-02-01'),
    (v_empresa_id, 'Daniel Vargas Gutiérrez',  'T-009', 'Impermeabilización',        'impermeabilizador', 'medio', 720.00, 'MXN', true, '2023-07-10'),
    (v_empresa_id, 'Arturo Castillo Vega',     'T-010', 'Instalación de pisos',      'pisos',         'senior', 850.00,  'MXN', true,  '2022-08-20')
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Seed trabajadores inserted for empresa %', v_empresa_id;
END;
$$;
