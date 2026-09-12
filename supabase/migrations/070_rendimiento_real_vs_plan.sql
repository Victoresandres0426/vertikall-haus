-- ============================================================
-- 070 — Rendimiento real vs. plan (reemplaza el score de
--        Productividad simplista por horas trabajadas/no trabajadas)
-- ============================================================
-- Hasta ahora "Productividad" en el IIDP solo miraba horas_productivas
-- vs horas_improductivas del día -- en la práctica casi nunca reflejaba
-- nada real (la columna horas_improductivas nunca se llena desde el
-- Reporte Diario).
--
-- Ahora Productividad compara, para cada trabajador/actividad/día:
--   - cuánto produjo realmente (avance_cantidad, ya capturado en
--     asistencia_actividad_diaria desde la migración 054)
--   - contra cuánto DEBERÍA haber producido en esas horas según el plan
--     de la actividad (cantidad_objetivo, duracion_plan_dias, y ahora
--     personal_planeado -- si trabaja más gente de la planeada sin
--     producir más, el rendimiento por hora-hombre cae, tal como debe
--     ser).
--
-- personal_planeado es la cantidad de trabajadores que el plan asume
-- para terminar cantidad_objetivo en duracion_plan_dias. Si queda sin
-- configurar, se asume 1 (comportamiento anterior, más conservador).
-- ============================================================

ALTER TABLE actividades ADD COLUMN IF NOT EXISTS personal_planeado INTEGER;

COMMENT ON COLUMN actividades.personal_planeado IS
  'Cantidad de trabajadores que el plan asume para lograr cantidad_objetivo en duracion_plan_dias. NULL = se asume 1 al calcular rendimiento.';
