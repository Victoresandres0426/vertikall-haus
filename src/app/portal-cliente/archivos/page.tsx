import { redirect } from "next/navigation"
import { PortalHeader } from "../portal-header"
import { SinProyecto } from "../sin-proyecto"
import { SubirArchivoForm } from "./subir-archivo-form"
import { ListaArchivos } from "./lista-archivos"
import { cargarSesionCliente, obtenerProyectoCliente, type ArchivoProyecto, t } from "../_shared"

// Sección exclusiva del colaborador externo (diseñador/arquitecto) --
// el cliente no debe ver planos ni documentos del proyecto, así que
// ni siquiera se le muestra la tarjeta en el home del portal (ver
// page.tsx), pero por si entra directo a la URL se bloquea aquí
// también (además de que el RPC ya lo rechaza a nivel de base).
export default async function ArchivosClientePage() {
  const { supabase, perfil, esColaborador } = await cargarSesionCliente()
  if (!esColaborador) redirect("/portal-cliente")

  const proyecto = await obtenerProyectoCliente(supabase)

  const facturaEnIngles = proyecto?.idioma_cliente === "en"
  const tf = t[facturaEnIngles ? "en" : "es"]

  if (!proyecto) {
    return <SinProyecto mensaje={tf.cuentaSinProyecto} contacto={tf.contactaContacto} />
  }

  let archivos: ArchivoProyecto[] = []
  try {
    const { data } = await supabase.rpc("colaborador_ver_archivos")
    archivos = (data ?? []) as ArchivoProyecto[]
  } catch (e) {
    console.error("colaborador_ver_archivos falló (¿falta correr la migración 119?):", e)
  }

  if (archivos.length > 0) {
    try {
      await Promise.all(
        archivos.map(async (a) => {
          const { data: firmada } = await supabase.storage
            .from("proyecto-archivos")
            .createSignedUrl(a.storage_path, 3600)
          if (firmada?.signedUrl) a.url = firmada.signedUrl
        })
      )
    } catch (e) {
      console.error("Firmar URLs de archivos del proyecto falló:", e)
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <PortalHeader
        proyectoNombre={proyecto.nombre}
        idioma={facturaEnIngles ? "en" : "es"}
        nombreCompleto={perfil.nombre_completo}
        seccion={tf.archivos}
        labelVolver={tf.volver}
      />

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        {esColaborador && (
          <SubirArchivoForm proyectoId={proyecto.id} en={facturaEnIngles} />
        )}

        {archivos.length === 0 ? (
          <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-xl p-5">{tf.sinArchivos}</p>
        ) : (
          <ListaArchivos archivos={archivos} en={facturaEnIngles} />
        )}
      </main>
    </div>
  )
}
