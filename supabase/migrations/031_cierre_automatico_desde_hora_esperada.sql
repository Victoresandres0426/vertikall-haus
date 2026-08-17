-- ============================================================
-- 031 — Cierre automático: base en hora de entrada ESPERADA,
--        no en la hora real de llegada
-- ============================================================
-- Si el proyecto tiene hora_entrada_esperada configurada, el cierre
-- automático (cuando alguien no registra salida) ya no se calcula
-- como "entrada real + 8h", sino como "hora esperada + 8h" del día
-- de la entrada. Así, si alguien llega tarde y no marca salida, no
-- se le cuentan de más las horas que llegó tarde.
--
-- Si el proyecto NO tiene hora esperada configurada, se mantiene el
-- comportamiento anterior: entrada real + 8h.
-- ============================================================

CREATE OR REPLACE FUNCTION cerrar_entradas_automaticamente()
RETURNS void AS $$
DECLARE
  v_registro RECORD;
  v_cierre_ts TIMESTAMPTZ;
  v_horas_trabajadas DECIMAL(5,2);
BEGIN
  FOR v_registro IN
    SELECT r.trabajador_id, r.proyecto_id, r.created_at, r.fecha, p.hora_entrada_esperada
    FROM registros_asistencia_qr r
    JOIN proyectos p ON p.id = r.proyecto_id
    WHERE r.tipo = 'entrada'
      AND r.trabajador_id IS NOT NULL
      AND r.created_at > NOW() - INTERVAL '3 days'
      AND NOT EXISTS (
        SELECT 1 FROM registros_asistencia_qr r2
        WHERE r2.trabajador_id = r.trabajador_id
          AND r2.proyecto_id = r.proyecto_id
          AND r2.tipo = 'salida'
          AND r2.created_at > r.created_at
      )
  LOOP
    IF v_registro.hora_entrada_esperada IS NOT NULL THEN
      -- Cierre = hora esperada + 8h, el mismo día de la entrada real
      v_cierre_ts := (v_registro.fecha::timestamp AT TIME ZONE 'America/Mexico_City')
                      + v_registro.hora_entrada_esperada + INTERVAL '8 hours';
    ELSE
      -- Sin hora esperada configurada: comportamiento anterior
      v_cierre_ts := v_registro.created_at + INTERVAL '8 hours';
    END IF;

    -- Aún no llega la hora de cierre calculada: no cerrar todavía
    CONTINUE WHEN NOW() < v_cierre_ts;

    v_horas_trabajadas := GREATEST(
      round((EXTRACT(EPOCH FROM (v_cierre_ts - v_registro.created_at)) / 3600.0)::numeric, 2),
      0
    );

    INSERT INTO registros_asistencia_qr (
      proyecto_id, trabajador_id, tipo, fecha, hora,
      cierre_automatico, motivo_cierre, horas_trabajadas, horas_extra
    ) VALUES (
      v_registro.proyecto_id,
      v_registro.trabajador_id,
      'salida',
      (v_cierre_ts AT TIME ZONE 'America/Mexico_City')::date,
      (v_cierre_ts AT TIME ZONE 'America/Mexico_City')::time(0),
      true,
      '8_horas',
      v_horas_trabajadas,
      0.00
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
