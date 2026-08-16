import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { FileText, TrendingUp, TrendingDown, Layers, DollarSign } from "lucide-react"
import { cn } from "@/lib/utils"

type Partida = {
  id: string
  codigo: string | null
  descripcion: string
  tipo_recurso: string
  cantidad: number | null
  unidad: string | null
  precio_unitario: number | null
  monto_presupuestado: number
  monto_comprometido: number
  monto_ejercido: number
  proceso_id: string | null
  actividad_id: string | null
  procesos: { nombre: string; codigo: string } | null
}

type Presupuesto = {
  id: string
  version: number
  nombre_version: string
  es_baseline_actual: boolean
  monto_total: number | null
  proyectos: { nombre: string; codigo: string } | null
  partidas: Partida[]
}

async function getData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data } = await supabase
    .from("presupuestos")
    .select(`
      id, version, nombre_version, es_baseline_actual, monto_total,
      proyectos ( nombre, codigo ),
      partidas_presupuesto (
        id, codigo, descripcion, tipo_recurso,
        cantidad, unidad, precio_unitario,
        monto_presupuestado, monto_comprometido, monto_ejercido,
        proceso_id, actividad_id,
        procesos ( nombre, codigo )
      )
    `)
    .order("created_at", { ascending: false })

  return (data ?? []) as unknown as Presupuesto[]
}

const tipoLabel: Record<string, string> = {
  mano_obra: "Mano de obra",
  material: "Material",
  equipo: "Equipo",
  subcontrato: "Subcontrato",
  indirecto: "Indirecto",
}

const tipoColor: Record<string, string> = {
  mano_obra: "bg-blue-100 text-blue-700",
  material: "bg-amber-100 text-amber-700",
  equipo: "bg-purple-100 text-purple-700",
  subcontrato: "bg-orange-100 text-orange-700",
  indirecto: "bg-slate-100 text-slate-600",
}

function formatMXN(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}

export default async function PresupuestoPage() {
  const presupuestos = await getData()

  const totalPresupuestado = presupuestos.reduce((s, p) => s + (p.monto_total ?? 0), 0)
  const totalPartidas = presupuestos.reduce((s, p) => s + p.partidas.length, 0)
  const totalEjercido = presupuestos.reduce(
    (s, p) => s + p.partidas.reduce((sp, pa) => sp + (pa.monto_ejercido ?? 0), 0),
    0
  )

  return (
    <div>
      <Header
        titulo="Presupuesto"
        subtitulo={
          presupuestos.length === 0
            ? "Sin presupuestos cargados"
            : `${presupuestos.length} versión${presupuestos.length !== 1 ? "es" : ""} · ${totalPartidas} partidas · ${formatMXN(totalPresupuestado)} total`
        }
      />

      <div className="p-6 space-y-6">
        {presupuestos.length === 0 ? (
          <div className="space-y-6">
            <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-400">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Sin presupuestos</p>
              <p className="text-sm mt-1 max-w-sm mx-auto">
                Los presupuestos se cargan desde un archivo Excel o se crean importando el catálogo de conceptos.
                Próximamente podrás importar aquí.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { icon: FileText, label: "Versiones", desc: "Maneja múltiples versiones y baseline del presupuesto" },
                { icon: Layers, label: "Partidas", desc: "Desglose por partida, proceso y tipo de recurso" },
                { icon: DollarSign, label: "Control", desc: "Compara presupuestado vs comprometido vs ejercido" },
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
            {/* Resumen global */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Presupuestado", val: formatMXN(totalPresupuestado), color: "text-slate-900" },
                { label: "Ejercido", val: formatMXN(totalEjercido), color: "text-blue-600" },
                {
                  label: "Variación",
                  val: formatMXN(Math.abs(totalPresupuestado - totalEjercido)),
                  color: totalEjercido > totalPresupuestado ? "text-red-600" : "text-emerald-600",
                },
                { label: "% ejercido", val: totalPresupuestado > 0 ? `${Math.round((totalEjercido / totalPresupuestado) * 100)}%` : "—", color: "text-slate-700" },
              ].map((s) => (
                <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                  <p className={cn("text-2xl font-bold", s.color)}>{s.val}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Presupuestos */}
            {presupuestos.map((pres) => {
              const ejercidoTotal = pres.partidas.reduce((s, p) => s + (p.monto_ejercido ?? 0), 0)
              const presTotal = pres.monto_total ?? pres.partidas.reduce((s, p) => s + (p.monto_presupuestado ?? 0), 0)
              const pctEjercido = presTotal > 0 ? Math.round((ejercidoTotal / presTotal) * 100) : 0

              // Agrupar por tipo_recurso
              const porTipo: Record<string, { presup: number; ejercido: number }> = {}
              for (const p of pres.partidas) {
                if (!porTipo[p.tipo_recurso]) porTipo[p.tipo_recurso] = { presup: 0, ejercido: 0 }
                porTipo[p.tipo_recurso].presup += p.monto_presupuestado ?? 0
                porTipo[p.tipo_recurso].ejercido += p.monto_ejercido ?? 0
              }

              return (
                <div key={pres.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      {pres.proyectos && (
                        <span className="font-mono text-xs text-slate-500">{pres.proyectos.codigo}</span>
                      )}
                      <h3 className="text-sm font-semibold text-slate-800">
                        {pres.proyectos?.nombre ?? "Proyecto"} — v{pres.version}: {pres.nombre_version}
                      </h3>
                      {pres.es_baseline_actual && (
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">Baseline</span>
                      )}
                    </div>
                    <div className="text-right text-xs">
                      <p className="font-bold text-slate-900">{formatMXN(presTotal)}</p>
                      <p className={cn("font-medium", pctEjercido > 100 ? "text-red-600" : "text-slate-500")}>
                        {pctEjercido}% ejercido
                      </p>
                    </div>
                  </div>

                  {/* Resumen por tipo */}
                  <div className="px-4 py-3 grid grid-cols-3 sm:grid-cols-5 gap-3 border-b border-slate-100">
                    {Object.entries(porTipo).map(([tipo, vals]) => (
                      <div key={tipo} className="text-center">
                        <span className={cn("text-xs px-1.5 py-0.5 rounded", tipoColor[tipo] ?? "bg-slate-100 text-slate-600")}>
                          {tipoLabel[tipo] ?? tipo}
                        </span>
                        <p className="text-sm font-bold text-slate-900 mt-1">{formatMXN(vals.presup)}</p>
                        <p className="text-xs text-slate-400">{formatMXN(vals.ejercido)} ejec.</p>
                      </div>
                    ))}
                  </div>

                  {/* Partidas */}
                  <div className="divide-y divide-slate-50">
                    {pres.partidas.slice(0, 10).map((partida) => {
                      const desviacion = (partida.monto_ejercido ?? 0) - (partida.monto_presupuestado ?? 0)
                      const pct = partida.monto_presupuestado > 0
                        ? Math.round(((partida.monto_ejercido ?? 0) / partida.monto_presupuestado) * 100)
                        : 0
                      return (
                        <div key={partida.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-sm">
                          <div className="flex-1 min-w-0">
                            {partida.codigo && (
                              <span className="font-mono text-xs text-slate-400 mr-2">{partida.codigo}</span>
                            )}
                            <span className="text-slate-800 truncate">{partida.descripcion}</span>
                          </div>
                          <span className={cn("text-xs px-1.5 py-0.5 rounded shrink-0", tipoColor[partida.tipo_recurso] ?? "bg-slate-100 text-slate-600")}>
                            {tipoLabel[partida.tipo_recurso] ?? partida.tipo_recurso}
                          </span>
                          <div className="text-right shrink-0 space-x-4 flex">
                            <span className="text-slate-500 text-xs">{formatMXN(partida.monto_presupuestado)}</span>
                            <span className={cn("font-medium text-xs flex items-center gap-0.5",
                              desviacion > 0 ? "text-red-600" : desviacion < 0 ? "text-emerald-600" : "text-slate-500"
                            )}>
                              {desviacion > 0 ? <TrendingUp className="h-3 w-3" /> : desviacion < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                              {desviacion !== 0 ? formatMXN(Math.abs(desviacion)) : "—"}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                    {pres.partidas.length > 10 && (
                      <div className="px-4 py-2 text-xs text-slate-400 text-center">
                        +{pres.partidas.length - 10} partidas más
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
