"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

const ROLES_GESTION = ["project_manager", "administrador", "dueno", "superadmin"]
const ROLES_BORRAN = ["administrador", "dueno", "superadmin"]

export type SubcontratistaInput = {
  nombre_compania: string
  contacto_nombre: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  sitio_web: string | null
  especialidad: string | null
  ein: string | null
  w9_recibido: boolean
  licencia_numero: string | null
  licencia_vence: string | null
  seguro_aseguradora: string | null
  seguro_poliza: string | null
  seguro_vence: string | null
  workers_comp: boolean
  metodo_pago: string | null
  datos_pago: string | null
  calificacion: number | null
  activo: boolean
  notas: string | null
}

export type SubcontratoInput = {
  subcontratista_id: string
  proyecto_id: string
  alcance: string
  monto_contrato: number
  fecha_inicio: string | null
  fecha_fin: string | null
  estado: "borrador" | "activo" | "completado" | "cancelado"
  notas: string | null
}

async function acceso() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "No autenticado" }
  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol, empresa_id")
    .eq("id", user.id)
    .single()
  if (!perfil || !ROLES_GESTION.includes(perfil.rol)) {
    return { ok: false as const, error: "No tienes permisos para gestionar subcontratistas" }
  }
  return { ok: true as const, supabase, rol: perfil.rol as string, empresaId: perfil.empresa_id as string }
}

function limpiar(i: SubcontratistaInput): SubcontratistaInput {
  const t = (s: string | null) => (s?.trim() ? s.trim() : null)
  return {
    nombre_compania: i.nombre_compania.trim(),
    contacto_nombre: t(i.contacto_nombre),
    telefono: t(i.telefono),
    email: t(i.email),
    direccion: t(i.direccion),
    sitio_web: t(i.sitio_web),
    especialidad: t(i.especialidad),
    ein: t(i.ein),
    w9_recibido: !!i.w9_recibido,
    licencia_numero: t(i.licencia_numero),
    licencia_vence: i.licencia_vence || null,
    seguro_aseguradora: t(i.seguro_aseguradora),
    seguro_poliza: t(i.seguro_poliza),
    seguro_vence: i.seguro_vence || null,
    workers_comp: !!i.workers_comp,
    metodo_pago: t(i.metodo_pago),
    datos_pago: t(i.datos_pago),
    calificacion: i.calificacion && i.calificacion >= 1 && i.calificacion <= 5 ? Math.round(i.calificacion) : null,
    activo: !!i.activo,
    notas: t(i.notas),
  }
}

function revalidar() {
  revalidatePath("/subcontratistas")
}

export async function crearSubcontratista(input: SubcontratistaInput): Promise<{ error?: string; id?: string }> {
  const a = await acceso()
  if (!a.ok) return { error: a.error }
  if (!input.nombre_compania?.trim()) return { error: "El nombre de la compañía es obligatorio" }

  const { data, error } = await a.supabase
    .from("subcontratistas")
    .insert({ ...limpiar(input), empresa_id: a.empresaId })
    .select("id")
    .single()
  if (error || !data) {
    console.error("crearSubcontratista:", error)
    return { error: `No se pudo guardar el subcontratista.${error?.message ? ` (${error.message})` : ""}` }
  }
  revalidar()
  return { id: data.id }
}

export async function actualizarSubcontratista(id: string, input: SubcontratistaInput): Promise<{ error?: string }> {
  const a = await acceso()
  if (!a.ok) return { error: a.error }
  if (!input.nombre_compania?.trim()) return { error: "El nombre de la compañía es obligatorio" }

  const { error } = await a.supabase.from("subcontratistas").update(limpiar(input)).eq("id", id)
  if (error) {
    console.error("actualizarSubcontratista:", error)
    return { error: `No se pudo actualizar el subcontratista. (${error.message})` }
  }
  revalidar()
  return {}
}

export async function eliminarSubcontratista(id: string): Promise<{ error?: string }> {
  const a = await acceso()
  if (!a.ok) return { error: a.error }
  if (!ROLES_BORRAN.includes(a.rol)) {
    return { error: "Solo el dueño puede borrar subcontratistas. Puedes marcarlo como inactivo." }
  }
  const { error } = await a.supabase.from("subcontratistas").delete().eq("id", id)
  if (error) {
    console.error("eliminarSubcontratista:", error)
    return { error: "No se pudo borrar el subcontratista." }
  }
  revalidar()
  return {}
}

function validarContrato(i: SubcontratoInput): string | null {
  if (!i.proyecto_id) return "Elige el proyecto"
  if (!i.alcance?.trim()) return "El alcance del contrato es obligatorio"
  if (!Number.isFinite(i.monto_contrato) || i.monto_contrato < 0) return "Monto inválido"
  if (i.fecha_inicio && i.fecha_fin && i.fecha_fin < i.fecha_inicio) return "La fecha fin es anterior al inicio"
  return null
}

export async function crearSubcontrato(
  input: SubcontratoInput,
  actividadIds: string[]
): Promise<{ error?: string; id?: string }> {
  const a = await acceso()
  if (!a.ok) return { error: a.error }
  const err = validarContrato(input)
  if (err) return { error: err }

  const { data, error } = await a.supabase
    .from("subcontratos")
    .insert({
      subcontratista_id: input.subcontratista_id,
      proyecto_id: input.proyecto_id,
      alcance: input.alcance.trim(),
      monto_contrato: input.monto_contrato,
      fecha_inicio: input.fecha_inicio || null,
      fecha_fin: input.fecha_fin || null,
      estado: input.estado,
      notas: input.notas?.trim() || null,
    })
    .select("id")
    .single()
  if (error || !data) {
    console.error("crearSubcontrato:", error)
    return { error: "No se pudo crear el contrato." }
  }

  if (actividadIds.length > 0) {
    const res = await asignarActividades(a.supabase, data.id, actividadIds)
    if (res.error) {
      revalidar()
      return { id: data.id, error: res.error }
    }
  }
  revalidar()
  return { id: data.id }
}

export async function actualizarSubcontrato(
  id: string,
  input: SubcontratoInput,
  actividadIds: string[]
): Promise<{ error?: string }> {
  const a = await acceso()
  if (!a.ok) return { error: a.error }
  const err = validarContrato(input)
  if (err) return { error: err }

  const { error } = await a.supabase
    .from("subcontratos")
    .update({
      alcance: input.alcance.trim(),
      monto_contrato: input.monto_contrato,
      fecha_inicio: input.fecha_inicio || null,
      fecha_fin: input.fecha_fin || null,
      estado: input.estado,
      notas: input.notas?.trim() || null,
    })
    .eq("id", id)
  if (error) {
    console.error("actualizarSubcontrato:", error)
    return { error: "No se pudo actualizar el contrato." }
  }

  const { error: errDel } = await a.supabase.from("subcontrato_actividades").delete().eq("subcontrato_id", id)
  if (errDel) {
    console.error("actualizarSubcontrato - limpiar actividades:", errDel)
    return { error: "No se pudieron actualizar las actividades del contrato." }
  }
  if (actividadIds.length > 0) {
    const res = await asignarActividades(a.supabase, id, actividadIds)
    if (res.error) return res
  }
  revalidar()
  return {}
}

export async function eliminarSubcontrato(id: string): Promise<{ error?: string }> {
  const a = await acceso()
  if (!a.ok) return { error: a.error }
  if (!ROLES_BORRAN.includes(a.rol)) {
    return { error: "Solo el dueño puede borrar contratos. Puedes marcarlo como cancelado." }
  }
  const { error } = await a.supabase.from("subcontratos").delete().eq("id", id)
  if (error) {
    console.error("eliminarSubcontrato:", error)
    return { error: "No se pudo borrar el contrato." }
  }
  revalidar()
  return {}
}

export type TipoDocumento = "seguro" | "licencia" | "w9" | "workers_comp" | "contrato" | "otro"

// El archivo ya se subió al almacenamiento desde el navegador; aquí se registra.
export async function registrarDocumentoSubcontratista(input: {
  subcontratistaId: string
  tipo: TipoDocumento
  nombreArchivo: string
  storagePath: string
  fechaVence: string | null
  notas: string | null
}): Promise<{ error?: string; id?: string }> {
  const a = await acceso()
  if (!a.ok) return { error: a.error }

  // La ruta debe pertenecer a la empresa y al subcontratista indicados
  if (!input.storagePath.startsWith(`${a.empresaId}/${input.subcontratistaId}/`)) {
    return { error: "Ruta de archivo inválida." }
  }

  const { data: { user } } = await a.supabase.auth.getUser()
  const { data, error } = await a.supabase
    .from("subcontratista_documentos")
    .insert({
      subcontratista_id: input.subcontratistaId,
      tipo: input.tipo,
      nombre_archivo: input.nombreArchivo,
      storage_path: input.storagePath,
      fecha_vence: input.fechaVence || null,
      notas: input.notas?.trim() || null,
      subido_por: user?.id ?? null,
    })
    .select("id")
    .single()
  if (error || !data) {
    console.error("registrarDocumentoSubcontratista:", error)
    // No dejar el archivo huérfano en el almacenamiento
    await a.supabase.storage.from("subcontratistas-docs").remove([input.storagePath])
    return { error: "No se pudo registrar el documento." }
  }
  revalidar()
  return { id: data.id }
}

export async function eliminarDocumentoSubcontratista(id: string): Promise<{ error?: string }> {
  const a = await acceso()
  if (!a.ok) return { error: a.error }
  if (!ROLES_BORRAN.includes(a.rol)) return { error: "Solo el dueño puede borrar documentos." }

  const { data: doc } = await a.supabase
    .from("subcontratista_documentos")
    .select("storage_path")
    .eq("id", id)
    .single()
  if (!doc) return { error: "No se encontró el documento." }

  const { error } = await a.supabase.from("subcontratista_documentos").delete().eq("id", id)
  if (error) {
    console.error("eliminarDocumentoSubcontratista:", error)
    return { error: "No se pudo borrar el documento." }
  }
  await a.supabase.storage.from("subcontratistas-docs").remove([doc.storage_path])
  revalidar()
  return {}
}

async function asignarActividades(
  supabase: Awaited<ReturnType<typeof createClient>>,
  subcontratoId: string,
  actividadIds: string[]
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("subcontrato_actividades")
    .insert(actividadIds.map((actividad_id) => ({ subcontrato_id: subcontratoId, actividad_id })))
  if (error) {
    console.error("asignarActividades:", error)
    return { error: "Alguna actividad ya está en otro contrato o no pertenece al proyecto." }
  }
  return {}
}
