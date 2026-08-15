"use client"

import { Bell, Search, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface HeaderProps {
  titulo: string
  subtitulo?: string
  acciones?: React.ReactNode
}

export function Header({ titulo, subtitulo, acciones }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{titulo}</h1>
        {subtitulo && (
          <p className="text-sm text-slate-500 mt-0.5">{subtitulo}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {acciones}
        <button className="relative p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
          <Bell className="h-5 w-5" />
          {/* Punto de notificación */}
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />
        </button>
      </div>
    </header>
  )
}

// Selector de proyecto para el header
interface ProyectoSelectorProps {
  proyectoActual?: string
  className?: string
}

export function ProyectoSelector({ proyectoActual, className }: ProyectoSelectorProps) {
  return (
    <button className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 transition-colors",
      className
    )}>
      <span className="font-medium">{proyectoActual ?? "Seleccionar proyecto"}</span>
      <ChevronDown className="h-4 w-4 text-slate-400" />
    </button>
  )
}
