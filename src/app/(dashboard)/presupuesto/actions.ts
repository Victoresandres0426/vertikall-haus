"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

const ROLES_GESTION = ["project_manager", "dueno", "superadmin", "administrador"]

async function verificarAcceso(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_GESTION.includes(perfil.rol)) {
    return { ok: false as const, error: "No tienes permisos para esta acción" }
  }
  return { ok: true as const }
}

export async function crearPresupuesto(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  const proyecto_id = formData.get("proyecto_id") as string
  if (!proyecto_id) return { error: "Selecciona un proyecto" }

  const nombre_version = (formData.get("nombre_version") as string) || "Nueva versión"

  // Siguiente número de versión para ese proyecto
  const { data: existentes } = await supabase
    .from("presupuestos")
    .select("version")
    .eq("proyecto_id", proyecto_id)
    .order("version", { ascending: false })
    .limit(1)

  const siguienteVersion = (existentes?.[0]?.version ?? 0) + 1

  const { error } = await supabase.from("presupuestos").insert({
    proyecto_id,
    version: siguienteVersion,
    nombre_version: nombre_version.trim(),
    es_baseline_actual: siguienteVersion === 1,
    total: 0,
  })

  if (error) {
    console.error("crearPresupuesto error:", error)
    return { error: "Error al crear la versión de presupuesto." }
  }

  revalidatePath("/presupuesto")
  return {}
}

export async function crearPartida(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  const presupuesto_id = formData.get("presupuesto_id") as string
  const descripcion = formData.get("descripcion") as string
  const tipo_recurso = formData.get("tipo_recurso") as string
  if (!presupuesto_id) return { error: "Presupuesto no especificado" }
  if (!descripcion?.trim()) return { error: "La descripción es requerida" }
  if (!tipo_recurso) return { error: "Selecciona un tipo de recurso" }

  const cantidadRaw = formData.get("cantidad") as string
  const cantidad = cantidadRaw ? parseFloat(cantidadRaw) : null
  const precioRaw = formData.get("precio_unitario") as string
  const precio_unitario = precioRaw ? parseFloat(precioRaw) : null
  const montoRaw = formData.get("monto_total") as string
  let monto_total = montoRaw ? parseFloat(montoRaw) : 0

  // Si no se dio monto directo pero sí cantidad y precio, se calcula
  if ((!montoRaw || isNaN(monto_total)) && cantidad != null && precio_unitario != null && !isNaN(cantidad) && !isNaN(precio_unitario)) {
    monto_total = cantidad * precio_unitario
  }
  if (isNaN(monto_total)) monto_total = 0

  const { error: errPartida } = await supabase.from("partidas_presupuesto").insert({
    presupuesto_id,
    codigo: (formData.get("codigo") as string) || null,
    descripcion: descripcion.trim(),
    tipo_recurso,
    cantidad: cantidad != null && !isNaN(cantidad) ? cantidad : null,
    unidad: (formData.get("unidad") as string) || null,
    precio_unitario: precio_unitario != null && !isNaN(precio_unitario) ? precio_unitario : null,
    // monto_total se mantiene por compatibilidad; monto_presupuestado
    // es el campo que usa la interfaz para comparar vs. comprometido/ejercido.
    monto_total,
    monto_presupuestado: monto_total,
  })

  if (errPartida) {
    console.error("crearPartida error:", errPartida)
    return { error: "Error al guardar la partida." }
  }

  // Recalcular el total del presupuesto sumando sus partidas
  const { data: partidas } = await supabase
    .from("partidas_presupuesto")
    .select("monto_presupuestado")
    .eq("presupuesto_id", presupuesto_id)

  const nuevoTotal = (partidas ?? []).reduce((s, p) => s + (p.monto_presupuestado ?? 0), 0)

  await supabase.from("presupuestos").update({ total: nuevoTotal }).eq("id", presupuesto_id)

  revalidatePath("/presupuesto")
  return {}
}
