"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

const ROLES_EDITAN_CLIENTE = ["project_manager", "administrador", "dueno", "superadmin"]

export async function actualizarClienteEmail(proyectoId: string, email: string): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_EDITAN_CLIENTE.includes(perfil.rol)) {
    return { error: "No tienes permisos para editar el contacto del cliente" }
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Correo inválido" }
  }

  const { error } = await supabase
    .from("proyectos")
    .update({ cliente_email: email || null })
    .eq("id", proyectoId)

  if (error) {
    console.error("actualizarClienteEmail error:", error)
    return { error: "Error al guardar el correo." }
  }

  revalidatePath(`/proyectos/${proyectoId}`)
  return {}
}

export async function actualizarCoordenadas(proyectoId: string, lat: number, lng: number): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_EDITAN_CLIENTE.includes(perfil.rol)) {
    return { error: "No tienes permisos para editar la ubicación" }
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { error: "Coordenadas fuera de rango" }
  }

  const { error } = await supabase
    .from("proyectos")
    .update({ coordenadas: { lat, lng } })
    .eq("id", proyectoId)

  if (error) {
    console.error("actualizarCoordenadas error:", error)
    return { error: "Error al guardar las coordenadas." }
  }

  revalidatePath(`/proyectos/${proyectoId}`)
  return {}
}

export async function actualizarHoraEntrada(proyectoId: string, hora: string): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_EDITAN_CLIENTE.includes(perfil.rol)) {
    return { error: "No tienes permisos para editar la hora de entrada" }
  }

  if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
    return { error: "Hora inválida (usa HH:MM)" }
  }

  const { error } = await supabase
    .from("proyectos")
    .update({ hora_entrada_esperada: hora || null })
    .eq("id", proyectoId)

  if (error) {
    console.error("actualizarHoraEntrada error:", error)
    return { error: "Error al guardar la hora de entrada." }
  }

  revalidatePath(`/proyectos/${proyectoId}`)
  return {}
}

export async function eliminarProyecto(proyectoId: string): Promise<{ error?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  // Verificar que el proyecto pertenece a la empresa del usuario (RLS lo filtra)
  const { error } = await supabase
    .from("proyectos")
    .update({ activo: false })
    .eq("id", proyectoId)

  if (error) return { error: error.message }

  revalidatePath("/proyectos")
  return {}
}
