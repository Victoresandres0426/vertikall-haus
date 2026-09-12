"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { ejecutarMotorDiario } from "@/lib/engine/motor"
import type { TipoDependencia } from "@/lib/engine/cpm"

const ROLES_RECALCULAN = ["project_manager", "administrador", "dueno", "superadmin"]

type Supabase = Awaited<ReturnType<typeof createClient>>

async function verificarRolCronograma(supabase: Supabase): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_RECALCULAN.includes(perfil.rol)) {
    return { ok: false, error: "No tienes permisos para editar el cronograma" }
  }
  return { ok: true }
}

async function proyectoIdDeActividad(supabase: Supabase, actividadId: string): Promise<string | null> {
  const { data } = await supabase.from("actividades").select("proyecto_id").eq("id", actividadId).single()
  return data?.proyecto_id ?? null
}

// Recalcula ruta crítica/holgura tras tocar una dependencia -- agregar,
// quitar o cambiar el tipo/lag de una dependencia puede correr o
// atrasar tanto la sucesora como todo lo que dependa de ella en cascada.
async function recalcularYRevalidarDependencias(supabase: Supabase, proyectoId: string) {
  const motor = await ejecutarMotorDiario(supabase, proyectoId, new Date())
  if (motor.errores.length > 0) {
    console.error("Motor de reglas (tras editar dependencias) terminó con errores:", motor.errores)
  }
  revalidatePath(`/gantt/${proyectoId}`)
  revalidatePath(`/gantt/${proyectoId}/editar`)
  revalidatePath("/actividades")
  revalidatePath("/dashboard")
  revalidatePath("/alertas")
}

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

// ── Dependencias entre actividades (flechas del Gantt) ──────────
// "actividadId" es la SUCESORA (la que depende), "predecesoraId" la que
// debe ir antes -- mismo sentido que usa dependencias_actividad y el
// motor de ruta crítica (src/lib/engine/cpm.ts).

export async function crearDependencia(
  actividadId: string,
  predecesoraId: string,
  tipo: TipoDependencia,
  lagDias: number
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const rol = await verificarRolCronograma(supabase)
  if (!rol.ok) return { error: rol.error }

  if (actividadId === predecesoraId) {
    return { error: "Una actividad no puede depender de sí misma" }
  }

  const proyectoId = await proyectoIdDeActividad(supabase, actividadId)
  if (!proyectoId) return { error: "No se encontró el proyecto de esta actividad" }

  const { error } = await supabase.from("dependencias_actividad").insert({
    actividad_id: actividadId,
    predecesora_id: predecesoraId,
    tipo,
    lag_dias: lagDias,
  })

  if (error) {
    if (error.code === "23505") return { error: "Esa dependencia ya existe" }
    return { error: error.message }
  }

  await recalcularYRevalidarDependencias(supabase, proyectoId)
  return {}
}

export async function actualizarDependencia(
  dependenciaId: string,
  cambios: { tipo: TipoDependencia; lag_dias: number }
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const rol = await verificarRolCronograma(supabase)
  if (!rol.ok) return { error: rol.error }

  const { data: dep } = await supabase
    .from("dependencias_actividad")
    .select("actividad_id")
    .eq("id", dependenciaId)
    .single()

  if (!dep) return { error: "Esa dependencia ya no existe" }

  const { error } = await supabase
    .from("dependencias_actividad")
    .update({ tipo: cambios.tipo, lag_dias: cambios.lag_dias })
    .eq("id", dependenciaId)

  if (error) return { error: error.message }

  const proyectoId = await proyectoIdDeActividad(supabase, dep.actividad_id)
  if (proyectoId) await recalcularYRevalidarDependencias(supabase, proyectoId)
  return {}
}

export async function eliminarDependencia(dependenciaId: string): Promise<{ error?: string }> {
  const supabase = await createClient()

  const rol = await verificarRolCronograma(supabase)
  if (!rol.ok) return { error: rol.error }

  const { data: dep } = await supabase
    .from("dependencias_actividad")
    .select("actividad_id")
    .eq("id", dependenciaId)
    .single()

  const { error } = await supabase.from("dependencias_actividad").delete().eq("id", dependenciaId)
  if (error) return { error: error.message }

  if (dep?.actividad_id) {
    const proyectoId = await proyectoIdDeActividad(supabase, dep.actividad_id)
    if (proyectoId) await recalcularYRevalidarDependencias(supabase, proyectoId)
  }
  return {}
}
