import { PortalHeader } from "../portal-header"
import { SinProyecto } from "../sin-proyecto"
import { ChangeOrdersFeed } from "./change-orders-feed"
import { cargarSesionCliente, obtenerProyectoCliente, type ChangeOrder, t } from "../_shared"

// Solo visible para el rol "cliente" -- colaborador_externo y
// subcontratista no ven change orders (información contractual/de
// costo, igual criterio que Facturas). El botón de acceso a esta
// página en portal-cliente/page.tsx ya está gateado con esProyectista.
export default async function ChangeOrdersClientePage() {
  const { supabase, perfil } = await cargarSesionCliente()
  const proyecto = await obtenerProyectoCliente(supabase)

  const facturaEnIngles = proyecto?.idioma_cliente === "en"
  const tf = t[facturaEnIngles ? "en" : "es"]

  if (!proyecto) {
    return <SinProyecto mensaje={tf.cuentaSinProyecto} contacto={tf.contactaContacto} />
  }

  let changeOrders: ChangeOrder[] = []
  try {
    const { data } = await supabase.rpc("portal_ver_change_orders")
    changeOrders = (data ?? []) as ChangeOrder[]
  } catch (e) {
    console.error("portal_ver_change_orders falló (¿falta correr la migración 127?):", e)
  }

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <PortalHeader
        proyectoNombre={proyecto.nombre}
        idioma={facturaEnIngles ? "en" : "es"}
        nombreCompleto={perfil.nombre_completo}
        seccion={tf.changeOrders}
        labelVolver={tf.volver}
      />

      <main className="max-w-3xl mx-auto px-6 py-8">
        <ChangeOrdersFeed changeOrders={changeOrders} en={facturaEnIngles} />
      </main>
    </div>
  )
}
