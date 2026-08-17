"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

const ROLES_VALIDOS = ["capataz", "administrador", "project_manager", "dueno"] as const
type RolValido = typeof ROLES_VALIDOS[number]

export async function invitarUsuario(formData: FormData): Promise<{ error?: string; token?: string; email?: string }> {
  const email = (formData.get("email") as string)?.toLowerCase().trim()
  const nombre = (formData.get("nombre") as string)?.trim()
  const rol = formData.get("rol") as string

  if (!email || !nombre || !rol) return { error: "Todos los campos son requeridos" }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email inválido" }
  if (!ROLES_VALIDOS.includes(rol as RolValido)) return { error: "Rol inválido" }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  // Verificar que quien invita tiene permisos
  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("empresa_id, rol")
    .eq("id", user.id)
    .single()

  if (!perfil) return { error: "Perfil no encontrado" }
  if (!["dueno", "superadmin", "administrador"].includes(perfil.rol)) {
    return { error: "No tienes permisos para invitar usuarios" }
  }

  // Verificar que el email no esté ya registrado
  const { data: yaExiste } = await supabase
    .from("perfiles_usuario")
    .select("id")
    .eq("email", email)
    .eq("empresa_id", perfil.empresa_id)
    .single()

  if (yaExiste) return { error: "Ese correo ya tiene una cuenta en tu empresa" }

  // Crear invitación (desactivar invitaciones previas del mismo email)
  await supabase
    .from("invitaciones")
    .update({ activa: false })
    .eq("email", email)
    .eq("empresa_id", perfil.empresa_id)

  const { data: invitacion, error: invErr } = await supabase
    .from("invitaciones")
    .insert({
      empresa_id: perfil.empresa_id,
      email,
      nombre_completo: nombre,
      rol,
      created_by: user.id,
    })
    .select("token")
    .single()

  if (invErr || !invitacion) return { error: "Error al crear la invitación" }

  revalidatePath("/configuracion")
  return { token: invitacion.token, email }
}

export async function enviarRespaldoAhora(): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { error } = await supabase.rpc("generar_respaldo_ahora")

  if (error) {
    if (error.message.includes("Solo el dueño")) {
      return { error: "Solo el dueño puede generar un respaldo manual." }
    }
    return { error: "Error al generar el respaldo. Revisa que el correo (Resend) esté configurado." }
  }

  return {}
}

export async function revocarInvitacion(invitacionId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { error } = await supabase
    .from("invitaciones")
    .update({ activa: false })
    .eq("id", invitacionId)

  if (error) return { error: "No se pudo revocar la invitación" }

  revalidatePath("/configuracion")
  return {}
}
