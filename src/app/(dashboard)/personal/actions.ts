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
      moneda: "MXN",
    })
    .select("id, nombre_completo, codigo, especialidad, rol_obra, nivel_experiencia, tarifa_diaria, moneda, activo, fecha_ingreso, notas, usuario_id")
    .single()

  if (error) {
    console.error("crearTrabajador error:", error)
    return { error: "Error al guardar. Intenta de nuevo." }
  }

  revalidatePath("/personal")
  return { trabajador: data }
}
