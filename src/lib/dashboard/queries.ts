/**
 * Dashboard — Server-side Supabase queries
 * Todas estas funciones corren en el servidor (Server Components / Route Handlers).
 * Usan el cliente server-side que inyecta las cookies de sesión automáticamente.
 */

import { createClient } from "@/lib/supabase/server"
import type { Proyecto, Alerta, IIDPSnapshot, Proceso } from "@/types/database"

// ─── TIPOS DE RESPUESTA ───────────────────────────────────────

export interface ProcesoConAvance {
  id: string
  nombre: string
  plan_pct: number   // % planificado a la fecha
  real_pct: number   // % real ejecutado
}

export interface ComponenteIIDP {
  label: string
  score: number
  peso: string
}

export interface KpiCaja {
  semana: string
  entrada: number
  salida: number
}

export interface DashboardData {
  proyecto: Proyecto | null
  iidpActual: number
  iidpHistorial: Array<{ semana: string; iidp: number }>
  scoreComponentes: ComponenteIIDP[]
  alertas: Alerta[]
  avancePorProceso: ProcesoConAvance[]
  kpis: {
    fechaFinPlan: string | null
    fechaFinForecast: string | null
    avancePct: number
    presupuestoBase: number
    costoReal: number
    margenObjetivo: number
    trabajadoresHoy: number
  }
  alertasActivas: { rojas: number; amarillas: number; verdes: number }
}

// ─── QUERIES ─────────────────────────────────────────────────

/**
 * Lista todos los proyectos activos del usuario autenticado.
 * RLS en Supabase filtra automáticamente por empresa.
 */
export async function getProyectos(): Promise<Proyecto[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("proyectos")
    .select("*")
    .eq("activo", true)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[getProyectos]", error.message)
    return []
  }

  return (data ?? []) as Proyecto[]
}

/**
 * Obtiene todos los datos necesarios para el dashboard de un proyecto.
 * Si proyectoId es null, intenta usar el primer proyecto disponible.
 */
export async function getDashboardData(proyectoId: string | null): Promise<DashboardData> {
  const supabase = await createClient()

  const empty: DashboardData = {
    proyecto: null,
    iidpActual: 0,
    iidpHistorial: [],
    scoreComponentes: [],
    alertas: [],
    avancePorProceso: [],
    kpis: {
      fechaFinPlan: null,
      fechaFinForecast: null,
      avancePct: 0,
      presupuestoBase: 0,
      costoReal: 0,
      margenObjetivo: 0,
      trabajadoresHoy: 0,
    },
    alertasActivas: { rojas: 0, amarillas: 0, verdes: 0 },
  }

  // 1. Resolver proyecto
  let pid = proyectoId
  if (!pid) {
    const { data: primero } = await supabase
      .from("proyectos")
      .select("id")
      .eq("activo", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()
    pid = primero?.id ?? null
  }

  if (!pid) return empty

  // 2. Datos del proyecto
  const { data: proyecto, error: errProy } = await supabase
    .from("proyectos")
    .select("*")
    .eq("id", pid)
    .single()

  if (errProy || !proyecto) {
    console.error("[getDashboardData] proyecto", errProy?.message)
    return empty
  }

  // 3. IIDP — último snapshot + historial de 6 semanas
  const { data: snapshots } = await supabase
    .from("iidp_snapshots")
    .select("*")
    .eq("proyecto_id", pid)
    .order("fecha", { ascending: false })
    .limit(10)

  const ultimoSnap = snapshots?.[0] as IIDPSnapshot | undefined

  // Construir historial ordenado (antiguo → reciente), máx 6 puntos
  const historialOrdenado = [...(snapshots ?? [])].reverse().slice(-6) as IIDPSnapshot[]
  const iidpHistorial = historialOrdenado.map((s, i) => ({
    semana: i === historialOrdenado.length - 1 ? "Hoy" : `S${i + 1}`,
    iidp: Math.round(s.score_total),
  }))

  // Componentes del último snapshot
  // Pesos desde configuración de la empresa (tipado explícito para satisfacer TS)
  type IIDPPesos = {
    cronograma: number; finanzas: number; productividad: number;
    calidad: number; logistica: number; gestion: number
  }
  const config = (proyecto as Proyecto).configuracion as { iidp_pesos?: IIDPPesos } | null
  const pesos: IIDPPesos = config?.iidp_pesos ?? {
    cronograma: 0.25, finanzas: 0.25, productividad: 0.20,
    calidad: 0.15, logistica: 0.10, gestion: 0.05,
  }

  const scoreComponentes: ComponenteIIDP[] = ultimoSnap
    ? [
        { label: "Cronograma", score: Math.round(ultimoSnap.score_cronograma), peso: `${Math.round(pesos.cronograma * 100)}%` },
        { label: "Finanzas", score: Math.round(ultimoSnap.score_finanzas), peso: `${Math.round(pesos.finanzas * 100)}%` },
        { label: "Productividad", score: Math.round(ultimoSnap.score_productividad), peso: `${Math.round(pesos.productividad * 100)}%` },
        { label: "Calidad", score: Math.round(ultimoSnap.score_calidad), peso: `${Math.round(pesos.calidad * 100)}%` },
        { label: "Logística", score: Math.round(ultimoSnap.score_logistica), peso: `${Math.round(pesos.logistica * 100)}%` },
        { label: "Gestión", score: Math.round(ultimoSnap.score_gestion), peso: `${Math.round(pesos.gestion * 100)}%` },
      ]
    : []

  // 4. Alertas activas
  const { data: alertasData } = await supabase
    .from("alertas")
    .select("*")
    .eq("proyecto_id", pid)
    .in("estado", ["activa", "en_revision"])
    .order("nivel", { ascending: true }) // rojo primero en alfabético no es correcto, usaremos ordenamiento manual
    .limit(10)

  // Ordenar: rojo > amarillo > verde
  const nivelOrden: Record<string, number> = { rojo: 0, amarillo: 1, verde: 2 }
  const alertas = ((alertasData ?? []) as Alerta[]).sort(
    (a, b) => (nivelOrden[a.nivel] ?? 9) - (nivelOrden[b.nivel] ?? 9)
  )

  const alertasActivas = {
    rojas: alertas.filter((a) => a.nivel === "rojo").length,
    amarillas: alertas.filter((a) => a.nivel === "amarillo").length,
    verdes: alertas.filter((a) => a.nivel === "verde").length,
  }

  // 5. Avance por proceso — JOIN procesos → actividades
  const { data: procesosData } = await supabase
    .from("procesos")
    .select(`
      id,
      nombre,
      actividades!actividades_proceso_id_fkey (
        avance_porcentaje,
        fecha_inicio_plan,
        fecha_fin_plan,
        costo_presupuesto
      )
    `)
    .eq("proyecto_id", pid)
    .eq("activo", true)
    .order("orden", { ascending: true })

  const avancePorProceso: ProcesoConAvance[] = ((procesosData ?? []) as (Proceso & {
    actividades: Array<{
      avance_porcentaje: number
      fecha_inicio_plan: string | null
      fecha_fin_plan: string | null
      costo_presupuesto: number
    }>
  })[]).map((proc) => {
    const acts = proc.actividades ?? []
    if (acts.length === 0) return { id: proc.id, nombre: proc.nombre, plan_pct: 0, real_pct: 0 }

    // % planificado: promedio simple de avances planificados a fecha de hoy
    const today = new Date()
    let totalPeso = 0
    let planPonderado = 0
    let realPonderado = 0

    for (const a of acts) {
      const peso = a.costo_presupuesto > 0 ? a.costo_presupuesto : 1
      totalPeso += peso

      // Plan: cuánto debería estar hecho a hoy según fechas plan
      let planPct = 0
      if (a.fecha_inicio_plan && a.fecha_fin_plan) {
        const inicio = new Date(a.fecha_inicio_plan).getTime()
        const fin = new Date(a.fecha_fin_plan).getTime()
        const ahora = today.getTime()
        if (ahora >= fin) planPct = 100
        else if (ahora <= inicio) planPct = 0
        else planPct = Math.round(((ahora - inicio) / (fin - inicio)) * 100)
      }

      planPonderado += planPct * peso
      realPonderado += (a.avance_porcentaje ?? 0) * peso
    }

    return {
      id: proc.id,
      nombre: proc.nombre,
      plan_pct: totalPeso > 0 ? Math.round(planPonderado / totalPeso) : 0,
      real_pct: totalPeso > 0 ? Math.round(realPonderado / totalPeso) : 0,
    }
  })

  // 6. KPIs del proyecto
  // Costo real: suma de costos_reales del proyecto
  const { data: costosData } = await supabase
    .from("costos_reales")
    .select("monto")
    .eq("proyecto_id", pid)

  const costoReal = (costosData ?? []).reduce(
    (sum: number, c: { monto: number }) => sum + (c.monto ?? 0),
    0
  )

  // Trabajadores hoy: asistencias de hoy (fecha LOCAL de la obra, no UTC)
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" })
  const { count: trabajadoresHoy } = await supabase
    .from("reportes_diarios")
    .select("asistencia_diaria!inner(trabajador_id)", { count: "exact" })
    .eq("proyecto_id", pid)
    .eq("fecha", hoy)
    .eq("asistencia_diaria.presente", true)

  // Avance global del proyecto: promedio ponderado de actividades
  const avancePct =
    avancePorProceso.length > 0
      ? Math.round(
          avancePorProceso.reduce((s, p) => s + p.real_pct, 0) / avancePorProceso.length
        )
      : 0

  return {
    proyecto: proyecto as Proyecto,
    iidpActual: ultimoSnap ? Math.round(ultimoSnap.score_total) : 0,
    iidpHistorial,
    scoreComponentes,
    alertas,
    avancePorProceso,
    kpis: {
      fechaFinPlan: (proyecto as Proyecto).fecha_fin_plan ?? null,
      fechaFinForecast: (proyecto as Proyecto).fecha_fin_forecast ?? null,
      avancePct,
      presupuestoBase: (proyecto as Proyecto).presupuesto_base ?? 0,
      costoReal,
      margenObjetivo: (proyecto as Proyecto).margen_objetivo ?? 0,
      trabajadoresHoy: trabajadoresHoy ?? 0,
    },
    alertasActivas,
  }
}
