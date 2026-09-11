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
