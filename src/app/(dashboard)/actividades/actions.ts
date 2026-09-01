"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

const ROLES_EDITAN = ["project_manager", "administrador", "dueno", "superadmin"]

async function verificarAcceso(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_EDITAN.includes(perfil.rol)) {
    return { ok: false as const, error: "No tienes permisos para editar" }
  }
  return { ok: true as const }
}

// ── Proyecto ─────────────────────────────────────────────────

export type ProyectoInfoInput = {
  nombre: string
  cliente: string | null
  cliente_email: string | null
  cliente_telefono: string | null
  ubicacion: string | null
  presupuesto_base: number
  presupuesto_venta: number
  margen_objetivo: number
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
}

export async function actualizarProyectoInfo(
  proyectoId: string,
  input: ProyectoInfoInput
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  if (!input.nombre?.trim()) return { error: "El nombre del proyecto es obligatorio" }

  const { error } = await supabase
    .from("proyectos")
    .update({
      nombre: input.nombre.trim(),
      cliente: input.cliente || null,
      cliente_email: input.cliente_email || null,
      cliente_telefono: input.cliente_telefono || null,
      ubicacion: input.ubicacion || null,
      presupuesto_base: input.presupuesto_base || 0,
      presupuesto_venta: input.presupuesto_venta || 0,
      margen_objetivo: input.margen_objetivo || 0,
      fecha_inicio_plan: input.fecha_inicio_plan || null,
      fecha_fin_plan: input.fecha_fin_plan || null,
    })
    .eq("id", proyectoId)

  if (error) {
    console.error("actualizarProyectoInfo error:", error)
    return { error: "Error al actualizar el proyecto." }
  }

  revalidatePath("/actividades")
  revalidatePath("/proyectos")
  revalidatePath(`/proyectos/${proyectoId}`)
  return {}
}

// ── Procesos ─────────────────────────────────────────────────

export async function crearProceso(
  proyectoId: string,
  codigo: string,
  nombre: string
): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  if (!nombre?.trim()) return { error: "El nombre del proceso es obligatorio" }

  const { data: existentes } = await supabase
    .from("procesos")
    .select("orden")
    .eq("proyecto_id", proyectoId)
    .order("orden", { ascending: false })
    .limit(1)

  const siguienteOrden = (existentes?.[0]?.orden ?? -1) + 1

  const { data, error } = await supabase
    .from("procesos")
    .insert({
      proyecto_id: proyectoId,
      codigo: codigo?.trim() || String(siguienteOrden + 1),
      nombre: nombre.trim(),
      orden: siguienteOrden,
    })
    .select("id")
    .single()

  if (error || !data) {
    console.error("crearProceso error:", error)
    return { error: "Error al crear el proceso." }
  }

  revalidatePath("/actividades")
  return { id: data.id }
}

export async function actualizarProceso(
  procesoId: string,
  codigo: string,
  nombre: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  if (!nombre?.trim()) return { error: "El nombre del proceso es obligatorio" }

  const { error } = await supabase
    .from("procesos")
    .update({ codigo: codigo?.trim() || "", nombre: nombre.trim() })
    .eq("id", procesoId)

  if (error) {
    console.error("actualizarProceso error:", error)
    return { error: "Error al actualizar el proceso." }
  }

  revalidatePath("/actividades")
  return {}
}

export async function eliminarProceso(procesoId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  const { count } = await supabase
    .from("actividades")
    .select("id", { count: "exact", head: true })
    .eq("proceso_id", procesoId)
    .eq("activa", true)

  if ((count ?? 0) > 0) {
    return { error: "Este proceso todavía tiene actividades. Elimínalas primero." }
  }

  const { error } = await supabase.from("procesos").delete().eq("id", procesoId)

  if (error) {
    console.error("eliminarProceso error:", error)
    return { error: "Error al eliminar el proceso." }
  }

  revalidatePath("/actividades")
  return {}
}

// ── Actividades ──────────────────────────────────────────────

export type ActividadInput = {
  codigo: string
  nombre: string
  disciplina: string | null
  costo_material: number
  costo_mano_obra: number
  cantidad_objetivo: number | null
  unidad: string | null
  duracion_plan_dias: number
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
  es_critica: boolean
}

export async function crearActividad(
  proyectoId: string,
  procesoId: string,
  input: ActividadInput
): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  if (!input.nombre?.trim()) return { error: "El nombre de la actividad es obligatorio" }

  const costoMaterial = input.costo_material || 0
  const costoManoObra = input.costo_mano_obra || 0

  const { data, error } = await supabase
    .from("actividades")
    .insert({
      proyecto_id: proyectoId,
      proceso_id: procesoId,
      codigo: input.codigo?.trim() || "",
      nombre: input.nombre.trim(),
      disciplina: input.disciplina || null,
      costo_material: costoMaterial,
      costo_mano_obra: costoManoObra,
      costo_presupuesto: costoMaterial + costoManoObra,
      cantidad_objetivo: input.cantidad_objetivo ?? null,
      unidad: input.unidad || null,
      duracion_plan_dias: Math.max(1, Math.round(input.duracion_plan_dias || 1)),
      fecha_inicio_plan: input.fecha_inicio_plan || null,
      fecha_fin_plan: input.fecha_fin_plan || null,
      es_critica: !!input.es_critica,
    })
    .select("id")
    .single()

  if (error || !data) {
    console.error("crearActividad error:", error)
    return { error: "Error al crear la actividad." }
  }

  revalidatePath("/actividades")
  return { id: data.id }
}

export async function actualizarActividad(
  actividadId: string,
  input: ActividadInput
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  if (!input.nombre?.trim()) return { error: "El nombre de la actividad es obligatorio" }

  const costoMaterial = input.costo_material || 0
  const costoManoObra = input.costo_mano_obra || 0

  const { error } = await supabase
    .from("actividades")
    .update({
      codigo: input.codigo?.trim() || "",
      nombre: input.nombre.trim(),
      disciplina: input.disciplina || null,
      costo_material: costoMaterial,
      costo_mano_obra: costoManoObra,
      costo_presupuesto: costoMaterial + costoManoObra,
      cantidad_objetivo: input.cantidad_objetivo ?? null,
      unidad: input.unidad || null,
      duracion_plan_dias: Math.max(1, Math.round(input.duracion_plan_dias || 1)),
      fecha_inicio_plan: input.fecha_inicio_plan || null,
      fecha_fin_plan: input.fecha_fin_plan || null,
      es_critica: !!input.es_critica,
    })
    .eq("id", actividadId)

  if (error) {
    console.error("actualizarActividad error:", error)
    return { error: "Error al actualizar la actividad." }
  }

  revalidatePath("/actividades")
  return {}
}

export async function eliminarActividad(actividadId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  // Baja lógica: preserva historial (reportes, costos reales, asistencia, etc.)
  // que pudieran referenciar esta actividad.
  const { error } = await supabase
    .from("actividades")
    .update({ activa: false })
    .eq("id", actividadId)

  if (error) {
    console.error("eliminarActividad error:", error)
    return { error: "Error al eliminar la actividad." }
  }

  revalidatePath("/actividades")
  return {}
}
