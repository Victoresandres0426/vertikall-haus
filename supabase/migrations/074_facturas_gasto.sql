-- ============================================================
-- 074 — Facturas de gasto (material/servicios) con líneas
--        detalladas por actividad
-- ============================================================
-- Hasta ahora, costos_reales guardaba un solo "monto" total por línea,
-- sin unidad/cantidad/precio_unitario/tax por separado, y no existía
-- ningún concepto de "factura" que agrupe varias líneas de una misma
-- compra (ej. un solo recibo de Home Depot con 3 artículos distintos).
-- Esto se agrega sin tocar el mecanismo ya existente: costos_reales
-- sigue siendo la fuente de verdad de la que se calcula
-- actividades.costo_real (trigger de la migración 057) -- solo se le
-- agregan columnas nuevas y se le vincula opcionalmente a una factura.
-- ============================================================

CREATE TABLE facturas_gasto (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  lugar TEXT NOT NULL, -- ej. "Home Depot - Miami Beach" (texto libre, no siempre hay un proveedor formal dado de alta)
  proveedor_id UUID REFERENCES proveedores(id),
  referencia TEXT, -- folio/ticket del recibo
  foto_referencia TEXT, -- por ahora solo texto (ej. nombre de archivo); la subida real de la imagen queda para después
  subtotal DECIMAL(12,2) DEFAULT 0,
  tax_total DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,
  creado_por UUID REFERENCES perfiles_usuario(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_facturas_gasto_proyecto ON facturas_gasto(proyecto_id);
CREATE INDEX idx_facturas_gasto_fecha ON facturas_gasto(fecha);

ALTER TABLE facturas_gasto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_pm_dueno_ven_facturas_gasto" ON facturas_gasto
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(proyecto_id)
  );

CREATE POLICY "admin_pm_dueno_crean_facturas_gasto" ON facturas_gasto
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(proyecto_id)
  );

CREATE POLICY "admin_pm_dueno_editan_facturas_gasto" ON facturas_gasto
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(proyecto_id)
  );

CREATE POLICY "admin_pm_dueno_eliminan_facturas_gasto" ON facturas_gasto
  FOR DELETE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(proyecto_id)
  );

-- ── costos_reales: columnas nuevas para el detalle de cada línea ──
ALTER TABLE costos_reales ADD COLUMN factura_id UUID REFERENCES facturas_gasto(id) ON DELETE SET NULL;
ALTER TABLE costos_reales ADD COLUMN unidad TEXT;
ALTER TABLE costos_reales ADD COLUMN cantidad DECIMAL(12,3);
ALTER TABLE costos_reales ADD COLUMN precio_unitario DECIMAL(12,4);
ALTER TABLE costos_reales ADD COLUMN tax DECIMAL(12,2);

CREATE INDEX idx_costos_reales_factura ON costos_reales(factura_id);

-- costos_reales tenía SELECT e INSERT, pero nunca UPDATE/DELETE -- una vez
-- guardado un costo no se podía corregir ni borrar desde la app. Con esta
-- lista de gastos va a ser normal necesitar corregir un tax mal tecleado
-- o borrar una línea duplicada, así que se agregan las políticas que
-- faltaban (mismo criterio que ya usan SELECT/INSERT).
CREATE POLICY "admin_pm_dueno_editan_costos" ON costos_reales
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(proyecto_id)
  );

CREATE POLICY "admin_pm_dueno_eliminan_costos" ON costos_reales
  FOR DELETE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(proyecto_id)
  );
