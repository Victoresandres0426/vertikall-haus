import { ChevronDown, ListChecks, AlertTriangle } from "lucide-react"
import { PortalHeader } from "../portal-header"
import { SinProyecto } from "../sin-proyecto"
import { AvanceChart } from "../avance-chart"
import {
  cargarSesionCliente,
  obtenerProyectoCliente,
  marcarVistoSeccion,
  estadoActividadLabel,
  estadoActividadLabelEn,
  formatoFecha,
  type Actividad,
  t,
} from "../_shared"

// El % de avance (avance_porcentaje) siempre fue REAL -- cuánto se ha
// ejecutado. Lo que faltaba para "ver dónde está el atraso real" (no
// solo la salud general del gráfico de arriba) es el % que el plan
// dice que debería llevar CADA actividad hoy, calculado con las mismas
// fechas de plan que ya trae cliente_ver_avance() -- misma fórmula que
// ya se usa para el resumen general del proyecto (cliente_ver_avance_
// general), solo que aquí evaluada actividad por actividad.
function calcularPlanPct(fechaInicioPlan: string | null, fechaFinPlan: string | null): number | null {
  if (!fechaInicioPlan || !fechaFinPlan) return null
  const hoy = new Date()
  const ini = new Date(fechaInicioPlan + "T00:00:00")
  const fin = new Date(fechaFinPlan + "T00:00:00")
  if (ini.getTime() >= fin.getTime()) return null
  if (hoy.getTime() >= fin.getTime()) return 100
  if (hoy.getTime() <= ini.getTime()) return 0
  return Math.round(((hoy.getTime() - ini.getTime()) / (fin.getTime() - ini.getTime())) * 100)
}

export default async function CronogramaClientePage() {
  const { supabase, perfil } = await cargarSesionCliente()
  const proyecto = await obtenerProyectoCliente(supabase)

  const facturaEnIngles = proyecto?.idioma_cliente === "en"
  const tf = t[facturaEnIngles ? "en" : "es"]

  if (!proyecto) {
    return <SinProyecto mensaje={tf.cuentaSinProyecto} contacto={tf.contactaContacto} />
  }

  await marcarVistoSeccion(supabase, "cronograma")

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
              const conPlan = proc.actividades
                .map((a) => ({ a, plan: calcularPlanPct(a.fecha_inicio_plan, a.fecha_fin_plan) }))

              const avanceProc = proc.actividades.length > 0
                ? Math.round(proc.actividades.reduce((s, a) => s + Math.min(100, a.avance_porcentaje ?? 0), 0) / proc.actividades.length)
                : 0

              const planesValidos = conPlan.filter((x) => x.plan != null)
              const planProc = planesValidos.length > 0
                ? Math.round(planesValidos.reduce((s, x) => s + (x.plan ?? 0), 0) / planesValidos.length)
                : null

              const deltaProc = planProc != null ? avanceProc - planProc : null

              const atrasadas = conPlan.filter((x) => x.plan != null && Math.min(100, x.a.avance_porcentaje ?? 0) - (x.plan ?? 0) < -3).length

              return (
                <details key={proc.id} className="group p-4">
                  <summary className="flex items-center justify-between gap-2 cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      <ListChecks className="h-3.5 w-3.5 text-slate-400" />
                      {facturaEnIngles ? (proc.nombre_en || proc.nombre) : proc.nombre}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
                      {atrasadas > 0 && (
                        <span className="flex items-center gap-1 text-amber-600 font-medium">
                          <AlertTriangle className="h-3 w-3" />
                          {atrasadas} {atrasadas === 1 ? tf.atrasada : tf.atrasadas}
                        </span>
                      )}
                      <span>
                        {avanceProc}%{planProc != null && <span className="text-slate-300"> · {tf.planCorto} {planProc}%</span>}
                      </span>
                      · {proc.actividades.length} {proc.actividades.length !== 1 ? tf.actividades : tf.actividad}
                      <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                    </span>
                  </summary>

                  {deltaProc != null && (
                    <p className={`text-xs font-medium mt-1 ${deltaProc >= -3 ? "text-emerald-600" : "text-amber-600"}`}>
                      {deltaProc >= 3
                        ? `${tf.adelantadoPlan} ${Math.round(deltaProc)}%`
                        : deltaProc >= -3
                          ? tf.enLineaConPlan
                          : `${Math.abs(Math.round(deltaProc))}% ${tf.detrasDelPlan}`}
                    </p>
                  )}

                  <div className="space-y-4 mt-4">
                    {conPlan.map(({ a, plan }) => {
                      const real = Math.min(100, Math.round(a.avance_porcentaje ?? 0))
                      const delta = plan != null ? real - plan : null
                      return (
                        <div key={a.actividad_id}>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-sm text-slate-700 truncate">{facturaEnIngles ? (a.nombre_en || a.nombre) : a.nombre}</span>
                            <span className="text-xs text-slate-400 shrink-0">
                              {estadoActividadLabelActivo[a.estado] ?? a.estado} · {real}%{plan != null && <span> · {tf.planCorto} {plan}%</span>}
                            </span>
                          </div>

                          <div className="relative h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${a.estado === "completada" ? "bg-emerald-500" : "bg-[#3B72D8]"}`}
                              style={{ width: `${Math.max(0, real)}%` }}
                            />
                            {plan != null && (
                              <div
                                className="absolute top-0 bottom-0 w-[2px] bg-slate-500/70"
                                style={{ left: `${Math.min(99, Math.max(0, plan))}%` }}
                                title={`${tf.planCorto} ${plan}%`}
                              />
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2 mt-1">
                            <span className="text-[11px] text-slate-400">
                              {tf.planCorto}: {formatoFecha(a.fecha_inicio_plan, facturaEnIngles)} → {formatoFecha(a.fecha_fin_plan, facturaEnIngles)}
                              {" · "}{tf.realCorto}: {formatoFecha(a.fecha_inicio_real, facturaEnIngles)} → {a.fecha_fin_real ? formatoFecha(a.fecha_fin_real, facturaEnIngles) : (a.fecha_inicio_real ? tf.enCurso : "—")}
                            </span>
                            {delta != null && (
                              <span className={`text-[11px] font-medium shrink-0 ${delta >= -3 ? "text-emerald-600" : "text-amber-600"}`}>
                                {delta >= 3
                                  ? `+${Math.round(delta)}%`
                                  : delta >= -3
                                    ? "≈"
                                    : `${Math.round(delta)}%`}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
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
