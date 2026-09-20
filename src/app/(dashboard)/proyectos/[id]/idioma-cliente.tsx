"use client"

import { useState, useTransition } from "react"
import { Languages } from "lucide-react"
import { actualizarIdiomaCliente } from "../actions"

export function IdiomaCliente({
  proyectoId,
  idiomaInicial,
  puedeEditar,
}: {
  proyectoId: string
  idiomaInicial: "es" | "en"
  puedeEditar: boolean
}) {
  const [idioma, setIdioma] = useState<"es" | "en">(idiomaInicial)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  const handleChange = (nuevo: "es" | "en") => {
    const anterior = idioma
    setIdioma(nuevo)
    setError("")
    startTransition(async () => {
      const result = await actualizarIdiomaCliente(proyectoId, nuevo)
      if (result.error) {
        setError(result.error)
        setIdioma(anterior)
      }
    })
  }

  return (
    <div className="flex items-center gap-1.5">
      <Languages className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      <select
        value={idioma}
        disabled={!puedeEditar || isPending}
        onChange={(e) => handleChange(e.target.value as "es" | "en")}
        className="text-sm border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:bg-slate-50 disabled:text-slate-400"
        title="Idioma de la factura enviada al cliente (correo y portal)"
      >
        <option value="es">Español</option>
        <option value="en">English</option>
      </select>
      {error && <span className="text-xs text-red-600 ml-1">{error}</span>}
    </div>
  )
}
