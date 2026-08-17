import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { FacturasClient, type FacturaCliente, type FacturaProveedor, type ProyectoOpcion, type ProveedorOpcion } from "./facturas-client"

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

  const [
    { data: facturasCliente },
    { data: facturasProveedor },
    { data: proyectos },
    { data: proveedores },
  ] = await Promise.all([
    supabase
      .from("facturas_cliente")
      .select(`
        id, numero, descripcion, hito_asociado, monto, retencion, amortizacion_anticipo,
        fecha_emision, fecha_vencimiento, fecha_cobro, estado, monto_cobrado,
        proyectos ( nombre, codigo )
      `)
      .order("created_at", { ascending: false }),
    supabase
      .from("facturas_proveedor")
      .select(`
        id, numero, descripcion, monto,
        fecha_recepcion, fecha_vencimiento, fecha_pago, estado, monto_pagado,
        proyectos ( nombre, codigo ),
        proveedores ( nombre )
      `)
      .order("created_at", { ascending: false }),
    supabase.from("proyectos").select("id, nombre, codigo").order("nombre"),
    supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
  ])

  return {
    facturasCliente: (facturasCliente ?? []) as unknown as FacturaCliente[],
    facturasProveedor: (facturasProveedor ?? []) as unknown as FacturaProveedor[],
    proyectos: (proyectos ?? []) as ProyectoOpcion[],
    proveedores: (proveedores ?? []) as ProveedorOpcion[],
    puedeCrear: !!perfil && ROLES_FACTURAS.includes(perfil.rol),
  }
}

export default async function FacturasPage() {
  const { facturasCliente, facturasProveedor, proyectos, proveedores, puedeCrear } = await getData()

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
