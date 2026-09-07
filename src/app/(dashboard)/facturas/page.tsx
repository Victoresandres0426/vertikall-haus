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
    supabase.from("proyectos").select("id, nombre, codigo").order("nombre"),
    supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
  ])

  const todosLosProyectos = proyectos ?? []
  const cookieId = await getProyectoActivoId()
  const proyectoActivo = resolverProyectoActivo(todosLosProyectos, cookieId)

  let facturasCliente: FacturaCliente[] = []
  let facturasProveedor: FacturaProveedor[] = []

  if (proyectoActivo) {
    const [{ data: fc }, { data: fp }] = await Promise.all([
      supabase
        .from("facturas_cliente")
        .select(`
          id, numero, descripcion, hito_asociado, monto, retencion, amortizacion_anticipo,
          fecha_emision, fecha_vencimiento, fecha_cobro, estado, monto_cobrado,
          proyectos ( nombre, codigo )
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
  }

  return {
    facturasCliente,
    facturasProveedor,
    proyectos: (proyectos ?? []) as ProyectoOpcion[],
    proveedores: (proveedores ?? []) as ProveedorOpcion[],
    puedeCrear: !!perfil && ROLES_FACTURAS.includes(perfil.rol),
    todosLosProyectos,
    proyectoActivoId: proyectoActivo?.id ?? null,
  }
}

export default async function FacturasPage() {
  const { facturasCliente, facturasProveedor, proyectos, proveedores, puedeCrear, todosLosProyectos, proyectoActivoId } = await getData()

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
      />
    </div>
  )
}
