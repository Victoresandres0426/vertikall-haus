"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

const ROLES_EDITAN_CLIENTE = ["project_manager", "administrador", "dueno", "superadmin"]

export async function actualizarClienteEmail(proyectoId: string, email: string): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_EDITAN_CLIENTE.includes(perfil.rol)) {
    return { error: "No tienes permisos para editar el contacto del cliente" }
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Correo inválido" }
  }

  const { error } = await supabase
    .from("proyectos")
    .update({ cliente_email: email || null })
    .eq("id", proyectoId)

  if (error) {
    console.error("actualizarClienteEmail error:", error)
    return { error: "Error al guardar el correo." }
  }

  revalidatePath(`/proyectos/${proyectoId}`)
  return {}
}

export async function actualizarCoordenadas(proyectoId: string, lat: number, lng: number): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_EDITAN_CLIENTE.includes(perfil.rol)) {
    return { error: "No tienes permisos para editar la ubicación" }
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { error: "Coordenadas fuera de rango" }
  }

  const { error } = await supabase
    .from("proyectos")
    .update({ coordenadas: { lat, lng } })
    .eq("id", proyectoId)

  if (error) {
    console.error("actualizarCoordenadas error:", error)
    return { error: "Error al guardar las coordenadas." }
  }

  revalidatePath(`/proyectos/${proyectoId}`)
  return {}
}

export async function actualizarClienteTelefono(proyectoId: string, telefono: string): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_EDITAN_CLIENTE.includes(perfil.rol)) {
    return { error: "No tienes permisos para editar el contacto del cliente" }
  }

  const { error } = await supabase
    .from("proyectos")
    .update({ cliente_telefono: telefono || null })
    .eq("id", proyectoId)

  if (error) {
    console.error("actualizarClienteTelefono error:", error)
    return { error: "Error al guardar el teléfono." }
  }

  revalidatePath(`/proyectos/${proyectoId}`)
  return {}
}

export async function actualizarHoraEntrada(proyectoId: string, hora: string): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_EDITAN_CLIENTE.includes(perfil.rol)) {
    return { error: "No tienes permisos para editar la hora de entrada" }
  }

  if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
    return { error: "Hora inválida (usa HH:MM)" }
  }

  const { error } = await supabase
    .from("proyectos")
    .update({ hora_entrada_esperada: hora || null })
    .eq("id", proyectoId)

  if (error) {
    console.error("actualizarHoraEntrada error:", error)
    return { error: "Error al guardar la hora de entrada." }
  }

  revalidatePath(`/proyectos/${proyectoId}`)
  return {}
}

export async function crearProyecto(formData: FormData): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol, empresa_id")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_EDITAN_CLIENTE.includes(perfil.rol)) {
    return { error: "No tienes permisos para crear proyectos" }
  }

  const codigo = (formData.get("codigo") as string)?.trim()
  const nombre = (formData.get("nombre") as string)?.trim()
  const fecha_inicio_plan = (formData.get("fecha_inicio_plan") as string) || ""
  const fecha_fin_plan = (formData.get("fecha_fin_plan") as string) || ""

  if (!codigo) return { error: "El código es obligatorio" }
  if (!nombre) return { error: "El nombre es obligatorio" }
  if (!fecha_inicio_plan || !fecha_fin_plan) {
    return { error: "Las fechas de inicio y fin son obligatorias" }
  }
  if (fecha_fin_plan < fecha_inicio_plan) {
    return { error: "La fecha de fin no puede ser anterior a la de inicio" }
  }

  const presupuesto_venta = parseFloat(formData.get("presupuesto_venta") as string)
  const presupuesto_base = parseFloat(formData.get("presupuesto_base") as string)
  const margen_objetivo = parseFloat(formData.get("margen_objetivo") as string)

  const cliente_email = (formData.get("cliente_email") as string)?.trim() || null
  if (cliente_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente_email)) {
    return { error: "Correo del cliente inválido" }
  }

  const cliente_telefono = (formData.get("cliente_telefono") as string)?.trim() || null

  const latStr = (formData.get("lat") as string)?.trim()
  const lngStr = (formData.get("lng") as string)?.trim()
  let coordenadas: { lat: number; lng: number } | null = null
  if (latStr && lngStr) {
    const lat = parseFloat(latStr)
    const lng = parseFloat(lngStr)
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { error: "Coordenadas GPS fuera de rango" }
    }
    coordenadas = { lat, lng }
  }

  const hora_entrada_esperada = (formData.get("hora_entrada_esperada") as string) || null
  if (hora_entrada_esperada && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora_entrada_esperada)) {
    return { error: "Hora de entrada esperada inválida" }
  }

  const { data, error } = await supabase
    .from("proyectos")
    .insert({
      empresa_id: perfil.empresa_id,
      codigo,
      nombre,
      cliente: (formData.get("cliente") as string)?.trim() || null,
      cliente_email,
      cliente_telefono,
      coordenadas,
      hora_entrada_esperada,
      ubicacion: (formData.get("ubicacion") as string)?.trim() || null,
      fecha_inicio_plan,
      fecha_fin_plan,
      presupuesto_venta: isNaN(presupuesto_venta) ? 0 : presupuesto_venta,
      presupuesto_base: isNaN(presupuesto_base) ? 0 : presupuesto_base,
      margen_objetivo: isNaN(margen_objetivo) ? 0 : margen_objetivo,
      estado: "activo",
      activo: true,
    })
    .select("id")
    .single()

  if (error) {
    console.error("crearProyecto error:", error)
    if (error.code === "23505") return { error: "Ya existe un proyecto con ese código" }
    return { error: "Error al crear el proyecto." }
  }

  revalidatePath("/proyectos")
  return { id: data.id }
}

export async function registrarArchivoProyecto(
  proyectoId: string,
  categoria: string,
  storagePath: string,
  nombreArchivo: string,
  tamanoBytes: number
): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const categoriasValidas = ["planos", "fotos", "contratos", "otros"]
  if (!categoriasValidas.includes(categoria)) return { error: "Categoría inválida" }

  const { data, error } = await supabase
    .from("proyecto_archivos")
    .insert({
      proyecto_id: proyectoId,
      categoria,
      storage_path: storagePath,
      nombre_archivo: nombreArchivo,
      tamano_bytes: tamanoBytes,
      subido_por: user.id,
    })
    .select("id")
    .single()

  if (error) {
    console.error("registrarArchivoProyecto error:", error)
    return { error: "Error al guardar el archivo." }
  }

  revalidatePath(`/proyectos/${proyectoId}`)
  return { id: data.id }
}

export async function eliminarArchivoProyecto(
  archivoId: string,
  storagePath: string,
  proyectoId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { error: storageError } = await supabase.storage.from("proyecto-archivos").remove([storagePath])
  if (storageError) {
    console.error("eliminarArchivoProyecto storage error:", storageError)
    return { error: "Error al borrar el archivo." }
  }

  const { error } = await supabase.from("proyecto_archivos").delete().eq("id", archivoId)
  if (error) {
    console.error("eliminarArchivoProyecto db error:", error)
    return { error: "Error al borrar el registro del archivo." }
  }

  revalidatePath(`/proyectos/${proyectoId}`)
  return {}
}

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
