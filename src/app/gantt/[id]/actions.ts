"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { ejecutarMotorDiario } from "@/lib/engine/motor"

const ROLES_RECALCULAN = ["project_manager", "administrador", "dueno", "superadmin"]

// Fuerza una recorrida completa del motor de ruta crítica (CPM) para un
// proyecto -- útil cuando cambia la lógica de cálculo (ej. pasar a días
// hábiles) y hay que reprogramar todo lo que ya está en la base de
// datos, no solo lo que se edite de aquí en adelante. En el uso normal
// esto ya corre solo al editar una actividad o guardar un Reporte
// Diario; este botón es para forzarlo a demanda sobre TODO el proyecto.
export async function recalcularCronogramaProyecto(proyectoId: string): Promise<{
  error?: string
  criticas?: number
  actualizadas?: number
  reprogramadas?: number
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_RECALCULAN.includes(perfil.rol)) {
    return { error: "No tienes permisos para recalcular el cronograma" }
  }

  const motor = await ejecutarMotorDiario(supabase, proyectoId, new Date())

  if (motor.errores.length > 0) {
    return { error: motor.errores.join(" · ") }
  }

  revalidatePath(`/gantt/${proyectoId}`)
  revalidatePath("/actividades")
  revalidatePath("/dashboard")
  revalidatePath("/alertas")

  return {
    criticas: motor.ruta_critica?.actividades_criticas ?? 0,
    actualizadas: motor.ruta_critica?.actividades_actualizadas ?? 0,
    reprogramadas: motor.ruta_critica?.actividades_reprogramadas ?? 0,
  }
}

// Mover o estirar una barra en la vista interactiva del Gantt (/gantt/
// [id]/editar) -- guarda las nuevas fechas de ESA actividad y dispara el
// mismo recálculo de ruta crítica que ya corre al editarla desde
// Actividades, para que las actividades que dependen de ella se
// reprogramen solas si corresponde (mover/estirar una con sucesoras
// puede correr o atrasar el resto del cronograma).
export async function actualizarFechasActividad(
  actividadId: string,
  nuevas: { fecha_inicio_plan: string; fecha_fin_plan: string }
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_RECALCULAN.includes(perfil.rol)) {
    return { error: "No tienes permisos para mover actividades del cronograma" }
  }

  if (nuevas.fecha_fin_plan < nuevas.fecha_inicio_plan) {
    return { error: "La fecha de fin no puede ser anterior a la de inicio" }
  }

  const inicio = new Date(nuevas.fecha_inicio_plan + "T00:00:00")
  const fin = new Date(nuevas.fecha_fin_plan + "T00:00:00")
  const duracionDias = Math.max(1, Math.round((fin.getTime() - inicio.getTime()) / 86400000) + 1)

  const { data: act, error } = await supabase
    .from("actividades")
    .update({
      fecha_inicio_plan: nuevas.fecha_inicio_plan,
      fecha_fin_plan: nuevas.fecha_fin_plan,
      duracion_plan_dias: duracionDias,
    })
    .eq("id", actividadId)
    .select("proyecto_id")
    .single()

  if (error) return { error: error.message }
  if (!act?.proyecto_id) return { error: "No se encontró el proyecto de esta actividad" }

  const motor = await ejecutarMotorDiario(supabase, act.proyecto_id, new Date())
  if (motor.errores.length > 0) {
    console.error("Motor de reglas (tras mover barra de Gantt) terminó con errores:", motor.errores)
  }

  revalidatePath(`/gantt/${act.proyecto_id}`)
  revalidatePath(`/gantt/${act.proyecto_id}/editar`)
  revalidatePath("/actividades")
  revalidatePath("/dashboard")
  revalidatePath("/alertas")

  return {}
}
