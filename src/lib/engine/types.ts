// ============================================================
// Motor de reglas — tipos compartidos
// ============================================================
// Ver documentación funcional: "Plan Maestro del Sistema de
// Gestión Inteligente", secciones 6 (Motor de alertas), 7 (Motor
// de decisiones) y 8 (IIDP). Esta es la versión 1: un motor
// basado en reglas explícitas (spec §19, punto 6 del MVP), no
// todavía un modelo estadístico/ML. Las fórmulas están aisladas
// aquí para poder versionarlas sin tocar el resto de la app
// (principio de "evolución continua", spec §15).

export type NivelAlerta = "verde" | "amarillo" | "rojo"

export type Alternativa = {
  descripcion: string
  costo: number
  dias: number
  impacto: string
  recomendada: boolean
}

export type AlertaGenerada = {
  actividad_id: string
  proyecto_id: string
  tipo: "cronograma" | "costo"
  nivel: NivelAlerta
  titulo: string
  que_ocurrio: string
  causa_probable: string
  desviacion_actual: string
  proyeccion_sin_accion: string
  impacto_sucesoras: string | null
  impacto_financiero: number | null
  fecha_limite_accion: string | null
  rol_que_decide: "capataz" | "project_manager" | "administrador" | "dueno"
  alternativas: Alternativa[]
  recomendacion: string
}

export type PesosIIDP = {
  cronograma: number
  finanzas: number
  productividad: number
  calidad: number
  logistica: number
  gestion: number
}

// Coincide con empresas.configuracion.iidp_pesos sembrado en
// 003_seed_data.sql — si la empresa no tiene configuración propia,
// se usan estos mismos valores como respaldo.
export const PESOS_IIDP_DEFAULT: PesosIIDP = {
  cronograma: 0.25,
  finanzas: 0.25,
  productividad: 0.2,
  calidad: 0.15,
  logistica: 0.1,
  gestion: 0.05,
}

// Umbrales de desviación — configurables por empresa en
// empresas.configuracion.umbrales (JSONB, ver 003_seed_data.sql).
// Referencia inicial del documento maestro: amarillo 5–10%, rojo
// >10% (spec §12.3), y >5% de desviación de costo escala al dueño
// (spec §2.2/§11.2) — ese 5% se mapea a costo_rojo.
export type UmbralesDesviacion = {
  cronograma_amarillo: number
  cronograma_rojo: number
  costo_amarillo: number
  costo_rojo: number
}

export const UMBRALES_DEFAULT: UmbralesDesviacion = {
  cronograma_amarillo: 5,
  cronograma_rojo: 10,
  costo_amarillo: 2.5,
  costo_rojo: 5,
}

// Forma esperada de empresas.configuracion (subconjunto que usa el motor)
export type ConfiguracionEmpresa = {
  umbrales?: {
    alerta_amarilla_pct?: number
    alerta_roja_pct?: number
    escalamiento_dueno_pct?: number
  }
  iidp_pesos?: Partial<PesosIIDP>
}

export function umbralesDesdeConfig(config: ConfiguracionEmpresa | null | undefined): UmbralesDesviacion {
  const u = config?.umbrales
  const cronogramaAmarillo = u?.alerta_amarilla_pct ?? UMBRALES_DEFAULT.cronograma_amarillo
  const cronogramaRojo = u?.alerta_roja_pct ?? UMBRALES_DEFAULT.cronograma_rojo
  const costoRojo = u?.escalamiento_dueno_pct ?? UMBRALES_DEFAULT.costo_rojo
  return {
    cronograma_amarillo: cronogramaAmarillo,
    cronograma_rojo: cronogramaRojo,
    costo_amarillo: costoRojo / 2,
    costo_rojo: costoRojo,
  }
}

export function pesosDesdeConfig(config: ConfiguracionEmpresa | null | undefined): PesosIIDP {
  return { ...PESOS_IIDP_DEFAULT, ...(config?.iidp_pesos ?? {}) }
}
