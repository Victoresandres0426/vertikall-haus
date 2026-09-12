// ============================================================
// Rendimiento real vs. plan
// ============================================================
// Reemplaza la vieja idea de "productividad = horas productivas / horas
// totales del día" (que en la práctica nunca reflejaba nada real, porque
// horas_improductivas jamás se llenaba desde el Reporte Diario) por una
// comparación real: cuánto produjo cada trabajador en sus horas vs.
// cuánto debería haber producido según el plan de la actividad.
//
// El plan de una actividad define, además de la cantidad objetivo y la
// duración en días, cuánta gente (personal_planeado) se asumió para
// lograrla en ese tiempo. De ahí sale un "ritmo planeado" en unidades
// por hora-hombre. Si en la práctica trabaja más gente que la planeada
// sin producir más, el rendimiento por hora-hombre cae -- tal como debe
// ser: agregar personal no mejora el rendimiento si no se traduce en más
// avance real. Esto es también la base para que el motor, al proponer
// "agregar personal" como solución a un atraso, pueda verificar después
// si esa decisión realmente mejoró el rendimiento o no.

export type ActividadPlanRendimiento = {
  id: string
  cantidad_objetivo: number | null
  duracion_plan_dias: number | null
  personal_planeado: number | null
}

export type EntradaRendimiento = {
  actividadId: string
  trabajadorId: string
  horas: number
  avanceCantidad: number | null
}

export type TotalesRendimiento = {
  horasReales: number
  horasEquivalentesPlan: number
}

// Ritmo planeado en unidades por hora-hombre. Null si la actividad no
// tiene suficiente información de plan (cantidad objetivo o duración)
// para calcularlo -- en ese caso no se puede evaluar rendimiento real
// contra plan para esa actividad, y se trata como neutral (ver abajo).
export function ritmoPlaneado(actividad: ActividadPlanRendimiento): number | null {
  const cantidad = actividad.cantidad_objetivo
  const dias = actividad.duracion_plan_dias
  if (cantidad === null || cantidad <= 0 || dias === null || dias <= 0) return null
  const personas = actividad.personal_planeado && actividad.personal_planeado > 0 ? actividad.personal_planeado : 1
  return cantidad / (dias * 8 * personas)
}

// Cuántas "horas equivalentes al plan" representa lo que un trabajador
// produjo realmente en una entrada de asistencia. Si no hay ritmo
// planeado (actividad sin cantidad/duración configurada) o no se
// reportó avance_cantidad para esa entrada, se asume que sus horas
// reales SON el equivalente -- no se penaliza por falta de datos, igual
// que el resto del motor de IIDP.
export function horasEquivalentesPlan(entrada: EntradaRendimiento, ritmo: number | null): number {
  if (ritmo === null || ritmo <= 0 || entrada.avanceCantidad === null) return entrada.horas
  return entrada.avanceCantidad / ritmo
}

// % de rendimiento real vs. plan. null si no hay horas reales que
// comparar (nadie trabajó). Puede superar 100 -- significa que se
// produjo más rápido de lo que el plan asumía, y es información válida
// para mostrar (no se recorta acá; quien la use para un score 0-100 sí
// debe recortarla).
export function rendimientoPct(totales: TotalesRendimiento): number | null {
  if (totales.horasReales <= 0) return null
  return (totales.horasEquivalentesPlan / totales.horasReales) * 100
}

// Agrega una lista de entradas (asistencia_actividad_diaria de un día,
// de un proyecto o de un trabajador) contra el plan de cada actividad.
export function agregarRendimiento(
  entradas: EntradaRendimiento[],
  actividadesPorId: Map<string, ActividadPlanRendimiento>
): TotalesRendimiento {
  let horasReales = 0
  let horasEquivPlan = 0
  for (const e of entradas) {
    const act = actividadesPorId.get(e.actividadId)
    const ritmo = act ? ritmoPlaneado(act) : null
    horasReales += e.horas
    horasEquivPlan += horasEquivalentesPlan(e, ritmo)
  }
  return { horasReales, horasEquivalentesPlan: horasEquivPlan }
}

export type RendimientoPorTrabajador = {
  trabajadorId: string
  horasReales: number
  horasEquivalentesPlan: number
  rendimientoPct: number | null
}

export function agregarRendimientoPorTrabajador(
  entradas: EntradaRendimiento[],
  actividadesPorId: Map<string, ActividadPlanRendimiento>
): RendimientoPorTrabajador[] {
  const porTrabajador = new Map<string, EntradaRendimiento[]>()
  for (const e of entradas) {
    if (!porTrabajador.has(e.trabajadorId)) porTrabajador.set(e.trabajadorId, [])
    porTrabajador.get(e.trabajadorId)!.push(e)
  }

  const resultado: RendimientoPorTrabajador[] = []
  for (const [trabajadorId, entradasTrabajador] of porTrabajador) {
    const totales = agregarRendimiento(entradasTrabajador, actividadesPorId)
    resultado.push({
      trabajadorId,
      horasReales: totales.horasReales,
      horasEquivalentesPlan: totales.horasEquivalentesPlan,
      rendimientoPct: rendimientoPct(totales),
    })
  }
  return resultado
}
