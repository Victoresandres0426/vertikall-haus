import { ChevronDown } from "lucide-react"
import { PortalHeader } from "../portal-header"
import { SinProyecto } from "../sin-proyecto"
import { GaleriaFotos } from "../galeria-fotos"
import {
  cargarSesionCliente,
  obtenerProyectoCliente,
  traducirReportesFaltantes,
  formatoFecha,
  type Reporte,
  t,
} from "../_shared"

// Misma llamada de red pesada que antes (firmar cada foto de reporte,
// traducir con IA si hace falta) -- Reporte Diario mueve el
// maxDuration ya lo tenía la página vieja; aquí igual, por si acaso.
export const maxDuration = 60

export default async function ReportesClientePage() {
  const { supabase, perfil } = await cargarSesionCliente()
  const proyecto = await obtenerProyectoCliente(supabase)

  const facturaEnIngles = proyecto?.idioma_cliente === "en"
  const tf = t[facturaEnIngles ? "en" : "es"]

  if (!proyecto) {
    return <SinProyecto mensaje={tf.cuentaSinProyecto} contacto={tf.contactaContacto} />
  }

  const { data } = await supabase.rpc("cliente_ver_reportes")
  const reportes = (data ?? []) as Reporte[]

  try {
    await Promise.all(
      reportes.flatMap((r) =>
        (r.fotos_por_actividad ?? []).flatMap((grupo) =>
          grupo.fotos.map(async (foto) => {
            if (!foto.storage_path) return
            const { data: firmada } = await supabase.storage
              .from("reporte-fotos")
              .createSignedUrl(foto.storage_path, 3600)
            if (firmada?.signedUrl) foto.url = firmada.signedUrl
          })
        )
      )
    )
  } catch (e) {
    console.error("Firmar URLs de fotos de reporte falló:", e)
  }

  if (facturaEnIngles) {
    await traducirReportesFaltantes(supabase, reportes)
  }

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <PortalHeader
        proyectoNombre={proyecto.nombre}
        idioma={facturaEnIngles ? "en" : "es"}
        nombreCompleto={perfil.nombre_completo}
        seccion={tf.fotosYReportes}
        labelVolver={tf.volver}
      />

      <main className="max-w-4xl mx-auto px-6 py-8">
        {reportes.length === 0 ? (
          <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-xl p-5">{tf.sinReportes}</p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
            {reportes.map((r, i) => {
              const avances = r.avance_por_actividad ?? []
              const fotosGrupos = r.fotos_por_actividad ?? []
              return (
                <details key={i} className="group p-4">
                  <summary className="flex items-center justify-between gap-2 cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="text-sm font-semibold text-slate-800">{formatoFecha(r.fecha, facturaEnIngles)}</span>
                    <span className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
                      {r.clima && <span>{facturaEnIngles ? (r.clima_en || r.clima) : r.clima}</span>}
                      <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                    </span>
                  </summary>
                  <div className="space-y-4 mt-4">
                    {r.observaciones_generales && (
                      <p className="text-sm text-slate-600">{facturaEnIngles ? (r.observaciones_generales_en || r.observaciones_generales) : r.observaciones_generales}</p>
                    )}

                    {avances.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{tf.avanceDelDia}</p>
                        <div className="space-y-1.5">
                          {avances.map((a) => (
                            <div key={a.actividad_id} className="flex items-center justify-between text-sm">
                              <span className="text-slate-700 truncate">
                                {a.codigo ? `${a.codigo} — ` : ""}{facturaEnIngles ? (a.nombre_en || a.nombre) : a.nombre}
                              </span>
                              <span className="font-medium text-[#3B72D8] shrink-0 ml-2">
                                {a.avance_dia_pct != null ? `+${a.avance_dia_pct}%` : "—"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {fotosGrupos.length > 0 && (
                      <div className="space-y-3">
                        {fotosGrupos.map((grupo) => (
                          <div key={grupo.actividad_id}>
                            <p className="text-xs font-medium text-slate-500 mb-1.5">
                              {grupo.codigo ? `${grupo.codigo} — ` : ""}{facturaEnIngles ? (grupo.nombre_en || grupo.nombre) : grupo.nombre}
                            </p>
                            <GaleriaFotos
                              fotos={grupo.fotos.filter((f) => f.url).map((f) => ({ url: f.url!, alt: f.descripcion ?? grupo.nombre }))}
                              columnas="grid-cols-2 sm:grid-cols-3"
                              labelVolver={tf.volver}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
