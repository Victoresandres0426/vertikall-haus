-- ============================================================
-- 097 — Cronograma del portal del cliente en su idioma
-- ============================================================
-- El cambio de idioma del portal (migraciones 092/096) nunca cubrió
-- la sección "Cronograma y avance": ni los procesos (las
-- agrupaciones que se ven ahí, ej. "Demolición") ni los nombres de
-- actividad se traducían -- cliente_ver_avance() no devolvía
-- nombre_en para ninguno de los dos, y "procesos" ni siquiera tenía
-- esa columna.
--
-- Se agrega procesos.nombre_en (mismo patrón que actividades.nombre_en
-- de la migración 092: opcional, editable a mano o vía el botón de
-- traducción automática por IA) y se actualiza cliente_ver_avance()
-- para devolver ambos nombres en inglés. El portal decide cuál
-- mostrar según idioma_cliente -- ver cambio de código aparte en
-- portal-cliente/page.tsx.
-- ============================================================

ALTER TABLE procesos ADD COLUMN IF NOT EXISTS nombre_en TEXT;

CREATE OR REPLACE FUNCTION cliente_ver_avance()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_result JSONB;
BEGIN
  IF get_rol_usuario() <> 'cliente' THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'proceso_id', pr.id,
      'proceso', pr.nombre,
      'proceso_en', COALESCE(pr.nombre_en, pr.nombre),
      'proceso_orden', pr.orden,
      'actividad_id', a.id,
      'codigo', a.codigo,
      'nombre', a.nombre,
      'nombre_en', COALESCE(a.nombre_en, a.nombre),
      'fecha_inicio_plan', a.fecha_inicio_plan,
      'fecha_fin_plan', a.fecha_fin_plan,
      'fecha_inicio_real', a.fecha_inicio_real,
      'fecha_fin_real', a.fecha_fin_real,
      'avance_porcentaje', a.avance_porcentaje,
      'estado', a.estado,
      'es_critica', a.es_critica
    ) ORDER BY pr.orden, a.fecha_inicio_plan NULLS LAST, a.codigo
  ), '[]'::jsonb) INTO v_result
  FROM actividades a
  JOIN procesos pr ON pr.id = a.proceso_id
  WHERE a.proyecto_id = v_proyecto_id AND a.activa IS NOT FALSE;

  RETURN v_result;
END;
$$;
