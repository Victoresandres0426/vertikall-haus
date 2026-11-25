"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

const ROLES_PORTAL = ["cliente", "colaborador_externo", "subcontratista"]

// Inicia/cambia la vista previa ("Ver como") del dueño. Devuelve a dónde ir.
export async function iniciarVistaPrevia(
  rol: string,
  proyectoId: string | null
): Promise<{ error?: string; destino?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc("iniciar_vista_previa", {
    p_rol: rol,
    p_proyecto_id: proyectoId,
  })
  if (error) {
    if (error.message?.includes("sin_permisos")) return { error: "Solo el dueño puede usar “Ver como”" }
    return { error: "No se pudo iniciar la vista previa: " + error.message }
  }
  revalidatePath("/", "layout")
  return { destino: ROLES_PORTAL.includes(rol) ? "/portal-cliente" : "/dashboard" }
}

// Vuelve a la vista normal de dueño.
export async function terminarVistaPrevia(): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc("terminar_vista_previa")
  if (error) return { error: error.message }
  revalidatePath("/", "layout")
  return {}
}
