"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { extraerArchivos, type DatosProyecto } from "@/lib/salva/archivos"

// Borra definitivamente un proyecto YA salvado y terminado. Las reglas
// (rol, estado 'completado', salva descargada) las vuelve a validar la
// función SQL borrar_proyecto_definitivo (migración 159), no solo este código.
export async function eliminarProyectoDefinitivo(
  proyectoId: string,
  confirmacionNombre: string
): Promise<{ error?: string; archivosNoBorrados?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: proyecto } = await supabase
    .from("proyectos")
    .select("nombre")
    .eq("id", proyectoId)
    .maybeSingle()
  if (!proyecto) return { error: "Proyecto no encontrado" }
  if (confirmacionNombre.trim() !== (proyecto.nombre as string).trim()) {
    return { error: "El nombre escrito no coincide con el del proyecto" }
  }

  // Rutas de archivos, ANTES de borrar las filas que las referencian
  let archivos: { bucket: string; path: string }[] = []
  try {
    const { data } = await supabase.rpc("exportar_proyecto", { p_proyecto_id: proyectoId })
    archivos = extraerArchivos((data ?? {}) as DatosProyecto)
  } catch {
    archivos = []
  }

  const { error } = await supabase.rpc("borrar_proyecto_definitivo", { p_proyecto_id: proyectoId })
  if (error) {
    const m = error.message ?? ""
    if (m.includes("sin_permisos")) return { error: "Solo el dueño puede borrar un proyecto" }
    if (m.includes("proyecto_no_terminado")) return { error: "El proyecto debe estar en estado Completado" }
    if (m.includes("sin_salva")) return { error: "Primero descarga la salva del proyecto" }
    return { error: "No se pudo borrar el proyecto: " + m }
  }

  // Limpieza de Storage (mejor esfuerzo: si falla algo, el proyecto ya no existe)
  let noBorrados = 0
  const porBucket = new Map<string, string[]>()
  for (const a of archivos) porBucket.set(a.bucket, [...(porBucket.get(a.bucket) ?? []), a.path])
  for (const [bucket, rutas] of porBucket) {
    for (let i = 0; i < rutas.length; i += 100) {
      const lote = rutas.slice(i, i + 100)
      const { error: errSt } = await supabase.storage.from(bucket).remove(lote)
      if (errSt) noBorrados += lote.length
    }
  }

  revalidatePath("/proyectos")
  revalidatePath("/dashboard")
  return { archivosNoBorrados: noBorrados }
}
