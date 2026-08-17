"use client"

import { useState, useTransition } from "react"
import { DatabaseBackup, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { enviarRespaldoAhora } from "./actions"

export function RespaldoButton({ destino }: { destino: string }) {
  const [isPending, startTransition] = useTransition()
  const [resultado, setResultado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleClick = () => {
    setError(null)
    setResultado(null)
    startTransition(async () => {
      const res = await enviarRespaldoAhora()
      if (res.error) setError(res.error)
      else setResultado(`Respaldo enviado a ${destino}.`)
    })
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
          <DatabaseBackup className="h-5 w-5 text-slate-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-800">Respaldo automático semanal</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Cada lunes se envía por correo una copia completa de toda la información del sistema, en un archivo adjunto.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={handleClick} isLoading={isPending}>
              Enviar respaldo ahora
            </Button>
            {resultado && (
              <span className="text-xs text-emerald-600 flex items-center gap-1">
                <Check className="h-3.5 w-3.5" /> {resultado}
              </span>
            )}
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
