import { ChevronDown, ListChecks } from "lucide-react"
import { PortalHeader } from "../portal-header"
import { SinProyecto } from "../sin-proyecto"
import { AvanceChart } from "../avance-chart"
import {
  cargarSesionCliente,
  obtenerProyectoCliente,
  estadoActividadLabel,
  estadoActividadLabelEn,
  type Actividad,
  t,
} from "../_shared"

export default async function CronogramaClientePage() {
  const { supabase, perfil } = await cargarSesionCliente()
  const proyecto = await obtenerProyectoCliente(supabase)

  const facturaEnIngles = proyecto?.idioma_cliente === "en"
  const tf = t[facturaEnIngles ? "en" : "es"]

  if (!proyecto) {
    return <SinProyecto mensaje={tf.cuentaSinProyecto} contacto={tf.contactaContacto} />
  }

  const { data } = await supabase.rpc("cliente_ver_avance")
  const avance = (data ?? []) as Actividad[]

  let historico: { fecha: string; avance_pct: number }[] = []
  try {
    const { data: historicoData } = await supabase.rpc("cliente_ver_avance_historico")
    historico = (historicoData ?? []) as { fecha: string; avance_pct: number }[]
  } catch (e) {
    console.error("cliente_ver_avance_historico falló (¿falta correr la migración 108?):", e)
  }

  const procesos: { id: string; nombre: string; nombre_en: string | null; actividades: Actividad[] }[] = []
  for (const a of avance) {
    let grupo = procesos.find((p) => p.id === a.proceso_id)
    if (!grupo) {
      grupo = { id: a.proceso_id, nombre: a.proceso, nombre_en: a.proceso_en ?? null, actividades: [] }
      procesos.push(grupo)
    }
    grupo.actividades.push(a)
  }

  const estadoActividadLabelActivo = facturaEnIngles ? estadoActividadLabelEn : estadoActividadLabel

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <PortalHeader
        proyectoNombre={proyecto.nombre}
        idioma={facturaEnIngles ? "en" : "es"}
        nombreCompleto={perfil.nombre_completo}
        seccion={tf.cronogramaYAvance}
        labelVolver={tf.volver}
      />

      <main className="max-w-4xl mx-auto px-6 py-8">
        <AvanceChart datos={historico} en={facturaEnIngles} label={facturaEnIngles ? "Progress over time" : "Avance en el tiempo"} />

        {procesos.length === 0 ? (
          <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-xl p-5">{tf.sinActividades}</p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
            {procesos.map((proc) => {
              const avanceProc = proc.actividades.length > 0
                ? Math.round(proc.actividades.reduce((s, a) => s + (a.avance_porcentaje ?? 0), 0) / proc.actividades.length)
                : 0
              return (
                <details key={proc.id} className="group p-4">
                  <summary className="flex items-center justify-between gap-2 cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      <ListChecks className="h-3.5 w-3.5 text-slate-400" />
                      {facturaEnIngles ? (proc.nombre_en || proc.nombre) : proc.nombre}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
                      {avanceProc}% · {proc.actividades.length} {proc.actividades.length !== 1 ? tf.actividades : tf.actividad}
                      <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                    </span>
                  </summary>
                  <div className="space-y-3 mt-4">
                    {proc.actividades.map((a) => (
                      <div key={a.actividad_id}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm text-slate-700 truncate">{facturaEnIngles ? (a.nombre_en || a.nombre) : a.nombre}</span>
                          <span className="text-xs text-slate-400 shrink-0">
                            {estadoActividadLabelActivo[a.estado] ?? a.estado} · {Math.round(a.avance_porcentaje ?? 0)}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${a.estado === "completada" ? "bg-emerald-500" : "bg-[#3B72D8]"}`}
                            style={{ width: `${Math.min(100, Math.max(0, a.avance_porcentaje ?? 0))}%` }}
                          />
                        </div>
                      </div>
                    ))}
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
