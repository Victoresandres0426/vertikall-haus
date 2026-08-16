import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { GitMerge, DollarSign, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

type ChangeOrder = {
  id: string
  numero: string | null
  titulo: string
  descripcion: string | null
  solicitado_por: string | null
  estado: string
  impacto_costo: number
  impacto_dias: number
  facturado: boolean
  cobrado: boolean
  created_at: string
  aprobado_at: string | null
  proyectos: { nombre: string; codigo: string } | null
}

async function getData(): Promise<ChangeOrder[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data, error } = await supabase
    .from("change_orders")
    .select(`
      id, numero, titulo, descripcion, solicitado_por,
      estado, impacto_costo, impacto_dias,
      facturado, cobrado, created_at, aprobado_at,
      proyectos ( nombre, codigo )
    `)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error cargando change orders:", error.message)
    return []
  }
  return (data ?? []) as unknown as ChangeOrder[]
}

const estadoConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  detectado: { label: "Detectado", color: "bg-slate-100 text-slate-700", icon: AlertCircle },
  en_estimacion: { label: "En estimación", color: "bg-blue-100 text-blue-700", icon: Clock },
  enviado_cliente: { label: "Enviado cliente", color: "bg-amber-100 text-amber-700", icon: Clock },
  aprobado: { label: "Aprobado", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  rechazado: { label: "Rechazado", color: "bg-red-100 text-red-700", icon: XCircle },
  facturado: { label: "Facturado", color: "bg-purple-100 text-purple-700", icon: DollarSign },
  cobrado: { label: "Cobrado", color: "bg-emerald-200 text-emerald-800", icon: CheckCircle },
}

function formatMXN(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}

export default async function ChangeOrdersPage() {
  const changeOrders = await getData()

  const aprobados = changeOrders.filter((co) => ["aprobado", "facturado", "cobrado"].includes(co.estado))
  const pendientes = changeOrders.filter((co) => ["detectado", "en_estimacion", "enviado_cliente"].includes(co.estado))
  const impactoTotal = aprobados.reduce((s, co) => s + (co.impacto_costo ?? 0), 0)
  const diasImpacto = aprobados.reduce((s, co) => s + (co.impacto_dias ?? 0), 0)

  return (
    <div>
      <Header
        titulo="Change Orders"
        subtitulo={
          changeOrders.length === 0
            ? "Sin órdenes de cambio"
            : `${changeOrders.length} total · ${pendientes.length} pendientes · ${formatMXN(impactoTotal)} impacto aprobado`
        }
      />

      <div className="p-6 space-y-6">
        {changeOrders.length === 0 ? (
          <div className="space-y-6">
            <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-400">
              <GitMerge className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Sin change orders</p>
              <p className="text-sm mt-1 max-w-sm mx-auto">
                Los change orders se crean cuando el cliente solicita cambios de alcance
                o cuando se detectan condiciones imprevistas en obra.
              </p>
            </div>

            {/* Pipeline de estados */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-sm font-semibold text-slate-700 mb-4">Flujo de un Change Order</p>
              <div className="flex items-center gap-2 flex-wrap">
                {Object.values(estadoConfig).map((cfg, i, arr) => (
                  <div key={cfg.label} className="flex items-center gap-2">
                    <span className={cn("text-xs px-2 py-1 rounded-full font-medium", cfg.color)}>
                      {cfg.label}
                    </span>
                    {i < arr.length - 1 && <span className="text-slate-300">→</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Resumen */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Total", val: changeOrders.length, color: "text-slate-900" },
                { label: "Pendientes", val: pendientes.length, color: "text-amber-600" },
                { label: "Impacto aprobado", val: formatMXN(impactoTotal), color: impactoTotal > 0 ? "text-red-600" : "text-emerald-600" },
                { label: "Días de impacto", val: `+${diasImpacto}d`, color: diasImpacto > 0 ? "text-red-600" : "text-slate-500" },
              ].map((s) => (
                <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                  <p className={cn("text-2xl font-bold", s.color)}>{s.val}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Lista */}
            <div className="space-y-3">
              {changeOrders.map((co) => {
                const cfg = estadoConfig[co.estado] ?? estadoConfig.detectado
                const Icon = cfg.icon
                return (
                  <div key={co.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {co.numero && (
                            <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                              {co.numero}
                            </span>
                          )}
                          {co.proyectos && (
                            <span className="text-xs text-slate-400">{co.proyectos.codigo}</span>
                          )}
                          <span className={cn("flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium", cfg.color)}>
                            <Icon className="h-3 w-3" />
                            {cfg.label}
                          </span>
                          {co.facturado && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Facturado</span>
                          )}
                          {co.cobrado && (
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Cobrado</span>
                          )}
                        </div>
                        <h3 className="text-sm font-semibold text-slate-900">{co.titulo}</h3>
                        {co.proyectos && (
                          <p className="text-xs text-slate-400 mt-0.5">{co.proyectos.nombre}</p>
                        )}
                        {co.descripcion && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{co.descripcion}</p>
                        )}
                        {co.solicitado_por && (
                          <p className="text-xs text-slate-400 mt-1">Solicitado por: {co.solicitado_por}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right space-y-1">
                        {(co.impacto_costo ?? 0) !== 0 && (
                          <div>
                            <p className="text-xs text-slate-400">Impacto costo</p>
                            <p className={cn("text-sm font-bold", co.impacto_costo > 0 ? "text-red-600" : "text-emerald-600")}>
                              {co.impacto_costo > 0 ? "+" : ""}{formatMXN(co.impacto_costo)}
                            </p>
                          </div>
                        )}
                        {(co.impacto_dias ?? 0) !== 0 && (
                          <div>
                            <p className="text-xs text-slate-400">Días</p>
                            <p className={cn("text-sm font-bold", co.impacto_dias > 0 ? "text-amber-600" : "text-emerald-600")}>
                              {co.impacto_dias > 0 ? "+" : ""}{co.impacto_dias}d
                            </p>
                          </div>
                        )}
                        <p className="text-xs text-slate-300">
                          {new Date(co.created_at).toLocaleDateString("es-MX")}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
