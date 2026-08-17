"use client"

import { useState, useTransition } from "react"
import { Phone, Pencil, Check, X } from "lucide-react"
import { actualizarClienteTelefono } from "../actions"

export function TelefonoCliente({
  proyectoId,
  telefonoInicial,
  puedeEditar,
}: {
  proyectoId: string
  telefonoInicial: string | null
  puedeEditar: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [telefono, setTelefono] = useState(telefonoInicial ?? "")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  const handleGuardar = () => {
    setError("")
    startTransition(async () => {
      const result = await actualizarClienteTelefono(proyectoId, telefono.trim())
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
        <Phone className="h-3.5 w-3.5" />
        {telefonoInicial ? (
          <span>{telefonoInicial}</span>
        ) : (
          <span className="italic text-slate-400">Sin teléfono de contacto</span>
        )}
        {puedeEditar && <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      <input
        type="tel"
        value={telefono}
        onChange={(e) => setTelefono(e.target.value)}
        placeholder="+1 305 555 0100"
        autoFocus
        className="text-sm border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-slate-900 w-48"
      />
      <button onClick={handleGuardar} disabled={isPending} className="text-emerald-600 hover:text-emerald-800 disabled:opacity-50">
        <Check className="h-4 w-4" />
      </button>
      <button onClick={() => { setEditando(false); setTelefono(telefonoInicial ?? ""); setError("") }} disabled={isPending} className="text-slate-400 hover:text-slate-600">
        <X className="h-4 w-4" />
      </button>
      {error && <span className="text-xs text-red-600 ml-1">{error}</span>}
    </div>
  )
}
