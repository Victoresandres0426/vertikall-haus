"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

const ROLES_GESTION = ["project_manager", "dueno", "superadmin", "administrador"]

export async function crearChangeOrder(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("id, rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_GESTION.includes(perfil.rol)) {
    return { error: "No tienes permisos para registrar change orders" }
  }

  const proyecto_id = formData.get("proyecto_id") as string
  const titulo = formData.get("titulo") as string
  if (!proyecto_id) return { error: "Selecciona un proyecto" }
  if (!titulo?.trim()) return { error: "El título es requerido" }

  const impactoCostoRaw = formData.get("impacto_costo") as string
  const impacto_costo = impactoCostoRaw ? parseFloat(impactoCostoRaw) : 0
  const impactoDiasRaw = formData.get("impacto_dias") as string
  const impacto_dias = impactoDiasRaw ? parseInt(impactoDiasRaw, 10) : 0

  const { error } = await supabase.from("change_orders").insert({
    proyecto_id,
    numero: (formData.get("numero") as string) || null,
    titulo: titulo.trim(),
    descripcion: (formData.get("descripcion") as string) || null,
    solicitado_por: (formData.get("solicitado_por") as string) || null,
    detectado_por: perfil.id,
    estado: "detectado",
    impacto_costo: isNaN(impacto_costo) ? 0 : impacto_costo,
    impacto_dias: isNaN(impacto_dias) ? 0 : impacto_dias,
  })

  if (error) {
    console.error("crearChangeOrder error:", error)
    return { error: "Error al guardar. Intenta de nuevo." }
  }

  revalidatePath("/change-orders")
  return {}
}
