"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

const ROLES_GESTION = ["project_manager", "dueno", "superadmin", "administrador"]

export async function crearMaterial(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol, empresa_id")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_GESTION.includes(perfil.rol)) {
    return { error: "No tienes permisos para agregar materiales" }
  }

  const nombre = formData.get("nombre") as string
  const unidad = formData.get("unidad") as string
  if (!nombre?.trim()) return { error: "El nombre es requerido" }
  if (!unidad?.trim()) return { error: "La unidad es requerida" }

  const precioRaw = formData.get("precio_unitario") as string
  const precio_unitario = precioRaw ? parseFloat(precioRaw) : null
  const stockActualRaw = formData.get("stock_actual") as string
  const stock_actual = stockActualRaw ? parseFloat(stockActualRaw) : null
  const stockMinimoRaw = formData.get("stock_minimo") as string
  const stock_minimo = stockMinimoRaw ? parseFloat(stockMinimoRaw) : null

  const { error } = await supabase.from("materiales_catalogo").insert({
    empresa_id: perfil.empresa_id,
    codigo: (formData.get("codigo") as string) || null,
    nombre: nombre.trim(),
    descripcion: (formData.get("descripcion") as string) || null,
    unidad: unidad.trim(),
    categoria: (formData.get("categoria") as string) || null,
    precio_unitario: precio_unitario != null && !isNaN(precio_unitario) ? precio_unitario : null,
    stock_actual: stock_actual != null && !isNaN(stock_actual) ? stock_actual : null,
    stock_minimo: stock_minimo != null && !isNaN(stock_minimo) ? stock_minimo : null,
    activo: true,
  })

  if (error) {
    console.error("crearMaterial error:", error)
    return { error: "Error al guardar el material. Intenta de nuevo." }
  }

  revalidatePath("/materiales")
  return {}
}
