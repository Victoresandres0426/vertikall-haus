"use client"

import { useState, useTransition } from "react"
import { RefreshCw } from "lucide-react"
import { recalcularCronogramaProyecto } from "./actions"

export function BotonRecalcular({ proyectoId }: { proyectoId: string }) {
  const [isPending, startTransition] = useTransition()
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const recalcular = () => {
    setMensaje(null)
    setError(null)
    startTransition(async () => {
      const res = await recalcularCronogramaProyecto(proyectoId)
      if (res.error) {
        setError(res.error)
        return
      }
      setMensaje(
        `Listo: ${res.reprogramadas ?? 0} actividad(es) con fecha reprogramada, ` +
        `${res.criticas ?? 0} en ruta crítica. Recarga la página para ver el diagrama actualizado.`
      )
    })
  }

  return (
    <div className="flex flex-col items-end gap-1 print:hidden">
      <button
        onClick={recalcular}
        disabled={isPending}
        title="Vuelve a calcular fechas, ruta crítica y holgura de todas las actividades del proyecto, saltando fines de semana"
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium transition-colors shrink-0 disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Recalculando..." : "Recalcular cronograma"}
      </button>
      {mensaje && <p className="text-xs text-emerald-600 max-w-xs text-right">{mensaje}</p>}
      {error && <p className="text-xs text-red-600 max-w-xs text-right">{error}</p>}
    </div>
  )
}
