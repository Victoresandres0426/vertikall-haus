-- 142: Margen de Change Orders pasa a 20% (sobre el precio total:
-- total = directo / (1 - 0.20)). Los textos "Indirectos + Contingencia +
-- Margen — X%" ya leen este valor, así que se actualizan solos.
ALTER TABLE proyectos ALTER COLUMN margen_co_pct SET DEFAULT 20.00;
UPDATE proyectos SET margen_co_pct = 20.00;
