"use client"

import { useState, useTransition } from "react"
import { MapPin, Pencil, Check, X, ShieldCheck } from "lucide-react"
import { actualizarCoordenadas } from "../actions"

export function CoordenadasObra({
  proyectoId,
  coordenadasIniciales,
  puedeEditar,
}: {
  proyectoId: string
  coordenadasIniciales: { lat: number; lng: number } | null
  puedeEditar: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [lat, setLat] = useState(coordenadasIniciales?.lat?.toString() ?? "")
  const [lng, setLng] = useState(coordenadasIniciales?.lng?.toString() ?? "")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  const handleGuardar = () => {
    setError("")
    const latNum = parseFloat(lat)
    const lngNum = parseFloat(lng)
    if (isNaN(latNum) || isNaN(lngNum)) {
      setError("Coordenadas inválidas")
      return
    }
    startTransition(async () => {
      const result = await actualizarCoordenadas(proyectoId, latNum, lngNum)
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
        <MapPin className="h-3.5 w-3.5" />
        {coordenadasIniciales ? (
          <span className="flex items-center gap-1">
            {coordenadasIniciales.lat.toFixed(5)}, {coordenadasIniciales.lng.toFixed(5)}
            <ShieldCheck className="h-3 w-3 text-emerald-500" />
          </span>
        ) : (
          <span className="italic text-slate-400">Sin coordenadas GPS (check-in sin validar ubicación)</span>
        )}
        {puedeEditar && <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />}
      </button>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <input
          type="text"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          placeholder="Latitud"
          autoFocus
          className="text-sm border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-slate-900 w-28"
        />
        <input
          type="text"
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          placeholder="Longitud"
          className="text-sm border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-slate-900 w-28"
        />
        <button onClick={handleGuardar} disabled={isPending} className="text-emerald-600 hover:text-emerald-800 disabled:opacity-50">
          <Check className="h-4 w-4" />
        </button>
        <button onClick={() => { setEditando(false); setError("") }} disabled={isPending} className="text-slate-400 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="text-[10px] text-slate-400">
        Búscalo en Google Maps: clic derecho sobre el sitio → copia las coordenadas.
        Para México, EE.UU. y el resto de América, la longitud lleva signo negativo (ej. -99.13, no 99.13).
      </p>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
