"use client"

import { Fragment, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, RefreshCw, CheckCircle2, ChevronDown, ChevronUp, Wallet, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  crearPeriodoNomina,
  recalcularNominaPeriodo,
  actualizarLineaNomina,
  marcarPeriodoPagado,
} from "./actions"

export type PeriodoNomina = {
  id: string
  periodo: string
  fecha_inicio: string
  fecha_fin: string
  estado: string
  created_at: string
}

export type LineaNomina = {
  id: string
  periodo_id: string
  trabajador_id: string
  dias_trabajados: number
  horas_regulares: number
  horas_extra: number
  salario_base: number
  extra_monto: number
  bonos: number
  deducciones: number
  anticipos: number
  neto_a_pagar: number
  distribucion_proyectos: { proyecto_id: string; monto: number }[] | null
}

export type TrabajadorOpcion = { id: string; nombre_completo: string; rol_obra: string | null }
export type ProyectoOpcion = { id: string; nombre: string; codigo: string }

function formatoMoneda(n: number) {
  return Number(n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
}

function formatoFecha(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
}

const periodoLabel: Record<string, string> = {
  semanal: "Semanal",
  quincenal: "Quincenal",
  mensual: "Mensual",
}

function NuevoPeriodoForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [periodo, setPeriodo] = useState("semanal")
  const [inicio, setInicio] = useState("")
  const [fin, setFin] = useState("")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 transition-colors"
      >
        <Plus className="h-4 w-4" /> Nuevo periodo
      </button>
    )
  }

  const handleCrear = () => {
    setError(null)
    startTransition(async () => {
      const res = await crearPeriodoNomina({ periodo, fecha_inicio: inicio, fecha_fin: fin })
      if (res.error) {
        setError(res.error)
      } else if (res.id) {
        setOpen(false)
        setInicio("")
        setFin("")
        onCreated(res.id)
      }
    })
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">Nuevo periodo de nómina</p>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
        >
          {Object.entries(periodoLabel).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <input
          type="date"
          value={inicio}
          onChange={(e) => setInicio(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
        <input
          type="date"
          value={fin}
          onChange={(e) => setFin(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
      </div>
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      <button
        onClick={handleCrear}
        disabled={isPending || !inicio || !fin}
        className="w-full bg-slate-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
      >
        {isPending ? "Creando..." : "Crear periodo"}
      </button>
    </div>
  )
}

function CampoEditable({
  valor,
  onGuardar,
}: {
  valor: number
  onGuardar: (nuevo: number) => void
}) {
  const [draft, setDraft] = useState(String(valor))
  const [isPending, startTransition] = useTransition()

  return (
    <input
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = Number(draft)
        if (!Number.isNaN(n) && n !== valor) startTransition(() => onGuardar(n))
      }}
      disabled={isPending}
      className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:opacity-50"
    />
  )
}

export function NominaClient({
  periodosIniciales,
  lineasIniciales,
  trabajadores,
  proyectos,
}: {
  periodosIniciales: PeriodoNomina[]
  lineasIniciales: LineaNomina[]
  trabajadores: TrabajadorOpcion[]
  proyectos: ProyectoOpcion[]
}) {
  const router = useRouter()
  const [periodoId, setPeriodoId] = useState<string | undefined>(periodosIniciales[0]?.id)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const trabajadorPorId = new Map(trabajadores.map((t) => [t.id, t]))
  const proyectoPorId = new Map(proyectos.map((p) => [p.id, p]))

  const periodoActual = periodosIniciales.find((p) => p.id === periodoId)
  const lineasPeriodo = lineasIniciales
    .filter((l) => l.periodo_id === periodoId)
    .sort((a, b) => {
      const na = trabajadorPorId.get(a.trabajador_id)?.nombre_completo ?? ""
      const nb = trabajadorPorId.get(b.trabajador_id)?.nombre_completo ?? ""
      return na.localeCompare(nb)
    })

  const totalNeto = lineasPeriodo.reduce((s, l) => s + Number(l.neto_a_pagar ?? 0), 0)

  const handleRecalcular = () => {
    if (!periodoId) return
    setErrorMsg(null)
    startTransition(async () => {
      const res = await recalcularNominaPeriodo(periodoId)
      if (res.error) setErrorMsg(res.error)
      router.refresh()
    })
  }

  const handleMarcarPagado = () => {
    if (!periodoId) return
    setErrorMsg(null)
    startTransition(async () => {
      const res = await marcarPeriodoPagado(periodoId)
      if (res.error) setErrorMsg(res.error)
      router.refresh()
    })
  }

  if (periodosIniciales.length === 0) {
    return (
      <div className="p-6 space-y-4 max-w-3xl">
        <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl text-slate-400">
          <Wallet className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="font-medium">Todavía no hay periodos de nómina</p>
          <p className="text-sm mt-1">Crea el primero para empezar a calcular sueldos</p>
        </div>
        <NuevoPeriodoForm onCreated={() => router.refresh()} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={periodoId}
          onChange={(e) => setPeriodoId(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
        >
          {periodosIniciales.map((p) => (
            <option key={p.id} value={p.id}>
              {periodoLabel[p.periodo] ?? p.periodo} · {formatoFecha(p.fecha_inicio)} – {formatoFecha(p.fecha_fin)}
              {p.estado === "pagado" ? " (pagado)" : ""}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <NuevoPeriodoForm onCreated={(id) => { setPeriodoId(id); router.refresh() }} />
        </div>
      </div>

      {periodoActual && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRecalcular}
              disabled={isPending || periodoActual.estado === "pagado"}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} />
              Calcular / recalcular nómina
            </button>
            {periodoActual.estado !== "pagado" && lineasPeriodo.length > 0 && (
              <button
                onClick={handleMarcarPagado}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Marcar periodo como pagado
              </button>
            )}
            {periodoActual.estado === "pagado" && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                Periodo pagado
              </span>
            )}
          </div>

          {errorMsg && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errorMsg}</p>
          )}

          {lineasPeriodo.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl text-slate-400">
              <p className="font-medium">Sin cálculo todavía para este periodo</p>
              <p className="text-sm mt-1">Dale a &quot;Calcular / recalcular nómina&quot; para generar las líneas por trabajador</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-2.5 font-medium">Trabajador</th>
                      <th className="px-3 py-2.5 font-medium text-right">Días</th>
                      <th className="px-3 py-2.5 font-medium text-right">Hrs reg.</th>
                      <th className="px-3 py-2.5 font-medium text-right">Hrs extra</th>
                      <th className="px-3 py-2.5 font-medium text-right">Salario base</th>
                      <th className="px-3 py-2.5 font-medium text-right">Bonos</th>
                      <th className="px-3 py-2.5 font-medium text-right">Deducc.</th>
                      <th className="px-3 py-2.5 font-medium text-right">Anticipos</th>
                      <th className="px-3 py-2.5 font-medium text-right">Neto a pagar</th>
                      <th className="px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {lineasPeriodo.map((l) => {
                      const trabajador = trabajadorPorId.get(l.trabajador_id)
                      const distribucion = l.distribucion_proyectos ?? []
                      const pagado = periodoActual.estado === "pagado"
                      return (
                        <Fragment key={l.id}>
                          <tr className="hover:bg-slate-50/50">
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-slate-800">{trabajador?.nombre_completo ?? "—"}</p>
                              <p className="text-xs text-slate-400 capitalize">{trabajador?.rol_obra ?? "—"}</p>
                            </td>
                            <td className="px-3 py-2.5 text-right text-slate-600">{Number(l.dias_trabajados ?? 0)}</td>
                            <td className="px-3 py-2.5 text-right text-slate-600">{Number(l.horas_regulares ?? 0)}</td>
                            <td className="px-3 py-2.5 text-right text-slate-600">{Number(l.horas_extra ?? 0)}</td>
                            <td className="px-3 py-2.5 text-right text-slate-600">{formatoMoneda(l.salario_base)}</td>
                            <td className="px-3 py-2.5 text-right">
                              {pagado ? formatoMoneda(l.bonos) : (
                                <CampoEditable valor={l.bonos} onGuardar={(v) => actualizarLineaNomina(l.id, "bonos", v).then(() => router.refresh())} />
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {pagado ? formatoMoneda(l.deducciones) : (
                                <CampoEditable valor={l.deducciones} onGuardar={(v) => actualizarLineaNomina(l.id, "deducciones", v).then(() => router.refresh())} />
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {pagado ? formatoMoneda(l.anticipos) : (
                                <CampoEditable valor={l.anticipos} onGuardar={(v) => actualizarLineaNomina(l.id, "anticipos", v).then(() => router.refresh())} />
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{formatoMoneda(l.neto_a_pagar)}</td>
                            <td className="px-3 py-2.5 text-right">
                              {distribucion.length > 0 && (
                                <button
                                  onClick={() => setExpandido(expandido === l.id ? null : l.id)}
                                  className="text-slate-400 hover:text-slate-700"
                                  title="Ver desglose por proyecto"
                                >
                                  {expandido === l.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </button>
                              )}
                            </td>
                          </tr>
                          {expandido === l.id && distribucion.length > 0 && (
                            <tr className="bg-slate-50/70">
                              <td colSpan={10} className="px-4 py-2.5">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                                  Costo de mano de obra por proyecto en este periodo
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {distribucion.map((d, i) => {
                                    const proyecto = proyectoPorId.get(d.proyecto_id)
                                    return (
                                      <span key={i} className="text-xs bg-white border border-slate-200 rounded-full px-2.5 py-1">
                                        {proyecto ? `${proyecto.codigo} — ${proyecto.nombre}` : d.proyecto_id}: <strong>{formatoMoneda(d.monto)}</strong>
                                      </span>
                                    )
                                  })}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-semibold text-slate-800">
                      <td className="px-4 py-2.5" colSpan={8}>Total del periodo</td>
                      <td className="px-3 py-2.5 text-right">{formatoMoneda(totalNeto)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
