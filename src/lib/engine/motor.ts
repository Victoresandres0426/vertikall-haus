// ============================================================
// Motor de reglas — orquestación (I/O con Supabase)
// ============================================================
// Punto de entrada único: ejecutarMotorDiario(supabase, proyectoId).
// Se dispara desde reporte-diario/actions.ts justo después de que
// el capataz guarda su reporte del día (spec §5, pasos 3–7):
// recalcula desviaciones, genera/actualiza alertas y guarda un
// snapshot de IIDP para el proyecto.
//
// Es una v1 basada en reglas explícitas (spec §19). Todavía NO
// calcula ruta crítica dinámica (spec §4) — eso requiere un
// algoritmo CPM sobre dependencias_actividad y queda fuera de
// esta ronda; el campo actividades.es_critica se usa tal cual
// está en la base de datos hoy.

import { evaluarCronograma, evaluarCosto, type ActividadParaMotor } from "./reglas"
import { calcularIIDP, calcularTendencia, type IIDPInputs } from "./iidp"
import { umbralesDesdeConfig, pesosDesdeConfig, type ConfiguracionEmpresa } from "./types"
import type { AlertaGenerada } from "./types"

// Los clientes de Supabase (server.ts / client.ts) no se generan aquí
// con un tipo Database (no existe codegen en este proyecto todavía),
// así que se acepta el cliente sin tipar en el límite de este módulo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any

export type ResultadoMotor = {
  alertas_creadas: number
  alertas_actualizadas: number
  alertas_resueltas: number
  iidp: { score_total: number; tendencia: string } | null
  errores: string[]
}

function hoyISO(fecha: Date): string {
  return fecha.toISOString().slice(0, 10)
}

export async function ejecutarMotorDiario(
  supabase: AnySupabase,
  proyectoId: string,
  fecha: Date = new Date()
): Promise<ResultadoMotor> {
  const errores: string[] = []
  const resultado: ResultadoMotor = {
    alertas_creadas: 0,
    alertas_actualizadas: 0,
    alertas_resueltas: 0,
    iidp: null,
    errores,
  }

  // ── 1. Configuración de la empresa (umbrales, pesos IIDP) ────
  const { data: proyecto, error: errProyecto } = await supabase
    .from("proyectos")
    .select("id, empresa_id")
    .eq("id", proyectoId)
    .single()

  if (errProyecto || !proyecto) {
    errores.push("No se pudo cargar el proyecto para ejecutar el motor")
    return resultado
  }

  const { data: empresa } = await supabase
    .from("empresas")
    .select("configuracion")
    .eq("id", proyecto.empresa_id)
    .single()

  const config = (empresa?.configuracion ?? {}) as ConfiguracionEmpresa
  const umbrales = umbralesDesdeConfig(config)
  const pesos = pesosDesdeConfig(config)

  // ── 2. Actividades activas del proyecto ───────────────────────
  const { data: actividadesRaw, error: errAct } = await supabase
    .from("actividades")
    .select(
      "id, proyecto_id, codigo, nombre, fecha_inicio_plan, fecha_fin_plan, duracion_plan_dias, avance_porcentaje, costo_presupuesto, costo_real, es_critica, estado"
    )
    .eq("proyecto_id", proyectoId)
    .eq("activa", true)

  if (errAct) {
    errores.push(`Error leyendo actividades: ${errAct.message}`)
    return resultado
  }

  const actividades: ActividadParaMotor[] = ((actividadesRaw ?? []) as any[]).map((a: any) => ({
    id: a.id,
    proyecto_id: a.proyecto_id,
    codigo: a.codigo,
    nombre: a.nombre,
    fecha_inicio_plan: a.fecha_inicio_plan,
    fecha_fin_plan: a.fecha_fin_plan,
    duracion_plan_dias: a.duracion_plan_dias,
    avance_porcentaje: Number(a.avance_porcentaje ?? 0),
    costo_presupuesto: Number(a.costo_presupuesto ?? 0),
    costo_real: Number(a.costo_real ?? 0),
    es_critica: !!a.es_critica,
    estado: a.estado,
  }))

  // ── 3. Señales cualitativas del reporte de hoy (incidencias/bloqueos) ─
  const { data: reporteHoy } = await supabase
    .from("reportes_diarios")
    .select("id")
    .eq("proyecto_id", proyectoId)
    .eq("fecha", hoyISO(fecha))

  const reporteIds = ((reporteHoy ?? []) as any[]).map((r: any) => r.id)
  const señalesPorActividad = new Map<string, { incidencias?: string; bloqueos?: string }>()

  if (reporteIds.length > 0) {
    const { data: avancesHoy } = await supabase
      .from("avance_diario")
      .select("actividad_id, incidencias, bloqueos")
      .in("reporte_id", reporteIds)

    for (const av of (avancesHoy ?? []) as any[]) {
      señalesPorActividad.set(av.actividad_id, {
        incidencias: av.incidencias ?? undefined,
        bloqueos: av.bloqueos ?? undefined,
      })
    }
  }

  for (const a of actividades) {
    const s = señalesPorActividad.get(a.id)
    a.incidencias_recientes = s?.incidencias ?? null
    a.bloqueos_recientes = s?.bloqueos ?? null
  }

  // ── 4. Evaluar cada actividad y armar el conjunto de alertas vigentes ─
  const alertasVigentes: AlertaGenerada[] = []
  for (const a of actividades) {
    const alertaCronograma = evaluarCronograma(a, fecha, umbrales)
    if (alertaCronograma) alertasVigentes.push(alertaCronograma)

    const alertaCosto = evaluarCosto(a, umbrales)
    if (alertaCosto) alertasVigentes.push(alertaCosto)
  }

  // ── 5. Sincronizar contra alertas activas existentes (crear/actualizar/resolver) ─
  const { data: alertasActivasRaw } = await supabase
    .from("alertas")
    .select("id, actividad_id, tipo, estado")
    .eq("proyecto_id", proyectoId)
    .in("estado", ["activa", "en_revision"])

  const alertasActivas = (alertasActivasRaw ?? []) as any[]
  const clave = (actividadId: string, tipo: string) => `${actividadId}::${tipo}`
  const activasPorClave = new Map<string, any>(
    alertasActivas.map((al: any) => [clave(al.actividad_id, al.tipo), al])
  )
  const vigentesClaves = new Set(alertasVigentes.map((al) => clave(al.actividad_id, al.tipo)))

  for (const nueva of alertasVigentes) {
    const existente = activasPorClave.get(clave(nueva.actividad_id, nueva.tipo))
    if (existente) {
      const { error } = await supabase
        .from("alertas")
        .update({
          nivel: nueva.nivel,
          titulo: nueva.titulo,
          que_ocurrio: nueva.que_ocurrio,
          causa_probable: nueva.causa_probable,
          desviacion_actual: nueva.desviacion_actual,
          proyeccion_sin_accion: nueva.proyeccion_sin_accion,
          impacto_sucesoras: nueva.impacto_sucesoras,
          impacto_financiero: nueva.impacto_financiero,
          fecha_limite_accion: nueva.fecha_limite_accion,
          rol_que_decide: nueva.rol_que_decide,
          alternativas: nueva.alternativas,
          recomendacion: nueva.recomendacion,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existente.id)
      if (error) errores.push(`Error actualizando alerta: ${error.message}`)
      else resultado.alertas_actualizadas++
    } else {
      const { error } = await supabase.from("alertas").insert({
        proyecto_id: nueva.proyecto_id,
        actividad_id: nueva.actividad_id,
        tipo: nueva.tipo,
        nivel: nueva.nivel,
        estado: "activa",
        titulo: nueva.titulo,
        que_ocurrio: nueva.que_ocurrio,
        causa_probable: nueva.causa_probable,
        desviacion_actual: nueva.desviacion_actual,
        proyeccion_sin_accion: nueva.proyeccion_sin_accion,
        impacto_sucesoras: nueva.impacto_sucesoras,
        impacto_financiero: nueva.impacto_financiero,
        fecha_limite_accion: nueva.fecha_limite_accion,
        rol_que_decide: nueva.rol_que_decide,
        alternativas: nueva.alternativas,
        recomendacion: nueva.recomendacion,
      })
      if (error) errores.push(`Error creando alerta: ${error.message}`)
      else resultado.alertas_creadas++
    }
  }

  // Alertas que ya no aplican (la desviación desapareció) → resolver
  for (const activa of alertasActivas) {
    if (!vigentesClaves.has(clave(activa.actividad_id, activa.tipo))) {
      const { error } = await supabase
        .from("alertas")
        .update({ estado: "resuelta", updated_at: new Date().toISOString() })
        .eq("id", activa.id)
      if (error) errores.push(`Error resolviendo alerta: ${error.message}`)
      else resultado.alertas_resueltas++
    }
  }

  // ── 6. Calcular IIDP del día ───────────────────────────────────
  try {
    const iidpInputs = await construirInputsIIDP(supabase, proyectoId, proyecto.empresa_id, fecha, actividades)
    const calculo = calcularIIDP(iidpInputs, pesos)

    const { data: snapshotAyer } = await supabase
      .from("iidp_snapshots")
      .select("score_total")
      .eq("proyecto_id", proyectoId)
      .lt("fecha", hoyISO(fecha))
      .order("fecha", { ascending: false })
      .limit(1)
      .maybeSingle()

    const tendencia = calcularTendencia(calculo.score_total, snapshotAyer?.score_total ?? null)

    const { error: errSnapshot } = await supabase.from("iidp_snapshots").upsert(
      {
        proyecto_id: proyectoId,
        fecha: hoyISO(fecha),
        score_total: calculo.score_total,
        score_cronograma: calculo.score_cronograma,
        score_finanzas: calculo.score_finanzas,
        score_productividad: calculo.score_productividad,
        score_calidad: calculo.score_calidad,
        score_logistica: calculo.score_logistica,
        score_gestion: calculo.score_gestion,
        detalle: calculo.detalle,
        tendencia,
      },
      { onConflict: "proyecto_id,fecha" }
    )

    if (errSnapshot) errores.push(`Error guardando IIDP: ${errSnapshot.message}`)
    else resultado.iidp = { score_total: calculo.score_total, tendencia }
  } catch (e) {
    errores.push(`Error calculando IIDP: ${e instanceof Error ? e.message : String(e)}`)
  }

  return resultado
}

async function construirInputsIIDP(
  supabase: AnySupabase,
  proyectoId: string,
  empresaId: string,
  fecha: Date,
  actividades: ActividadParaMotor[]
): Promise<IIDPInputs> {
  // Asistencia de hoy
  const { data: reportesHoy } = await supabase
    .from("reportes_diarios")
    .select("id")
    .eq("proyecto_id", proyectoId)
    .eq("fecha", hoyISO(fecha))

  const reporteIdsHoy = ((reportesHoy ?? []) as any[]).map((r: any) => r.id)
  let horasProductivasHoy = 0
  let horasImproductivasHoy = 0

  if (reporteIdsHoy.length > 0) {
    const { data: asistencia } = await supabase
      .from("asistencia_diaria")
      .select("horas_productivas, horas_improductivas, horas_regulares, horas_extra")
      .in("reporte_id", reporteIdsHoy)

    for (const a of (asistencia ?? []) as any[]) {
      const productivas = a.horas_productivas ?? (a.horas_regulares ?? 0) + (a.horas_extra ?? 0)
      horasProductivasHoy += Number(productivas ?? 0)
      horasImproductivasHoy += Number(a.horas_improductivas ?? 0)
    }
  }

  // Retrabajo de los últimos 7 días
  const hace7dias = new Date(fecha.getTime() - 7 * 86400000)
  const { data: reportes7d } = await supabase
    .from("reportes_diarios")
    .select("id")
    .eq("proyecto_id", proyectoId)
    .gte("fecha", hoyISO(hace7dias))
    .lte("fecha", hoyISO(fecha))

  const reporteIds7d = ((reportes7d ?? []) as any[]).map((r: any) => r.id)
  let horasRetrabajo7d = 0
  let horasTrabajadas7d = 0

  if (reporteIds7d.length > 0) {
    const { data: avances7d } = await supabase
      .from("avance_diario")
      .select("retrabajo_horas, horas_trabajadas")
      .in("reporte_id", reporteIds7d)

    for (const av of (avances7d ?? []) as any[]) {
      horasRetrabajo7d += Number(av.retrabajo_horas ?? 0)
      horasTrabajadas7d += Number(av.horas_trabajadas ?? 0)
    }
  }

  // Materiales bajo stock mínimo (catálogo de la empresa)
  const { data: materiales } = await supabase
    .from("materiales_catalogo")
    .select("stock_actual, stock_minimo")
    .eq("empresa_id", empresaId)

  const materialesTotal = materiales?.length ?? 0
  const materialesBajoStock = ((materiales ?? []) as any[]).filter(
    (m: any) => m.stock_actual != null && m.stock_minimo != null && m.stock_actual <= m.stock_minimo
  ).length

  // Gestión: alertas con fecha límite ya vencida/hoy, cuántas tienen decisión
  const { data: alertasConLimite } = await supabase
    .from("alertas")
    .select("id, estado, fecha_limite_accion")
    .eq("proyecto_id", proyectoId)
    .not("fecha_limite_accion", "is", null)
    .lte("fecha_limite_accion", hoyISO(fecha))

  const alertasConFechaLimite = alertasConLimite?.length ?? 0
  const alertasAtendidasATiempo = ((alertasConLimite ?? []) as any[]).filter((al: any) =>
    ["en_revision", "resuelta"].includes(al.estado)
  ).length

  return {
    fecha,
    actividades,
    horasProductivasHoy,
    horasImproductivasHoy,
    horasRetrabajo7d,
    horasTrabajadas7d,
    materialesBajoStock,
    materialesTotal,
    alertasAtendidasATiempo,
    alertasConFechaLimite,
  }
}
