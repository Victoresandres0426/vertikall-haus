import { PortalHeader } from "../portal-header"
import { SinProyecto } from "../sin-proyecto"
import { ChangeOrdersFeed } from "./change-orders-feed"
import { cargarSesionCliente, obtenerProyectoCliente, traducirChangeOrdersFaltantes, type ChangeOrder, t } from "../_shared"

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

  // Nota: esta sección ya no marca "visto" -- el aviso de Change
  // Orders pendientes (migración 131) se calcula por estado
  // (enviado_cliente, sin decidir), no por si el cliente la miró.
  let changeOrders: ChangeOrder[] = []
  try {
    const { data } = await supabase.rpc("portal_ver_change_orders")
    changeOrders = (data ?? []) as ChangeOrder[]
  } catch (e) {
    console.error("portal_ver_change_orders falló (¿falta correr la migración 127?):", e)
  }

  if (facturaEnIngles) {
    await traducirChangeOrdersFaltantes(supabase, changeOrders)
    // Sustituye el texto libre (título/descripción/motivo de rechazo)
    // por su versión en inglés ya traducida/cacheada -- las etiquetas
    // fijas de la interfaz ya viajan traducidas en `tf`, esto cubre lo
    // que el equipo escribió en español al crear el CO.
    changeOrders = changeOrders.map((co) => ({
      ...co,
      titulo: co.titulo_en || co.titulo,
      descripcion: co.descripcion_en || co.descripcion,
      motivo_rechazo: co.motivo_rechazo_en || co.motivo_rechazo,
    }))
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
        <ChangeOrdersFeed changeOrders={changeOrders} en={facturaEnIngles} tf={tf} />
      </main>
    </div>
  )
}
