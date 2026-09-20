-- ============================================================
-- 104 — Bucket de Storage para fotos de avance por actividad
-- ============================================================
-- El dueño pidió que las fotos que se suben desde el reporte diario
-- queden vinculadas a la actividad específica que se está reportando
-- (no como una galería general suelta) -- eso ya tenía columna lista
-- desde el inicio (avance_diario.fotos JSONB, migración 001) pero
-- nunca se construyó la subida real. Esta migración crea el bucket;
-- la 105 hace que el guardado/edición del reporte y el portal del
-- cliente usen esas fotos agrupadas por actividad.
--
-- Ruta de cada archivo: {proyecto_id}/{actividad_id}/{archivo} -- mismo
-- patrón de RLS por carpeta que el bucket 'proyecto-archivos'
-- (migración 037): cualquier usuario autenticado de la empresa dueña
-- del proyecto puede ver y subir (el capataz sube desde el sitio).
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('reporte-fotos', 'reporte-fotos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "empresa_ve_fotos_reporte" ON storage.objects;
CREATE POLICY "empresa_ve_fotos_reporte" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'reporte-fotos' AND
    (storage.foldername(name))[1]::uuid IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

DROP POLICY IF EXISTS "empresa_sube_fotos_reporte" ON storage.objects;
CREATE POLICY "empresa_sube_fotos_reporte" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'reporte-fotos' AND
    (storage.foldername(name))[1]::uuid IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

DROP POLICY IF EXISTS "empresa_borra_fotos_reporte" ON storage.objects;
CREATE POLICY "empresa_borra_fotos_reporte" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'reporte-fotos' AND
    (storage.foldername(name))[1]::uuid IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );
