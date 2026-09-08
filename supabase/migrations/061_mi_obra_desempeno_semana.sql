-- ============================================================
-- 061 — /mi-obra: cada trabajador ve su desempeño de la semana
-- ============================================================
-- Igual que "Ver actividades del proyecto" (migración 052), ahora hay
-- un botón para que el propio trabajador vea, sin necesidad de cuenta
-- ni contraseña, cuánto lleva ganado cada día de la semana en curso.
--
-- Se identifica al trabajador con el MISMO mecanismo que ya existe
-- para el check-in: el device_token guardado en el celular, vinculado
-- a un solo trabajador en trabajador_dispositivos (migración 024). No
-- se expone nada de otro trabajador -- la función solo puede devolver
-- los datos del dueño de ESE celular.
--
-- La fuente de las ganancias es asistencia_actividad_diaria (igual que
-- la sección "Ganancias del día" de Personal), agregada por fecha desde
-- el lunes de la semana en curso (hora de México) hasta hoy. Los días
-- sin reporte todavía aparecen con $0, no se omiten.
-- ============================================================

CREATE OR REPLACE FUNCTION checkin_desempeno_semana(p_qr_token UUID, p_device_token UUID)
RETURNS TABLE(fecha DATE, horas NUMERIC, costo NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_trabajador_id UUID;
  v_hoy DATE := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_lunes DATE := v_hoy - (EXTRACT(ISODOW FROM v_hoy)::int - 1);
BEGIN
  SELECT id INTO v_proyecto_id
  FROM proyectos
  WHERE qr_token = p_qr_token AND activo = true
  LIMIT 1;

  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'qr_invalido';
  END IF;

  SELECT td.trabajador_id INTO v_trabajador_id
  FROM trabajador_dispositivos td
  WHERE td.device_token = p_device_token
  LIMIT 1;

  IF v_trabajador_id IS NULL THEN
    RAISE EXCEPTION 'dispositivo_no_vinculado';
  END IF;

  RETURN QUERY
  SELECT
    gs.dia::date AS fecha,
    COALESCE(sub.horas, 0)::numeric AS horas,
    COALESCE(sub.costo, 0)::numeric AS costo
  FROM generate_series(v_lunes, v_hoy, interval '1 day') AS gs(dia)
  LEFT JOIN (
    SELECT r.fecha, SUM(aad.horas) AS horas, SUM(aad.costo) AS costo
    FROM asistencia_actividad_diaria aad
    JOIN reportes_diarios r ON r.id = aad.reporte_id
    WHERE aad.trabajador_id = v_trabajador_id
      AND r.fecha BETWEEN v_lunes AND v_hoy
    GROUP BY r.fecha
  ) sub ON sub.fecha = gs.dia::date
  ORDER BY gs.dia;
END;
$$;

REVOKE ALL ON FUNCTION checkin_desempeno_semana(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION checkin_desempeno_semana(UUID, UUID) TO anon, authenticated;
