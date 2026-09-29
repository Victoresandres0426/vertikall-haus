import { PortalHeader } from "../portal-header"
import { SinProyecto } from "../sin-proyecto"
import { BitacoraFeed } from "./bitacora-feed"
import { cargarSesionCliente, obtenerProyectoCliente, type EntradaBitacora, t } from "../_shared"

// Visible para cliente (solo lectura) y colaborador_externo (lectura +
// escritura) -- el dueño pidió transparencia de las decisiones para el
// cliente, sin darle la posibilidad de escribir.
export default async function BitacoraClientePage() {
  const { supabase, perfil, esColaborador, esSubcontratista } = await cargarSesionCliente()
  const proyecto = await obtenerProyectoCliente(supabase)

  const facturaEnIngles = proyecto?.idioma_cliente === "en"
  const tf = t[facturaEnIngles ? "en" : "es"]

  if (!proyecto) {
    return <SinProyecto mensaje={tf.cuentaSinProyecto} contacto={tf.contactaContacto} />
  }

  let entradas: EntradaBitacora[] = []
  try {
    const { data } = await supabase.rpc("portal_ver_bitacora")
    entradas = (data ?? []) as EntradaBitacora[]
  } catch (e) {
    console.error("portal_ver_bitacora falló (¿falta correr la migración 120?):", e)
  }

  const todasLasFotos = entradas.flatMap((e) => e.fotos ?? [])
  if (todasLasFotos.length > 0) {
    try {
      await Promise.all(
        todasLasFotos.map(async (f) => {
          const { data: firmada } = await supabase.storage
            .from("bitacora-fotos")
            .createSignedUrl(f.storage_path, 3600)
          if (firmada?.signedUrl) f.url = firmada.signedUrl
        })
      )
    } catch (e) {
      console.error("Firmar URLs de fotos de bitácora falló:", e)
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <PortalHeader
        proyectoNombre={proyecto.nombre}
        idioma={facturaEnIngles ? "en" : "es"}
        nombreCompleto={perfil.nombre_completo}
        seccion={tf.bitacora}
        labelVolver={tf.volver}
      />

      <main className="max-w-3xl mx-auto px-6 py-8">
        <BitacoraFeed
          proyectoId={proyecto.id}
          entradas={entradas}
          puedeEscribir={esColaborador || esSubcontratista}
          en={facturaEnIngles}
        />
      </main>
    </div>
  )
}
