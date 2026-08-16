import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { TrendingUp, TrendingDown, Banknote, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

type Proyeccion = {
  id: string
  semana: string
  ingresos_plan: number
  ingresos_real: number
  egresos_plan: number
  egresos_real: number
  saldo_proyectado: number
  alerta_liquidez: boolean
  proyectos: { nombre: string; codigo: string } | null
}

async function getData(): Promise<Proyeccion[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data, error } = await supabase
    .from("flujo_caja_proyecciones")
    .select(`
      id, semana,
      ingresos_plan, ingresos_real,
      egresos_plan, egresos_real,
      saldo_proyectado, alerta_liquidez,
      proyectos ( nombre, codigo )
    `)
    .order("semana", { ascending: true })

  if (error) {
    console.error("Error cargando flujo de caja:", error.message)
    return []
  }
  return (data ?? []) as unknown as Proyeccion[]
}

function formatMXN(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}

export default async function FlujoCajaPage() {
  const proyecciones = await getData()

  const alertasLiquidez = proyecciones.filter((p) => p.alerta_liquidez)
  const ingresosPlanTotal = proyecciones.reduce((s, p) => s + (p.ingresos_plan ?? 0), 0)
  const egresosPlanTotal = proyecciones.reduce((s, p) => s + (p.egresos_plan ?? 0), 0)
  const ingresosRealTotal = proyecciones.reduce((s, p) => s + (p.ingresos_real ?? 0), 0)
  const saldoMin = proyecciones.reduce((min, p) => Math.min(min, p.saldo_proyectado ?? 0), Infinity)

  // Agrupar por proyecto
  const proyectoMap = new Map<string, { nombre: string; codigo: string; semanas: Proyeccion[] }>()
  for (const p of proyecciones) {
    const pid = p.proyectos?.nombre ?? "Sin proyecto"
    if (!proyectoMap.has(pid)) {
      proyectoMap.set(pid, { nombre: p.proyectos?.nombre ?? "—", codigo: p.proyectos?.codigo ?? "", semanas: [] })
    }
    proyectoMap.get(pid)!.semanas.push(p)
  }

  return (
    <div>
      <Header
        titulo="Flujo de Caja"
        subtitulo={
          proyecciones.length === 0
            ? "Sin proyecciones cargadas"
            : `${proyecciones.length} semanas · ${alertasLiquidez.length > 0 ? `⚠ ${alertasLiquidez.length} alerta${alertasLiquidez.length !== 1 ? "s" : ""} de liquidez` : "Sin alertas de liquidez"}`
        }
      />

      <div className="p-6 space-y-6">
        {proyecciones.length === 0 ? (
          <div className="space-y-6">
            <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-400">
              <Banknote className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Sin proyecciones de flujo</p>
              <p className="text-sm mt-1 max-w-sm mx-auto">
                El flujo de caja se alimenta semana a semana con ingresos y egresos planeados y reales.
                Próximamente podrás cargarlo desde el presupuesto.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { icon: Banknote, label: "Ingresos vs Egresos", desc: "Compara plan vs real semana a semana" },
                { icon: TrendingUp, label: "Saldo proyectado", desc: "Anticipa semanas de liquidez crítica" },
                { icon: AlertTriangle, label: "Alertas de liquidez", desc: "Notificaciones cuando el saldo proyectado es negativo" },
              ].map((item) => (
                <div key={item.label} className="bg-white border border-slate-200 rounded-xl p-5 text-center">
                  <item.icon className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                  <p className="text-sm font-semibold text-slate-700">{item.label}</p>
                  <p className="text-xs text-slate-400 mt-1">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Alertas de liquidez */}
            {alertasLiquidez.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800">
                    {alertasLiquidez.length} semana{alertasLiquidez.length !== 1 ? "s" : ""} con alerta de liquidez
                  </p>
                  <p className="text-xs text-red-700 mt-0.5">
                    Semanas: {alertasLiquidez.map((p) => new Date(p.semana).toLocaleDateString("es-MX", { month: "short", day: "numeric" })).join(", ")}
                  </p>
                </div>
              </div>
            )}

            {/* Resumen */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Ingresos plan", val: formatMXN(ingresosPlanTotal), color: "text-emerald-600", icon: TrendingUp },
                { label: "Egresos plan", val: formatMXN(egresosPlanTotal), color: "text-red-600", icon: TrendingDown },
                { label: "Ingresos reales", val: formatMXN(ingresosRealTotal), color: "text-blue-600", icon: Banknote },
                { label: "Saldo mín.", val: saldoMin === Infinity ? "—" : formatMXN(saldoMin), color: saldoMin < 0 ? "text-red-600" : "text-slate-900", icon: AlertTriangle },
              ].map((s) => (
                <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                  <p className={cn("text-2xl font-bold", s.color)}>{s.val}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Tabla por proyecto */}
            {Array.from(proyectoMap.entries()).map(([, proy]) => (
              <div key={proy.nombre} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <span className="font-mono text-xs text-slate-500">{proy.codigo}</span>
                  <h3 className="text-sm font-semibold text-slate-800">{proy.nombre}</h3>
                  <span className="text-xs text-slate-400">· {proy.semanas.length} semanas</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="text-left px-4 py-2 text-slate-500 font-medium">Semana</th>
                        <th className="text-right px-3 py-2 text-slate-500 font-medium">Ing. plan</th>
                        <th className="text-right px-3 py-2 text-slate-500 font-medium">Ing. real</th>
                        <th className="text-right px-3 py-2 text-slate-500 font-medium">Egr. plan</th>
                        <th className="text-right px-3 py-2 text-slate-500 font-medium">Egr. real</th>
                        <th className="text-right px-4 py-2 text-slate-500 font-medium">Saldo proy.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {proy.semanas.map((sem) => {
                        const fecha = new Date(sem.semana)
                        const label = fecha.toLocaleDateString("es-MX", { month: "short", day: "numeric" })
                        const saldoNeg = (sem.saldo_proyectado ?? 0) < 0
                        return (
                          <tr key={sem.id} className={cn("hover:bg-slate-50 transition-colors", sem.alerta_liquidez ? "bg-red-50" : "")}>
                            <td className="px-4 py-2.5 font-medium text-slate-700">
                              {label}
                              {sem.alerta_liquidez && (
                                <AlertTriangle className="inline h-3 w-3 text-red-500 ml-1" />
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right text-emerald-600">{formatMXN(sem.ingresos_plan)}</td>
                            <td className={cn("px-3 py-2.5 text-right font-medium",
                              sem.ingresos_real >= sem.ingresos_plan ? "text-emerald-600" : "text-amber-600")}>
                              {formatMXN(sem.ingresos_real)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-red-500">{formatMXN(sem.egresos_plan)}</td>
                            <td className={cn("px-3 py-2.5 text-right font-medium",
                              sem.egresos_real <= sem.egresos_plan ? "text-emerald-600" : "text-red-600")}>
                              {formatMXN(sem.egresos_real)}
                            </td>
                            <td className={cn("px-4 py-2.5 text-right font-bold", saldoNeg ? "text-red-600" : "text-slate-700")}>
                              {formatMXN(sem.saldo_proyectado)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
