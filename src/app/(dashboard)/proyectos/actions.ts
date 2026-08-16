"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

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
