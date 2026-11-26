-- 159: Salva (respaldo) completa de un proyecto terminado y borrado definitivo.
--  - exportar_proyecto(): devuelve TODO lo del proyecto en un JSON, descubriendo
--    las tablas hijas automáticamente a partir de las llaves foráneas (así no se
--    queda fuera ninguna tabla, ni las que se creen en el futuro).
--  - registrar_salva_proyecto(): marca que la salva ya se descargó completa.
--  - borrar_proyecto_definitivo(): solo si el proyecto está 'completado' Y ya hay
--    una salva registrada. Solo dueño/superadmin.

ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS salva_descargada_at TIMESTAMPTZ;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS salva_descargada_por UUID;

CREATE OR REPLACE FUNCTION exportar_proyecto(p_proyecto_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
DECLARE
  v_result   JSONB := '{}'::jsonb;
  v_conds    JSONB;
  v_cola     TEXT[] := ARRAY['proyectos'];
  v_tabla    TEXT;
  v_cond     TEXT;
  v_rows     JSONB;
  r          RECORD;
  v_excluir  TEXT[] := ARRAY['perfiles_usuario','vista_previa_rol'];
BEGIN
  IF rol_real_usuario() NOT IN ('dueno','superadmin') THEN
    RAISE EXCEPTION 'sin_permisos';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM proyectos WHERE id = p_proyecto_id AND empresa_id = get_empresa_id()) THEN
    RAISE EXCEPTION 'proyecto_no_encontrado';
  END IF;

  v_conds := jsonb_build_object('proyectos', format('id = %L', p_proyecto_id));

  WHILE array_length(v_cola, 1) IS NOT NULL LOOP
    v_tabla := v_cola[1];
    v_cola  := v_cola[2:array_length(v_cola, 1)];
    v_cond  := v_conds ->> v_tabla;

    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM public.%I t WHERE %s',
      v_tabla, v_cond
    ) INTO v_rows;
    v_result := v_result || jsonb_build_object(v_tabla, v_rows);

    FOR r IN
      SELECT cl.relname::text AS hijo, a.attname::text AS col_hijo, af.attname::text AS col_padre
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a  ON a.attrelid  = c.conrelid  AND a.attnum  = c.conkey[1]
      JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = c.confkey[1]
      WHERE c.contype = 'f'
        AND array_length(c.conkey, 1) = 1
        AND c.confrelid = ('public.' || quote_ident(v_tabla))::regclass
    LOOP
      IF r.hijo = ANY (v_excluir) OR v_conds ? r.hijo THEN
        CONTINUE;
      END IF;
      v_conds := v_conds || jsonb_build_object(
        r.hijo,
        format('%I IN (SELECT %I FROM public.%I WHERE %s)', r.col_hijo, r.col_padre, v_tabla, v_cond)
      );
      v_cola := v_cola || r.hijo;
    END LOOP;
  END LOOP;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION registrar_salva_proyecto(p_proyecto_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF rol_real_usuario() NOT IN ('dueno','superadmin') THEN
    RAISE EXCEPTION 'sin_permisos';
  END IF;
  UPDATE proyectos
     SET salva_descargada_at = now(), salva_descargada_por = auth.uid()
   WHERE id = p_proyecto_id AND empresa_id = get_empresa_id();
END;
$$;

CREATE OR REPLACE FUNCTION borrar_proyecto_definitivo(p_proyecto_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_estado TEXT;
  v_salva  TIMESTAMPTZ;
  r        RECORD;
BEGIN
  IF rol_real_usuario() NOT IN ('dueno','superadmin') THEN
    RAISE EXCEPTION 'sin_permisos';
  END IF;

  SELECT estado::text, salva_descargada_at INTO v_estado, v_salva
    FROM proyectos WHERE id = p_proyecto_id AND empresa_id = get_empresa_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'proyecto_no_encontrado'; END IF;
  IF v_estado <> 'completado' THEN RAISE EXCEPTION 'proyecto_no_terminado'; END IF;
  IF v_salva IS NULL THEN RAISE EXCEPTION 'sin_salva'; END IF;

  -- Tablas que apuntan al proyecto SIN borrado en cascada: se limpian a mano.
  FOR r IN
    SELECT cl.relname::text AS hijo, a.attname::text AS col, a.attnotnull AS no_nulo
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND array_length(c.conkey, 1) = 1
      AND c.confrelid = 'public.proyectos'::regclass
      AND c.confdeltype IN ('a','r')
  LOOP
    IF r.hijo = 'perfiles_usuario' AND NOT r.no_nulo THEN
      -- los usuarios (cliente/colaborador) se conservan, solo se desvinculan
      EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I = $1', r.hijo, r.col, r.col) USING p_proyecto_id;
    ELSE
      EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.hijo, r.col) USING p_proyecto_id;
    END IF;
  END LOOP;

  DELETE FROM proyectos WHERE id = p_proyecto_id;
END;
$$;

GRANT EXECUTE ON FUNCTION exportar_proyecto(UUID)          TO authenticated;
GRANT EXECUTE ON FUNCTION registrar_salva_proyecto(UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION borrar_proyecto_definitivo(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
