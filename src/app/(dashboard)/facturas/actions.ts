"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

// Mismos roles que las políticas RLS de facturas_cliente/facturas_proveedor
// (admin_dueno_crean_facturas_*, admin_dueno_actualizan_facturas_*):
// administrador, dueno, superadmin. project_manager puede VER facturas
// pero no crearlas/editarlas (dato financiero sensible).
const ROLES_FACTURAS = ["administrador", "dueno", "superadmin"]

async function verificarAcceso(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_FACTURAS.includes(perfil.rol)) {
    return { ok: false as const, error: "No tienes permisos para gestionar facturas" }
  }
  return { ok: true as const }
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function crearFacturaCliente(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  const proyecto_id = formData.get("proyecto_id") as string
  const montoRaw = formData.get("monto") as string
  const monto = montoRaw ? parseFloat(montoRaw) : NaN
  if (!proyecto_id) return { error: "Selecciona un proyecto" }
  if (!monto || isNaN(monto) || monto <= 0) return { error: "Ingresa un monto válido" }

  const retencionRaw = formData.get("retencion") as string
  const retencion = retencionRaw ? parseFloat(retencionRaw) : 0

  const { error } = await supabase.from("facturas_cliente").insert({
    proyecto_id,
    numero: (formData.get("numero") as string) || null,
    descripcion: (formData.get("descripcion") as string) || null,
    hito_asociado: (formData.get("hito_asociado") as string) || null,
    monto,
    retencion: isNaN(retencion) ? 0 : retencion,
    fecha_emision: (formData.get("fecha_emision") as string) || null,
    fecha_vencimiento: (formData.get("fecha_vencimiento") as string) || null,
    estado: "enviada",
    monto_cobrado: 0,
  })

  if (error) {
    console.error("crearFacturaCliente error:", error)
    return { error: "Error al guardar la factura de cliente." }
  }

  revalidatePath("/facturas")
  return {}
}

export async function crearFacturaProveedor(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  const proyecto_id = formData.get("proyecto_id") as string
  const proveedor_id = formData.get("proveedor_id") as string
  const montoRaw = formData.get("monto") as string
  const monto = montoRaw ? parseFloat(montoRaw) : NaN
  if (!proyecto_id) return { error: "Selecciona un proyecto" }
  if (!proveedor_id) return { error: "Selecciona un proveedor" }
  if (!monto || isNaN(monto) || monto <= 0) return { error: "Ingresa un monto válido" }

  const { error } = await supabase.from("facturas_proveedor").insert({
    proyecto_id,
    proveedor_id,
    numero: (formData.get("numero") as string) || null,
    descripcion: (formData.get("descripcion") as string) || null,
    monto,
    fecha_recepcion: (formData.get("fecha_recepcion") as string) || null,
    fecha_vencimiento: (formData.get("fecha_vencimiento") as string) || null,
    estado: "enviada",
    monto_pagado: 0,
  })

  if (error) {
    console.error("crearFacturaProveedor error:", error)
    return { error: "Error al guardar la factura de proveedor." }
  }

  revalidatePath("/facturas")
  return {}
}

export async function crearProveedorRapido(nombre: string): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }
  if (!nombre?.trim()) return { error: "Ingresa un nombre" }

  const { data: { user } } = await supabase.auth.getUser()
  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("empresa_id")
    .eq("id", user!.id)
    .single()

  if (!perfil?.empresa_id) return { error: "No se pudo determinar la empresa" }

  const { data, error } = await supabase
    .from("proveedores")
    .insert({ empresa_id: perfil.empresa_id, nombre: nombre.trim() })
    .select("id")
    .single()

  if (error) {
    console.error("crearProveedorRapido error:", error)
    return { error: "Error al crear el proveedor." }
  }

  revalidatePath("/facturas")
  return { id: data.id }
}

export async function marcarFacturaClienteCobrada(facturaId: string, montoCobrado: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }
  if (!facturaId || !montoCobrado || montoCobrado <= 0) return { error: "Monto inválido" }

  const { error } = await supabase
    .from("facturas_cliente")
    .update({ fecha_cobro: hoyISO(), monto_cobrado: montoCobrado, estado: "pagada" })
    .eq("id", facturaId)

  if (error) {
    console.error("marcarFacturaClienteCobrada error:", error)
    return { error: "Error al marcar la factura como cobrada." }
  }

  revalidatePath("/facturas")
  revalidatePath("/flujo-caja")
  return {}
}

export type FacturaGenerada = {
  proyecto_id: string
  proyecto_codigo: string
  numero_generado: string
  monto_generado: number
  amortizacion_generada: number
}

// Aprueba un borrador de estimación automática: pasa a 'enviada', que es
// lo que la hace visible en el portal del cliente y dispara el trigger de
// correo (si Resend/Vault están configurados). Solo aplica sobre filas que
// sigan en 'borrador' -- no se puede "re-aprobar" una ya enviada.
export async function aprobarFacturaCliente(facturaId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }
  if (!facturaId) return { error: "Falta la factura" }

  const { data, error } = await supabase
    .from("facturas_cliente")
    .update({ estado: "enviada" })
    .eq("id", facturaId)
    .eq("estado", "borrador")
    .select("id")

  if (error) {
    console.error("aprobarFacturaCliente error:", error)
    return { error: "Error al aprobar la factura." }
  }
  if (!data || data.length === 0) {
    return { error: "Esta factura ya no está en borrador (puede que alguien más ya la haya aprobado o descartado)." }
  }

  revalidatePath("/facturas")
  revalidatePath("/flujo-caja")
  return {}
}

// Ajusta el monto o la descripción de un borrador antes de aprobarlo. Si el
// monto se reduce, esa diferencia no se pierde: al quedar un monto menor
// "ya facturado" en el histórico, la siguiente corrida de facturación
// automática vuelve a detectarla como avance pendiente y la incluye en la
// próxima estimación.
export async function editarBorradorFacturaCliente(
  facturaId: string,
  campos: { monto?: number; descripcion?: string }
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }
  if (!facturaId) return { error: "Falta la factura" }

  const patch: Record<string, unknown> = {}
  if (campos.monto !== undefined) {
    if (isNaN(campos.monto) || campos.monto < 0) return { error: "Monto inválido" }
    patch.monto = campos.monto
  }
  if (campos.descripcion !== undefined) {
    patch.descripcion = campos.descripcion || null
  }
  if (Object.keys(patch).length === 0) return {}

  const { data, error } = await supabase
    .from("facturas_cliente")
    .update(patch)
    .eq("id", facturaId)
    .eq("estado", "borrador")
    .select("id")

  if (error) {
    console.error("editarBorradorFacturaCliente error:", error)
    return { error: "Error al editar el borrador." }
  }
  if (!data || data.length === 0) {
    return { error: "Esta factura ya no está en borrador." }
  }

  revalidatePath("/facturas")
  return {}
}

// Descarta un borrador (lo borra). Nunca llegó a enviarse ni a contar como
// "ya facturado" de forma definitiva más que mientras existió, así que el
// avance que representaba no se pierde: la próxima corrida automática lo
// vuelve a incluir (ver comentario en la migración 078).
export async function descartarBorradorFacturaCliente(facturaId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }
  if (!facturaId) return { error: "Falta la factura" }

  const { data, error } = await supabase
    .from("facturas_cliente")
    .delete()
    .eq("id", facturaId)
    .eq("estado", "borrador")
    .select("id")

  if (error) {
    console.error("descartarBorradorFacturaCliente error:", error)
    return { error: "Error al descartar el borrador." }
  }
  if (!data || data.length === 0) {
    return { error: "Esta factura ya no está en borrador." }
  }

  revalidatePath("/facturas")
  return {}
}

// Dispara la generación de estimaciones de avance para todos los
// proyectos activos de la empresa (misma lógica que corre sola cada
// lunes vía pg_cron). Solo genera lo que corresponda: si un proyecto
// no tiene avance nuevo desde su última estimación, no crea nada.
export async function generarFacturacionAutomatica(): Promise<{ error?: string; facturas?: FacturaGenerada[] }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  const { data, error } = await supabase.rpc("generar_facturas_semanales")

  if (error) {
    console.error("generarFacturacionAutomatica error:", error)
    return { error: error.message || "Error al generar la facturación automática." }
  }

  revalidatePath("/facturas")
  revalidatePath("/flujo-caja")
  return { facturas: (data ?? []) as FacturaGenerada[] }
}

export async function marcarFacturaProveedorPagada(facturaId: string, montoPagado: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }
  if (!facturaId || !montoPagado || montoPagado <= 0) return { error: "Monto inválido" }

  const { error } = await supabase
    .from("facturas_proveedor")
    .update({ fecha_pago: hoyISO(), monto_pagado: montoPagado, estado: "pagada" })
    .eq("id", facturaId)

  if (error) {
    console.error("marcarFacturaProveedorPagada error:", error)
    return { error: "Error al marcar la factura como pagada." }
  }

  revalidatePath("/facturas")
  revalidatePath("/flujo-caja")
  return {}
}
