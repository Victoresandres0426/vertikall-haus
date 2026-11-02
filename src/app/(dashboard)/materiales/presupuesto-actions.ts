"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { evaluarAlertasMateriales } from "@/lib/materiales/alertas"

const ROLES_GESTION = ["project_manager", "administrador", "dueno", "superadmin"]

async function verificarAcceso(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "No autenticado" }
  const { data: perfil } = await supabase.from("perfiles_usuario").select("rol").eq("id", user.id).single()
  if (!perfil || !ROLES_GESTION.includes(perfil.rol)) {
    return { ok: false as const, error: "No tienes permisos para esta acción" }
  }
  return { ok: true as const }
}

function revalidar() {
  revalidatePath("/materiales")
  revalidatePath("/alertas")
  revalidatePath("/dashboard")
}

// Liga (o quita) el material presupuestado de una línea de gasto. Al hacerlo
// manualmente queda confirmada (deja de ser "sugerida") y cuenta en la comparación.
export async function asignarMaterialLinea(
  lineaId: string,
  materialId: string | null
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  const { data: linea, error: errLinea } = await supabase
    .from("costos_reales")
    .select("proyecto_id")
    .eq("id", lineaId)
    .single()
  if (errLinea || !linea) return { error: "No se encontró la línea." }

  const { error } = await supabase
    .from("costos_reales")
    .update({ material_presupuestado_id: materialId, material_sugerido: false })
    .eq("id", lineaId)
  if (error) {
    console.error("asignarMaterialLinea:", error)
    return { error: "No se pudo ligar el material." }
  }

  await evaluarAlertasMateriales(supabase, linea.proyecto_id)
  revalidar()
  return {}
}

// Confirma todas las sugerencias pendientes de una factura (o de todo el proyecto).
export async function confirmarSugerencias(
  proyectoId: string,
  facturaId?: string
): Promise<{ error?: string; confirmadas?: number }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  let q = supabase
    .from("costos_reales")
    .update({ material_sugerido: false })
    .eq("proyecto_id", proyectoId)
    .eq("material_sugerido", true)
    .not("material_presupuestado_id", "is", null)
  if (facturaId) q = q.eq("factura_id", facturaId)

  const { data, error } = await q.select("id")
  if (error) {
    console.error("confirmarSugerencias:", error)
    return { error: "No se pudieron confirmar las sugerencias." }
  }

  await evaluarAlertasMateriales(supabase, proyectoId)
  revalidar()
  return { confirmadas: data?.length ?? 0 }
}

// Descarta las sugerencias pendientes (quita el material ligado sin confirmar).
export async function descartarSugerencias(
  proyectoId: string,
  facturaId?: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  let q = supabase
    .from("costos_reales")
    .update({ material_presupuestado_id: null, material_sugerido: false })
    .eq("proyecto_id", proyectoId)
    .eq("material_sugerido", true)
  if (facturaId) q = q.eq("factura_id", facturaId)

  const { error } = await q
  if (error) {
    console.error("descartarSugerencias:", error)
    return { error: "No se pudieron descartar las sugerencias." }
  }
  revalidar()
  return {}
}

// Días de anticipación de compra de un material (por defecto 7).
export async function actualizarDiasAnticipacion(
  materialId: string,
  dias: number
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  if (!Number.isFinite(dias) || dias < 0 || dias > 365) return { error: "Días inválidos (0 a 365)." }

  const { data: material, error } = await supabase
    .from("materiales_presupuestados")
    .update({ dias_anticipacion: Math.round(dias) })
    .eq("id", materialId)
    .select("proyecto_id")
    .single()
  if (error || !material) {
    console.error("actualizarDiasAnticipacion:", error)
    return { error: "No se pudo actualizar." }
  }

  await evaluarAlertasMateriales(supabase, material.proyecto_id)
  revalidar()
  return {}
}

// Aplica los mismos días de anticipación a todos los materiales de una división.
export async function actualizarDiasAnticipacionDivision(
  proyectoId: string,
  procesoId: string,
  dias: number
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  if (!Number.isFinite(dias) || dias < 0 || dias > 365) return { error: "Días inválidos (0 a 365)." }

  const { error } = await supabase
    .from("materiales_presupuestados")
    .update({ dias_anticipacion: Math.round(dias) })
    .eq("proyecto_id", proyectoId)
    .eq("proceso_id", procesoId)
  if (error) {
    console.error("actualizarDiasAnticipacionDivision:", error)
    return { error: "No se pudo actualizar." }
  }

  await evaluarAlertasMateriales(supabase, proyectoId)
  revalidar()
  return {}
}
