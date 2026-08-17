"use client"

import { useState, useTransition } from "react"
import { ChevronDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { actualizarEstadoProyecto } from "../actions"

const ESTADOS = ["activo", "pausado", "completado", "cancelado"] as const

const estadoStyle: Record<string, string> = {
  activo: "bg-emerald-100 text-emerald-700",
  pausado: "bg-amber-100 text-amber-700",
  completado: "bg-slate-100 text-slate-600",
  cancelado: "bg-red-100 text-red-600",
}

const estadoLabel: Record<string, string> = {
  activo: "Activo",
  pausado: "Pausado",
  completado: "Completado",
  cancelado: "Cancelado",
}

export function EstadoProyecto({
  proyectoId,
  estadoInicial,
  puedeEditar,
}: {
  proyectoId: string
  estadoInicial: string
  puedeEditar: boolean
}) {
  const [estado, setEstado] = useState(estadoInicial)
  const [editando, setEditando] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  const handleCambiar = (nuevo: string) => {
    if (nuevo === estado) { setEditando(false); return }
    setError("")
    const anterior = estado
    setEstado(nuevo)
    startTransition(async () => {
      const result = await actualizarEstadoProyecto(proyectoId, nuevo)
      if (result.error) {
        setError(result.error)
        setEstado(anterior)
      } else {
        setEditando(false)
      }
    })
  }

  if (!puedeEditar) {
    return (
      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", estadoStyle[estado] ?? "bg-slate-100 text-slate-600")}>
        {estadoLabel[estado] ?? estado}
      </span>
    )
  }

  if (!editando) {
    return (
      <button
        onClick={() => setEditando(true)}
        className={cn(
          "text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 hover:opacity-80 transition-opacity",
          estadoStyle[estado] ?? "bg-slate-100 text-slate-600"
        )}
      >
        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : estadoLabel[estado] ?? estado}
        {!isPending && <ChevronDown className="h-3 w-3" />}
      </button>
    )
  }

  return (
    <div className="relative inline-block">
      <select
        autoFocus
        value={estado}
        disabled={isPending}
        onChange={(e) => handleCambiar(e.target.value)}
        onBlur={() => setEditando(false)}
        className="text-xs px-2 py-0.5 rounded-full font-medium border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 capitalize"
      >
        {ESTADOS.map((e) => (
          <option key={e} value={e}>{estadoLabel[e]}</option>
        ))}
      </select>
      {error && <span className="absolute left-0 top-full mt-1 text-xs text-red-600 whitespace-nowrap">{error}</span>}
    </div>
  )
}
