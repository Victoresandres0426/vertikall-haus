"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

const ROLES_GESTION = ["project_manager", "administrador", "dueno", "superadmin"]

async function verificarAcceso(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_GESTION.includes(perfil.rol)) {
    return { ok: false as const, error: "No tienes permisos para registrar gastos" }
  }
  return { ok: true as const, userId: user.id }
}

export type LineaGastoInput = {
  actividadId: string | null
  tipoRecurso: "material" | "equipo" | "subcontrato" | "indirecto"
  descripcion: string
  unidad: string | null
  cantidad: number
  precioUnitario: number
  tax: number
}

export type FacturaGastoInput = {
  proyectoId: string
  fecha: string
  lugar: string
  referencia: string | null
  fotoReferencia: string | null
  lineas: LineaGastoInput[]
}

// Registra una factura/recibo completo -- crea la cabecera (facturas_gasto)
// y una fila en costos_reales por cada línea, cada una ya asignada a su
// actividad. costos_reales es la misma tabla que usa la mano de obra
// (migración 050) y ya está conectada por trigger a actividades.costo_real
// (migración 057) -- no hace falta actualizar nada más a mano, el costo
// real de cada actividad se recalcula solo.
export async function crearFacturaGasto(input: FacturaGastoInput): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  if (!input.fecha) return { error: "La fecha es obligatoria" }
  if (!input.lugar?.trim()) return { error: "El lugar de compra es obligatorio" }
  if (input.lineas.length === 0) return { error: "Agrega al menos un artículo o servicio" }

  for (const l of input.lineas) {
    if (!l.descripcion?.trim()) return { error: "Cada línea necesita una descripción" }
    if (!l.actividadId) return { error: "Cada línea debe asignarse a una actividad" }
  }

  const subtotal = input.lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0)
  const taxTotal = input.lineas.reduce((s, l) => s + (l.tax || 0), 0)
  const total = subtotal + taxTotal

  const { data: factura, error: errFactura } = await supabase
    .from("facturas_gasto")
    .insert({
      proyecto_id: input.proyectoId,
      fecha: input.fecha,
      lugar: input.lugar.trim(),
      referencia: input.referencia?.trim() || null,
      foto_referencia: input.fotoReferencia?.trim() || null,
      subtotal,
      tax_total: taxTotal,
      total,
      creado_por: acceso.userId,
    })
    .select("id")
    .single()

  if (errFactura || !factura) {
    console.error("crearFacturaGasto - factura:", errFactura)
    return { error: "No se pudo guardar la factura." }
  }

  const { error: errLineas } = await supabase.from("costos_reales").insert(
    input.lineas.map((l) => ({
      proyecto_id: input.proyectoId,
      actividad_id: l.actividadId,
      tipo_recurso: l.tipoRecurso,
      descripcion: l.descripcion.trim(),
      fecha: input.fecha,
      monto: l.cantidad * l.precioUnitario + (l.tax || 0),
      referencia: input.referencia?.trim() || null,
      unidad: l.unidad?.trim() || null,
      cantidad: l.cantidad,
      precio_unitario: l.precioUnitario,
      tax: l.tax || 0,
      factura_id: factura.id,
      aprobado: true,
    }))
  )

  if (errLineas) {
    console.error("crearFacturaGasto - lineas:", errLineas)
    // La factura ya quedó guardada -- se borra para no dejar una cabecera
    // huérfana sin ninguna línea (mejor que el usuario reintente limpio).
    await supabase.from("facturas_gasto").delete().eq("id", factura.id)
    return { error: "No se pudieron guardar los artículos de la factura." }
  }

  revalidatePath("/materiales")
  revalidatePath("/actividades")
  revalidatePath("/presupuesto")
  revalidatePath("/dashboard")
  revalidatePath("/proyectos")
  revalidatePath("/alertas")

  return { id: factura.id }
}

export async function eliminarFacturaGasto(facturaId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  // ON DELETE SET NULL en costos_reales.factura_id -- borrar la factura no
  // borra los costos reales ya contados en cada actividad, solo desvincula
  // la referencia a la factura. Para quitar también el costo hay que borrar
  // las líneas primero.
  const { error: errLineas } = await supabase.from("costos_reales").delete().eq("factura_id", facturaId)
  if (errLineas) {
    console.error("eliminarFacturaGasto - lineas:", errLineas)
    return { error: "No se pudieron borrar los artículos de la factura." }
  }

  const { error } = await supabase.from("facturas_gasto").delete().eq("id", facturaId)
  if (error) {
    console.error("eliminarFacturaGasto:", error)
    return { error: "No se pudo borrar la factura." }
  }

  revalidatePath("/materiales")
  revalidatePath("/actividades")
  revalidatePath("/presupuesto")
  revalidatePath("/dashboard")
  revalidatePath("/proyectos")
  revalidatePath("/alertas")

  return {}
}
