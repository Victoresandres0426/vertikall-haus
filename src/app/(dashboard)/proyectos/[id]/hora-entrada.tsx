"use client"

import { useState, useTransition } from "react"
import { Clock, Pencil, Check, X } from "lucide-react"
import { actualizarHoraEntrada } from "../actions"

export function HoraEntrada({
  proyectoId,
  horaInicial,
  puedeEditar,
}: {
  proyectoId: string
  horaInicial: string | null
  puedeEditar: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [hora, setHora] = useState(horaInicial?.substring(0, 5) ?? "")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  const handleGuardar = () => {
    setError("")
    startTransition(async () => {
      const result = await actualizarHoraEntrada(proyectoId, hora)
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
      >
        <Clock className="h-3.5 w-3.5" />
        {horaInicial ? (
          <span>Entrada esperada: {horaInicial.substring(0, 5)}</span>
        ) : (
          <span className="italic text-slate-400">Sin hora de entrada configurada (no marca llegadas tarde)</span>
        )}
        {puedeEditar && <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      <input
        type="time"
        value={hora}
        onChange={(e) => setHora(e.target.value)}
        autoFocus
        className="text-sm border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-slate-900"
      />
      <button onClick={handleGuardar} disabled={isPending} className="text-emerald-600 hover:text-emerald-800 disabled:opacity-50">
        <Check className="h-4 w-4" />
      </button>
      <button onClick={() => { setEditando(false); setError("") }} disabled={isPending} className="text-slate-400 hover:text-slate-600">
        <X className="h-4 w-4" />
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
