"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

const ROLES_GESTION = ["project_manager", "dueno", "superadmin", "administrador"]

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
  const costo_margen = isNaN(costo_directo) ? 0 : Math.round(costo_directo * (margen_pct_aplicado / 100) * 100) / 100
  const impacto_costo = (isNaN(costo_directo) ? 0 : costo_directo) + costo_margen

  const impactoDiasRaw = formData.get("impacto_dias") as string
  const impacto_dias = impactoDiasRaw ? parseInt(impactoDiasRaw, 10) : 0

  const { error } = await supabase.from("change_orders").insert({
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
  })

  if (error) {
    console.error("crearChangeOrder error:", error)
    return { error: "Error al guardar. Intenta de nuevo." }
  }

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
  const costo_margen = isNaN(costo_directo) ? 0 : Math.round(costo_directo * (margen_pct_aplicado / 100) * 100) / 100
  const impacto_costo = (isNaN(costo_directo) ? 0 : costo_directo) + costo_margen

  const impactoDiasRaw = formData.get("impacto_dias") as string
  const impacto_dias = impactoDiasRaw ? parseInt(impactoDiasRaw, 10) : 0

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
