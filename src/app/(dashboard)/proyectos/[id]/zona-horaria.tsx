"use client"

import { useState, useTransition } from "react"
import { Globe, Pencil, Check, X } from "lucide-react"
import { actualizarZonaHoraria } from "../actions"

const OPCIONES = [
  { value: "America/Mexico_City", label: "Ciudad de México" },
  { value: "America/Tijuana", label: "Tijuana" },
  { value: "America/Hermosillo", label: "Hermosillo" },
  { value: "America/Cancun", label: "Cancún" },
  { value: "America/New_York", label: "Este de EE. UU. (Nueva York, Miami)" },
  { value: "America/Chicago", label: "Centro de EE. UU. (Chicago)" },
  { value: "America/Denver", label: "Montaña de EE. UU. (Denver)" },
  { value: "America/Los_Angeles", label: "Pacífico de EE. UU. (Los Ángeles)" },
  { value: "America/Phoenix", label: "Arizona (sin horario de verano)" },
]

export function ZonaHoraria({
  proyectoId,
  zonaInicial,
  puedeEditar,
}: {
  proyectoId: string
  zonaInicial: string | null
  puedeEditar: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [zona, setZona] = useState(zonaInicial ?? "America/Mexico_City")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  const handleGuardar = () => {
    setError("")
    startTransition(async () => {
      const result = await actualizarZonaHoraria(proyectoId, zona)
      if (result.error) setError(result.error)
      else setEditando(false)
    })
  }

  const etiqueta = OPCIONES.find((o) => o.value === (zonaInicial ?? "America/Mexico_City"))?.label ?? zonaInicial

  if (!editando) {
    return (
      <button
        onClick={() => puedeEditar && setEditando(true)}
        disabled={!puedeEditar}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 disabled:hover:text-slate-500 group"
      >
        <Globe className="h-3.5 w-3.5" />
        <span>Zona horaria: {etiqueta}</span>
        {puedeEditar && <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <Globe className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      <select
        value={zona}
        onChange={(e) => setZona(e.target.value)}
        autoFocus
        className="text-sm border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-slate-900"
      >
        {OPCIONES.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <button onClick={handleGuardar} disabled={isPending} className="text-emerald-600 hover:text-emerald-800 disabled:opacity-50">
        <Check className="h-4 w-4" />
      </button>
      <button onClick={() => { setEditando(false); setError(""); setZona(zonaInicial ?? "America/Mexico_City") }} disabled={isPending} className="text-slate-400 hover:text-slate-600">
        <X className="h-4 w-4" />
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
