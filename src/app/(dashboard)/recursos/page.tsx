import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Users, Package, Wrench, Building2, TrendingUp } from "lucide-react"
import { Header } from "@/components/layout/header"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type CostoRaw = {
  tipo_recurso: string
  monto: number
  descripcion: string
  fecha: string
  proyectos: { nombre: string; codigo: string } | null
}

const TIPO_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string; bg: string }
> = {
  mano_obra:   { label: "Mano de Obra",  icon: Users,      color: "text-blue-600",    bg: "bg-blue-50"    },
  material:    { label: "Materiales",    icon: Package,    color: "text-emerald-600", bg: "bg-emerald-50" },
  equipo:      { label: "Equipos",       icon: Wrench,     color: "text-violet-600",  bg: "bg-violet-50"  },
  subcontrato: { label: "Subcontratos",  icon: Building2,  color: "text-orange-600",  bg: "bg-orange-50"  },
  indirecto:   { label: "Indirectos",    icon: TrendingUp, color: "text-slate-600",   bg: "bg-slate-100"  },
}

function formatMXN(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`
}

async function getRecursos(): Promise<CostoRaw[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data, error } = await supabase
    .from("costos_reales")
    .select("tipo_recurso, monto, descripcion, fecha, proyectos ( nombre, codigo )")
    .order("fecha", { ascending: false })
    .limit(200)

  if (error) {
    console.error("Error cargando recursos:", error.message)
    return []
  }
  return (data ?? []) as unknown as CostoRaw[]
}

export default async function RecursosPage() {
  const costos = await getRecursos()

  const porTipo: Record<string, { total: number; cantidad: number; items: CostoRaw[] }> = {}
  for (const c of costos) {
    const t = c.tipo_recurso
    if (!porTipo[t]) porTipo[t] = { total: 0, cantidad: 0, items: [] }
    porTipo[t].total += c.monto ?? 0
    porTipo[t].cantidad += 1
    porTipo[t].items.push(c)
  }

  const totalGeneral = costos.reduce((s, c) => s + (c.monto ?? 0), 0)
  const recientes = costos.slice(0, 10)

  return (
    <div>
      <Header titulo="Recursos" subtitulo="Resumen de costos ejecutados por tipo de recurso" />

      <div className="p-6 space-y-6">
        {/* Total general */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-700 rounded-2xl p-6 text-white">
          <p className="text-sm text-slate-400 mb-1">Costo total ejecutado</p>
          <p className="text-4xl font-bold">{formatMXN(totalGeneral)}</p>
          <p className="text-sm text-slate-400 mt-1">{costos.length} registros de costo</p>
        </div>

        {/* Cards por tipo */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Object.entries(TIPO_CONFIG).map(([tipo, cfg]) => {
            const d = porTipo[tipo] ?? { total: 0, cantidad: 0 }
            const pct = totalGeneral > 0 ? (d.total / totalGeneral) * 100 : 0
            const Icon = cfg.icon
            return (
              <Card key={tipo} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-4 pb-4">
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center mb-3", cfg.bg)}>
                    <Icon className={cn("h-5 w-5", cfg.color)} />
                  </div>
                  <p className="text-xs text-slate-500 mb-0.5">{cfg.label}</p>
                  <p className="text-lg font-bold text-slate-900">{formatMXN(d.total)}</p>
                  <div className="mt-2">
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={cn("h-1.5 rounded-full", cfg.color, "bg-current opacity-60")}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {pct.toFixed(0)}% · {d.cantidad} registros
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Tabla de últimos registros */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Últimos registros de costo</h2>
          {recientes.length === 0 ? (
            <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No hay registros de costo aún</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Tipo</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Descripción</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden md:table-cell">Proyecto</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden sm:table-cell">Fecha</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {recientes.map((c, i) => {
                    const cfg = TIPO_CONFIG[c.tipo_recurso] ?? TIPO_CONFIG.indirecto
                    const Icon = cfg.icon
                    return (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full", cfg.bg, cfg.color)}>
                            <Icon className="h-3 w-3" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700 max-w-xs truncate">{c.descripcion}</td>
                        <td className="px-4 py-3 text-slate-500 hidden md:table-cell">
                          {c.proyectos
                            ? <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{c.proyectos.codigo}</span>
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-400 hidden sm:table-cell text-xs">{c.fecha}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatMXN(c.monto ?? 0)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
