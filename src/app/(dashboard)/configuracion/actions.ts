"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

const ROLES_VALIDOS = ["capataz", "administrador", "project_manager", "dueno", "cliente"] as const
type RolValido = typeof ROLES_VALIDOS[number]

export async function invitarUsuario(formData: FormData): Promise<{ error?: string; token?: string; email?: string }> {
  const email = (formData.get("email") as string)?.toLowerCase().trim()
  const nombre = (formData.get("nombre") as string)?.trim()
  const rol = formData.get("rol") as string
  const proyectoId = (formData.get("proyecto_id") as string)?.trim() || null

  if (!email || !nombre || !rol) return { error: "Todos los campos son requeridos" }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email inválido" }
  if (!ROLES_VALIDOS.includes(rol as RolValido)) return { error: "Rol inválido" }
  if (rol === "cliente" && !proyectoId) return { error: "Selecciona el proyecto al que tendrá acceso el cliente" }

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

  // Si es cliente, verificar que el proyecto pertenezca a la misma empresa
  if (rol === "cliente") {
    const { data: proyecto } = await supabase
      .from("proyectos")
      .select("id")
      .eq("id", proyectoId)
      .eq("empresa_id", perfil.empresa_id)
      .single()
    if (!proyecto) return { error: "Proyecto no válido" }
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
      proyecto_id: rol === "cliente" ? proyectoId : null,
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

// ── Gestión del equipo: cambiar rol / activar-desactivar una cuenta ──
// Mismo nivel de permiso que invitar (dueno/superadmin/administrador),
// pero con guardas extra para que un administrador no pueda tocar
// cuentas de dueño/superadmin ni ascender a nadie a esos roles --
// mismo patrón de "narrowing" ya usado en proyecto_usuarios_asignados
// (migración 053): un rol de gestión no puede auto-escalarse ni tocar
// a quien está por encima de él.
const ROLES_GESTION_EQUIPO = ["dueno", "superadmin", "administrador"] as const
const ROLES_PROTEGIDOS = ["dueno", "superadmin"] as const

async function verificarPermisoGestionEquipo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  targetId: string
): Promise<{ error?: string; actorRol?: string; empresaId?: string; targetRolActual?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  if (user.id === targetId) return { error: "No puedes editar tu propia cuenta desde aquí" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol, empresa_id")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_GESTION_EQUIPO.includes(perfil.rol as typeof ROLES_GESTION_EQUIPO[number])) {
    return { error: "No tienes permisos para gestionar el equipo" }
  }

  const { data: target } = await supabase
    .from("perfiles_usuario")
    .select("rol, empresa_id")
    .eq("id", targetId)
    .single()

  if (!target || target.empresa_id !== perfil.empresa_id) {
    return { error: "Usuario no encontrado" }
  }

  if (
    perfil.rol === "administrador" &&
    ROLES_PROTEGIDOS.includes(target.rol as typeof ROLES_PROTEGIDOS[number])
  ) {
    return { error: "Un administrador no puede editar cuentas de dueño o superadmin" }
  }

  return { actorRol: perfil.rol, empresaId: perfil.empresa_id, targetRolActual: target.rol }
}

export async function actualizarRolUsuario(usuarioId: string, nuevoRol: string): Promise<{ error?: string }> {
  if (!ROLES_VALIDOS.includes(nuevoRol as RolValido)) return { error: "Rol inválido" }

  const supabase = await createClient()
  const check = await verificarPermisoGestionEquipo(supabase, usuarioId)
  if (check.error) return { error: check.error }

  if (
    check.actorRol === "administrador" &&
    ROLES_PROTEGIDOS.includes(nuevoRol as typeof ROLES_PROTEGIDOS[number])
  ) {
    return { error: "Un administrador no puede asignar el rol de dueño o superadmin" }
  }

  // No dejar a la empresa sin ningún dueño activo.
  if (check.targetRolActual === "dueno" && nuevoRol !== "dueno") {
    const { count } = await supabase
      .from("perfiles_usuario")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", check.empresaId)
      .eq("rol", "dueno")
      .eq("activo", true)
    if ((count ?? 0) <= 1) {
      return { error: "No puedes quitarle el rol de dueño al único dueño activo de la empresa" }
    }
  }

  const { error } = await supabase
    .from("perfiles_usuario")
    .update({ rol: nuevoRol })
    .eq("id", usuarioId)

  if (error) return { error: "No se pudo actualizar el rol" }

  revalidatePath("/configuracion")
  return {}
}

export async function cambiarActivoUsuario(usuarioId: string, activo: boolean): Promise<{ error?: string }> {
  const supabase = await createClient()
  const check = await verificarPermisoGestionEquipo(supabase, usuarioId)
  if (check.error) return { error: check.error }

  if (!activo && check.targetRolActual === "dueno") {
    const { count } = await supabase
      .from("perfiles_usuario")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", check.empresaId)
      .eq("rol", "dueno")
      .eq("activo", true)
    if ((count ?? 0) <= 1) {
      return { error: "No puedes desactivar al único dueño activo de la empresa" }
    }
  }

  const { error } = await supabase
    .from("perfiles_usuario")
    .update({ activo })
    .eq("id", usuarioId)

  if (error) return { error: "No se pudo actualizar la cuenta" }

  revalidatePath("/configuracion")
  return {}
}
