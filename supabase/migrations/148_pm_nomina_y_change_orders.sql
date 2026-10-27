-- PM: puede ver nómina (solo lectura) y crear/editar CO en borrador,
-- pero validar / enviar al cliente / corregir aprobados es solo del dueño.

-- 1) Nómina: PM puede leer líneas (periodos_nomina_select ya lo incluye)
DROP POLICY IF EXISTS "lineas_nomina_select" ON lineas_nomina;
CREATE POLICY "lineas_nomina_select" ON lineas_nomina
  FOR SELECT USING (
    periodo_id IN (
      SELECT id FROM periodos_nomina WHERE empresa_id = get_empresa_id()
    ) AND
    get_rol_usuario() IN ('dueno', 'superadmin', 'administrador', 'project_manager')
  );

-- 2) Change orders: el PM no puede cambiar el estado ni tocar CO fuera de borrador
CREATE OR REPLACE FUNCTION trg_co_restringir_pm()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND get_rol_usuario() = 'project_manager' THEN
    IF NEW.estado IS DISTINCT FROM OLD.estado THEN
      RAISE EXCEPTION 'Solo el dueño puede validar, enviar o cambiar el estado de un Change Order';
    END IF;
    IF OLD.estado NOT IN ('detectado', 'en_estimacion') THEN
      RAISE EXCEPTION 'Solo el dueño puede modificar un Change Order ya enviado o aprobado';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS co_restringir_pm ON change_orders;
CREATE TRIGGER co_restringir_pm
  BEFORE UPDATE ON change_orders
  FOR EACH ROW EXECUTE FUNCTION trg_co_restringir_pm();
