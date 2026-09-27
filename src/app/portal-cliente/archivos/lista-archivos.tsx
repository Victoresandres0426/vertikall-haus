"use client"

import { FileText, Download } from "lucide-react"
import type { ArchivoProyecto } from "../_shared"

function formatoTamano(bytes: number | null) {
  if (!bytes) return null
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ListaArchivos({ archivos, en }: { archivos: ArchivoProyecto[]; en: boolean }) {
  const categoriaLabel: Record<string, string> = {
    planos: en ? "Plans" : "Planos",
    otros: en ? "Other" : "Otros",
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
      {archivos.map((a) => (
        <a
          key={a.id}
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors"
        >
          <div className="h-10 w-10 rounded-xl bg-[#3B72D8]/10 flex items-center justify-center shrink-0">
            <FileText className="h-5 w-5 text-[#3B72D8]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{a.nombre_archivo}</p>
            <p className="text-xs text-slate-400">
              {categoriaLabel[a.categoria] ?? a.categoria}
              {formatoTamano(a.tamano_bytes) ? ` · ${formatoTamano(a.tamano_bytes)}` : ""}
            </p>
          </div>
          <Download className="h-4 w-4 text-slate-300 shrink-0" />
        </a>
      ))}
    </div>
  )
}
