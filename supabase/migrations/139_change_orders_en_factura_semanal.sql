-- ============================================================
-- 139 — Change Orders: facturar su avance DENTRO de la factura
-- semanal normal, en vez de una factura aparte al instante
-- ============================================================
-- Hasta ahora (migración 134) cada Change Order se facturaba SOLO,
-- al instante, cada vez que cambiaba el avance de sus actividades --
-- generaba su propia factura "CO-F1", "CO-F2", etc., separada de la
-- factura semanal normal del contrato. El usuario decidió que en
-- realidad quiere que el avance del CO se sume a la MISMA factura
-- periódica semanal que ya se genera para el resto de actividades,
-- como un renglón más (identificado, pero dentro del mismo documento
-- y mismo monto total) -- sin anticipo descontado, porque un CO no
-- tiene anticipo detrás.
--
-- Cambios:
--   1. Se quita el trigger que facturaba el CO al instante
--      (trg_facturar_avance_co) -- ya no se dispara nada al cambiar
--      avance_porcentaje. La función facturar_avance_co() se deja
--      definida (por si hace falta mirar atrás) pero huérfana, sin
--      trigger que la llame.
--   2. generar_facturas_semanales ahora también:
--      a) guarda snapshot de avance semanal para las actividades de
--         CO (antes se excluían por completo de
--         avance_snapshots_actividad_semanales) -- necesario para
--         poder calcular el delta de avance de un período al
--         siguiente, igual que cualquier actividad normal.
--      b) agrega un rengión de grupo por cada Change Order aprobado
--         con avance nuevo desde el último período, con el mismo
--         formato de grupo "por disciplina" que ya usa el desglose
--         (así el renderer de Facturas ya sabe pintarlo como
--         encabezado propio: "Change Order <número> — <título>"),
--         SIN restarle el % de anticipo (una actividad de CO siempre
--         se factura completa, monto_neto = monto_bruto,
--         monto_amortizado = 0).
--   3. Se borran las 2 facturas de Change Order que ya se habían
--      emitido hoy por el mecanismo viejo (a petición del usuario,
--      "bórralas y reconstruye") -- el avance completo de esos CO se
--      vuelve a facturar desde cero la próxima vez que se corra
--      generar_facturas_semanales, ahora ya integrado a la factura
--      semanal.
-- ============================================================

-- ── 1. Apagar el disparador instantáneo de migración 134 ──
DROP TRIGGER IF EXISTS trg_facturar_avance_co ON actividades;

-- ── 2. Redefinir generar_facturas_semanales ──
CREATE OR REPLACE FUNCTION generar_facturas_semanales(p_empresa_id UUID DEFAULT NULL)
RETURNS TABLE(
  proyecto_id UUID,
  proyecto_codigo TEXT,
  numero_generado TEXT,
  monto_generado DECIMAL,
  amortizacion_generada DECIMAL
) AS $$
#variable_conflict use_column
DECLARE
  v_empresa_id UUID;
  v_rol rol_usuario;
  v_proyecto RECORD;
  v_presupuesto_id UUID;
  v_presupuesto_total DECIMAL(15,2);
  v_presupuesto_base DECIMAL(15,2);
  v_presupuesto_venta DECIMAL(15,2);
  v_margen_total DECIMAL(15,2);
  v_avance_ponderado DECIMAL(7,4);
  v_baseline_proyecto DECIMAL(7,4);
  v_delta_fisico DECIMAL(7,4);
  v_anticipo_total DECIMAL(15,2);
  v_pct_anticipo DECIMAL(7,4);
  v_pct_anticipo_pct DECIMAL(7,4);
  v_indirectos_total DECIMAL(15,2);
  v_monto_bruto_total DECIMAL(15,2);
  v_monto_neto_total DECIMAL(15,2);
  v_utilidad_neto_total DECIMAL(15,2);
  v_amortizacion DECIMAL(15,2);
  v_siguiente_seq INTEGER;
  v_numero TEXT;
  v_periodo_inicio DATE;
  v_act RECORD;
  v_baseline_act DECIMAL(5,2);
  v_delta_act DECIMAL(7,2);
  v_desglose_act JSONB;
  v_ejecutado_linea DECIMAL(15,2);
  v_neto_linea DECIMAL(15,2);
  v_amort_linea DECIMAL(15,2);
  v_facturable_ahora DECIMAL(7,4);
  v_facturable_antes DECIMAL(7,4);
  v_usa_disciplinas BOOLEAN;
  v_disc RECORD;
  v_grupo_actividades JSONB;
  v_grupo_bruto DECIMAL(15,2);
  v_grupo_amort DECIMAL(15,2);
  v_grupo_neto DECIMAL(15,2);
  v_grupo_peso DECIMAL(15,2);
  v_grupo_delta_pond DECIMAL(15,4);
  v_grupo_baseline_pond DECIMAL(15,4);
  v_grupo_actual_pond DECIMAL(15,4);
  v_avance_desde DECIMAL(7,2);
  v_avance_hasta DECIMAL(7,2);
  v_co RECORD;
BEGIN
  v_empresa_id := COALESCE(p_empresa_id, get_empresa_id());
  IF v_empresa_id IS NULL THEN
    RETURN;
  END IF;

  IF p_empresa_id IS NULL THEN
    v_rol := get_rol_usuario();
    IF v_rol IS NULL OR v_rol NOT IN ('project_manager', 'administrador', 'dueno', 'superadmin') THEN
      RAISE EXCEPTION 'No tienes permisos para generar facturación automática';
    END IF;
  END IF;

  FOR v_proyecto IN
    SELECT pr.id, pr.codigo, pr.presupuesto_base, pr.presupuesto_venta
    FROM proyectos pr
    WHERE pr.empresa_id = v_empresa_id AND pr.activo = true
  LOOP
    v_presupuesto_id := NULL;

    SELECT bl.id, bl.total INTO v_presupuesto_id, v_presupuesto_total
    FROM presupuestos bl
    WHERE bl.proyecto_id = v_proyecto.id AND bl.es_baseline_actual = true
    LIMIT 1;

    IF v_presupuesto_total IS NULL OR v_presupuesto_total <= 0 THEN
      SELECT COALESCE(SUM(act.costo_presupuesto), 0) INTO v_presupuesto_total
      FROM actividades act
      WHERE act.proyecto_id = v_proyecto.id AND act.activa = true
        AND act.excluir_de_avance = FALSE
        AND act.id NOT IN (SELECT actividad_id FROM change_order_actividades_creadas);
    END IF;

    IF v_presupuesto_total IS NULL OR v_presupuesto_total <= 0 THEN
      CONTINUE;
    END IF;

    v_presupuesto_base := COALESCE(v_proyecto.presupuesto_base, 0);
    v_presupuesto_venta := COALESCE(v_proyecto.presupuesto_venta, 0);
    v_margen_total := GREATEST(v_presupuesto_venta - v_presupuesto_base, 0);

    SELECT
      CASE
        WHEN SUM(act.costo_presupuesto) > 0
          THEN SUM(act.avance_porcentaje * act.costo_presupuesto) / SUM(act.costo_presupuesto)
        WHEN COUNT(*) > 0
          THEN AVG(act.avance_porcentaje)
        ELSE 0
      END
    INTO v_avance_ponderado
    FROM actividades act
    WHERE act.proyecto_id = v_proyecto.id AND act.activa = true
      AND act.excluir_de_avance = FALSE
      AND act.id NOT IN (SELECT actividad_id FROM change_order_actividades_creadas);

    v_avance_ponderado := COALESCE(v_avance_ponderado, 0);

    INSERT INTO avance_snapshots_semanales (proyecto_id, fecha, avance_ponderado_pct, presupuesto_total)
    VALUES (v_proyecto.id, CURRENT_DATE, v_avance_ponderado, v_presupuesto_total)
    ON CONFLICT (proyecto_id, fecha) DO UPDATE
      SET avance_ponderado_pct = EXCLUDED.avance_ponderado_pct,
          presupuesto_total = EXCLUDED.presupuesto_total;

    FOR v_act IN
      SELECT act.id, act.avance_porcentaje, act.costo_presupuesto
      FROM actividades act
      WHERE act.proyecto_id = v_proyecto.id AND act.activa = true
        AND act.excluir_de_avance = FALSE
        AND act.id NOT IN (SELECT actividad_id FROM change_order_actividades_creadas)
    LOOP
      INSERT INTO avance_snapshots_actividad_semanales (proyecto_id, actividad_id, fecha, avance_porcentaje, costo_presupuesto)
      VALUES (v_proyecto.id, v_act.id, CURRENT_DATE, COALESCE(v_act.avance_porcentaje, 0), v_act.costo_presupuesto)
      ON CONFLICT (actividad_id, fecha) DO UPDATE
        SET avance_porcentaje = EXCLUDED.avance_porcentaje,
            costo_presupuesto = EXCLUDED.costo_presupuesto;
    END LOOP;

    -- También se guarda snapshot de las actividades de Change Order --
    -- antes se excluían por completo de esta tabla (migración 096), lo
    -- que hacía imposible calcular su delta de avance período a período.
    -- Ahora su progreso se factura dentro de esta misma factura semanal
    -- (ver más abajo), así que necesita el mismo mecanismo de baseline.
    FOR v_act IN
      SELECT act.id, act.avance_porcentaje, act.costo_presupuesto
      FROM actividades act
      WHERE act.proyecto_id = v_proyecto.id AND act.activa = true
        AND act.excluir_de_avance = FALSE
        AND act.id IN (SELECT actividad_id FROM change_order_actividades_creadas)
    LOOP
      INSERT INTO avance_snapshots_actividad_semanales (proyecto_id, actividad_id, fecha, avance_porcentaje, costo_presupuesto)
      VALUES (v_proyecto.id, v_act.id, CURRENT_DATE, COALESCE(v_act.avance_porcentaje, 0), v_act.costo_presupuesto)
      ON CONFLICT (actividad_id, fecha) DO UPDATE
        SET avance_porcentaje = EXCLUDED.avance_porcentaje,
            costo_presupuesto = EXCLUDED.costo_presupuesto;
    END LOOP;

    SELECT fc.periodo_fin + 1 INTO v_periodo_inicio
    FROM facturas_cliente fc
    WHERE fc.proyecto_id = v_proyecto.id AND fc.numero LIKE 'EST-%' AND fc.periodo_fin IS NOT NULL
    ORDER BY fc.periodo_fin DESC
    LIMIT 1;

    IF v_periodo_inicio IS NULL THEN
      SELECT COALESCE(pr2.fecha_inicio_real, pr2.fecha_inicio_plan) INTO v_periodo_inicio
      FROM proyectos pr2 WHERE pr2.id = v_proyecto.id;
    END IF;

    SELECT ass.avance_ponderado_pct INTO v_baseline_proyecto
    FROM avance_snapshots_semanales ass
    WHERE ass.proyecto_id = v_proyecto.id AND ass.fecha < v_periodo_inicio
    ORDER BY ass.fecha DESC
    LIMIT 1;
    v_baseline_proyecto := COALESCE(v_baseline_proyecto, 0);

    v_delta_fisico := v_avance_ponderado - v_baseline_proyecto;

    v_desglose_act := '[]'::jsonb;
    v_monto_bruto_total := 0;
    v_monto_neto_total := 0;

    IF EXISTS (
      SELECT 1 FROM facturas_cliente fc
      WHERE fc.proyecto_id = v_proyecto.id AND fc.numero LIKE 'EST-%' AND fc.estado = 'borrador'
    ) THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM facturas_cliente fc
      WHERE fc.proyecto_id = v_proyecto.id
        AND fc.numero LIKE 'EST-%'
        AND fc.estado <> 'borrador'
        AND fc.fecha_emision >= CURRENT_DATE - INTERVAL '6 days'
    ) THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(fc.monto), 0) INTO v_anticipo_total
    FROM facturas_cliente fc
    WHERE fc.proyecto_id = v_proyecto.id AND fc.numero LIKE 'ANT-%';

    v_pct_anticipo := CASE WHEN v_presupuesto_venta > 0
      THEN LEAST(v_anticipo_total / v_presupuesto_venta, 1)
      ELSE 0
    END;
    v_pct_anticipo_pct := v_pct_anticipo * 100;

    SELECT EXISTS (
      SELECT 1 FROM actividades act
      WHERE act.proyecto_id = v_proyecto.id AND act.activa = true AND act.disciplina_presupuesto IS NOT NULL
        AND act.excluir_de_avance = FALSE
        AND act.id NOT IN (SELECT actividad_id FROM change_order_actividades_creadas)
    ) INTO v_usa_disciplinas;

    IF v_usa_disciplinas THEN
      FOR v_disc IN
        SELECT
          COALESCE(d.disciplina, 'Otras actividades') AS disciplina,
          COALESCE(d.disciplina_en, 'Other activities') AS disciplina_en,
          MIN(d.orden) AS orden
        FROM (
          SELECT
            act.disciplina_presupuesto AS disciplina,
            act.disciplina_presupuesto_en AS disciplina_en,
            CASE WHEN act.codigo ~ '^[0-9]+\.' THEN (regexp_match(act.codigo, '^([0-9]+)\.'))[1]::int ELSE 999 END AS orden
          FROM actividades act
          WHERE act.proyecto_id = v_proyecto.id AND act.activa = true
            AND act.excluir_de_avance = FALSE
            AND act.id NOT IN (SELECT actividad_id FROM change_order_actividades_creadas)
        ) d
        GROUP BY d.disciplina, d.disciplina_en
        ORDER BY MIN(d.orden)
      LOOP
        v_grupo_actividades := '[]'::jsonb;
        v_grupo_bruto := 0;
        v_grupo_amort := 0;
        v_grupo_neto := 0;
        v_grupo_peso := 0;
        v_grupo_delta_pond := 0;
        v_grupo_baseline_pond := 0;
        v_grupo_actual_pond := 0;

        FOR v_act IN
          SELECT act.id, act.codigo, act.nombre, act.nombre_en,
                 COALESCE(act.avance_porcentaje, 0) AS avance_porcentaje,
                 COALESCE(act.costo_presupuesto, 0) AS costo_presupuesto
          FROM actividades act
          WHERE act.proyecto_id = v_proyecto.id AND act.activa = true
            AND COALESCE(act.disciplina_presupuesto, 'Otras actividades') = v_disc.disciplina
            AND act.excluir_de_avance = FALSE
            AND act.id NOT IN (SELECT actividad_id FROM change_order_actividades_creadas)
          ORDER BY act.codigo
        LOOP
          SELECT asa.avance_porcentaje INTO v_baseline_act
          FROM avance_snapshots_actividad_semanales asa
          WHERE asa.actividad_id = v_act.id AND asa.fecha < v_periodo_inicio
          ORDER BY asa.fecha DESC
          LIMIT 1;

          v_baseline_act := COALESCE(v_baseline_act, 0);
          v_delta_act := ROUND(v_act.avance_porcentaje - v_baseline_act, 2);

          v_grupo_peso := v_grupo_peso + GREATEST(v_act.costo_presupuesto, 1);
          v_grupo_delta_pond := v_grupo_delta_pond + v_delta_act * GREATEST(v_act.costo_presupuesto, 1);
          v_grupo_baseline_pond := v_grupo_baseline_pond + v_baseline_act * GREATEST(v_act.costo_presupuesto, 1);
          v_grupo_actual_pond := v_grupo_actual_pond + v_act.avance_porcentaje * GREATEST(v_act.costo_presupuesto, 1);

          IF v_delta_act <> 0 THEN
            v_grupo_actividades := v_grupo_actividades || jsonb_build_object(
              'actividad_id', v_act.id,
              'codigo', v_act.codigo,
              'nombre', v_act.nombre,
              'nombre_en', COALESCE(v_act.nombre_en, v_act.nombre),
              'avance_actual_pct', ROUND(v_act.avance_porcentaje, 1)
            );

            v_ejecutado_linea := ROUND(v_act.costo_presupuesto * v_delta_act / 100, 2);
            v_facturable_ahora := GREATEST(v_act.avance_porcentaje - v_pct_anticipo_pct, 0);
            v_facturable_antes := GREATEST(v_baseline_act - v_pct_anticipo_pct, 0);
            v_neto_linea := ROUND(v_act.costo_presupuesto * (v_facturable_ahora - v_facturable_antes) / 100, 2);
            v_amort_linea := v_ejecutado_linea - v_neto_linea;

            v_grupo_bruto := v_grupo_bruto + v_ejecutado_linea;
            v_grupo_neto := v_grupo_neto + v_neto_linea;
            v_grupo_amort := v_grupo_amort + v_amort_linea;
          END IF;
        END LOOP;

        v_avance_desde := CASE WHEN v_grupo_peso > 0 THEN ROUND(v_grupo_baseline_pond / v_grupo_peso, 1) ELSE 0 END;
        v_avance_hasta := CASE WHEN v_grupo_peso > 0 THEN ROUND(v_grupo_actual_pond / v_grupo_peso, 1) ELSE 0 END;

        IF v_grupo_bruto <> 0 THEN
          v_monto_bruto_total := v_monto_bruto_total + v_grupo_bruto;
          v_monto_neto_total := v_monto_neto_total + v_grupo_neto;

          v_desglose_act := v_desglose_act || jsonb_build_object(
            'disciplina', v_disc.disciplina,
            'disciplina_en', v_disc.disciplina_en,
            'avance_desde_pct', v_avance_desde,
            'avance_hasta_pct', v_avance_hasta,
            'monto_bruto', v_grupo_bruto,
            'monto_amortizado', v_grupo_amort,
            'monto_neto', v_grupo_neto,
            'actividades', v_grupo_actividades
          );
        END IF;
      END LOOP;
    ELSE
      FOR v_act IN
        SELECT act.id, act.codigo, act.nombre, act.nombre_en, COALESCE(act.avance_porcentaje, 0) AS avance_porcentaje, COALESCE(act.costo_presupuesto, 0) AS costo_presupuesto
        FROM actividades act
        WHERE act.proyecto_id = v_proyecto.id AND act.activa = true
          AND act.excluir_de_avance = FALSE
          AND act.id NOT IN (SELECT actividad_id FROM change_order_actividades_creadas)
        ORDER BY act.codigo
      LOOP
        SELECT asa.avance_porcentaje INTO v_baseline_act
        FROM avance_snapshots_actividad_semanales asa
        WHERE asa.actividad_id = v_act.id AND asa.fecha < v_periodo_inicio
        ORDER BY asa.fecha DESC
        LIMIT 1;

        v_baseline_act := COALESCE(v_baseline_act, 0);
        v_delta_act := ROUND(v_act.avance_porcentaje - v_baseline_act, 2);

        IF v_delta_act <> 0 THEN
          v_ejecutado_linea := ROUND(v_act.costo_presupuesto * v_delta_act / 100, 2);
          v_facturable_ahora := GREATEST(v_act.avance_porcentaje - v_pct_anticipo_pct, 0);
          v_facturable_antes := GREATEST(v_baseline_act - v_pct_anticipo_pct, 0);
          v_neto_linea := ROUND(v_act.costo_presupuesto * (v_facturable_ahora - v_facturable_antes) / 100, 2);
          v_amort_linea := v_ejecutado_linea - v_neto_linea;

          v_monto_bruto_total := v_monto_bruto_total + v_ejecutado_linea;
          v_monto_neto_total := v_monto_neto_total + v_neto_linea;

          v_desglose_act := v_desglose_act || jsonb_build_object(
            'actividad_id', v_act.id,
            'actividad_codigo', v_act.codigo,
            'actividad_nombre', v_act.nombre,
            'actividad_nombre_en', COALESCE(v_act.nombre_en, v_act.nombre),
            'avance_pct', v_delta_act,
            'monto_bruto', v_ejecutado_linea,
            'monto_amortizado', v_amort_linea,
            'monto_neto', v_neto_linea
          );
        END IF;
      END LOOP;
    END IF;

    IF v_presupuesto_id IS NOT NULL THEN
      SELECT COALESCE(SUM(pp.monto_presupuestado), 0) INTO v_indirectos_total
      FROM partidas_presupuesto pp
      WHERE pp.presupuesto_id = v_presupuesto_id
        AND pp.tipo_recurso = 'indirecto'
        AND pp.actividad_id IS NULL;

      IF v_indirectos_total > 0 THEN
        v_ejecutado_linea := ROUND(v_indirectos_total * v_delta_fisico / 100, 2);
        v_facturable_ahora := GREATEST(v_avance_ponderado - v_pct_anticipo_pct, 0);
        v_facturable_antes := GREATEST(v_baseline_proyecto - v_pct_anticipo_pct, 0);
        v_neto_linea := ROUND(v_indirectos_total * (v_facturable_ahora - v_facturable_antes) / 100, 2);
        v_amort_linea := v_ejecutado_linea - v_neto_linea;

        v_monto_bruto_total := v_monto_bruto_total + v_ejecutado_linea;
        v_monto_neto_total := v_monto_neto_total + v_neto_linea;

        v_desglose_act := v_desglose_act || (
          CASE WHEN v_usa_disciplinas THEN
            jsonb_build_object(
              'disciplina', 'Costos indirectos',
              'disciplina_en', 'Indirect costs',
              'avance_desde_pct', ROUND(v_baseline_proyecto, 1),
              'avance_hasta_pct', ROUND(v_avance_ponderado, 1),
              'monto_bruto', v_ejecutado_linea,
              'monto_amortizado', v_amort_linea,
              'monto_neto', v_neto_linea,
              'actividades', '[]'::jsonb
            )
          ELSE
            jsonb_build_object(
              'actividad_id', 'indirectos-' || v_proyecto.id,
              'actividad_codigo', NULL,
              'actividad_nombre', 'Costos indirectos',
              'actividad_nombre_en', 'Indirect costs',
              'avance_pct', ROUND(v_delta_fisico, 2),
              'monto_bruto', v_ejecutado_linea,
              'monto_amortizado', v_amort_linea,
              'monto_neto', v_neto_linea
            )
          END
        );
      END IF;
    END IF;

    v_utilidad_neto_total := 0;
    IF v_margen_total > 0 THEN
      v_ejecutado_linea := ROUND(v_margen_total * v_delta_fisico / 100, 2);
      v_facturable_ahora := GREATEST(v_avance_ponderado - v_pct_anticipo_pct, 0);
      v_facturable_antes := GREATEST(v_baseline_proyecto - v_pct_anticipo_pct, 0);
      v_neto_linea := ROUND(v_margen_total * (v_facturable_ahora - v_facturable_antes) / 100, 2);
      v_amort_linea := v_ejecutado_linea - v_neto_linea;

      IF v_ejecutado_linea > 0 THEN
        v_monto_bruto_total := v_monto_bruto_total + v_ejecutado_linea;
        v_monto_neto_total := v_monto_neto_total + v_neto_linea;
        v_utilidad_neto_total := v_neto_linea;

        v_desglose_act := v_desglose_act || (
          CASE WHEN v_usa_disciplinas THEN
            jsonb_build_object(
              'disciplina', 'Utilidad del contratista',
              'disciplina_en', 'Contractor profit',
              'avance_desde_pct', ROUND(v_baseline_proyecto, 1),
              'avance_hasta_pct', ROUND(v_avance_ponderado, 1),
              'monto_bruto', v_ejecutado_linea,
              'monto_amortizado', v_amort_linea,
              'monto_neto', v_neto_linea,
              'actividades', '[]'::jsonb
            )
          ELSE
            jsonb_build_object(
              'actividad_id', 'utilidad-' || v_proyecto.id,
              'actividad_codigo', NULL,
              'actividad_nombre', 'Utilidad del contratista',
              'actividad_nombre_en', 'Contractor profit',
              'avance_pct', ROUND(v_delta_fisico, 2),
              'monto_bruto', v_ejecutado_linea,
              'monto_amortizado', v_amort_linea,
              'monto_neto', v_neto_linea
            )
          END
        );
      END IF;
    END IF;

    -- ── Change Orders: se suman como su propio renglón de grupo dentro
    -- de ESTA MISMA factura semanal, sin anticipo descontado (un CO no
    -- tiene anticipo detrás -- su avance se cobra íntegro). Se usa el
    -- mismo formato de "grupo con disciplina" que ya entiende el
    -- renderer de Facturas, sin importar si el proyecto factura por
    -- disciplina o no -- basta con que el renglón traiga 'disciplina'
    -- para que se pinte como encabezado propio.
    FOR v_co IN
      SELECT co.id, co.numero, co.titulo
      FROM change_orders co
      WHERE co.proyecto_id = v_proyecto.id AND co.estado IN ('aprobado', 'facturado', 'cobrado')
    LOOP
      v_grupo_actividades := '[]'::jsonb;
      v_grupo_bruto := 0;
      v_grupo_neto := 0;
      v_grupo_peso := 0;
      v_grupo_baseline_pond := 0;
      v_grupo_actual_pond := 0;

      FOR v_act IN
        SELECT act.id, act.codigo, act.nombre, act.nombre_en,
               COALESCE(act.avance_porcentaje, 0) AS avance_porcentaje,
               COALESCE(act.costo_presupuesto, 0) AS costo_presupuesto
        FROM actividades act
        JOIN change_order_actividades_creadas caco ON caco.actividad_id = act.id
        WHERE caco.change_order_id = v_co.id
          AND act.activa = true AND act.excluir_de_avance = FALSE
        ORDER BY act.codigo
      LOOP
        SELECT asa.avance_porcentaje INTO v_baseline_act
        FROM avance_snapshots_actividad_semanales asa
        WHERE asa.actividad_id = v_act.id AND asa.fecha < v_periodo_inicio
        ORDER BY asa.fecha DESC
        LIMIT 1;

        v_baseline_act := COALESCE(v_baseline_act, 0);
        v_delta_act := ROUND(v_act.avance_porcentaje - v_baseline_act, 2);

        v_grupo_peso := v_grupo_peso + GREATEST(v_act.costo_presupuesto, 1);
        v_grupo_baseline_pond := v_grupo_baseline_pond + v_baseline_act * GREATEST(v_act.costo_presupuesto, 1);
        v_grupo_actual_pond := v_grupo_actual_pond + v_act.avance_porcentaje * GREATEST(v_act.costo_presupuesto, 1);

        IF v_delta_act <> 0 THEN
          v_grupo_actividades := v_grupo_actividades || jsonb_build_object(
            'actividad_id', v_act.id,
            'codigo', v_act.codigo,
            'nombre', v_act.nombre,
            'nombre_en', COALESCE(v_act.nombre_en, v_act.nombre),
            'avance_actual_pct', ROUND(v_act.avance_porcentaje, 1)
          );

          -- Sin descuento de anticipo: el CO se factura íntegro.
          v_ejecutado_linea := ROUND(v_act.costo_presupuesto * v_delta_act / 100, 2);
          v_grupo_bruto := v_grupo_bruto + v_ejecutado_linea;
          v_grupo_neto := v_grupo_neto + v_ejecutado_linea;
        END IF;
      END LOOP;

      IF v_grupo_bruto <> 0 THEN
        v_avance_desde := CASE WHEN v_grupo_peso > 0 THEN ROUND(v_grupo_baseline_pond / v_grupo_peso, 1) ELSE 0 END;
        v_avance_hasta := CASE WHEN v_grupo_peso > 0 THEN ROUND(v_grupo_actual_pond / v_grupo_peso, 1) ELSE 0 END;

        v_monto_bruto_total := v_monto_bruto_total + v_grupo_bruto;
        v_monto_neto_total := v_monto_neto_total + v_grupo_neto;

        v_desglose_act := v_desglose_act || jsonb_build_object(
          'disciplina', 'Change Order ' || COALESCE(v_co.numero, '') || ' — ' || v_co.titulo,
          'disciplina_en', 'Change Order ' || COALESCE(v_co.numero, '') || ' — ' || v_co.titulo,
          'avance_desde_pct', v_avance_desde,
          'avance_hasta_pct', v_avance_hasta,
          'monto_bruto', v_grupo_bruto,
          'monto_amortizado', 0,
          'monto_neto', v_grupo_neto,
          'actividades', v_grupo_actividades
        );
      END IF;
    END LOOP;

    -- Nota: ya no se corta aquí por "v_delta_fisico < 1" (como hacían
    -- versiones anteriores) -- eso habría saltado proyectos enteros
    -- sin dejar facturar el avance de un Change Order aunque el
    -- contrato original no haya avanzado esta semana. La única
    -- condición real para generar la factura es que haya algo que
    -- cobrar, sin importar de dónde venga (contrato normal o CO).
    IF v_monto_neto_total <= 0 THEN
      CONTINUE;
    END IF;

    v_amortizacion := v_monto_bruto_total - v_monto_neto_total;

    SELECT COUNT(*) + 1 INTO v_siguiente_seq
    FROM facturas_cliente fc
    WHERE fc.proyecto_id = v_proyecto.id AND fc.numero LIKE 'EST-%';

    v_numero := 'EST-' || v_proyecto.codigo || '-' || LPAD(v_siguiente_seq::TEXT, 3, '0');

    INSERT INTO facturas_cliente (
      proyecto_id, numero, descripcion, monto, retencion, amortizacion_anticipo, utilidad,
      periodo_inicio, periodo_fin, desglose_periodos, desglose_actividades,
      avance_delta_pct, avance_acumulado_pct,
      fecha_emision, fecha_vencimiento, estado, monto_cobrado
    ) VALUES (
      v_proyecto.id,
      v_numero,
      'Estimación de avance automática — ' || ROUND(v_delta_fisico, 1) || '% de avance adicional (acumulado ' || ROUND(v_avance_ponderado, 1) || '%)',
      v_monto_neto_total,
      0,
      v_amortizacion,
      v_utilidad_neto_total,
      v_periodo_inicio,
      CURRENT_DATE,
      '[]'::jsonb,
      v_desglose_act,
      ROUND(v_delta_fisico, 1),
      ROUND(v_avance_ponderado, 1),
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '15 days',
      'borrador',
      0
    );

    proyecto_id := v_proyecto.id;
    proyecto_codigo := v_proyecto.codigo;
    numero_generado := v_numero;
    monto_generado := v_monto_neto_total;
    amortizacion_generada := v_amortizacion;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION generar_facturas_semanales(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generar_facturas_semanales(UUID) TO authenticated;

-- ── 3. Borrar las 2 facturas de CO que ya se habían emitido hoy por el
-- mecanismo viejo (a petición del usuario) y reabrir esos CO para que
-- su avance se vuelva a facturar desde cero, ya integrado a la factura
-- semanal. Reseteamos change_orders.facturado -- ya no se usa para
-- gatear nada (el nuevo mecanismo decide solo por el delta de avance
-- contra el snapshot), pero se deja consistente. ──
DO $$
DECLARE
  v_proyecto_id UUID := '561331ad-3d02-40b4-b10b-19f031711440';
BEGIN
  UPDATE change_orders
  SET facturado = false
  WHERE proyecto_id = v_proyecto_id
    AND id IN (SELECT change_order_id FROM facturas_cliente WHERE change_order_id IS NOT NULL);

  DELETE FROM facturas_cliente
  WHERE proyecto_id = v_proyecto_id
    AND change_order_id IS NOT NULL;
END $$;
