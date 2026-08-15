-- ============================================================
-- DATOS SEMILLA — Configuración inicial Vertikall Haus
-- ============================================================

-- NOTA: Esta semilla crea datos de demostración.
-- En producción, el primer "dueño" creará su empresa al registrarse.

-- Configuración de umbrales por defecto (referencia del documento, sec. 6)
-- Estos valores son CONFIGURABLES por empresa y por proyecto.
INSERT INTO empresas (id, nombre, configuracion) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Vertikall Haus',
  '{
    "umbrales": {
      "alerta_amarilla_pct": 5,
      "alerta_roja_pct": 10,
      "escalamiento_dueno_pct": 5,
      "lead_time_material_local_dias": 2,
      "lead_time_material_especial_dias": 15
    },
    "iidp_pesos": {
      "cronograma": 0.25,
      "finanzas": 0.25,
      "productividad": 0.20,
      "calidad": 0.15,
      "logistica": 0.10,
      "gestion": 0.05
    },
    "nomina": {
      "jurisdiccion": "MX",
      "periodo_default": "semanal",
      "overtime_multiplicador": 2.0,
      "horas_jornada": 8
    }
  }'::jsonb
) ON CONFLICT DO NOTHING;
