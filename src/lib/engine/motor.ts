// ============================================================
// Motor de reglas — orquestación (I/O con Supabase)
// ============================================================
// Punto de entrada único: ejecutarMotorDiario(supabase, proyectoId).
// Se dispara desde reporte-diario/actions.ts justo después de que
// el capataz guarda su reporte del día (spec §5, pasos 3–7):
// recalcula desviaciones, genera/actualiza alertas y guarda un
// snapshot de IIDP para el proyecto.
//
// Es una v1 basada en reglas explícitas (spec §19). Incluye cálculo
// de ruta crítica (CPM) sobre dependencias_actividad: en cada corrida
// se recalculan es_critica/holgura_dias de todas las actividades del
// proyecto y se guardan de vuelta en la tabla (ver cpm.ts).

import { evaluarCronograma, evaluarCosto, type ActividadParaMotor } from "./reglas"
import { calcularIIDP, calcularTendencia, type IIDPInputs } from "./iidp"
import { umbralesDesdeConfig, pesosDesdeConfig, type ConfiguracionEmpresa } from "./types"
import { calcularRutaCritica, type ActividadCPM, type DependenciaCPM } from "./cpm"
import {
  evaluarDecision,
  mejorAlternativaConocida,
  calcularConfianza,
  type DecisionParaEvaluar,
  type EstadisticaAlternativa,
} from "./conocimiento"
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
  ruta_critica: { actividades_criticas: number; actividades_actualizadas: number } | null
  conocimiento: { decisiones_evaluadas: number } | null
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
    ruta_critica: null,
    conocimiento: null,
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

  // ── 2b. Ruta crítica (CPM) sobre las dependencias del proyecto ────
  try {
    const actividadIds = actividades.map((a) => a.id)
    const { data: depsRaw, error: errDeps } = await supabase
      .from("dependencias_actividad")
      .select("actividad_id, predecesora_id, tipo, lag_dias")
      .in("actividad_id", actividadIds)

    if (errDeps) {
      errores.push(`Error leyendo dependencias para ruta crítica: ${errDeps.message}`)
    } else {
      const actividadesCPM: ActividadCPM[] = actividades.map((a) => ({
        id: a.id,
        fecha_inicio_plan: a.fecha_inicio_plan,
        fecha_fin_plan: a.fecha_fin_plan,
        duracion_plan_dias: a.duracion_plan_dias,
      }))
      const dependenciasCPM: DependenciaCPM[] = ((depsRaw ?? []) as any[]).map((d: any) => ({
        actividad_id: d.actividad_id,
        predecesora_id: d.predecesora_id,
        tipo: d.tipo,
        lag_dias: d.lag_dias ?? 0,
      }))

      const cpm = calcularRutaCritica(actividadesCPM, dependenciasCPM)

      let criticas = 0
      let actualizadas = 0
      for (const a of actividades) {
        const r = cpm.get(a.id)
        if (!r) continue
        if (r.es_critica) criticas++
        // Sobrescribe es_critica en memoria para que las alertas de este
        // mismo ciclo usen el valor recién calculado (no el que traía la BD).
        const cambioEstado = a.es_critica !== r.es_critica
        a.es_critica = r.es_critica

        if (cambioEstado) {
          const { error: errUpd } = await supabase
            .from("actividades")
            .update({ es_critica: r.es_critica, holgura_dias: r.holgura_dias })
            .eq("id", a.id)
          if (errUpd) errores.push(`Error guardando ruta crítica de ${a.codigo}: ${errUpd.message}`)
          else actualizadas++
        } else {
          const { error: errUpd } = await supabase
            .from("actividades")
            .update({ holgura_dias: r.holgura_dias })
            .eq("id", a.id)
          if (errUpd) errores.push(`Error guardando holgura de ${a.codigo}: ${errUpd.message}`)
        }
      }
      resultado.ruta_critica = { actividades_criticas: criticas, actividades_actualizadas: actualizadas }
    }
  } catch (e) {
    errores.push(`Error calculando ruta crítica: ${e instanceof Error ? e.message : String(e)}`)
  }

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

  // ── 3b. Conocimiento histórico: ¿qué alternativa le ha funcionado a
  // ESTA empresa en el pasado para cada tipo de alerta? (spec §9) ────
  let mejorCronograma: string | null = null
  let mejorCosto: string | null = null
  try {
    const { data: conocimientoRaw } = await supabase
      .from("conocimiento_historico")
      .select("datos")
      .eq("empresa_id", proyecto.empresa_id)
      .eq("tipo", "efectividad_alternativa")

    const estadisticas: EstadisticaAlternativa[] = ((conocimientoRaw ?? []) as any[])
      .map((c: any) => c.datos)
      .filter((d: any) => d && d.tipo_alerta && d.alternativa)
      .map((d: any) => ({
        tipo_alerta: d.tipo_alerta,
        alternativa: d.alternativa,
        exitos: Number(d.exitos ?? 0),
        total: Number(d.total ?? 0),
      }))

    mejorCronograma = mejorAlternativaConocida(estadisticas, "cronograma")
    mejorCosto = mejorAlternativaConocida(estadisticas, "costo")
  } catch (e) {
    errores.push(`Error leyendo conocimiento histórico: ${e instanceof Error ? e.message : String(e)}`)
  }

  // ── 4. Evaluar cada actividad y armar el conjunto de alertas vigentes ─
  const alertasVigentes: AlertaGenerada[] = []
  for (const a of actividades) {
    const alertaCronograma = evaluarCronograma(a, fecha, umbrales, mejorCronograma)
    if (alertaCronograma) alertasVigentes.push(alertaCronograma)

    const alertaCosto = evaluarCosto(a, umbrales, mejorCosto)
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

  // ── 5b. Evaluar decisiones pendientes y alimentar el conocimiento
  // histórico con el resultado (spec §9 — cierra el loop de aprendizaje) ─
  try {
    const { data: decisionesPendientesRaw } = await supabase
      .from("decisiones")
      .select("id, fecha_decision, alternativa_seleccionada, alerta_id, alertas ( tipo, estado )")
      .eq("proyecto_id", proyectoId)
      .is("resultado_fecha", null)

    let decisionesEvaluadas = 0
    const cambiosConocimiento = new Map<string, { tipo_alerta: string; alternativa: string; exito: boolean }[]>()

    for (const d of (decisionesPendientesRaw ?? []) as any[]) {
      if (!d.alertas || !d.alternativa_seleccionada) continue
      const paraEvaluar: DecisionParaEvaluar = {
        id: d.id,
        fecha_decision: d.fecha_decision,
        alternativa_seleccionada: d.alternativa_seleccionada,
        tipo_alerta: d.alertas.tipo,
        alerta_estado: d.alertas.estado,
      }
      const resultado_ = evaluarDecision(paraEvaluar, fecha)
      if (!resultado_) continue // todavía es pronto, o la alerta fue descartada

      const { error: errUpdDecision } = await supabase
        .from("decisiones")
        .update({
          resultado_observado: resultado_.resultado_observado,
          resultado_fecha: resultado_.resultado_fecha,
          prediccion_fue_correcta: resultado_.prediccion_fue_correcta,
          aprendizaje: resultado_.aprendizaje,
          updated_at: new Date().toISOString(),
        })
        .eq("id", d.id)

      if (errUpdDecision) {
        errores.push(`Error actualizando decisión: ${errUpdDecision.message}`)
        continue
      }
      decisionesEvaluadas++

      const clave_ = `${d.alertas.tipo}::${d.alternativa_seleccionada}`
      if (!cambiosConocimiento.has(clave_)) cambiosConocimiento.set(clave_, [])
      cambiosConocimiento.get(clave_)!.push({
        tipo_alerta: d.alertas.tipo,
        alternativa: d.alternativa_seleccionada,
        exito: resultado_.prediccion_fue_correcta,
      })
    }

    if (cambiosConocimiento.size > 0) {
      const { data: existentesRaw } = await supabase
        .from("conocimiento_historico")
        .select("id, datos")
        .eq("empresa_id", proyecto.empresa_id)
        .eq("tipo", "efectividad_alternativa")

      const existentes = (existentesRaw ?? []) as any[]

      for (const [, cambios] of cambiosConocimiento) {
        const { tipo_alerta, alternativa } = cambios[0]
        const nuevosExitos = cambios.filter((c) => c.exito).length
        const nuevoTotal = cambios.length

        const existente = existentes.find(
          (e: any) => e.datos?.tipo_alerta === tipo_alerta && e.datos?.alternativa === alternativa
        )

        if (existente) {
          const exitos = Number(existente.datos.exitos ?? 0) + nuevosExitos
          const total = Number(existente.datos.total ?? 0) + nuevoTotal
          const { error: errUpdConoc } = await supabase
            .from("conocimiento_historico")
            .update({
              datos: { tipo_alerta, alternativa, exitos, total },
              confianza: calcularConfianza(exitos, total),
              veces_observado: total,
              ultima_observacion: hoyISO(fecha),
              descripcion: `Alternativa "${alternativa}" para alertas de ${tipo_alerta}: ${exitos}/${total} casos exitosos.`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existente.id)
          if (errUpdConoc) errores.push(`Error actualizando conocimiento histórico: ${errUpdConoc.message}`)
        } else {
          const { error: errInsConoc } = await supabase.from("conocimiento_historico").insert({
            empresa_id: proyecto.empresa_id,
            tipo: "efectividad_alternativa",
            entidad_tipo: "alternativa",
            descripcion: `Alternativa "${alternativa}" para alertas de ${tipo_alerta}: ${nuevosExitos}/${nuevoTotal} casos exitosos.`,
            datos: { tipo_alerta, alternativa, exitos: nuevosExitos, total: nuevoTotal },
            confianza: calcularConfianza(nuevosExitos, nuevoTotal),
            veces_observado: nuevoTotal,
            ultima_observacion: hoyISO(fecha),
          })
          if (errInsConoc) errores.push(`Error creando conocimiento histórico: ${errInsConoc.message}`)
        }
      }
    }

    resultado.conocimiento = { decisiones_evaluadas: decisionesEvaluadas }
  } catch (e) {
    errores.push(`Error evaluando decisiones/conocimiento: ${e instanceof Error ? e.message : String(e)}`)
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
