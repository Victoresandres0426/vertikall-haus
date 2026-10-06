"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

const ROLES_GESTION = ["project_manager", "dueno", "superadmin", "administrador"]

type RenglonInput = {
  proceso_id: string
  nombre: string
  descripcion?: string | null
  costo_material: number
  costo_mano_obra: number
  duracion_dias: number // acepta decimales -- ver comentario en migración 132
  cantidad_objetivo?: number | null // cantidad real de obra (SF, unidad, ml...) -- migración 135
  unidad?: string | null
}

// Los renglones viajan como JSON en un campo oculto del formulario
// (formData no soporta arrays de objetos directamente). Son el
// desglose interno -- nunca se le muestra al cliente -- de qué
// actividades/divisiones cubre el CO y cuánto de material/mano de
// obra cada una. Si vienen vacíos, el CO se sigue creando igual (modo
// "monto global" de siempre) y decidir_change_order() usará el
// comportamiento legacy al aprobarse.
function parseRenglones(formData: FormData): RenglonInput[] {
  const raw = formData.get("renglones") as string | null
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((r) => r && typeof r === "object" && r.proceso_id && r.nombre?.trim())
      .map((r) => ({
        proceso_id: String(r.proceso_id),
        nombre: String(r.nombre).trim(),
        descripcion: r.descripcion ? String(r.descripcion).trim() : null,
        costo_material: Number(r.costo_material) || 0,
        costo_mano_obra: Number(r.costo_mano_obra) || 0,
        duracion_dias: Math.max(0.01, Number(r.duracion_dias) || 1),
        cantidad_objetivo: r.cantidad_objetivo !== undefined && r.cantidad_objetivo !== null && r.cantidad_objetivo !== ""
          ? Number(r.cantidad_objetivo) || null
          : null,
        unidad: r.unidad ? String(r.unidad).trim() : null,
      }))
  } catch {
    return []
  }
}

async function guardarRenglones(
  supabase: Awaited<ReturnType<typeof createClient>>,
  changeOrderId: string,
  renglones: RenglonInput[]
) {
  // Reemplaza el set completo -- más simple y seguro que hacer diff,
  // y el volumen por CO es mínimo (unas pocas filas).
  await supabase.from("change_order_renglones").delete().eq("change_order_id", changeOrderId)
  if (renglones.length === 0) return
  const { error } = await supabase.from("change_order_renglones").insert(
    renglones.map((r, i) => ({
      change_order_id: changeOrderId,
      proceso_id: r.proceso_id,
      nombre: r.nombre,
      descripcion: r.descripcion,
      costo_material: r.costo_material,
      costo_mano_obra: r.costo_mano_obra,
      duracion_dias: r.duracion_dias,
      cantidad_objetivo: r.cantidad_objetivo ?? null,
      unidad: r.unidad ?? null,
      orden: i + 1,
    }))
  )
  if (error) console.error("guardarRenglones error:", error)
}

export async function crearChangeOrder(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("id, rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_GESTION.includes(perfil.rol)) {
    return { error: "No tienes permisos para registrar change orders" }
  }

  const proyecto_id = formData.get("proyecto_id") as string
  const titulo = formData.get("titulo") as string
  if (!proyecto_id) return { error: "Selecciona un proyecto" }
  if (!titulo?.trim()) return { error: "El título es requerido" }

  // El costo directo (material + mano de obra) lo captura el usuario;
  // el margen de Utilidad+OH se calcula aquí en el servidor a partir del
  // % configurado en el proyecto (migración 126) -- no se confía en un
  // total que venga ya calculado del cliente, para que nadie pueda
  // mandar un impacto_costo manipulado que no cuadre con el % pactado.
  const costoDirectoRaw = formData.get("costo_directo") as string
  const costo_directo = costoDirectoRaw ? parseFloat(costoDirectoRaw) : 0

  const { data: proyecto } = await supabase
    .from("proyectos")
    .select("margen_co_pct")
    .eq("id", proyecto_id)
    .single()

  const margen_pct_aplicado = proyecto?.margen_co_pct ?? 0
  const costo_margen = isNaN(costo_directo) ? 0 : margen_pct_aplicado >= 100 ? 0 : Math.round((costo_directo / (1 - margen_pct_aplicado / 100) - costo_directo) * 100) / 100
  const impacto_costo = (isNaN(costo_directo) ? 0 : costo_directo) + costo_margen

  const impactoDiasRaw = formData.get("impacto_dias") as string
  const impacto_dias = impactoDiasRaw ? parseInt(impactoDiasRaw, 10) : 0

  const renglones = parseRenglones(formData)
  if (renglones.length > 0) {
    const sumaRenglones = renglones.reduce((s, r) => s + r.costo_material + r.costo_mano_obra, 0)
    if (Math.abs(sumaRenglones - (isNaN(costo_directo) ? 0 : costo_directo)) > 0.01) {
      return { error: `El desglose por actividad (${sumaRenglones.toFixed(2)}) no coincide con el costo directo (${(isNaN(costo_directo) ? 0 : costo_directo).toFixed(2)}). Ajusta uno de los dos.` }
    }
  }

  const { data: nuevoCO, error } = await supabase.from("change_orders").insert({
    proyecto_id,
    numero: (formData.get("numero") as string) || null,
    titulo: titulo.trim(),
    descripcion: (formData.get("descripcion") as string) || null,
    solicitado_por: (formData.get("solicitado_por") as string) || null,
    detectado_por: perfil.id,
    estado: "detectado",
    costo_directo: isNaN(costo_directo) ? 0 : costo_directo,
    margen_pct_aplicado,
    costo_margen,
    impacto_costo,
    impacto_dias: isNaN(impacto_dias) ? 0 : impacto_dias,
  }).select("id").single()

  if (error || !nuevoCO) {
    console.error("crearChangeOrder error:", error)
    return { error: "Error al guardar. Intenta de nuevo." }
  }

  await guardarRenglones(supabase, nuevoCO.id, renglones)

  revalidatePath("/change-orders")
  return {}
}

async function verificarPermisoGestion(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" } as const

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("id, rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_GESTION.includes(perfil.rol)) {
    return { error: "No tienes permisos para esta acción" } as const
  }
  return { perfil } as const
}

// modificar: solo mientras el CO sigue siendo borrador interno
// (detectado o en_estimacion) -- una vez enviado al cliente ya no se
// puede tocar, igual que una factura enviada.
export async function actualizarChangeOrder(id: string, formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const chk = await verificarPermisoGestion(supabase)
  if ("error" in chk) return { error: chk.error }

  const titulo = formData.get("titulo") as string
  if (!titulo?.trim()) return { error: "El título es requerido" }

  const { data: co } = await supabase
    .from("change_orders")
    .select("id, proyecto_id, estado")
    .eq("id", id)
    .single()

  if (!co) return { error: "Change Order no encontrado" }
  if (!["detectado", "en_estimacion"].includes(co.estado)) {
    return { error: "Este Change Order ya fue enviado al cliente y no se puede modificar" }
  }

  const costoDirectoRaw = formData.get("costo_directo") as string
  const costo_directo = costoDirectoRaw ? parseFloat(costoDirectoRaw) : 0

  const { data: proyecto } = await supabase
    .from("proyectos")
    .select("margen_co_pct")
    .eq("id", co.proyecto_id)
    .single()

  const margen_pct_aplicado = proyecto?.margen_co_pct ?? 0
  const costo_margen = isNaN(costo_directo) ? 0 : margen_pct_aplicado >= 100 ? 0 : Math.round((costo_directo / (1 - margen_pct_aplicado / 100) - costo_directo) * 100) / 100
  const impacto_costo = (isNaN(costo_directo) ? 0 : costo_directo) + costo_margen

  const impactoDiasRaw = formData.get("impacto_dias") as string
  const impacto_dias = impactoDiasRaw ? parseInt(impactoDiasRaw, 10) : 0

  const renglones = parseRenglones(formData)
  if (renglones.length > 0) {
    const sumaRenglones = renglones.reduce((s, r) => s + r.costo_material + r.costo_mano_obra, 0)
    if (Math.abs(sumaRenglones - (isNaN(costo_directo) ? 0 : costo_directo)) > 0.01) {
      return { error: `El desglose por actividad (${sumaRenglones.toFixed(2)}) no coincide con el costo directo (${(isNaN(costo_directo) ? 0 : costo_directo).toFixed(2)}). Ajusta uno de los dos.` }
    }
  }

  const { error } = await supabase
    .from("change_orders")
    .update({
      numero: (formData.get("numero") as string) || null,
      titulo: titulo.trim(),
      descripcion: (formData.get("descripcion") as string) || null,
      solicitado_por: (formData.get("solicitado_por") as string) || null,
      costo_directo: isNaN(costo_directo) ? 0 : costo_directo,
      margen_pct_aplicado,
      costo_margen,
      impacto_costo,
      impacto_dias: isNaN(impacto_dias) ? 0 : impacto_dias,
    })
    .eq("id", id)
    .in("estado", ["detectado", "en_estimacion"])

  if (error) {
    console.error("actualizarChangeOrder error:", error)
    return { error: "Error al guardar. Intenta de nuevo." }
  }

  await guardarRenglones(supabase, id, renglones)

  revalidatePath("/change-orders")
  return {}
}

// validar: detectado -> en_estimacion (revisión interna completada,
// listo para mandar al cliente cuando se decida).
export async function validarChangeOrder(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const chk = await verificarPermisoGestion(supabase)
  if ("error" in chk) return { error: chk.error }

  const { error } = await supabase
    .from("change_orders")
    .update({ estado: "en_estimacion" })
    .eq("id", id)
    .eq("estado", "detectado")

  if (error) {
    console.error("validarChangeOrder error:", error)
    return { error: "Error al validar. Intenta de nuevo." }
  }

  revalidatePath("/change-orders")
  return {}
}

// enviar: en_estimacion -> enviado_cliente. A partir de aquí el CO
// aparece en el portal del cliente y ya no se puede editar; solo el
// cliente puede aprobarlo o rechazarlo (RPC decidir_change_order).
export async function enviarChangeOrderCliente(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const chk = await verificarPermisoGestion(supabase)
  if ("error" in chk) return { error: chk.error }

  const { error } = await supabase
    .from("change_orders")
    .update({ estado: "enviado_cliente", enviado_at: new Date().toISOString() })
    .eq("id", id)
    .eq("estado", "en_estimacion")

  if (error) {
    console.error("enviarChangeOrderCliente error:", error)
    return { error: "Error al enviar. Intenta de nuevo." }
  }

  revalidatePath("/change-orders")
  return {}
}

export async function reabrirChangeOrder(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const chk = await verificarPermisoGestion(supabase)
  if ("error" in chk) return { error: chk.error }

  const { error } = await supabase.rpc("reabrir_change_order", { p_id: id })
  if (error) {
    console.error("reabrirChangeOrder error:", error)
    if (error.message.includes("co_con_facturas"))
      return { error: "Este CO ya tiene facturas emitidas; no se puede reabrir automáticamente." }
    if (error.message.includes("co_con_avance"))
      return { error: "Este CO ya tiene avance reportado en sus actividades; no se puede reabrir automáticamente." }
    if (error.message.includes("change_order_no_reabrible"))
      return { error: "Este CO no se puede reabrir." }
    return { error: "Error al reabrir. ¿Corriste la migración 140?" }
  }

  revalidatePath("/change-orders")
  return {}
}

// Corrige en sitio un CO ya aprobado (con avance/facturas): migración 141.
export async function corregirChangeOrderAprobado(id: string, formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const chk = await verificarPermisoGestion(supabase)
  if ("error" in chk) return { error: chk.error }

  const titulo = formData.get("titulo") as string
  if (!titulo?.trim()) return { error: "El título es requerido" }

  const costoDirecto = parseFloat((formData.get("costo_directo") as string) || "0") || 0
  const renglonesRaw = (() => {
    try { return JSON.parse((formData.get("renglones") as string) || "[]") } catch { return [] }
  })()
  if (!Array.isArray(renglonesRaw) || renglonesRaw.length === 0) {
    return { error: "Un CO aprobado debe conservar su desglose por actividad." }
  }
  const suma = renglonesRaw.reduce((s: number, r: { costo_material?: number; costo_mano_obra?: number }) =>
    s + (Number(r.costo_material) || 0) + (Number(r.costo_mano_obra) || 0), 0)
  if (Math.abs(suma - costoDirecto) > 0.01) {
    return { error: `El desglose (${suma.toFixed(2)}) no coincide con el costo directo (${costoDirecto.toFixed(2)}).` }
  }

  const { error } = await supabase.rpc("corregir_change_order_aprobado", {
    p_id: id,
    p_titulo: titulo.trim(),
    p_descripcion: (formData.get("descripcion") as string) || "",
    p_numero: (formData.get("numero") as string) || "",
    p_solicitado_por: (formData.get("solicitado_por") as string) || "",
    p_impacto_dias: parseInt((formData.get("impacto_dias") as string) || "0", 10) || 0,
    p_renglones: renglonesRaw,
  })
  if (error) {
    console.error("corregirChangeOrderAprobado error:", error)
    if (error.message.includes("renglon_con_avance"))
      return { error: "No puedes quitar un renglón cuya actividad ya tiene avance." }
    return { error: "Error al corregir. ¿Corriste la migración 141?" }
  }

  revalidatePath("/change-orders")
  return {}
}
