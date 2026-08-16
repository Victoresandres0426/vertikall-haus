-- ============================================================
-- 016 — Políticas UPDATE para el motor de conocimiento histórico
-- ============================================================
-- Al construir el motor de aprendizaje (spec §9): el motor necesita
-- (a) actualizar una "decisión" ya tomada con su resultado observado
-- (resultado_observado/resultado_fecha/prediccion_fue_correcta/
-- aprendizaje) unos días después de que se tomó, y (b) hacer upsert
-- sobre "conocimiento_historico" (incrementar veces_observado/
-- confianza cuando ya existe una entrada para esa alternativa).
-- Ninguna de las dos tablas tenía política UPDATE -- sin esto, el
-- motor podría leer y crear, pero nunca actualizar (fallaría en
-- silencio la segunda vez, mismo patrón que 014/015).
-- ============================================================

CREATE POLICY "usuarios_actualizan_decisiones_empresa" ON decisiones
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

CREATE POLICY "conocimiento_historico_update" ON conocimiento_historico
  FOR UPDATE USING (empresa_id = get_empresa_id());
