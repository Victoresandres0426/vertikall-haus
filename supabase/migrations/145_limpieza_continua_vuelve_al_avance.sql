-- 145: Limpieza continua (00.02) de Radnor vuelve a contar en el avance
-- real, calculado por sus reportes como cualquier otra actividad (deja
-- de avanzar "por tiempo"). Supervisión (ADM.01) sigue fuera del avance
-- real y avanzando por tiempo (migración 144).
UPDATE actividades
SET avance_por_tiempo = FALSE, excluir_de_avance = FALSE
WHERE codigo = '00.02' AND proyecto_id = '561331ad-3d02-40b4-b10b-19f031711440';

-- Su avance_porcentaje se había sobrescrito con el % del plan: se
-- recalcula desde los reportes diarios (misma función que usa el botón
-- "Recalcular" de Actividades).
DO $$
DECLARE v_id UUID;
BEGIN
  FOR v_id IN
    SELECT id FROM actividades
    WHERE codigo = '00.02' AND proyecto_id = '561331ad-3d02-40b4-b10b-19f031711440'
  LOOP
    PERFORM _recalcular_avance_actividad(v_id);
  END LOOP;
END $$;
