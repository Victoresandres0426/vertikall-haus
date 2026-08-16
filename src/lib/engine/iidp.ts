// ============================================================
// Motor de reglas — Índice Integral de Desempeño del Proyecto
// ============================================================
// Ver spec §8. Esta v1 usa promedios ponderados por costo
// presupuestado sobre datos ya capturados por el flujo diario
// (avance_diario, asistencia_diaria, costos_reales, materiales).
// Los pesos son configurables (empresas.configuracion.pesos_iidp).

import type { PesosIIDP } from "./types"
import { PESOS_IIDP_DEFAULT } from "./types"
import { avanceEsperadoPct, type ActividadParaMotor } from "./reglas"

export type IIDPInputs = {
  fecha: Date
  actividades: ActividadParaMotor[]
  // Asistencia del día: horas productivas vs. improductivas
  horasProductivasHoy: number
  horasImproductivasHoy: number
  // Retrabajo reportado en avances recientes (últimos 7 días)
  horasRetrabajo7d: number
  horasTrabajadas7d: number
  // Materiales: cuántos están bajo stock mínimo vs. total en catálogo
  materialesBajoStock: number
  materialesTotal: number
  // Alertas: cuántas se resolvieron/decidieron dentro de su fecha límite
  // sobre el total de alertas con fecha límite vencida o próxima
  alertasAtendidasATiempo: number
  alertasConFechaLimite: number
}

export type IIDPResultado = {
  score_total: number
  score_cronograma: number
  score_finanzas: number
  score_productividad: number
  score_calidad: number
  score_logistica: number
  score_gestion: number
  detalle: Record<string, unknown>
}

function clamp0a100(n: number): number {
  return Math.max(0, Math.min(100, n))
}

function scoreCronograma(actividades: ActividadParaMotor[], fecha: Date): number {
  const activas = actividades.filter((a) => a.estado !== "cancelada")
  if (activas.length === 0) return 100

  let sumaPeso = 0
  let sumaPenalizacion = 0
  for (const a of activas) {
    const peso = a.costo_presupuesto > 0 ? a.costo_presupuesto : 1
    const esperado = avanceEsperadoPct(a, fecha)
    const atraso = Math.max(0, esperado - a.avance_porcentaje)
    sumaPeso += peso
    sumaPenalizacion += peso * atraso
  }
  const atrasoPromedioPonderado = sumaPeso > 0 ? sumaPenalizacion / sumaPeso : 0
  return clamp0a100(100 - atrasoPromedioPonderado)
}

function scoreFinanzas(actividades: ActividadParaMotor[]): number {
  const conPresupuesto = actividades.filter((a) => a.costo_presupuesto > 0)
  if (conPresupuesto.length === 0) return 100

  let sumaPeso = 0
  let sumaDesviacion = 0
  for (const a of conPresupuesto) {
    const peso = a.costo_presupuesto
    const desviacionPct = ((a.costo_real - a.costo_presupuesto) / a.costo_presupuesto) * 100
    sumaPeso += peso
    sumaDesviacion += peso * Math.max(0, desviacionPct)
  }
  const desviacionPromedio = sumaPeso > 0 ? sumaDesviacion / sumaPeso : 0
  return clamp0a100(100 - desviacionPromedio)
}

function scoreProductividad(horasProductivas: number, horasImproductivas: number): number {
  const total = horasProductivas + horasImproductivas
  if (total <= 0) return 70 // sin datos del día: valor neutral, no se penaliza
  return clamp0a100((horasProductivas / total) * 100)
}

function scoreCalidad(horasRetrabajo: number, horasTrabajadas: number): number {
  if (horasTrabajadas <= 0) return 100
  const pctRetrabajo = (horasRetrabajo / horasTrabajadas) * 100
  return clamp0a100(100 - pctRetrabajo * 2) // el retrabajo penaliza doble
}

function scoreLogistica(bajoStock: number, total: number): number {
  if (total <= 0) return 80 // sin catálogo cargado aún: neutral
  const pctBajoStock = (bajoStock / total) * 100
  return clamp0a100(100 - pctBajoStock)
}

function scoreGestion(atendidasATiempo: number, conFechaLimite: number): number {
  if (conFechaLimite <= 0) return 100
  return clamp0a100((atendidasATiempo / conFechaLimite) * 100)
}

export function calcularIIDP(inputs: IIDPInputs, pesos: PesosIIDP = PESOS_IIDP_DEFAULT): IIDPResultado {
  const cronograma = scoreCronograma(inputs.actividades, inputs.fecha)
  const finanzas = scoreFinanzas(inputs.actividades)
  const productividad = scoreProductividad(inputs.horasProductivasHoy, inputs.horasImproductivasHoy)
  const calidad = scoreCalidad(inputs.horasRetrabajo7d, inputs.horasTrabajadas7d)
  const logistica = scoreLogistica(inputs.materialesBajoStock, inputs.materialesTotal)
  const gestion = scoreGestion(inputs.alertasAtendidasATiempo, inputs.alertasConFechaLimite)

  const total =
    cronograma * pesos.cronograma +
    finanzas * pesos.finanzas +
    productividad * pesos.productividad +
    calidad * pesos.calidad +
    logistica * pesos.logistica +
    gestion * pesos.gestion

  return {
    score_total: Math.round(total * 100) / 100,
    score_cronograma: Math.round(cronograma * 100) / 100,
    score_finanzas: Math.round(finanzas * 100) / 100,
    score_productividad: Math.round(productividad * 100) / 100,
    score_calidad: Math.round(calidad * 100) / 100,
    score_logistica: Math.round(logistica * 100) / 100,
    score_gestion: Math.round(gestion * 100) / 100,
    detalle: {
      pesos,
      actividades_evaluadas: inputs.actividades.length,
      horas_productivas_hoy: inputs.horasProductivasHoy,
      horas_improductivas_hoy: inputs.horasImproductivasHoy,
      materiales_bajo_stock: inputs.materialesBajoStock,
      materiales_total: inputs.materialesTotal,
    },
  }
}

export function calcularTendencia(scoreHoy: number, scoreAyer: number | null): "mejorando" | "estable" | "deteriorando" {
  if (scoreAyer === null) return "estable"
  const diff = scoreHoy - scoreAyer
  if (diff > 2) return "mejorando"
  if (diff < -2) return "deteriorando"
  return "estable"
}
