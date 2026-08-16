"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

const ROLES_GESTION = ['capataz', 'project_manager', 'administrador', 'dueno', 'superadmin']

async function verificarAcceso(supabase: Awaited<ReturnType<typeof createClient>>, proyectoId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  return !!perfil && ROLES_GESTION.includes(perfil.rol)
}

export async function agregarTrabajadorAProyecto(proyectoId: string, trabajadorId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const tieneAcceso = await verificarAcceso(supabase, proyectoId)
  if (!tieneAcceso) return { error: "Sin permisos" }

  const { error } = await supabase
    .from("proyecto_trabajadores")
    .upsert(
      { proyecto_id: proyectoId, trabajador_id: trabajadorId, autorizado: true, autorizado_por: user.id },
      { onConflict: "proyecto_id,trabajador_id" }
    )

  if (error) return { error: error.message }

  revalidatePath(`/proyectos/${proyectoId}`)
  return { ok: true }
}

export async function removerTrabajadorDeProyecto(proyectoId: string, trabajadorId: string) {
  const supabase = await createClient()

  const tieneAcceso = await verificarAcceso(supabase, proyectoId)
  if (!tieneAcceso) return { error: "Sin permisos" }

  const { error } = await supabase
    .from("proyecto_trabajadores")
    .delete()
    .eq("proyecto_id", proyectoId)
    .eq("trabajador_id", trabajadorId)

  if (error) return { error: error.message }

  revalidatePath(`/proyectos/${proyectoId}`)
  return { ok: true }
}
