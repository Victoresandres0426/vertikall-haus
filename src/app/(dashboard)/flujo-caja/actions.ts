"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import {
  calcularProyeccionesFlujoCaja,
  type FacturaClienteFlujo,
  type FacturaProveedorFlujo,
  type NominaFlujo,
} from "@/lib/engine/flujo-caja"

// La carga manual semana a semana se mantiene como respaldo/ajuste fino,
// pero desde esta ronda existe también el cálculo automático (spec §11.3)
// a partir de facturas_cliente, facturas_proveedor y nómina — ver
// recalcularFlujoCajaAutomatico() más abajo.
const ROLES_GESTION = ["project_manager", "dueno", "superadmin", "administrador"]

export async function crearProyeccionSemanal(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_GESTION.includes(perfil.rol)) {
    return { error: "No tienes permisos para cargar flujo de caja" }
  }

  const proyecto_id = formData.get("proyecto_id") as string
  const semana = formData.get("semana") as string
  if (!proyecto_id) return { error: "Selecciona un proyecto" }
  if (!semana) return { error: "Selecciona la semana (fecha de inicio)" }

  const num = (key: string) => {
    const raw = formData.get(key) as string
    const v = raw ? parseFloat(raw) : 0
    return isNaN(v) ? 0 : v
  }

  const ingresos_plan = num("ingresos_plan")
  const ingresos_real = num("ingresos_real")
  const egresos_plan = num("egresos_plan")
  const egresos_real = num("egresos_real")

  // Saldo simple de la semana (ingresos reales/plan - egresos reales/plan).
  // El saldo ACUMULADO entre semanas es responsabilidad del motor
  // predictivo completo (pendiente); esto es una aproximación por semana.
  const saldo_proyectado = (ingresos_real || ingresos_plan) - (egresos_real || egresos_plan)
  const alerta_liquidez = saldo_proyectado < 0

  const { error } = await supabase.from("flujo_caja_proyecciones").upsert(
    {
      proyecto_id,
      semana,
      ingresos_plan,
      ingresos_real,
      egresos_plan,
      egresos_real,
      saldo_proyectado,
      alerta_liquidez,
    },
    { onConflict: "proyecto_id,semana" }
  )

  if (error) {
    console.error("crearProyeccionSemanal error:", error)
    return { error: "Error al guardar la proyección." }
  }

  revalidatePath("/flujo-caja")
  return {}
}

/**
 * Recalcula el flujo de caja de un proyecto a partir de sus fuentes reales:
 * facturas_cliente (CxC), facturas_proveedor (CxP) y la porción de nómina
 * distribuida a este proyecto (lineas_nomina.distribucion_proyectos).
 * Agrupa todo en semanas y calcula un saldo ACUMULADO (no solo el neto de
 * cada semana), luego hace upsert en flujo_caja_proyecciones por semana.
 *
 * No borra proyecciones cargadas a mano en semanas sin facturas/nómina;
 * solo sobreescribe las semanas donde sí hay datos reales que agregar.
 */
export async function recalcularFlujoCajaAutomatico(proyectoId: string): Promise<{ error?: string; semanas?: number }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_GESTION.includes(perfil.rol)) {
    return { error: "No tienes permisos para recalcular el flujo de caja" }
  }

  if (!proyectoId) return { error: "Selecciona un proyecto" }

  const { data: proyecto, error: errProyecto } = await supabase
    .from("proyectos")
    .select("id, empresa_id")
    .eq("id", proyectoId)
    .single()

  if (errProyecto || !proyecto) return { error: "No se pudo cargar el proyecto" }

  const [{ data: facturasClienteRaw }, { data: facturasProveedorRaw }, { data: periodosRaw }] = await Promise.all([
    supabase
      .from("facturas_cliente")
      .select("proyecto_id, monto, monto_cobrado, fecha_emision, fecha_vencimiento, fecha_cobro, estado")
      .eq("proyecto_id", proyectoId),
    supabase
      .from("facturas_proveedor")
      .select("proyecto_id, monto, monto_pagado, fecha_recepcion, fecha_vencimiento, fecha_pago, estado")
      .eq("proyecto_id", proyectoId),
    supabase
      .from("periodos_nomina")
      .select("id, fecha_fin, estado")
      .eq("empresa_id", proyecto.empresa_id),
  ])

  const facturasCliente: FacturaClienteFlujo[] = ((facturasClienteRaw ?? []) as any[]).map((f: any) => ({
    proyecto_id: f.proyecto_id,
    monto: Number(f.monto ?? 0),
    monto_cobrado: Number(f.monto_cobrado ?? 0),
    fecha_emision: f.fecha_emision,
    fecha_vencimiento: f.fecha_vencimiento,
    fecha_cobro: f.fecha_cobro,
    estado: f.estado,
  }))

  const facturasProveedor: FacturaProveedorFlujo[] = ((facturasProveedorRaw ?? []) as any[]).map((f: any) => ({
    proyecto_id: f.proyecto_id,
    monto: Number(f.monto ?? 0),
    monto_pagado: Number(f.monto_pagado ?? 0),
    fecha_recepcion: f.fecha_recepcion,
    fecha_vencimiento: f.fecha_vencimiento,
    fecha_pago: f.fecha_pago,
    estado: f.estado,
  }))

  // Nómina: solo la porción de cada línea distribuida a este proyecto
  // (lineas_nomina.distribucion_proyectos = [{proyecto_id, pct, monto}]).
  // Si el usuario actual no tiene permiso para ver nómina (RLS), esta
  // consulta simplemente vuelve vacía y el cálculo sigue sin esa parte.
  const nomina: NominaFlujo[] = []
  const periodos = (periodosRaw ?? []) as any[]
  if (periodos.length > 0) {
    const periodoIds = periodos.map((p) => p.id)
    const periodoPorId = new Map(periodos.map((p) => [p.id, p]))

    const { data: lineasRaw } = await supabase
      .from("lineas_nomina")
      .select("periodo_id, neto_a_pagar, distribucion_proyectos")
      .in("periodo_id", periodoIds)

    for (const linea of (lineasRaw ?? []) as any[]) {
      const periodo = periodoPorId.get(linea.periodo_id)
      if (!periodo) continue
      const distribucion = Array.isArray(linea.distribucion_proyectos) ? linea.distribucion_proyectos : []
      const neto = Number(linea.neto_a_pagar ?? 0)

      for (const d of distribucion) {
        if (d?.proyecto_id !== proyectoId) continue
        const monto = d.monto != null ? Number(d.monto) : (Number(d.pct ?? 0) / 100) * neto
        if (monto > 0) {
          nomina.push({
            proyecto_id: proyectoId,
            monto,
            fecha_referencia: periodo.fecha_fin,
            pagado: periodo.estado === "pagado",
          })
        }
      }
    }
  }

  if (facturasCliente.length === 0 && facturasProveedor.length === 0 && nomina.length === 0) {
    return { error: "Este proyecto no tiene facturas ni nómina registradas todavía; no hay nada que calcular." }
  }

  const proyecciones = calcularProyeccionesFlujoCaja(facturasCliente, facturasProveedor, nomina)

  for (const p of proyecciones) {
    const { error: errUpsert } = await supabase.from("flujo_caja_proyecciones").upsert(
      {
        proyecto_id: proyectoId,
        semana: p.semana,
        ingresos_plan: p.ingresos_plan,
        ingresos_real: p.ingresos_real,
        egresos_plan: p.egresos_plan,
        egresos_real: p.egresos_real,
        saldo_proyectado: p.saldo_proyectado,
        alerta_liquidez: p.alerta_liquidez,
      },
      { onConflict: "proyecto_id,semana" }
    )
    if (errUpsert) {
      console.error("recalcularFlujoCajaAutomatico upsert error:", errUpsert)
      return { error: `Error guardando la semana ${p.semana}: ${errUpsert.message}` }
    }
  }

  revalidatePath("/flujo-caja")
  return { semanas: proyecciones.length }
}
