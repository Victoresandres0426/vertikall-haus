-- ============================================================
-- Carga del presupuesto actualizado de ARMANDO AGUILAR RESIDENCE
-- Fuente: Aguilar_Residence_Presupuesto_Esquema_Hibrido.xlsx (24-oct-2026)
-- REEMPLAZA procesos, actividades y partidas del proyecto (sin avance).
-- Avance por unidad (SF, LF, CY, EA...) + actividad de Supervisión (ADM.01).
-- Se ejecuta en una sola transacción: si algo falla, no cambia nada.
-- Requiere las migraciones 137 y 144 (excluir_de_avance / avance_por_tiempo).
-- ============================================================
DO $$
DECLARE
  v_proy UUID;
  v_n INT;
  v_pres UUID;
  v_proc_adm UUID;
BEGIN
  SELECT COUNT(*) INTO v_n FROM proyectos WHERE nombre ILIKE '%aguilar%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Se esperaba 1 proyecto con "Aguilar" en el nombre y hay %', v_n;
  END IF;
  SELECT id INTO v_proy FROM proyectos WHERE nombre ILIKE '%aguilar%';

  IF EXISTS (SELECT 1 FROM reportes_diarios WHERE proyecto_id = v_proy) THEN
    RAISE EXCEPTION 'El proyecto ya tiene reportes diarios: no se reemplaza';
  END IF;
  IF EXISTS (SELECT 1 FROM costos_reales WHERE proyecto_id = v_proy) THEN
    RAISE EXCEPTION 'El proyecto ya tiene costos reales registrados: no se reemplaza';
  END IF;
  IF EXISTS (SELECT 1 FROM facturas_cliente WHERE proyecto_id = v_proy AND estado::text <> 'borrador') THEN
    RAISE EXCEPTION 'El proyecto ya tiene facturas emitidas: no se reemplaza';
  END IF;

  DELETE FROM facturas_cliente WHERE proyecto_id = v_proy;
  DELETE FROM actividades WHERE proyecto_id = v_proy;
  DELETE FROM procesos WHERE proyecto_id = v_proy;

  SELECT id INTO v_pres FROM presupuestos WHERE proyecto_id = v_proy AND es_baseline_actual = true LIMIT 1;
  IF v_pres IS NULL THEN
    INSERT INTO presupuestos (proyecto_id, version, nombre_version, es_baseline_actual, total)
    VALUES (v_proy, 1, 'Presupuesto 24-oct-2026', true, 0) RETURNING id INTO v_pres;
  ELSE
    DELETE FROM partidas_presupuesto WHERE presupuesto_id = v_pres;
    UPDATE presupuestos SET nombre_version = 'Presupuesto 24-oct-2026' WHERE id = v_pres;
  END IF;

  INSERT INTO procesos (proyecto_id, codigo, nombre, orden)
  SELECT v_proy, v.c, v.n, v.o FROM (VALUES
  ('01','CONDICIONES GENERALES',1),
  ('02','CONCRETO',2),
  ('03','MAMPOSTERÍA',3),
  ('04','MADERA/ESTRUCT. SEGUNDO PISO',4),
  ('05','MADERA/ESTRUCT. TECHO',5),
  ('06','TÉRMICO/HUMEDAD',6),
  ('07','ABERTURAS EXTERIORES',7),
  ('08','ABERTURAS INTERIORES',8),
  ('09','ACABADOS INTERIORES PAREDES Y PISOS',9),
  ('10','ACABADOS INTERIORES TECHOS',10),
  ('11','CARPINTERÍA',11),
  ('12-13','HIDRÁULICA + SANITARIO',12),
  ('14-15','HVAC + EXTRACTORES',13),
  ('16','ELÉCTRICO',14),
  ('17','ACABADOS EXTERIORES',15),
  ('18','CIERRE',16)
  ) AS v(c, n, o);

  -- Equipo de renta incluido en costo_material (cuenta en avance y facturación);
  -- M.O. queda solo con mano de obra.
  CREATE TEMP TABLE tmp_acts (proc TEXT, cod TEXT, nom TEXT, ini DATE, fin DATE, dur NUMERIC,
                              mat NUMERIC, mo NUMERIC, eq NUMERIC, qty NUMERIC, und TEXT) ON COMMIT DROP;
  INSERT INTO tmp_acts VALUES
  ('01','01.01','Movilización e instalaciones temporales',DATE '2026-11-02',DATE '2026-11-04',3.0,11743.250000,2544.924000,0.000000,1,'LS'),
  ('02','02.01','Limpieza, desmonte y control de erosión',DATE '2026-11-05',DATE '2026-11-06',2.0,0.000000,1521.104000,1660.000000,1564.2,'SF'),
  ('02','02.02','Nivelación gruesa y compactación (base limerock)',DATE '2026-11-09',DATE '2026-11-11',3.0,4535.088000,2281.656000,0.000000,1564.2,'SF'),
  ('02','02.03','Excavación de zapatas / zanjas',DATE '2026-11-12',DATE '2026-11-13',2.0,0.000000,1521.104000,760.000000,218,'LF'),
  ('02','02.04','Encofrado + acero de zapatas y vigas de fundación',DATE '2026-11-16',DATE '2026-11-19',4.0,1212.545400,4797.328000,0.000000,218,'LF'),
  ('02','02.05','Vaciado de concreto en zapatas (bombeo)',DATE '2026-11-24',DATE '2026-11-24',1.0,4243.085000,1784.372000,430.384615,20.6,'CY'),
  ('02','02.06','Preparación de losa (vapor + malla + antitermitas)',DATE '2026-11-25',DATE '2026-11-27',3.2,1629.984928,2620.979200,0.000000,1564.2,'SF'),
  ('02','02.07','Vaciado y acabado de losa SOG',DATE '2026-12-02',DATE '2026-12-02',1.6,4738.569044,2480.569600,688.615385,1564.2,'SF'),
  ('03','03.01','Levantamiento de muros CMU (bloque + mortero + grout)',DATE '2026-12-08',DATE '2026-12-22',11.01,12449.483170,16747.355040,4547.130000,4316,'SF'),
  ('03','03.02','Refuerzo horizontal, flejes, buck y accesorios de vano',DATE '2026-12-08',DATE '2026-12-09',2.0,4382.912600,0.000000,0.000000,2477,'LF'),
  ('03','03.03a','Concreto premezclado de dinteles, vigas y columnas',DATE '2027-01-04',DATE '2027-01-06',3.0,6242.326500,4651.068000,2850.000000,26.7,'CY'),
  ('03','03.03b','Acero de refuerzo de dinteles, vigas y columnas',DATE '2026-12-17',DATE '2026-12-24',5.5,7975.281380,8526.958000,0.000000,9592,'LB'),
  ('03','03.03c','Encofrado de vigas',DATE '2026-12-25',DATE '2026-12-30',4.2,5198.862500,6511.495200,0.000000,485,'LF'),
  ('04','04.01','Viguetería de entrepiso (joists + ledgers + blocking + rim)',DATE '2027-01-14',DATE '2027-01-19',4.1,2961.332000,5396.994000,0.000000,1000,'SF'),
  ('04','04.02','Subpiso (plywood + adhesivo + hangers + pernos + clavos)',DATE '2027-01-20',DATE '2027-01-21',2.0,5212.933000,2632.680000,0.000000,1000,'SF'),
  ('05','05.01','Estructura de techo (roof joists dobles + blocking + ledgers + hangers)',DATE '2027-01-22',DATE '2027-01-27',4.3,7520.441500,7169.665200,3139.000000,1394,'SF'),
  ('05','05.02','Entablado de cubierta (plywood + adhesivo + clavos)',DATE '2027-01-28',DATE '2027-02-01',2.14,3467.442000,2823.043015,0.000000,1394,'SF'),
  ('06','06.01','Cubierta de teja metálica (subcontrato materiales + M.O.)',DATE '2027-02-02',DATE '2027-02-11',8.0,13525.000000,0.000000,0.000000,1394,'SF'),
  ('06','06.02','Bajantes y canalones (fuera del subcontrato de techo)',DATE '2027-03-17',DATE '2027-03-18',2.0,3457.705000,1170.080000,0.000000,110,'LF'),
  ('06','06.03','Aislamiento térmico (techo R-30 fibra de vidrio + muros R-4.1)',DATE '2027-03-04',DATE '2027-03-09',3.8,6622.861300,2223.152000,0.000000,5710,'SF'),
  ('07','07.01','Ventanas y puertas de impacto — instalación (subcontrato)',DATE '2027-01-22',DATE '2027-02-01',7.0,28799.000000,9900.000000,0.000000,672,'SF'),
  ('07','07.02','Puerta de garaje — instalación',DATE '2027-01-22',DATE '2027-01-22',1.0,2358.280000,1500.000000,0.000000,1,'EA'),
  ('08','08.01','Instalación de puertas interiores (swing/bifold/pocket + molduras)',DATE '2027-03-25',DATE '2027-03-26',1.8,2416.603025,2106.144000,0.000000,17,'EA'),
  ('08','08.02','Herrajes y accesorios (cerraduras, perillas, topes)',DATE '2027-03-29',DATE '2027-03-29',0.5,174.303000,585.040000,0.000000,17,'EA'),
  ('08','08.03','Baseboard / zócalo (toda la casa)',DATE '2027-04-02',DATE '2027-04-05',2.0,794.903000,1170.080000,0.000000,680,'LF'),
  ('09','09.01','Tabiquería metálica + furring + aislante acústico',DATE '2027-02-12',DATE '2027-02-16',3.4,3463.616750,4475.556000,0.000000,150,'LF'),
  ('09','09.02','Drywall: colocación y acabado de paredes — NIVEL 2 + textura',DATE '2027-03-15',DATE '2027-03-18',4.1,5563.230670,6356.459600,307.500000,2700,'SF'),
  ('09','09.03','Tabla de cemento + impermeabilización de duchas',DATE '2027-03-15',DATE '2027-03-15',1.0,1348.381900,819.056000,0.000000,323,'SF'),
  ('09','09.04','Pintura interior (primer + paredes + trim)',DATE '2027-03-19',DATE '2027-03-24',4.3,2012.744900,4779.776800,0.000000,7016,'SF'),
  ('09','09.05','Piso de azulejo en baños',DATE '2027-03-16',DATE '2027-03-18',2.9,466.092000,3393.232000,159.500000,160,'SF'),
  ('09','09.06','Piso básico resto de la casa (porcelanato/cerámica económica) + revestimiento de escalera',DATE '2027-03-25',DATE '2027-04-01',6.3,3886.318324,7371.504000,0.000000,1530.4,'SF'),
  ('10','10.01','Estructura metálica de cielo (perfil + track)',DATE '2027-02-17',DATE '2027-02-19',3.1,1448.887000,4087.040000,0.000000,1949,'SF'),
  ('10','10.02','Drywall de cielo + acabado — NIVEL 2 + textura',DATE '2027-03-10',DATE '2027-03-16',5.7,2341.526475,8876.952000,0.000000,1949,'SF'),
  ('10','10.03','Pintura de cielo (primer + flat)',DATE '2027-03-17',DATE '2027-03-18',1.5,445.933200,1668.600000,0.000000,1949,'SF'),
  ('11','11.01','Gabinetes de cocina + encimeras de cuarzo',DATE '2027-03-25',DATE '2027-03-30',4.0,9866.577000,2808.192000,0.000000,1,'LS'),
  ('11','11.02','Escalera de madera (hecha en obra) + barandas (subcontrato)',DATE '2027-03-25',DATE '2027-03-30',4.0,7993.000000,2808.192000,0.000000,1,'LS'),
  ('11','11.03','Muebles de lavamanos (instalación, 4 unidades)',DATE '2027-03-25',DATE '2027-03-25',1.0,642.000000,702.048000,0.000000,4,'EA'),
  ('12-13','P-A','Instalación de aparatos sanitarios y valvulería (trim-out)',DATE '2027-03-26',DATE '2027-03-30',3.0,2545.637000,2948.601600,0.000000,12,'EA'),
  ('12-13','P-B','Calentadores de agua tankless (2 EA — IWH-1 PB, IWH-2 PA)',DATE '2027-02-22',DATE '2027-02-22',1.0,941.600000,748.851200,0.000000,2,'EA'),
  ('12-13','P-C1','Tubería troncal CPVC + acometida subterránea',DATE '2027-02-17',DATE '2027-02-17',1.5,912.415750,1474.300800,397.500000,30,'LF'),
  ('12-13','P-C2','Fittings, codos, tees y uniones CPVC',DATE '2027-02-18',DATE '2027-02-22',3.0,1171.264800,2948.601600,0.000000,1,'LS'),
  ('12-13','P-C3','Aislamiento, soportes y sellador de tubería de agua',DATE '2027-02-23',DATE '2027-02-25',3.0,1088.350500,2948.601600,0.000000,200,'LF'),
  ('12-13','P-D','Rough-in subterráneo sanitario (acometida de alcantarillado)',DATE '2026-11-16',DATE '2026-11-18',3.0,292.859000,3650.649600,795.000000,40,'LF'),
  ('12-13','P-E1','Tubería DWV + fittings + cleanouts',DATE '2027-02-17',DATE '2027-02-18',2.5,2563.706625,3042.208000,0.000000,315,'LF'),
  ('12-13','P-E2','Ventilación, tees/wyes/codos y trampas',DATE '2027-02-19',DATE '2027-02-23',3.0,1125.640000,3650.649600,0.000000,9,'EA'),
  ('12-13','P-F','Drenajes especiales, válvulas y misc. sanitarios',DATE '2027-02-17',DATE '2027-02-18',2.0,1359.702500,1216.883200,0.000000,3,'EA'),
  ('14-15','H-A','Instalación de equipo (condensadoras + manejadoras) — subcontrato',DATE '2027-02-17',DATE '2027-02-23',5.0,9630.000000,6000.000000,0.000000,2,'EA'),
  ('14-15','H-B1','Ductería flexible',DATE '2027-02-24',DATE '2027-02-24',1.0,527.296000,1216.883200,0.000000,234,'LF'),
  ('14-15','H-B2','Duct board rígido + accesorios de junta y sellado',DATE '2027-02-25',DATE '2027-02-25',1.0,3203.644200,1216.883200,0.000000,20,'SHT'),
  ('14-15','H-B3','Soportes y fijación de ductería',DATE '2027-02-26',DATE '2027-02-26',1.0,1168.761000,1216.883200,0.000000,200,'LF'),
  ('14-15','H-C','Registros, rejillas y difusores',DATE '2027-03-19',DATE '2027-03-19',1.0,992.960000,608.441600,0.000000,25,'EA'),
  ('14-15','H-D','Extractores de baño (fans + ductos + roof cap)',DATE '2027-03-19',DATE '2027-03-19',1.0,850.382500,608.441600,0.000000,4,'EA'),
  ('14-15','H-E','Línea de condensado',DATE '2027-03-01',DATE '2027-03-01',1.0,291.703400,748.851200,0.000000,80,'LF'),
  ('14-15','H-F','Disconnects y conexiones eléctricas de equipo',DATE '2027-02-24',DATE '2027-02-24',1.0,326.136000,0.000000,0.000000,2,'EA'),
  ('16','16.01','Acometida + paneles + puesta a tierra',DATE '2026-12-23',DATE '2026-12-25',2.3,3518.240250,2260.594560,0.000000,1,'LS'),
  ('16','16.02a','Cableado de fuerza (circuitos ramales 120/240V)',DATE '2027-02-17',DATE '2027-02-19',3.0,4912.156000,3650.649600,180.000000,3850,'LF'),
  ('16','16.02b','Cableado de iluminación y bajo voltaje',DATE '2027-02-22',DATE '2027-02-23',1.8,305.164000,2190.389760,108.000000,31,'EA'),
  ('16','16.02c','Tubería (EMT/PVC), conectores y consumibles de instalación',DATE '2027-02-17',DATE '2027-02-19',3.0,907.247650,0.000000,0.000000,270,'LF'),
  ('16','16.03','Colocación de dispositivos (tomas + interruptores)',DATE '2027-03-25',DATE '2027-03-25',1.2,728.225950,1179.440640,0.000000,84,'EA'),
  ('16','16.04','Colocación de luminarias y detectores',DATE '2027-03-31',DATE '2027-03-31',1.0,2106.830000,982.867200,0.000000,37,'EA'),
  ('17','17.01','Estuco 3 capas en muros exteriores',DATE '2027-02-12',DATE '2027-02-22',7.3,6135.273000,8541.584000,2518.500000,3324,'SF'),
  ('17','17.02','Pintura exterior elastomérica (2 manos)',DATE '2027-03-09',DATE '2027-03-16',6.2,4090.182000,7254.496000,0.000000,3324,'SF'),
  ('18','18.01','Inspecciones MEP + correcciones + prueba final (BCC)',DATE '2027-04-09',DATE '2027-04-15',5.0,0.000000,4826.580000,0.000000,1,'LS'),
  ('18','18.02','Limpieza final + as-built + paquete de cierre',DATE '2027-04-16',DATE '2027-04-20',3.0,0.000000,2544.924000,0.000000,1,'LS');

  INSERT INTO actividades (proceso_id, proyecto_id, codigo, nombre, fecha_inicio_plan, fecha_fin_plan,
                           duracion_plan_dias, es_critica, costo_material, costo_mano_obra, cantidad_objetivo, unidad)
  SELECT p.id, v_proy, t.cod, t.nom, t.ini, t.fin, t.dur, false, t.mat + t.eq, t.mo, t.qty, t.und
  FROM tmp_acts t JOIN procesos p ON p.proyecto_id = v_proy AND p.codigo = t.proc;

  INSERT INTO partidas_presupuesto (presupuesto_id, proceso_id, actividad_id, codigo, descripcion, tipo_recurso, monto_total, monto_presupuestado)
  SELECT v_pres, a.proceso_id, a.id, a.codigo, a.nombre || ' (material)', 'material'::tipo_recurso, t.mat, t.mat
  FROM tmp_acts t JOIN actividades a ON a.proyecto_id = v_proy AND a.codigo = t.cod WHERE t.mat > 0
  UNION ALL
  SELECT v_pres, a.proceso_id, a.id, a.codigo, a.nombre || ' (mano de obra)', 'mano_obra'::tipo_recurso, t.mo, t.mo
  FROM tmp_acts t JOIN actividades a ON a.proyecto_id = v_proy AND a.codigo = t.cod WHERE t.mo > 0
  UNION ALL
  SELECT v_pres, a.proceso_id, a.id, a.codigo, a.nombre || ' (equipo)', 'equipo'::tipo_recurso, t.eq, t.eq
  FROM tmp_acts t JOIN actividades a ON a.proyecto_id = v_proy AND a.codigo = t.cod WHERE t.eq > 0;

  -- Indirectos, contingencia y overhead (sin actividad)
  INSERT INTO partidas_presupuesto (presupuesto_id, actividad_id, proceso_id, codigo, descripcion, tipo_recurso, monto_total, monto_presupuestado)
  SELECT v_pres, NULL, NULL, v.c, v.d, 'indirecto'::tipo_recurso, v.m, v.m FROM (VALUES
  ('IND-01','Supervisión (capataz + visitas de PM) — $250/día laborable',48750.000000),
  ('IND-02','Seguro GL + Builders Risk',5086.166653),
  ('IND-03','Agua y energía temporal',5778.000000),
  ('IND-04','Contingencia (7%)',36363.658237),
  ('IND-05','Overhead de empresa (4%)',20000.012030)
  ) AS v(c, d, m);

  -- Supervisión como actividad (igual que en Radnor): avanza sola con el
  -- tiempo (9 meses = 273 días calendario) y NO se factura como actividad,
  -- porque su costo ya se cobra por el indirecto IND-01.
  INSERT INTO procesos (proyecto_id, codigo, nombre, orden)
  VALUES (v_proy, 'ADM', 'Administración y Supervisión', 100) RETURNING id INTO v_proc_adm;

  INSERT INTO actividades (proceso_id, proyecto_id, codigo, nombre, descripcion,
                           fecha_inicio_plan, fecha_fin_plan, duracion_plan_dias,
                           cantidad_objetivo, unidad, costo_material, costo_mano_obra,
                           estado, excluir_de_avance, avance_por_tiempo)
  VALUES (v_proc_adm, v_proy, 'ADM.01', 'Supervisión (capataz + visitas de PM)',
          'Supervisión continua de obra ($250 por día laborable). Avanza con el tiempo; su costo se factura vía indirectos.',
          DATE '2026-11-02', DATE '2026-11-02' + 273, 195,
          NULL, NULL, 0, 48750.00,
          'en_progreso', TRUE, TRUE);

  UPDATE proyectos SET
    presupuesto_base = 575844.50,
    presupuesto_venta = 650704.29,
    margen_objetivo = ROUND((650704.29 - 575844.50) / 650704.29 * 100, 2),
    fecha_inicio_plan = DATE '2026-11-02',
    fecha_fin_plan = DATE '2027-04-20'
  WHERE id = v_proy;

  PERFORM refrescar_avance_por_tiempo();
  RAISE NOTICE 'Listo: proyecto %, % actividades', v_proy, (SELECT COUNT(*) FROM actividades WHERE proyecto_id = v_proy);
END $$;

-- Verificación (total partidas debe ser 575844.50; actividades 65 = 64 + supervisión)
SELECT p.nombre, p.presupuesto_base, p.presupuesto_venta, pr.total AS total_partidas,
       (SELECT COUNT(*) FROM actividades a WHERE a.proyecto_id = p.id) AS actividades
FROM proyectos p JOIN presupuestos pr ON pr.proyecto_id = p.id AND pr.es_baseline_actual
WHERE p.nombre ILIKE '%aguilar%';
