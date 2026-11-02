-- 151: Materiales presupuestados (hoja S2 del Excel) por proyecto, comparados
-- contra los gastos de material registrados. Cada línea de gasto (costos_reales)
-- puede ligarse a un material presupuestado; la app calcula cantidades/costos
-- comprados, genera alertas de sobreconsumo y avisa cuándo comprar según el
-- cronograma (inicio de la división - días de anticipación).

CREATE TABLE IF NOT EXISTS materiales_presupuestados (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proyecto_id      UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  proceso_id       UUID REFERENCES procesos(id) ON DELETE SET NULL,   -- división (disciplina)
  seccion          TEXT,                                              -- ej. "CONCRETO"
  codigo           TEXT,
  descripcion      TEXT NOT NULL,
  unidad           TEXT,
  cantidad_neta    NUMERIC(14,3) NOT NULL DEFAULT 0,
  desperdicio_pct  NUMERIC(7,3)  NOT NULL DEFAULT 0,                  -- 0.10 = 10%
  cantidad_total   NUMERIC(14,3) NOT NULL DEFAULT 0,                  -- incluye desperdicio
  precio_unitario  NUMERIC(14,4) NOT NULL DEFAULT 0,
  costo_sin_tax    NUMERIC(14,2) NOT NULL DEFAULT 0,
  costo_total      NUMERIC(14,2) NOT NULL DEFAULT 0,                  -- con tax
  estado_plano     TEXT,
  proveedor        TEXT,
  dias_anticipacion INT NOT NULL DEFAULT 7,                           -- días antes del inicio para comprar
  orden            INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mat_presup_proyecto ON materiales_presupuestados(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_mat_presup_proceso ON materiales_presupuestados(proceso_id);

ALTER TABLE materiales_presupuestados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mat_presup_select" ON materiales_presupuestados
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(proyecto_id)
  );

-- Los días de anticipación los puede ajustar también el PM
CREATE POLICY "mat_presup_update" ON materiales_presupuestados
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(proyecto_id)
  );

-- Agregar / quitar líneas del presupuesto de materiales: solo dirección
CREATE POLICY "mat_presup_insert" ON materiales_presupuestados
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'dueno', 'superadmin')
  );

CREATE POLICY "mat_presup_delete" ON materiales_presupuestados
  FOR DELETE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'dueno', 'superadmin')
  );

-- Cada línea de gasto puede ligarse a un material presupuestado.
-- material_sugerido = true: la app propuso el material y aún falta confirmarlo
-- (mientras no se confirme no cuenta en la comparación).
ALTER TABLE costos_reales
  ADD COLUMN IF NOT EXISTS material_presupuestado_id UUID REFERENCES materiales_presupuestados(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS material_sugerido BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_costos_reales_material_presup ON costos_reales(material_presupuestado_id);

-- Referencia genérica en alertas (id del material o de la división a la que
-- apunta una alerta de materiales; evita duplicarlas al reevaluar).
ALTER TABLE alertas ADD COLUMN IF NOT EXISTS referencia_id UUID;
CREATE INDEX IF NOT EXISTS idx_alertas_referencia ON alertas(referencia_id);
