"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

// Solo dueño/administrador/superadmin pueden asignar o quitar acceso --
// si un project_manager pudiera hacerlo, podría auto-asignarse a
// cualquier proyecto de la empresa y anular la restricción.
const ROLES_GESTION_ACCESO = ["dueno", "superadmin", "administrador"]

async function verificarAcceso(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  return !!perfil && ROLES_GESTION_ACCESO.includes(perfil.rol)
}

export async function asignarUsuarioAProyecto(proyectoId: string, usuarioId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const tieneAcceso = await verificarAcceso(supabase)
  if (!tieneAcceso) return { error: "Sin permisos" }

  const { error } = await supabase
    .from("proyecto_usuarios_asignados")
    .upsert(
      { proyecto_id: proyectoId, usuario_id: usuarioId, asignado_por: user.id },
      { onConflict: "proyecto_id,usuario_id" }
    )

  if (error) return { error: error.message }

  revalidatePath(`/proyectos/${proyectoId}`)
  return { ok: true }
}

export async function removerUsuarioDeProyecto(proyectoId: string, usuarioId: string) {
  const supabase = await createClient()

  const tieneAcceso = await verificarAcceso(supabase)
  if (!tieneAcceso) return { error: "Sin permisos" }

  const { error } = await supabase
    .from("proyecto_usuarios_asignados")
    .delete()
    .eq("proyecto_id", proyectoId)
    .eq("usuario_id", usuarioId)

  if (error) return { error: error.message }

  revalidatePath(`/proyectos/${proyectoId}`)
  return { ok: true }
}
