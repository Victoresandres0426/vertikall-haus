"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, Check, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { recalcularActividadesProyecto } from "./actions"

// Botón "de última instancia" para cuando el avance/costo mostrado en
// Actividades no cuadra con lo que hay en Reportes Diarios/Gastos de
// materiales. En teoría esto nunca debería hacer falta -- los triggers
// de la base de datos (migraciones 057/064) recalculan solos con cada
// cambio -- pero sirve como red de seguridad ante cualquier caso raro
// (edición manual antigua, migración de datos, etc.) sin tener que
// pedir una migración nueva cada vez. Recorre todas las actividades del
// proyecto y refresca cantidad_ejecutada/avance_porcentaje/estado/costo_real
// desde su fuente real (avance_diario y costos_reales).
export function RecalcularBoton({ proyectoId }: { proyectoId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [resultado, setResultado] = useState<{ actualizadas: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ejecutar = () => {
    setError(null)
    setResultado(null)
    startTransition(async () => {
      const res = await recalcularActividadesProyecto(proyectoId)
      if (res.error) { setError(res.error); return }
      setResultado({ actualizadas: res.actualizadas ?? 0 })
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={ejecutar}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 text-xs font-medium border border-slate-200 text-slate-600 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors shrink-0 disabled:opacity-60"
        title="Recalcula el avance y el costo real de todas las actividades de este proyecto a partir de los Reportes Diarios y los Gastos de materiales -- útil si algo no cuadra"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} />
        {isPending ? "Recalculando..." : "Recalcular avance y costos"}
      </button>

      {resultado && !error && (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
          <Check className="h-3.5 w-3.5" />
          {resultado.actualizadas} actividad{resultado.actualizadas !== 1 ? "es" : ""} al día
        </span>
      )}
      {error && (
        <span className="inline-flex items-center gap-1 text-xs text-red-600">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
        </span>
      )}
    </div>
  )
}
