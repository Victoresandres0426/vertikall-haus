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
// avance real.
//
// IMPORTANTE sobre la fuente de "horas reales": NO se usa la columna
// horas de asistencia_actividad_diaria como total de horas trabajadas --
// esa columna solo existe para repartir el COSTO de mano de obra entre
// actividades y en la práctica muchas veces queda en 0 cuando un
// trabajador cobra a destajo por cantidad (ver comentarios en
// reporte-client.tsx / historial-edit-client.tsx: "un renglón guardado
// con 0 horas normalmente es porque nunca se llenó a mano"). La fuente
// confiable del total de horas de un trabajador en el día es
// asistencia_diaria (horas_regulares + horas_extra), que es también la
// que se usa para pagarle. El rendimiento compara esas horas reales
// contra el equivalente en horas de plan de TODO lo que avanzó ese día,
// sin importar cómo repartió la columna "horas" entre sus actividades.

export type ActividadPlanRendimiento = {
  id: string
  cantidad_objetivo: number | null
  duracion_plan_dias: number | null
  personal_planeado: number | null
}

// Un renglón de avance de un trabajador en una actividad ese día
// (viene de asistencia_actividad_diaria, columna avance_cantidad).
export type EntradaAvancePorActividad = {
  actividadId: string
  avanceCantidad: number | null
}

// Todo lo que un trabajador reportó en un día: sus horas reales
// (autoritativas, de asistencia_diaria) y en cuántas/cuáles actividades
// dividió su avance ese día.
export type TrabajadorDia = {
  trabajadorId: string
  horasReales: number
  entradas: EntradaAvancePorActividad[]
}

// Ritmo planeado en unidades por hora-hombre. Null si la actividad no
// tiene suficiente información de plan (cantidad objetivo o duración)
// para calcularlo.
export function ritmoPlaneado(actividad: ActividadPlanRendimiento): number | null {
  const cantidad = actividad.cantidad_objetivo
  const dias = actividad.duracion_plan_dias
  if (cantidad === null || cantidad <= 0 || dias === null || dias <= 0) return null
  const personas = actividad.personal_planeado && actividad.personal_planeado > 0 ? actividad.personal_planeado : 1
  return cantidad / (dias * 8 * personas)
}

// Horas equivalentes al plan que un trabajador produjo en un día. Como
// no se puede confiar en un desglose de horas por actividad, se asume
// que sus horas reales se repartieron en partes iguales entre las
// actividades en las que reportó avance ese día. Para las que sí tienen
// plan configurado y avance reportado, esa porción se compara contra el
// ritmo planeado; para las que no (actividad sin plan, o sin avance
// reportado en ese renglón), esa porción se cuenta como neutral --no se
// penaliza por falta de datos, igual que el resto del motor de IIDP.
export function horasEquivalentesPlanTrabajador(
  trabajador: TrabajadorDia,
  actividadesPorId: Map<string, ActividadPlanRendimiento>
): number {
  if (trabajador.horasReales <= 0 || trabajador.entradas.length === 0) return 0

  const horasPorEntrada = trabajador.horasReales / trabajador.entradas.length
  let total = 0
  for (const entrada of trabajador.entradas) {
    const actividad = actividadesPorId.get(entrada.actividadId)
    const ritmo = actividad ? ritmoPlaneado(actividad) : null
    if (ritmo === null || ritmo <= 0 || entrada.avanceCantidad === null) {
      total += horasPorEntrada // sin plan o sin avance reportado: neutral
    } else {
      total += entrada.avanceCantidad / ritmo
    }
  }
  return total
}

// % de rendimiento real vs. plan. null si no hay horas reales que
// comparar (nadie trabajó, o no se tiene su asistencia). Puede superar
// 100 -- significa que se produjo más rápido de lo que el plan asumía;
// no se recorta acá, quien lo use para un score 0-100 sí debe hacerlo.
export function rendimientoPct(horasEquivalentesPlan: number, horasReales: number): number | null {
  if (horasReales <= 0) return null
  return (horasEquivalentesPlan / horasReales) * 100
}

export type TotalesRendimiento = {
  horasReales: number
  horasEquivalentesPlan: number
}

// Agrega el rendimiento de todos los trabajadores de un día (o de un
// proyecto completo, según qué lista de TrabajadorDia se le pase).
export function agregarRendimiento(
  trabajadoresDia: TrabajadorDia[],
  actividadesPorId: Map<string, ActividadPlanRendimiento>
): TotalesRendimiento {
  let horasReales = 0
  let horasEquivPlan = 0
  for (const t of trabajadoresDia) {
    horasReales += t.horasReales
    horasEquivPlan += horasEquivalentesPlanTrabajador(t, actividadesPorId)
  }
  return { horasReales, horasEquivalentesPlan: horasEquivPlan }
}

export type RendimientoPorTrabajador = {
  trabajadorId: string
  horasReales: number
  horasEquivalentesPlan: number
  rendimientoPct: number | null
}

export function calcularRendimientoPorTrabajador(
  trabajadoresDia: TrabajadorDia[],
  actividadesPorId: Map<string, ActividadPlanRendimiento>
): RendimientoPorTrabajador[] {
  return trabajadoresDia.map((t) => {
    const equiv = horasEquivalentesPlanTrabajador(t, actividadesPorId)
    return {
      trabajadorId: t.trabajadorId,
      horasReales: t.horasReales,
      horasEquivalentesPlan: equiv,
      rendimientoPct: rendimientoPct(equiv, t.horasReales),
    }
  })
}
