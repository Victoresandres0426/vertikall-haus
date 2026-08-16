// ============================================================
// Motor de reglas — cálculo de desviación y generación de alertas
// ============================================================
// Funciones puras (sin I/O) para poder probarlas de forma aislada.
// La orquestación (leer/escribir Supabase) vive en motor.ts.

import type { Alternativa, AlertaGenerada, NivelAlerta, UmbralesDesviacion } from "./types"
import { UMBRALES_DEFAULT } from "./types"

export type ActividadParaMotor = {
  id: string
  proyecto_id: string
  codigo: string
  nombre: string
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
  duracion_plan_dias: number | null
  avance_porcentaje: number
  costo_presupuesto: number
  costo_real: number
  es_critica: boolean
  estado: string
  // Señales cualitativas del último reporte (opcional)
  incidencias_recientes?: string | null
  bloqueos_recientes?: string | null
}

/** % de avance esperado a la fecha, por interpolación lineal plan. */
export function avanceEsperadoPct(actividad: ActividadParaMotor, fecha: Date): number {
  if (!actividad.fecha_inicio_plan || !actividad.fecha_fin_plan) return 0
  const inicio = new Date(actividad.fecha_inicio_plan).getTime()
  const fin = new Date(actividad.fecha_fin_plan).getTime()
  const hoy = fecha.getTime()
  if (fin <= inicio) return 100
  if (hoy <= inicio) return 0
  if (hoy >= fin) return 100
  return ((hoy - inicio) / (fin - inicio)) * 100
}

/** Clasifica un nivel según desviación (positiva = atraso/exceso) y umbrales. */
function clasificar(desviacion: number, amarillo: number, rojo: number): NivelAlerta {
  if (desviacion >= rojo) return "rojo"
  if (desviacion >= amarillo) return "amarillo"
  return "verde"
}

/** Sube un nivel de severidad si la actividad es crítica (ruta crítica). */
function escalarSiCritica(nivel: NivelAlerta, esCritica: boolean): NivelAlerta {
  if (!esCritica) return nivel
  if (nivel === "amarillo") return "rojo"
  if (nivel === "verde") return "amarillo" // cualquier desviación en ruta crítica preocupa un poco más
  return nivel
}

function diasARaiz(actividad: ActividadParaMotor): number {
  return actividad.duracion_plan_dias && actividad.duracion_plan_dias > 0
    ? actividad.duracion_plan_dias
    : 10 // fallback conservador si falta la duración planificada
}

function costoDiarioProxy(actividad: ActividadParaMotor): number {
  const dias = diasARaiz(actividad)
  return actividad.costo_presupuesto > 0 ? actividad.costo_presupuesto / dias : 0
}

/** Genera alternativas de recuperación estilo spec §14 (agregar recurso / horas extra / no intervenir). */
export function generarAlternativasCronograma(
  actividad: ActividadParaMotor,
  atrasoPct: number,
  mejorConocida?: string | null
): Alternativa[] {
  const dias = diasARaiz(actividad)
  const diasAtraso = Math.max(1, Math.round((atrasoPct / 100) * dias))
  const costoDiario = costoDiarioProxy(actividad)

  const agregarRecurso: Alternativa = {
    tipo: "agregar_recurso",
    descripcion: `Agregar un recurso adicional durante ${diasAtraso} día${diasAtraso !== 1 ? "s" : ""}`,
    costo: Math.round(costoDiario * diasAtraso * 0.5),
    dias: -diasAtraso, // días que se recuperan (negativo = reduce atraso)
    impacto: "Recupera la mayor parte del atraso sin extender la fecha de terminación de la actividad.",
    recomendada: false,
  }

  const horasExtra: Alternativa = {
    tipo: "horas_extra",
    descripcion: `Autorizar horas extra por ${diasAtraso} día${diasAtraso !== 1 ? "s" : ""}`,
    costo: Math.round(actividad.costo_presupuesto * 0.1),
    dias: -Math.max(1, Math.round(diasAtraso * 0.5)),
    impacto: "Recupera parte del atraso a menor costo, pero con menor efectividad que sumar personal.",
    recomendada: false,
  }

  const noIntervenir: Alternativa = {
    tipo: "no_intervenir",
    descripcion: "No intervenir por ahora",
    costo: 0,
    dias: 0,
    impacto: actividad.es_critica
      ? "La actividad es parte de la ruta crítica: el atraso se propaga a la fecha final del proyecto."
      : "Existe holgura; el atraso podría absorberse sin afectar la fecha final, pero debe monitorearse.",
    recomendada: false,
  }

  const opciones = [agregarRecurso, horasExtra, noIntervenir]

  if (mejorConocida && opciones.some((o) => o.tipo === mejorConocida)) {
    // El motor de conocimiento histórico (spec §9) ya vio suficientes
    // casos en ESTA empresa como para confiar en cuál alternativa
    // funciona mejor para este tipo de alerta — se usa esa en vez de
    // la regla fija por defecto.
    opciones.forEach((o) => (o.recomendada = o.tipo === mejorConocida))
  } else if (diasAtraso <= 1 && !actividad.es_critica) {
    horasExtra.recomendada = true
  } else {
    agregarRecurso.recomendada = true
  }

  return opciones
}

export function generarAlternativasCosto(
  actividad: ActividadParaMotor,
  desviacionPct: number,
  mejorConocida?: string | null
): Alternativa[] {
  const excesoActual = actividad.costo_real - actividad.costo_presupuesto
  const opciones: Alternativa[] = [
    {
      tipo: "renegociar",
      descripcion: "Renegociar con proveedor/subcontratista o buscar alternativa más económica",
      costo: -Math.round(excesoActual * 0.4),
      dias: 0,
      impacto: "Reduce parcialmente la desviación de costo sin afectar el cronograma.",
      recomendada: true,
    },
    {
      tipo: "absorber",
      descripcion: "Absorber la desviación dentro del margen del proyecto",
      costo: 0,
      dias: 0,
      impacto: "No requiere acción inmediata, pero reduce el margen final si la tendencia continúa.",
      recomendada: false,
    },
    {
      tipo: "escalar_dueno",
      descripcion: "Escalar a dueño para autorizar sobrecosto o generar change order",
      costo: Math.round(excesoActual),
      dias: 0,
      impacto: "Formaliza el sobrecosto; si es atribuible a alcance adicional, puede facturarse al cliente.",
      recomendada: false,
    },
  ]

  if (mejorConocida && opciones.some((o) => o.tipo === mejorConocida)) {
    opciones.forEach((o) => (o.recomendada = o.tipo === mejorConocida))
  } else {
    opciones[0].recomendada = true
    opciones[2].recomendada = desviacionPct >= 10
  }

  return opciones
}

/**
 * Evalúa una actividad y devuelve la alerta de cronograma que corresponde,
 * o null si no hay desviación relevante (nivel verde).
 */
export function evaluarCronograma(
  actividad: ActividadParaMotor,
  fecha: Date,
  umbrales: UmbralesDesviacion = UMBRALES_DEFAULT,
  mejorConocida?: string | null
): AlertaGenerada | null {
  if (actividad.estado === "completada" || actividad.estado === "cancelada") return null

  const esperado = avanceEsperadoPct(actividad, fecha)
  const atraso = esperado - actividad.avance_porcentaje
  if (atraso <= 0) return null // va igual o mejor que el plan

  const nivelBase = clasificar(atraso, umbrales.cronograma_amarillo, umbrales.cronograma_rojo)
  const nivel = escalarSiCritica(nivelBase, actividad.es_critica)
  if (nivel === "verde") return null

  const alternativas = generarAlternativasCronograma(actividad, atraso, mejorConocida)
  const recomendada = alternativas.find((a) => a.recomendada)

  const causaProbable =
    actividad.bloqueos_recientes?.trim() ||
    actividad.incidencias_recientes?.trim() ||
    "Ritmo de ejecución por debajo del plan; el capataz no reportó una causa específica en el último avance."

  return {
    actividad_id: actividad.id,
    proyecto_id: actividad.proyecto_id,
    tipo: "cronograma",
    nivel,
    titulo: `${actividad.codigo} — ${actividad.nombre}: atraso de ${atraso.toFixed(1)}%`,
    que_ocurrio: `El avance real (${actividad.avance_porcentaje.toFixed(1)}%) está por debajo del avance esperado (${esperado.toFixed(1)}%) a la fecha.`,
    causa_probable: causaProbable,
    desviacion_actual: `${atraso.toFixed(1)} puntos porcentuales de atraso`,
    proyeccion_sin_accion: `Si la tendencia continúa, la actividad terminaría con un atraso aproximado de ${Math.max(1, Math.round((atraso / 100) * diasARaiz(actividad)))} día(s) sobre el plan.`,
    impacto_sucesoras: actividad.es_critica
      ? "Actividad marcada como crítica: el atraso impacta directamente la fecha final del proyecto."
      : "Actividad sin holgura crítica registrada; revisar impacto en sucesoras inmediatas.",
    impacto_financiero: recomendada ? Math.abs(recomendada.costo) : null,
    fecha_limite_accion: new Date(fecha.getTime() + 2 * 86400000).toISOString().slice(0, 10),
    rol_que_decide: nivel === "rojo" ? "project_manager" : "capataz",
    alternativas,
    recomendacion: recomendada
      ? `${recomendada.descripcion} (impacto estimado: ${recomendada.impacto})`
      : "Monitorear sin intervenir por ahora.",
  }
}

export function evaluarCosto(
  actividad: ActividadParaMotor,
  umbrales: UmbralesDesviacion = UMBRALES_DEFAULT,
  mejorConocida?: string | null
): AlertaGenerada | null {
  if (actividad.costo_presupuesto <= 0) return null
  const desviacionPct = ((actividad.costo_real - actividad.costo_presupuesto) / actividad.costo_presupuesto) * 100
  if (desviacionPct <= 0) return null

  const nivel = clasificar(desviacionPct, umbrales.costo_amarillo, umbrales.costo_rojo)
  if (nivel === "verde") return null

  const alternativas = generarAlternativasCosto(actividad, desviacionPct, mejorConocida)
  const recomendada = alternativas.find((a) => a.recomendada)

  return {
    actividad_id: actividad.id,
    proyecto_id: actividad.proyecto_id,
    tipo: "costo",
    nivel,
    titulo: `${actividad.codigo} — ${actividad.nombre}: sobrecosto de ${desviacionPct.toFixed(1)}%`,
    que_ocurrio: `El costo real ($${actividad.costo_real.toLocaleString()}) supera el presupuestado ($${actividad.costo_presupuesto.toLocaleString()}) en ${desviacionPct.toFixed(1)}%.`,
    causa_probable: "Desviación detectada por comparación directa presupuesto vs. costo real registrado.",
    desviacion_actual: `${desviacionPct.toFixed(1)}% sobre presupuesto`,
    proyeccion_sin_accion: "Si la actividad no ha terminado, el sobrecosto final podría ser mayor al actual.",
    impacto_sucesoras: null,
    impacto_financiero: Math.round(actividad.costo_real - actividad.costo_presupuesto),
    fecha_limite_accion: null,
    rol_que_decide: desviacionPct >= umbrales.costo_rojo ? "dueno" : "project_manager",
    alternativas,
    recomendacion: recomendada
      ? `${recomendada.descripcion} (impacto estimado: ${recomendada.impacto})`
      : "Revisar la partida presupuestal asociada.",
  }
}
