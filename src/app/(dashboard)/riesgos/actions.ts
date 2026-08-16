"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

const ROLES_GESTION = ["project_manager", "dueno", "superadmin", "administrador"]

export async function crearRiesgo(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_GESTION.includes(perfil.rol)) {
    return { error: "No tienes permisos para registrar riesgos" }
  }

  const proyecto_id = formData.get("proyecto_id") as string
  const titulo = formData.get("titulo") as string
  if (!proyecto_id) return { error: "Selecciona un proyecto" }
  if (!titulo?.trim()) return { error: "El título es requerido" }

  const probabilidadRaw = formData.get("probabilidad") as string
  const probabilidad = probabilidadRaw ? parseFloat(probabilidadRaw) : null
  const impactoCostoRaw = formData.get("impacto_costo") as string
  const impacto_costo = impactoCostoRaw ? parseFloat(impactoCostoRaw) : 0
  const impactoDiasRaw = formData.get("impacto_dias") as string
  const impacto_dias = impactoDiasRaw ? parseInt(impactoDiasRaw, 10) : 0

  const exposicion = probabilidad != null && !isNaN(probabilidad) ? probabilidad * impacto_costo : null

  const { error } = await supabase.from("riesgos").insert({
    proyecto_id,
    titulo: titulo.trim(),
    descripcion: (formData.get("descripcion") as string) || null,
    categoria: (formData.get("categoria") as string) || null,
    probabilidad: probabilidad != null && !isNaN(probabilidad) ? probabilidad : null,
    impacto_costo: isNaN(impacto_costo) ? 0 : impacto_costo,
    impacto_dias: isNaN(impacto_dias) ? 0 : impacto_dias,
    exposicion,
    mitigacion: (formData.get("mitigacion") as string) || null,
    estado: "identificado",
  })

  if (error) {
    console.error("crearRiesgo error:", error)
    return { error: "Error al guardar el riesgo. Intenta de nuevo." }
  }

  revalidatePath("/riesgos")
  return {}
}
