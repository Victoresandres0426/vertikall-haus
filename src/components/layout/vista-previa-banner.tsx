"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Eye } from "lucide-react"
import { terminarVistaPrevia } from "@/app/vista-previa-actions"

export const ETIQUETA_ROL: Record<string, string> = {
  cliente: "Cliente",
  colaborador_externo: "Colaborador externo",
  subcontratista: "Subcontratista",
  project_manager: "Project Manager",
  capataz: "Capataz",
}

export function VistaPreviaBanner({ rol }: { rol: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  return (
    <div className="flex items-center justify-between gap-3 bg-amber-500 text-white text-sm px-4 py-2 shrink-0">
      <span className="flex items-center gap-2 min-w-0">
        <Eye className="h-4 w-4 flex-shrink-0" />
        <span className="truncate">
          Vista previa como <strong>{ETIQUETA_ROL[rol] ?? rol}</strong>. Las acciones que hagas son reales.
        </span>
      </span>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            await terminarVistaPrevia()
            router.push("/dashboard")
            router.refresh()
          })
        }
        className="flex-shrink-0 rounded-md bg-white/20 hover:bg-white/30 px-3 py-1 font-medium transition-colors disabled:opacity-60"
      >
        {pending ? "Volviendo..." : "Volver a dueño"}
      </button>
    </div>
  )
}
