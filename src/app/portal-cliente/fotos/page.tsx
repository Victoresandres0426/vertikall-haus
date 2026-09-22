import { PortalHeader } from "../portal-header"
import { SinProyecto } from "../sin-proyecto"
import { GaleriaFotos } from "../galeria-fotos"
import { cargarSesionCliente, obtenerProyectoCliente, type Foto, t } from "../_shared"

export default async function FotosClientePage() {
  const { supabase, perfil } = await cargarSesionCliente()
  const proyecto = await obtenerProyectoCliente(supabase)

  const facturaEnIngles = proyecto?.idioma_cliente === "en"
  const tf = t[facturaEnIngles ? "en" : "es"]

  if (!proyecto) {
    return <SinProyecto mensaje={tf.cuentaSinProyecto} contacto={tf.contactaContacto} />
  }

  let fotos: Foto[] = []
  try {
    const { data } = await supabase.rpc("cliente_ver_fotos")
    fotos = (data ?? []) as Foto[]
  } catch (e) {
    console.error("cliente_ver_fotos falló:", e)
  }

  if (fotos.length > 0) {
    try {
      await Promise.all(
        fotos.map(async (foto) => {
          const { data: firmada } = await supabase.storage
            .from("proyecto-archivos")
            .createSignedUrl(foto.storage_path, 3600)
          if (firmada?.signedUrl) foto.url = firmada.signedUrl
        })
      )
    } catch (e) {
      console.error("Firmar URLs de fotos del proyecto falló:", e)
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <PortalHeader
        proyectoNombre={proyecto.nombre}
        idioma={facturaEnIngles ? "en" : "es"}
        nombreCompleto={perfil.nombre_completo}
        seccion={tf.fotosDelProyecto}
        labelVolver={tf.volver}
      />

      <main className="max-w-4xl mx-auto px-6 py-8">
        {fotos.length === 0 ? (
          <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-xl p-5">{tf.sinFotos}</p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <GaleriaFotos
              fotos={fotos.filter((f) => f.url).map((f) => ({ url: f.url!, alt: f.nombre_archivo }))}
              columnas="grid-cols-2 sm:grid-cols-4"
              labelVolver={tf.volver}
            />
          </div>
        )}
      </main>
    </div>
  )
}
