"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { TrabajadorFromDB } from "./personal-client"

export async function crearTrabajador(
  formData: FormData
): Promise<{ error?: string; trabajador?: TrabajadorFromDB }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autorizado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol, empresa_id")
    .eq("id", user.id)
    .single()

  if (!perfil) return { error: "Perfil no encontrado" }

  const rolesPermitidos = ["dueno", "superadmin", "administrador", "project_manager"]
  if (!rolesPermitidos.includes(perfil.rol)) {
    return { error: "No tienes permisos para agregar trabajadores" }
  }

  const nombre_completo = formData.get("nombre_completo") as string
  if (!nombre_completo?.trim()) return { error: "El nombre es requerido" }

  const tarifa_raw = formData.get("tarifa_diaria") as string
  const tarifa_diaria = tarifa_raw ? parseFloat(tarifa_raw) : null

  const { data, error } = await supabase
    .from("trabajadores")
    .insert({
      empresa_id: perfil.empresa_id,
      nombre_completo: nombre_completo.trim(),
      codigo: (formData.get("codigo") as string) || null,
      especialidad: (formData.get("especialidad") as string) || null,
      rol_obra: (formData.get("rol_obra") as string) || null,
      nivel_experiencia: (formData.get("nivel_experiencia") as string) || null,
      tarifa_diaria: isNaN(tarifa_diaria!) ? null : tarifa_diaria,
      fecha_ingreso: (formData.get("fecha_ingreso") as string) || null,
      notas: (formData.get("notas") as string) || null,
      activo: true,
      moneda: "USD",
      telefono_personal: (formData.get("telefono_personal") as string) || null,
      direccion: (formData.get("direccion") as string) || null,
      contacto_emergencia_nombre: (formData.get("contacto_emergencia_nombre") as string) || null,
      contacto_emergencia_telefono: (formData.get("contacto_emergencia_telefono") as string) || null,
    })
    .select("id, nombre_completo, codigo, especialidad, rol_obra, nivel_experiencia, tarifa_diaria, moneda, activo, fecha_ingreso, notas, usuario_id, telefono_personal, direccion, contacto_emergencia_nombre, contacto_emergencia_telefono")
    .single()

  if (error) {
    console.error("crearTrabajador error:", error)
    return { error: "Error al guardar. Intenta de nuevo." }
  }

  revalidatePath("/personal")
  return { trabajador: data }
}

export async function actualizarTrabajador(
  trabajadorId: string,
  formData: FormData
): Promise<{ error?: string; trabajador?: TrabajadorFromDB }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autorizado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol, empresa_id")
    .eq("id", user.id)
    .single()

  if (!perfil) return { error: "Perfil no encontrado" }

  const rolesPermitidos = ["dueno", "superadmin", "administrador", "project_manager"]
  if (!rolesPermitidos.includes(perfil.rol)) {
    return { error: "No tienes permisos para editar trabajadores" }
  }

  const nombre_completo = formData.get("nombre_completo") as string
  if (!nombre_completo?.trim()) return { error: "El nombre es requerido" }

  const tarifa_raw = formData.get("tarifa_diaria") as string
  const tarifa_diaria = tarifa_raw ? parseFloat(tarifa_raw) : null

  const { data, error } = await supabase
    .from("trabajadores")
    .update({
      nombre_completo: nombre_completo.trim(),
      codigo: (formData.get("codigo") as string) || null,
      especialidad: (formData.get("especialidad") as string) || null,
      rol_obra: (formData.get("rol_obra") as string) || null,
      nivel_experiencia: (formData.get("nivel_experiencia") as string) || null,
      tarifa_diaria: tarifa_diaria === null || isNaN(tarifa_diaria) ? null : tarifa_diaria,
      fecha_ingreso: (formData.get("fecha_ingreso") as string) || null,
      notas: (formData.get("notas") as string) || null,
      telefono_personal: (formData.get("telefono_personal") as string) || null,
      direccion: (formData.get("direccion") as string) || null,
      contacto_emergencia_nombre: (formData.get("contacto_emergencia_nombre") as string) || null,
      contacto_emergencia_telefono: (formData.get("contacto_emergencia_telefono") as string) || null,
    })
    .eq("id", trabajadorId)
    .select("id, nombre_completo, codigo, especialidad, rol_obra, nivel_experiencia, tarifa_diaria, moneda, activo, fecha_ingreso, notas, usuario_id, telefono_personal, direccion, contacto_emergencia_nombre, contacto_emergencia_telefono")
    .single()

  if (error) {
    console.error("actualizarTrabajador error:", error)
    return { error: "Error al guardar. Intenta de nuevo." }
  }

  revalidatePath("/personal")
  return { trabajador: data }
}

const ROLES_TARIFAS = ["dueno", "superadmin", "administrador", "project_manager"]

// Tarifa específica de un trabajador para un rol/tipo de trabajo -- se usa
// cuando la misma persona gana distinto según la actividad que hace (ver
// migración 049/050). Si ya existe una tarifa para ese (trabajador, rol),
// se actualiza en vez de duplicarla.
export async function guardarTarifaTrabajo(
  trabajadorId: string,
  rolObra: string,
  tarifaHora: number
): Promise<{ error?: string; tarifa?: { id: string; rol_obra: string; tarifa_hora: number | null } }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autorizado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_TARIFAS.includes(perfil.rol)) {
    return { error: "No tienes permisos para editar tarifas" }
  }

  if (!rolObra?.trim()) return { error: "Escribe el rol/tipo de trabajo" }
  if (Number.isNaN(tarifaHora) || tarifaHora < 0) return { error: "Tarifa inválida" }

  const { data, error } = await supabase
    .from("tarifas_trabajo")
    .upsert(
      { trabajador_id: trabajadorId, rol_obra: rolObra.trim(), tarifa_hora: tarifaHora, activo: true },
      { onConflict: "trabajador_id,rol_obra" }
    )
    .select("id, rol_obra, tarifa_hora")
    .single()

  if (error) return { error: "Error al guardar la tarifa" }

  revalidatePath("/personal")
  return { tarifa: data }
}

export async function eliminarTarifaTrabajo(tarifaId: string): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autorizado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_TARIFAS.includes(perfil.rol)) {
    return { error: "No tienes permisos para eliminar tarifas" }
  }

  const { error } = await supabase.from("tarifas_trabajo").delete().eq("id", tarifaId)
  if (error) return { error: "Error al eliminar la tarifa" }

  revalidatePath("/personal")
  return {}
}
