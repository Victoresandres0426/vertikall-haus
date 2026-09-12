-- ============================================================
-- 069 — Zona horaria automática desde las coordenadas del proyecto
-- ============================================================
-- Corrige 067/068: la zona horaria de un proyecto NUNCA debe asumirse
-- (ni México, ni ninguna otra) -- se calcula a partir de las MISMAS
-- coordenadas GPS que ya usa el check-in para exigir que el trabajador
-- esté físicamente en la obra (columna proyectos.coordenadas).
--
-- Esto se resuelve con una función determinística por rangos de
-- lat/lng (México + EE. UU. continental, que es donde operan los
-- proyectos actuales) y un trigger que recalcula automáticamente
-- proyectos.zona_horaria cada vez que se guardan/actualizan las
-- coordenadas -- sin importar desde dónde se escriban (ficha del
-- proyecto, importador de Excel, etc.).
--
-- Si las coordenadas caen fuera de las zonas conocidas, se deja
-- zona_horaria como está (NULL si nunca se configuró) para que un
-- humano la defina a mano desde la ficha del proyecto -- nunca se
-- inventa un valor por defecto.
-- ============================================================

-- 1. Ya no hay default ni NOT NULL -- sin coordenadas (o coordenadas
--    fuera de las zonas conocidas), zona_horaria queda NULL en vez de
--    asumir México (o cualquier otra zona) silenciosamente.
ALTER TABLE proyectos ALTER COLUMN zona_horaria DROP DEFAULT;
ALTER TABLE proyectos ALTER COLUMN zona_horaria DROP NOT NULL;

-- 2. Clasificador lat/lng -> IANA timezone (aproximado por regiones,
--    pero suficiente para direcciones reales de obra). Devuelve NULL
--    si no reconoce la zona.
CREATE OR REPLACE FUNCTION zona_horaria_desde_coordenadas(p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION)
RETURNS TEXT AS $$
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL THEN
    RETURN NULL;
  END IF;

  -- México: casos particulares primero (zonas que NO son la central)
  IF p_lat BETWEEN 27.5 AND 32.9 AND p_lng BETWEEN -117.3 AND -112.8 THEN
    RETURN 'America/Tijuana';        -- Baja California
  ELSIF p_lat BETWEEN 22.8 AND 27.5 AND p_lng BETWEEN -115.5 AND -105.5 THEN
    RETURN 'America/Mazatlan';       -- Baja California Sur / Sinaloa / Nayarit
  ELSIF p_lat BETWEEN 26.0 AND 32.9 AND p_lng BETWEEN -112.8 AND -108.5 THEN
    RETURN 'America/Hermosillo';     -- Sonora (sin horario de verano)
  ELSIF p_lat BETWEEN 17.5 AND 21.8 AND p_lng BETWEEN -90.5 AND -86.5 THEN
    RETURN 'America/Cancun';         -- Quintana Roo
  ELSIF p_lat BETWEEN 14.0 AND 32.9 AND p_lng BETWEEN -118.5 AND -86.0 THEN
    RETURN 'America/Mexico_City';    -- resto de México

  -- EE. UU. continental, por franja de longitud
  ELSIF p_lat BETWEEN 24.0 AND 50.0 AND p_lng BETWEEN -87.5 AND -66.0 THEN
    RETURN 'America/New_York';       -- Este
  ELSIF p_lat BETWEEN 24.0 AND 50.0 AND p_lng BETWEEN -101.0 AND -87.5 THEN
    RETURN 'America/Chicago';        -- Centro
  ELSIF p_lat BETWEEN 31.0 AND 37.5 AND p_lng BETWEEN -114.9 AND -109.0 THEN
    RETURN 'America/Phoenix';        -- Arizona (sin horario de verano)
  ELSIF p_lat BETWEEN 24.0 AND 50.0 AND p_lng BETWEEN -114.0 AND -101.0 THEN
    RETURN 'America/Denver';         -- Montaña
  ELSIF p_lat BETWEEN 24.0 AND 50.0 AND p_lng BETWEEN -125.0 AND -114.0 THEN
    RETURN 'America/Los_Angeles';    -- Pacífico

  ELSE
    RETURN NULL; -- fuera de las zonas conocidas -- queda en manos de un humano
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. Trigger: cada vez que se insertan/actualizan las coordenadas, se
--    recalcula zona_horaria. Si el resultado es NULL (fuera de rango
--    conocido) se deja lo que ya hubiera, en vez de borrarlo.
CREATE OR REPLACE FUNCTION trg_zona_horaria_desde_coordenadas()
RETURNS TRIGGER AS $$
DECLARE
  v_calculada TEXT;
BEGIN
  IF NEW.coordenadas IS NOT NULL THEN
    v_calculada := zona_horaria_desde_coordenadas(
      (NEW.coordenadas->>'lat')::double precision,
      (NEW.coordenadas->>'lng')::double precision
    );
    IF v_calculada IS NOT NULL THEN
      NEW.zona_horaria := v_calculada;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS zona_horaria_desde_coordenadas_trigger ON proyectos;
CREATE TRIGGER zona_horaria_desde_coordenadas_trigger
  BEFORE INSERT OR UPDATE OF coordenadas ON proyectos
  FOR EACH ROW
  EXECUTE FUNCTION trg_zona_horaria_desde_coordenadas();

-- 4. Backfill: recalcula todos los proyectos que ya tienen coordenadas
--    (corrige el default a México que puso la migración 067), y limpia
--    a NULL los que nunca tuvieron coordenadas (para que la ficha del
--    proyecto avise que falta configurarlas, en vez de mostrar México
--    como si fuera un hecho).
UPDATE proyectos
SET zona_horaria = zona_horaria_desde_coordenadas(
  (coordenadas->>'lat')::double precision,
  (coordenadas->>'lng')::double precision
)
WHERE coordenadas IS NOT NULL
  AND zona_horaria_desde_coordenadas(
        (coordenadas->>'lat')::double precision,
        (coordenadas->>'lng')::double precision
      ) IS NOT NULL;

UPDATE proyectos
SET zona_horaria = NULL
WHERE coordenadas IS NULL;
