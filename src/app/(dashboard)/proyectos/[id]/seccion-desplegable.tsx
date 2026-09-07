"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

// Envoltorio genérico para secciones largas (ruta crítica, procesos y
// actividades, etc.) que antes siempre estaban expandidas y hacían la
// página muy larga -- ahora arrancan cerradas y el usuario las abre
// solo cuando quiere verlas.
export function SeccionDesplegable({
  icono,
  titulo,
  contador,
  extra,
  defaultAbierta = false,
  children,
}: {
  icono: ReactNode
  titulo: string
  contador?: string
  extra?: ReactNode
  defaultAbierta?: boolean
  children: ReactNode
}) {
  const [abierta, setAbierta] = useState(defaultAbierta)

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          {icono}
          <h2 className="text-sm font-semibold text-slate-700">{titulo}</h2>
          {contador && <span className="text-xs text-slate-400 shrink-0">· {contador}</span>}
          {abierta ? (
            <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
          )}
        </button>
        {extra}
      </div>
      {abierta && children}
    </section>
  )
}
