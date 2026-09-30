"use client"

import { useState, useTransition } from "react"
import { Percent, Pencil, Check, X } from "lucide-react"
import { actualizarMargenCO } from "../actions"

export function MargenCO({
  proyectoId,
  margenInicial,
  puedeEditar,
}: {
  proyectoId: string
  margenInicial: number
  puedeEditar: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [margen, setMargen] = useState(String(margenInicial))
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  const handleGuardar = () => {
    const valor = parseFloat(margen)
    if (!Number.isFinite(valor)) return
    setError("")
    startTransition(async () => {
      const result = await actualizarMargenCO(proyectoId, valor)
      if (result.error) setError(result.error)
      else setEditando(false)
    })
  }

  if (!editando) {
    return (
      <button
        onClick={() => puedeEditar && setEditando(true)}
        disabled={!puedeEditar}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 disabled:hover:text-slate-500 group"
        title="Indirectos + Contingencia + Margen (Utilidad+OH) que se suman automáticamente al costo directo (material+mano de obra) al registrar un Change Order"
      >
        <Percent className="h-3.5 w-3.5" />
        <span>Margen Change Orders: {margenInicial}%</span>
        {puedeEditar && <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <Percent className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      <input
        type="number"
        step="0.01"
        min="0"
        max="100"
        value={margen}
        onChange={(e) => setMargen(e.target.value)}
        autoFocus
        className="w-20 text-sm border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-slate-900"
      />
      <button onClick={handleGuardar} disabled={isPending} className="text-emerald-600 hover:text-emerald-800 disabled:opacity-50">
        <Check className="h-4 w-4" />
      </button>
      <button onClick={() => { setEditando(false); setError(""); setMargen(String(margenInicial)) }} disabled={isPending} className="text-slate-400 hover:text-slate-600">
        <X className="h-4 w-4" />
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
