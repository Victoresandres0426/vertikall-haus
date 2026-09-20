"use client"

import { useState } from "react"
import { ArrowLeft, X } from "lucide-react"

// Antes las fotos abrían en una pestaña nueva del navegador (target
//="_blank") -- en la tablet del cliente eso se sentía como un
// callejón sin salida, sin manera clara de volver al portal. Este
// visor las abre DENTRO de la misma página, con un botón explícito de
// "Volver" arriba.
export function GaleriaFotos({
  fotos,
  columnas = "grid-cols-2 sm:grid-cols-4",
  labelVolver = "Volver",
}: {
  fotos: { url: string; alt: string }[]
  columnas?: string
  labelVolver?: string
}) {
  const [abierta, setAbierta] = useState<number | null>(null)

  if (fotos.length === 0) return null

  return (
    <>
      <div className={`grid ${columnas} gap-2`}>
        {fotos.map((f, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setAbierta(i)}
            className="block rounded-lg overflow-hidden border border-slate-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url} alt={f.alt} className="w-full h-28 object-cover" />
          </button>
        ))}
      </div>

      {abierta !== null && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <button
              type="button"
              onClick={() => setAbierta(null)}
              className="flex items-center gap-1.5 text-white text-sm font-medium"
            >
              <ArrowLeft className="h-5 w-5" /> {labelVolver}
            </button>
            <button type="button" onClick={() => setAbierta(null)} className="text-white p-1">
              <X className="h-6 w-6" />
            </button>
          </div>
          <div
            className="flex-1 flex items-center justify-center p-4 overflow-auto"
            onClick={() => setAbierta(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fotos[abierta].url}
              alt={fotos[abierta].alt}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </>
  )
}
