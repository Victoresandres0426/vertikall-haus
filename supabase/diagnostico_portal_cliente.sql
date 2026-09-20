-- ============================================================
-- Diagnóstico: portal del cliente / fotos / reportes diarios
-- ============================================================
-- Solo lectura -- no cambia nada. Todo en UN solo SELECT (con UNION
-- ALL) para que el SQL Editor de Supabase muestre TODOS los
-- resultados juntos en una sola tabla (si se corren como sentencias
-- separadas, solo muestra la última). Corre esto y pásame una
-- captura de la tabla de resultados completa.
-- ============================================================

SELECT '1. función validar_reporte_diario existe (migración 102)' AS chequeo,
       EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'validar_reporte_diario')::text AS resultado
UNION ALL
SELECT '2. función cliente_ver_fotos existe (migración 103)',
       EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'cliente_ver_fotos')::text
UNION ALL
SELECT '3. cliente_ver_reportes ya tiene el formato nuevo (migración 105)',
       COALESCE(
         (SELECT CASE WHEN pg_get_functiondef(oid) LIKE '%fotos_por_actividad%' THEN 'true' ELSE 'false -- todavía formato viejo' END
          FROM pg_proc WHERE proname = 'cliente_ver_reportes'),
         'la función cliente_ver_reportes NO existe'
       )
UNION ALL
SELECT '4. bucket proyecto-archivos existe',
       EXISTS(SELECT 1 FROM storage.buckets WHERE id = 'proyecto-archivos')::text
UNION ALL
SELECT '5. bucket reporte-fotos existe (migración 104)',
       EXISTS(SELECT 1 FROM storage.buckets WHERE id = 'reporte-fotos')::text
UNION ALL
SELECT '6. reportes diarios en estado borrador',
       (SELECT COUNT(*) FROM reportes_diarios WHERE estado_reporte = 'borrador')::text
UNION ALL
SELECT '7. reportes diarios en estado validado',
       (SELECT COUNT(*) FROM reportes_diarios WHERE estado_reporte = 'validado')::text
UNION ALL
SELECT '8. fotos generales ya subidas (Archivos > Fotos)',
       (SELECT COUNT(*) FROM proyecto_archivos WHERE categoria = 'fotos')::text
UNION ALL
SELECT '9. actividades con fotos dentro de algún reporte',
       (SELECT COUNT(*) FROM avance_diario WHERE jsonb_array_length(fotos) > 0)::text
ORDER BY 1;
