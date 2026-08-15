// ============================================================
// TIPOS TypeScript — Vertikall Haus
// Corresponden exactamente al schema de base de datos
// ============================================================

export type RolUsuario = 'capataz' | 'administrador' | 'project_manager' | 'dueno' | 'superadmin';
export type EstadoActividad = 'no_iniciada' | 'en_progreso' | 'completada' | 'bloqueada' | 'cancelada';
export type NivelAlerta = 'verde' | 'amarillo' | 'rojo';
export type EstadoAlerta = 'activa' | 'en_revision' | 'resuelta' | 'descartada';
export type TipoRecurso = 'mano_obra' | 'material' | 'equipo' | 'subcontrato' | 'indirecto';
export type EstadoReadiness = 'verde' | 'amarillo' | 'rojo';
export type EstadoChangeOrder = 'detectado' | 'en_estimacion' | 'enviado_cliente' | 'aprobado' | 'rechazado' | 'facturado' | 'cobrado';
export type EstadoFactura = 'borrador' | 'enviada' | 'parcialmente_pagada' | 'pagada' | 'vencida' | 'en_disputa';

// ============================================================
// EMPRESA (tenant)
// ============================================================
export interface Empresa {
  id: string;
  nombre: string;
  rfc_tax_id?: string;
  logo_url?: string;
  configuracion: {
    umbrales: {
      alerta_amarilla_pct: number;
      alerta_roja_pct: number;
      escalamiento_dueno_pct: number;
      lead_time_material_local_dias: number;
      lead_time_material_especial_dias: number;
    };
    iidp_pesos: {
      cronograma: number;
      finanzas: number;
      productividad: number;
      calidad: number;
      logistica: number;
      gestion: number;
    };
    nomina: {
      jurisdiccion: string;
      periodo_default: string;
      overtime_multiplicador: number;
      horas_jornada: number;
    };
  };
  jurisdiccion: string;
  activa: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================
// USUARIO
// ============================================================
export interface PerfilUsuario {
  id: string;
  empresa_id: string;
  nombre_completo: string;
  email: string;
  rol: RolUsuario;
  avatar_url?: string;
  activo: boolean;
  configuracion_notificaciones: {
    email: boolean;
    push: boolean;
  };
  created_at: string;
  updated_at: string;
}

// ============================================================
// PROYECTO
// ============================================================
export interface Proyecto {
  id: string;
  empresa_id: string;
  codigo: string;
  nombre: string;
  descripcion?: string;
  cliente?: string;
  numero_contrato?: string;
  tipo_contrato?: string;
  fecha_inicio_plan: string;
  fecha_fin_plan: string;
  fecha_inicio_real?: string;
  fecha_fin_forecast?: string;
  presupuesto_base: number;
  presupuesto_venta: number;
  margen_objetivo: number;
  estado: string;
  responsable_id?: string;
  ubicacion?: string;
  configuracion: Record<string, unknown>;
  activo: boolean;
  created_at: string;
  updated_at: string;
  // Relaciones (join)
  responsable?: PerfilUsuario;
  procesos?: Proceso[];
}

// ============================================================
// PROCESO
// ============================================================
export interface Proceso {
  id: string;
  proyecto_id: string;
  codigo: string;
  nombre: string;
  descripcion?: string;
  orden: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
  // Relaciones
  actividades?: Actividad[];
  proyecto?: Proyecto;
}

// ============================================================
// ACTIVIDAD
// ============================================================
export interface Actividad {
  id: string;
  proceso_id: string;
  proyecto_id: string;
  codigo: string;
  nombre: string;
  descripcion?: string;
  disciplina?: string;
  responsable_id?: string;
  // Plan
  fecha_inicio_plan?: string;
  fecha_fin_plan?: string;
  duracion_plan_dias?: number;
  cantidad_objetivo?: number;
  unidad?: string;
  holgura_dias: number;
  es_critica: boolean;
  // Real
  fecha_inicio_real?: string;
  fecha_fin_real?: string;
  fecha_fin_forecast?: string;
  avance_porcentaje: number;
  cantidad_ejecutada: number;
  estado: EstadoActividad;
  // Readiness
  readiness: EstadoReadiness;
  readiness_detalle: Record<string, unknown>;
  // Costos
  costo_presupuesto: number;
  costo_comprometido: number;
  costo_real: number;
  costo_forecast: number;
  // Inteligencia
  tendencia?: string;
  riesgo_nivel: NivelAlerta;
  notas?: string;
  orden: number;
  activa: boolean;
  created_at: string;
  updated_at: string;
  // Relaciones
  proceso?: Proceso;
  responsable?: PerfilUsuario;
  predecesoras?: DependenciaActividad[];
  sucesoras?: DependenciaActividad[];
}

// ============================================================
// DEPENDENCIA ENTRE ACTIVIDADES
// ============================================================
export interface DependenciaActividad {
  id: string;
  actividad_id: string;
  predecesora_id: string;
  tipo: 'fin_a_inicio' | 'inicio_a_inicio' | 'fin_a_fin' | 'inicio_a_fin';
  lag_dias: number;
  created_at: string;
  // Relaciones
  predecesora?: Actividad;
  actividad?: Actividad;
}

// ============================================================
// TRABAJADOR
// ============================================================
export interface Trabajador {
  id: string;
  empresa_id: string;
  nombre_completo: string;
  codigo?: string;
  especialidad?: string;
  rol_obra?: string;
  nivel_experiencia?: string;
  tarifa_diaria?: number;
  tarifa_hora?: number;
  moneda: string;
  certificaciones: Array<{ nombre: string; vencimiento: string }>;
  usuario_id?: string;
  activo: boolean;
  fecha_ingreso?: string;
  notas?: string;
  created_at: string;
  updated_at: string;
}

// ============================================================
// REPORTE DIARIO
// ============================================================
export interface ReporteDiario {
  id: string;
  proyecto_id: string;
  capataz_id: string;
  fecha: string;
  clima?: string;
  observaciones_generales?: string;
  estado_reporte: 'borrador' | 'enviado' | 'validado';
  validado_por?: string;
  validado_at?: string;
  created_at: string;
  updated_at: string;
  // Relaciones
  asistencias?: AsistenciaDiaria[];
  avances?: AvanceDiario[];
  consumos?: ConsumoMaterialDiario[];
  capataz?: PerfilUsuario;
}

export interface AsistenciaDiaria {
  id: string;
  reporte_id: string;
  trabajador_id: string;
  presente: boolean;
  horas_regulares: number;
  horas_extra: number;
  horas_productivas?: number;
  horas_improductivas: number;
  actividad_principal_id?: string;
  motivo_ausencia?: string;
  observacion?: string;
  trabajador?: Trabajador;
}

export interface AvanceDiario {
  id: string;
  reporte_id: string;
  actividad_id: string;
  cantidad_ejecutada_dia: number;
  porcentaje_avance_total?: number;
  horas_trabajadas?: number;
  incidencias?: string;
  bloqueos?: string;
  retrabajo_descripcion?: string;
  retrabajo_horas: number;
  fotos: Array<{ url: string; descripcion: string }>;
  actividad?: Actividad;
}

export interface ConsumoMaterialDiario {
  id: string;
  reporte_id: string;
  actividad_id: string;
  material_id: string;
  cantidad_consumida: number;
  desperdicio: number;
  observacion?: string;
  material?: MaterialCatalogo;
}

// ============================================================
// MATERIALES
// ============================================================
export interface MaterialCatalogo {
  id: string;
  empresa_id: string;
  codigo?: string;
  nombre: string;
  descripcion?: string;
  unidad: string;
  categoria?: string;
  es_critico: boolean;
  lead_time_dias: number;
  desperdicio_esperado_pct: number;
  activo: boolean;
}

// ============================================================
// ALERTA
// ============================================================
export interface Alerta {
  id: string;
  proyecto_id: string;
  actividad_id?: string;
  tipo: string;
  nivel: NivelAlerta;
  estado: EstadoAlerta;
  titulo: string;
  que_ocurrio: string;
  causa_probable?: string;
  desviacion_actual?: string;
  proyeccion_sin_accion?: string;
  impacto_sucesoras?: string;
  impacto_financiero?: number;
  fecha_limite_accion?: string;
  rol_que_decide?: RolUsuario;
  alternativas: Array<{
    descripcion: string;
    costo: number;
    dias: number;
    impacto: string;
    recomendada: boolean;
  }>;
  recomendacion?: string;
  decision_tomada_id?: string;
  created_at: string;
  updated_at: string;
  // Relaciones
  actividad?: Actividad;
  proyecto?: Proyecto;
}

// ============================================================
// DECISIÓN
// ============================================================
export interface Decision {
  id: string;
  proyecto_id: string;
  alerta_id?: string;
  actividad_id?: string;
  descripcion: string;
  alternativa_seleccionada?: string;
  razon?: string;
  aprobado_por: string;
  rol_aprobador: RolUsuario;
  fecha_decision: string;
  resultado_observado?: string;
  resultado_fecha?: string;
  prediccion_fue_correcta?: boolean;
  aprendizaje?: string;
  created_at: string;
  // Relaciones
  aprobador?: PerfilUsuario;
  alerta?: Alerta;
}

// ============================================================
// IIDP
// ============================================================
export interface IIDPSnapshot {
  id: string;
  proyecto_id: string;
  fecha: string;
  score_total: number;
  score_cronograma: number;
  score_finanzas: number;
  score_productividad: number;
  score_calidad: number;
  score_logistica: number;
  score_gestion: number;
  detalle: Record<string, unknown>;
  tendencia: string;
  created_at: string;
}

// ============================================================
// CHANGE ORDER
// ============================================================
export interface ChangeOrder {
  id: string;
  proyecto_id: string;
  numero?: string;
  titulo: string;
  descripcion?: string;
  solicitado_por?: string;
  detectado_por?: string;
  estado: EstadoChangeOrder;
  impacto_costo: number;
  impacto_dias: number;
  actividades_afectadas: string[];
  evidencia: Array<{ url: string; tipo: string; descripcion: string }>;
  aprobado_por?: string;
  aprobado_at?: string;
  facturado: boolean;
  cobrado: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================
// RIESGO
// ============================================================
export interface Riesgo {
  id: string;
  proyecto_id: string;
  actividad_id?: string;
  titulo: string;
  descripcion?: string;
  categoria?: string;
  probabilidad?: number;
  impacto_costo: number;
  impacto_dias: number;
  exposicion?: number;
  estado: 'identificado' | 'en_mitigacion' | 'resuelto' | 'materializado' | 'aceptado';
  mitigacion?: string;
  responsable_id?: string;
  fecha_revision?: string;
  created_at: string;
  updated_at: string;
}

// ============================================================
// UTILIDADES
// ============================================================

export const ROL_LABELS: Record<RolUsuario, string> = {
  capataz: 'Capataz',
  administrador: 'Administrador',
  project_manager: 'Project Manager',
  dueno: 'Dueño',
  superadmin: 'Super Admin',
};

export const ROL_COLORES: Record<RolUsuario, string> = {
  capataz: 'bg-orange-100 text-orange-800',
  administrador: 'bg-blue-100 text-blue-800',
  project_manager: 'bg-purple-100 text-purple-800',
  dueno: 'bg-emerald-100 text-emerald-800',
  superadmin: 'bg-gray-100 text-gray-800',
};

export const ALERTA_COLORES: Record<NivelAlerta, { bg: string; text: string; border: string }> = {
  verde: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  amarillo: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  rojo: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
};

export const ESTADO_ACTIVIDAD_LABELS: Record<EstadoActividad, string> = {
  no_iniciada: 'No iniciada',
  en_progreso: 'En progreso',
  completada: 'Completada',
  bloqueada: 'Bloqueada',
  cancelada: 'Cancelada',
};

// Permisos por rol (qué puede hacer cada uno)
export const PERMISOS: Record<RolUsuario, {
  crearProyecto: boolean;
  modificarPlan: boolean;
  aprobarCambios: boolean;
  verFinanzas: boolean;
  verCostos: boolean;
  aprobarCompras: boolean;
  registrarReporte: boolean;
  aprobarDecisiones: boolean;
}> = {
  capataz: {
    crearProyecto: false,
    modificarPlan: false,
    aprobarCambios: false,
    verFinanzas: false,
    verCostos: false,
    aprobarCompras: false,
    registrarReporte: true,
    aprobarDecisiones: false,
  },
  administrador: {
    crearProyecto: false,
    modificarPlan: false,
    aprobarCambios: false,
    verFinanzas: true,
    verCostos: true,
    aprobarCompras: true,
    registrarReporte: false,
    aprobarDecisiones: false,
  },
  project_manager: {
    crearProyecto: true,
    modificarPlan: true,
    aprobarCambios: false,
    verFinanzas: true,
    verCostos: true,
    aprobarCompras: true,
    registrarReporte: false,
    aprobarDecisiones: true,
  },
  dueno: {
    crearProyecto: true,
    modificarPlan: true,
    aprobarCambios: true,
    verFinanzas: true,
    verCostos: true,
    aprobarCompras: true,
    registrarReporte: false,
    aprobarDecisiones: true,
  },
  superadmin: {
    crearProyecto: true,
    modificarPlan: true,
    aprobarCambios: true,
    verFinanzas: true,
    verCostos: true,
    aprobarCompras: true,
    registrarReporte: true,
    aprobarDecisiones: true,
  },
};
