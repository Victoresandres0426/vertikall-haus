import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { SelectorProyectoActivo } from "@/components/layout/selector-proyecto-activo"
import { FacturasClient, type FacturaCliente, type FacturaProveedor, type ProyectoOpcion, type ProveedorOpcion } from "./facturas-client"
import { getProyectoActivoId, resolverProyectoActivo } from "@/lib/proyecto-activo"

const ROLES_FACTURAS = ["administrador", "dueno", "superadmin"]
const ROLES_VEN_FACTURAS = ["administrador", "project_manager", "dueno", "superadmin"]

async function getData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_VEN_FACTURAS.includes(perfil.rol)) redirect("/sin-acceso")

  const [{ data: proyectos }, { data: proveedores }] = await Promise.all([
    supabase.from("proyectos").select("id, nombre, codigo, presupuesto_venta").order("nombre"),
    supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
  ])

  const todosLosProyectos = proyectos ?? []
  const cookieId = await getProyectoActivoId()
  const proyectoActivo = resolverProyectoActivo(todosLosProyectos, cookieId)

  let facturasCliente: FacturaCliente[] = []
  let facturasProveedor: FacturaProveedor[] = []
  // El gráfico "Facturado vs. % de avance real" debe mostrar en su
  // último punto el avance REAL de HOY, no el que tenía la obra
  // cuando se generó la última factura (pueden ser fechas distintas) --
  // ver mismo histórico que usa Cronograma.
  let avanceActualPct: number | null = null

  if (proyectoActivo) {
    const [{ data: fc }, { data: fp }] = await Promise.all([
      supabase
        .from("facturas_cliente")
        .select(`
          id, numero, descripcion, hito_asociado, monto, retencion, amortizacion_anticipo,
          periodo_inicio, periodo_fin, desglose_periodos, desglose_actividades,
          fecha_emision, fecha_vencimiento, fecha_cobro, estado, monto_cobrado,
          avance_acumulado_pct, change_order_id,
          proyectos ( nombre, codigo ),
          change_orders ( numero, titulo )
        `)
        .eq("proyecto_id", proyectoActivo.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("facturas_proveedor")
        .select(`
          id, numero, descripcion, monto,
          fecha_recepcion, fecha_vencimiento, fecha_pago, estado, monto_pagado,
          proyectos ( nombre, codigo ),
          proveedores ( nombre )
        `)
        .eq("proyecto_id", proyectoActivo.id)
        .order("created_at", { ascending: false }),
    ])
    facturasCliente = (fc ?? []) as unknown as FacturaCliente[]
    facturasProveedor = (fp ?? []) as unknown as FacturaProveedor[]

    try {
      const { data: historicoData } = await supabase.rpc("proyecto_avance_historico", { p_proyecto_id: proyectoActivo.id })
      const historico = (historicoData ?? []) as { fecha: string; avance_pct: number }[]
      avanceActualPct = historico.length > 0 ? historico[historico.length - 1].avance_pct : null
    } catch { /* migración 110 no aplicada aún */ }
  }

  return {
    facturasCliente,
    facturasProveedor,
    proyectos: (proyectos ?? []) as ProyectoOpcion[],
    proveedores: (proveedores ?? []) as ProveedorOpcion[],
    puedeCrear: !!perfil && ROLES_FACTURAS.includes(perfil.rol),
    todosLosProyectos,
    proyectoActivoId: proyectoActivo?.id ?? null,
    proyectoActivoPresupuestoVenta: (proyectoActivo as { presupuesto_venta?: number } | null)?.presupuesto_venta ?? null,
    avanceActualPct,
  }
}

export default async function FacturasPage() {
  const { facturasCliente, facturasProveedor, proyectos, proveedores, puedeCrear, todosLosProyectos, proyectoActivoId, proyectoActivoPresupuestoVenta, avanceActualPct } = await getData()

  const total = facturasCliente.length + facturasProveedor.length

  return (
    <div>
      <Header
        titulo="Facturas"
        subtitulo={
          total === 0
            ? "Sin facturas registradas"
            : `${facturasCliente.length} de cliente (CxC) · ${facturasProveedor.length} de proveedor (CxP)`
        }
        acciones={
          todosLosProyectos.length > 0 ? (
            <SelectorProyectoActivo proyectos={todosLosProyectos} proyectoActualId={proyectoActivoId} />
          ) : undefined
        }
      />
      <FacturasClient
        facturasClienteIniciales={facturasCliente}
        facturasProveedorIniciales={facturasProveedor}
        proyectos={proyectos}
        proveedores={proveedores}
        puedeCrear={puedeCrear}
        proyectoActivoPresupuestoVenta={proyectoActivoPresupuestoVenta}
        avanceActualPct={avanceActualPct}
      />
    </div>
  )
}
