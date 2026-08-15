-- ============================================================
-- VERTIKALL HAUS — Schema Inicial v1.0
-- Jerarquía: Empresa → Proyecto → Proceso → Actividad
-- ============================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- ENUMERACIONES
-- ============================================================

CREATE TYPE rol_usuario AS ENUM ('capataz', 'administrador', 'project_manager', 'dueno', 'superadmin');
CREATE TYPE estado_actividad AS ENUM ('no_iniciada', 'en_progreso', 'completada', 'bloqueada', 'cancelada');
CREATE TYPE nivel_alerta AS ENUM ('verde', 'amarillo', 'rojo');
CREATE TYPE estado_alerta AS ENUM ('activa', 'en_revision', 'resuelta', 'descartada');
CREATE TYPE tipo_dependencia AS ENUM ('fin_a_inicio', 'inicio_a_inicio', 'fin_a_fin', 'inicio_a_fin');
CREATE TYPE estado_change_order AS ENUM ('detectado', 'en_estimacion', 'enviado_cliente', 'aprobado', 'rechazado', 'facturado', 'cobrado');
CREATE TYPE estado_riesgo AS ENUM ('identificado', 'en_mitigacion', 'resuelto', 'materializado', 'aceptado');
CREATE TYPE estado_factura AS ENUM ('borrador', 'enviada', 'parcialmente_pagada', 'pagada', 'vencida', 'en_disputa');
CREATE TYPE tipo_recurso AS ENUM ('mano_obra', 'material', 'equipo', 'subcontrato', 'indirecto');
CREATE TYPE estado_readiness AS ENUM ('verde', 'amarillo', 'rojo');
CREATE TYPE tipo_equipo AS ENUM ('propio', 'rentado');
CREATE TYPE estado_solicitud_compra AS ENUM ('borrador', 'pendiente', 'aprobada', 'ordenada', 'recibida', 'cancelada');
CREATE TYPE periodo_nomina AS ENUM ('semanal', 'quincenal', 'mensual');

-- ============================================================
-- EMPRESAS (tenant raíz del sistema multi-tenant)
-- ============================================================

CREATE TABLE empresas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre TEXT NOT NULL,
  rfc_tax_id TEXT,
  logo_url TEXT,
  configuracion JSONB DEFAULT '{}', -- Thresholds, reglas de negocio, umbrales
  jurisdiccion TEXT DEFAULT 'MX', -- Para reglas de nómina
  activa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USUARIOS Y PERFILES
-- ============================================================

CREATE TABLE perfiles_usuario (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre_completo TEXT NOT NULL,
  email TEXT NOT NULL,
  rol rol_usuario NOT NULL,
  avatar_url TEXT,
  activo BOOLEAN DEFAULT TRUE,
  configuracion_notificaciones JSONB DEFAULT '{"email": true, "push": true}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROYECTOS
-- ============================================================

CREATE TABLE proyectos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  cliente TEXT,
  numero_contrato TEXT,
  tipo_contrato TEXT, -- precio_fijo, costo_mas_fee, unitario
  fecha_inicio_plan DATE NOT NULL,
  fecha_fin_plan DATE NOT NULL,
  fecha_inicio_real DATE,
  fecha_fin_forecast DATE,
  presupuesto_base DECIMAL(15,2) DEFAULT 0,
  presupuesto_venta DECIMAL(15,2) DEFAULT 0, -- precio al cliente
  margen_objetivo DECIMAL(5,2) DEFAULT 0, -- porcentaje
  estado TEXT DEFAULT 'activo', -- activo, pausado, completado, cancelado
  responsable_id UUID REFERENCES perfiles_usuario(id),
  ubicacion TEXT,
  coordenadas JSONB, -- {lat, lng}
  configuracion JSONB DEFAULT '{}', -- umbrales específicos por proyecto
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, codigo)
);

-- ============================================================
-- PROCESOS (agrupador intermedio entre Proyecto y Actividad)
-- ============================================================

CREATE TABLE procesos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  orden INTEGER DEFAULT 0,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ACTIVIDADES (célula base del sistema)
-- ============================================================

CREATE TABLE actividades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proceso_id UUID NOT NULL REFERENCES procesos(id) ON DELETE CASCADE,
  proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  disciplina TEXT, -- cimentacion, estructura, instalaciones, acabados, etc.
  responsable_id UUID REFERENCES perfiles_usuario(id),

  -- Plan
  fecha_inicio_plan DATE,
  fecha_fin_plan DATE,
  duracion_plan_dias INTEGER,
  cantidad_objetivo DECIMAL(12,3), -- unidad de medición
  unidad TEXT, -- m2, ml, m3, und, etc.
  holgura_dias INTEGER DEFAULT 0,
  es_critica BOOLEAN DEFAULT FALSE,

  -- Real / Ejecución
  fecha_inicio_real DATE,
  fecha_fin_real DATE,
  fecha_fin_forecast DATE,
  avance_porcentaje DECIMAL(5,2) DEFAULT 0, -- 0-100
  cantidad_ejecutada DECIMAL(12,3) DEFAULT 0,
  estado estado_actividad DEFAULT 'no_iniciada',

  -- Readiness
  readiness estado_readiness DEFAULT 'rojo',
  readiness_detalle JSONB DEFAULT '{}',

  -- Costos (resumen, detalle en tabla costos)
  costo_presupuesto DECIMAL(15,2) DEFAULT 0,
  costo_comprometido DECIMAL(15,2) DEFAULT 0,
  costo_real DECIMAL(15,2) DEFAULT 0,
  costo_forecast DECIMAL(15,2) DEFAULT 0,

  -- Inteligencia
  tendencia TEXT, -- mejorando, estable, deteriorando
  riesgo_nivel nivel_alerta DEFAULT 'verde',
  notas TEXT,
  orden INTEGER DEFAULT 0,
  activa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Línea base de actividades (versionado)
CREATE TABLE actividades_baseline (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actividad_id UUID NOT NULL REFERENCES actividades(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  nombre_version TEXT,
  fecha_inicio_plan DATE,
  fecha_fin_plan DATE,
  duracion_plan_dias INTEGER,
  cantidad_objetivo DECIMAL(12,3),
  costo_presupuesto DECIMAL(15,2),
  motivo_cambio TEXT,
  aprobado_por UUID REFERENCES perfiles_usuario(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DEPENDENCIAS ENTRE ACTIVIDADES
-- ============================================================

CREATE TABLE dependencias_actividad (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actividad_id UUID NOT NULL REFERENCES actividades(id) ON DELETE CASCADE,
  predecesora_id UUID NOT NULL REFERENCES actividades(id) ON DELETE CASCADE,
  tipo tipo_dependencia DEFAULT 'fin_a_inicio',
  lag_dias INTEGER DEFAULT 0, -- días de desfase (positivo = lag, negativo = lead)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(actividad_id, predecesora_id)
);

-- ============================================================
-- TRABAJADORES
-- ============================================================

CREATE TABLE trabajadores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre_completo TEXT NOT NULL,
  codigo TEXT,
  especialidad TEXT,
  rol_obra TEXT, -- carpintero, electricista, plomero, ayudante, etc.
  nivel_experiencia TEXT, -- junior, medio, senior
  tarifa_diaria DECIMAL(10,2),
  tarifa_hora DECIMAL(10,2),
  moneda TEXT DEFAULT 'MXN',
  certificaciones JSONB DEFAULT '[]', -- [{nombre, vencimiento}]
  usuario_id UUID REFERENCES perfiles_usuario(id), -- si tiene acceso al sistema
  activo BOOLEAN DEFAULT TRUE,
  fecha_ingreso DATE,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CUADRILLAS
-- ============================================================

CREATE TABLE cuadrillas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  capataz_id UUID REFERENCES trabajadores(id),
  descripcion TEXT,
  activa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE cuadrilla_trabajadores (
  cuadrilla_id UUID REFERENCES cuadrillas(id) ON DELETE CASCADE,
  trabajador_id UUID REFERENCES trabajadores(id) ON DELETE CASCADE,
  fecha_ingreso DATE DEFAULT CURRENT_DATE,
  fecha_salida DATE,
  activo BOOLEAN DEFAULT TRUE,
  PRIMARY KEY (cuadrilla_id, trabajador_id)
);

-- ============================================================
-- PROVEEDORES
-- ============================================================

CREATE TABLE proveedores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  rfc_tax_id TEXT,
  tipo TEXT, -- material, equipo, subcontrato, servicio
  contacto_nombre TEXT,
  contacto_email TEXT,
  contacto_telefono TEXT,
  lead_time_promedio_dias INTEGER, -- días promedio de entrega
  calificacion_promedio DECIMAL(3,2), -- 0-5
  activo BOOLEAN DEFAULT TRUE,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MATERIALES
-- ============================================================

CREATE TABLE materiales_catalogo (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo TEXT,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  unidad TEXT NOT NULL,
  categoria TEXT, -- concreto, acero, madera, instalaciones, etc.
  es_critico BOOLEAN DEFAULT FALSE, -- requiere seguimiento especial
  lead_time_dias INTEGER DEFAULT 2,
  desperdicio_esperado_pct DECIMAL(5,2) DEFAULT 5, -- % esperado de desperdicio
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE materiales_actividad (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actividad_id UUID NOT NULL REFERENCES actividades(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES materiales_catalogo(id),
  proveedor_id UUID REFERENCES proveedores(id),
  cantidad_plan DECIMAL(12,3) NOT NULL,
  cantidad_reservada DECIMAL(12,3) DEFAULT 0,
  cantidad_en_transito DECIMAL(12,3) DEFAULT 0,
  cantidad_recibida DECIMAL(12,3) DEFAULT 0,
  cantidad_consumida DECIMAL(12,3) DEFAULT 0,
  desperdicio_real DECIMAL(12,3) DEFAULT 0,
  precio_unitario DECIMAL(12,4),
  fecha_necesidad DATE,
  alerta_compra_emitida BOOLEAN DEFAULT FALSE,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EQUIPOS Y MAQUINARIA
-- ============================================================

CREATE TABLE equipos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  codigo TEXT,
  tipo TEXT, -- excavadora, grua, andamio, herramienta, etc.
  capacidad TEXT,
  propiedad tipo_equipo DEFAULT 'rentado',
  proveedor_id UUID REFERENCES proveedores(id),
  tarifa_dia DECIMAL(10,2),
  tarifa_hora DECIMAL(10,2),
  incluye_operador BOOLEAN DEFAULT FALSE,
  operador_default_id UUID REFERENCES trabajadores(id),
  activo BOOLEAN DEFAULT TRUE,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE equipos_reserva (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipo_id UUID NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  actividad_id UUID NOT NULL REFERENCES actividades(id) ON DELETE CASCADE,
  proyecto_id UUID NOT NULL REFERENCES proyectos(id),
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  horas_planificadas DECIMAL(8,2),
  horas_reales DECIMAL(8,2) DEFAULT 0,
  costo_estimado DECIMAL(12,2),
  costo_real DECIMAL(12,2) DEFAULT 0,
  estado TEXT DEFAULT 'reservado', -- reservado, activo, devuelto, cancelado
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SUBCONTRATISTAS
-- ============================================================

CREATE TABLE subcontratistas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  nombre TEXT NOT NULL, -- puede ser diferente al proveedor
  especialidad TEXT,
  calificacion_promedio DECIMAL(3,2),
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE contratos_subcontrato (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subcontratista_id UUID NOT NULL REFERENCES subcontratistas(id),
  proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  actividad_id UUID REFERENCES actividades(id),
  numero_contrato TEXT,
  alcance TEXT,
  monto_contrato DECIMAL(15,2),
  fecha_inicio DATE,
  fecha_fin_plan DATE,
  fecha_fin_real DATE,
  estado TEXT DEFAULT 'activo',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- REPORTES DIARIOS (captura del Capataz)
-- ============================================================

CREATE TABLE reportes_diarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  capataz_id UUID NOT NULL REFERENCES perfiles_usuario(id),
  fecha DATE NOT NULL,
  clima TEXT,
  observaciones_generales TEXT,
  estado_reporte TEXT DEFAULT 'borrador', -- borrador, enviado, validado
  validado_por UUID REFERENCES perfiles_usuario(id),
  validado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proyecto_id, capataz_id, fecha)
);

-- Asistencia diaria (parte del reporte)
CREATE TABLE asistencia_diaria (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporte_id UUID NOT NULL REFERENCES reportes_diarios(id) ON DELETE CASCADE,
  trabajador_id UUID NOT NULL REFERENCES trabajadores(id),
  presente BOOLEAN DEFAULT TRUE,
  horas_regulares DECIMAL(4,2) DEFAULT 8,
  horas_extra DECIMAL(4,2) DEFAULT 0,
  horas_productivas DECIMAL(4,2),
  horas_improductivas DECIMAL(4,2) DEFAULT 0,
  actividad_principal_id UUID REFERENCES actividades(id),
  motivo_ausencia TEXT,
  observacion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Avance diario por actividad (parte del reporte)
CREATE TABLE avance_diario (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporte_id UUID NOT NULL REFERENCES reportes_diarios(id) ON DELETE CASCADE,
  actividad_id UUID NOT NULL REFERENCES actividades(id),
  cantidad_ejecutada_dia DECIMAL(12,3) NOT NULL DEFAULT 0,
  porcentaje_avance_total DECIMAL(5,2), -- % acumulado al día
  horas_trabajadas DECIMAL(6,2),
  incidencias TEXT,
  bloqueos TEXT,
  retrabajo_descripcion TEXT,
  retrabajo_horas DECIMAL(6,2) DEFAULT 0,
  fotos JSONB DEFAULT '[]', -- [{url, descripcion}]
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Consumo de materiales diario (parte del reporte)
CREATE TABLE consumo_material_diario (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporte_id UUID NOT NULL REFERENCES reportes_diarios(id) ON DELETE CASCADE,
  actividad_id UUID NOT NULL REFERENCES actividades(id),
  material_id UUID NOT NULL REFERENCES materiales_catalogo(id),
  cantidad_consumida DECIMAL(12,3) NOT NULL,
  desperdicio DECIMAL(12,3) DEFAULT 0,
  observacion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PRESUPUESTO Y COSTOS
-- ============================================================

CREATE TABLE presupuestos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  nombre_version TEXT DEFAULT 'Baseline Original',
  es_baseline_actual BOOLEAN DEFAULT TRUE,
  total DECIMAL(15,2) DEFAULT 0,
  aprobado_por UUID REFERENCES perfiles_usuario(id),
  aprobado_at TIMESTAMPTZ,
  motivo_revision TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE partidas_presupuesto (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  presupuesto_id UUID NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
  actividad_id UUID REFERENCES actividades(id),
  proceso_id UUID REFERENCES procesos(id),
  codigo TEXT,
  descripcion TEXT NOT NULL,
  tipo_recurso tipo_recurso NOT NULL,
  cantidad DECIMAL(12,3),
  unidad TEXT,
  precio_unitario DECIMAL(12,4),
  monto_total DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE costos_reales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  actividad_id UUID REFERENCES actividades(id),
  tipo_recurso tipo_recurso NOT NULL,
  descripcion TEXT NOT NULL,
  proveedor_id UUID REFERENCES proveedores(id),
  trabajador_id UUID REFERENCES trabajadores(id),
  fecha DATE NOT NULL,
  monto DECIMAL(15,2) NOT NULL,
  moneda TEXT DEFAULT 'MXN',
  referencia TEXT, -- número de factura, orden de compra, etc.
  aprobado BOOLEAN DEFAULT FALSE,
  aprobado_por UUID REFERENCES perfiles_usuario(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FLUJO DE CAJA
-- ============================================================

CREATE TABLE flujo_caja_proyecciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  semana DATE NOT NULL, -- inicio de la semana
  ingresos_plan DECIMAL(15,2) DEFAULT 0,
  ingresos_real DECIMAL(15,2) DEFAULT 0,
  egresos_plan DECIMAL(15,2) DEFAULT 0,
  egresos_real DECIMAL(15,2) DEFAULT 0,
  saldo_proyectado DECIMAL(15,2) DEFAULT 0,
  alerta_liquidez BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proyecto_id, semana)
);

-- ============================================================
-- CHANGE ORDERS (Órdenes de Cambio)
-- ============================================================

CREATE TABLE change_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  numero TEXT,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  solicitado_por TEXT, -- nombre del cliente o razón
  detectado_por UUID REFERENCES perfiles_usuario(id),
  estado estado_change_order DEFAULT 'detectado',
  impacto_costo DECIMAL(15,2) DEFAULT 0,
  impacto_dias INTEGER DEFAULT 0,
  actividades_afectadas JSONB DEFAULT '[]',
  evidencia JSONB DEFAULT '[]', -- [{url, tipo, descripcion}]
  aprobado_por UUID REFERENCES perfiles_usuario(id),
  aprobado_at TIMESTAMPTZ,
  facturado BOOLEAN DEFAULT FALSE,
  cobrado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FACTURACIÓN Y CxC / CxP
-- ============================================================

CREATE TABLE facturas_cliente (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  numero TEXT,
  descripcion TEXT,
  hito_asociado TEXT,
  monto DECIMAL(15,2) NOT NULL,
  retencion DECIMAL(15,2) DEFAULT 0,
  fecha_emision DATE,
  fecha_vencimiento DATE,
  fecha_cobro DATE,
  estado estado_factura DEFAULT 'borrador',
  monto_cobrado DECIMAL(15,2) DEFAULT 0,
  change_order_id UUID REFERENCES change_orders(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE facturas_proveedor (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  proveedor_id UUID NOT NULL REFERENCES proveedores(id),
  numero TEXT,
  descripcion TEXT,
  actividad_id UUID REFERENCES actividades(id),
  monto DECIMAL(15,2) NOT NULL,
  fecha_recepcion DATE,
  fecha_vencimiento DATE,
  fecha_pago DATE,
  estado estado_factura DEFAULT 'borrador',
  monto_pagado DECIMAL(15,2) DEFAULT 0,
  es_critica BOOLEAN DEFAULT FALSE, -- su demora bloquea obra
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NÓMINA
-- ============================================================

CREATE TABLE periodos_nomina (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  periodo periodo_nomina DEFAULT 'semanal',
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  estado TEXT DEFAULT 'abierto', -- abierto, cerrado, pagado
  cerrado_por UUID REFERENCES perfiles_usuario(id),
  cerrado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lineas_nomina (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  periodo_id UUID NOT NULL REFERENCES periodos_nomina(id) ON DELETE CASCADE,
  trabajador_id UUID NOT NULL REFERENCES trabajadores(id),
  horas_regulares DECIMAL(6,2) DEFAULT 0,
  horas_extra DECIMAL(6,2) DEFAULT 0,
  dias_trabajados DECIMAL(4,2) DEFAULT 0,
  salario_base DECIMAL(12,2) DEFAULT 0,
  extra_monto DECIMAL(12,2) DEFAULT 0,
  deducciones DECIMAL(12,2) DEFAULT 0,
  anticipos DECIMAL(12,2) DEFAULT 0,
  bonos DECIMAL(12,2) DEFAULT 0,
  neto_a_pagar DECIMAL(12,2) DEFAULT 0,
  distribucion_proyectos JSONB DEFAULT '[]', -- [{proyecto_id, pct, monto}]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ALERTAS
-- ============================================================

CREATE TABLE alertas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  actividad_id UUID REFERENCES actividades(id),
  tipo TEXT NOT NULL, -- cronograma, costo, calidad, logistica, seguridad, etc.
  nivel nivel_alerta NOT NULL,
  estado estado_alerta DEFAULT 'activa',
  titulo TEXT NOT NULL,
  que_ocurrio TEXT NOT NULL,
  causa_probable TEXT,
  desviacion_actual TEXT,
  proyeccion_sin_accion TEXT,
  impacto_sucesoras TEXT,
  impacto_financiero DECIMAL(15,2),
  fecha_limite_accion DATE,
  rol_que_decide rol_usuario,
  alternativas JSONB DEFAULT '[]', -- [{descripcion, costo, dias, impacto, recomendada}]
  recomendacion TEXT,
  decision_tomada_id UUID, -- FK a decisiones
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DECISIONES (registro de autoridad y aprendizaje)
-- ============================================================

CREATE TABLE decisiones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  alerta_id UUID REFERENCES alertas(id),
  actividad_id UUID REFERENCES actividades(id),
  descripcion TEXT NOT NULL,
  alternativa_seleccionada TEXT,
  razon TEXT,
  aprobado_por UUID NOT NULL REFERENCES perfiles_usuario(id),
  rol_aprobador rol_usuario NOT NULL,
  fecha_decision TIMESTAMPTZ DEFAULT NOW(),
  -- Resultado posterior (aprendizaje)
  resultado_observado TEXT,
  resultado_fecha DATE,
  prediccion_fue_correcta BOOLEAN,
  aprendizaje TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Actualizar FK de alertas
ALTER TABLE alertas ADD CONSTRAINT fk_decision FOREIGN KEY (decision_tomada_id) REFERENCES decisiones(id);

-- ============================================================
-- RIESGOS
-- ============================================================

CREATE TABLE riesgos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  actividad_id UUID REFERENCES actividades(id),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  categoria TEXT, -- tecnico, financiero, logistico, externo, humano
  probabilidad DECIMAL(3,2), -- 0-1
  impacto_costo DECIMAL(15,2) DEFAULT 0,
  impacto_dias INTEGER DEFAULT 0,
  exposicion DECIMAL(15,2), -- probabilidad * impacto_costo
  estado estado_riesgo DEFAULT 'identificado',
  mitigacion TEXT,
  responsable_id UUID REFERENCES perfiles_usuario(id),
  fecha_revision DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- IIDP — ÍNDICE INTEGRAL DE DESEMPEÑO DEL PROYECTO
-- ============================================================

CREATE TABLE iidp_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  score_total DECIMAL(5,2), -- 0-100
  score_cronograma DECIMAL(5,2),
  score_finanzas DECIMAL(5,2),
  score_productividad DECIMAL(5,2),
  score_calidad DECIMAL(5,2),
  score_logistica DECIMAL(5,2),
  score_gestion DECIMAL(5,2),
  detalle JSONB DEFAULT '{}', -- variables usadas en el cálculo
  tendencia TEXT, -- mejorando, estable, deteriorando
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proyecto_id, fecha)
);

-- Scores por rol
CREATE TABLE scores_rol (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES perfiles_usuario(id),
  rol rol_usuario NOT NULL,
  fecha DATE NOT NULL,
  score DECIMAL(5,2),
  detalle JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MOTOR DE CONOCIMIENTO (MCP)
-- ============================================================

CREATE TABLE conocimiento_historico (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- rendimiento, patron, sesgo, lead_time_real, etc.
  entidad_tipo TEXT, -- trabajador, cuadrilla, proveedor, actividad_tipo
  entidad_id UUID, -- ID de la entidad relacionada
  descripcion TEXT NOT NULL,
  datos JSONB DEFAULT '{}',
  confianza DECIMAL(3,2) DEFAULT 0.5, -- 0-1
  veces_observado INTEGER DEFAULT 1,
  ultima_observacion DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTIFICACIONES
-- ============================================================

CREATE TABLE notificaciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id UUID NOT NULL REFERENCES perfiles_usuario(id) ON DELETE CASCADE,
  proyecto_id UUID REFERENCES proyectos(id),
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  cuerpo TEXT,
  referencia_tipo TEXT, -- alerta, actividad, decision, etc.
  referencia_id UUID,
  leida BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AUDITORÍA (registro inmutable de cambios)
-- ============================================================

CREATE TABLE auditoria (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tabla TEXT NOT NULL,
  registro_id UUID NOT NULL,
  accion TEXT NOT NULL, -- INSERT, UPDATE, DELETE
  usuario_id UUID REFERENCES perfiles_usuario(id),
  datos_anteriores JSONB,
  datos_nuevos JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES DE RENDIMIENTO
-- ============================================================

CREATE INDEX idx_proyectos_empresa ON proyectos(empresa_id);
CREATE INDEX idx_procesos_proyecto ON procesos(proyecto_id);
CREATE INDEX idx_actividades_proceso ON actividades(proceso_id);
CREATE INDEX idx_actividades_proyecto ON actividades(proyecto_id);
CREATE INDEX idx_actividades_estado ON actividades(estado);
CREATE INDEX idx_actividades_critica ON actividades(es_critica);
CREATE INDEX idx_reportes_proyecto_fecha ON reportes_diarios(proyecto_id, fecha);
CREATE INDEX idx_alertas_proyecto ON alertas(proyecto_id);
CREATE INDEX idx_alertas_nivel_estado ON alertas(nivel, estado);
CREATE INDEX idx_costos_proyecto ON costos_reales(proyecto_id);
CREATE INDEX idx_iidp_proyecto_fecha ON iidp_snapshots(proyecto_id, fecha);
CREATE INDEX idx_notificaciones_usuario ON notificaciones(usuario_id, leida);
CREATE INDEX idx_auditoria_tabla_registro ON auditoria(tabla, registro_id);
CREATE INDEX idx_trabajadores_empresa ON trabajadores(empresa_id);

-- ============================================================
-- UPDATED_AT AUTOMÁTICO
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_empresas_updated_at BEFORE UPDATE ON empresas FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_proyectos_updated_at BEFORE UPDATE ON proyectos FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_actividades_updated_at BEFORE UPDATE ON actividades FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_trabajadores_updated_at BEFORE UPDATE ON trabajadores FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_reportes_updated_at BEFORE UPDATE ON reportes_diarios FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_alertas_updated_at BEFORE UPDATE ON alertas FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_decisiones_updated_at BEFORE UPDATE ON decisiones FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
