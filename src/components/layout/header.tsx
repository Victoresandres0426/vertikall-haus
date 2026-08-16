"use client"

import { useState, useRef, useEffect } from "react"
import { Bell, ChevronDown, Check, FolderOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Proyecto } from "@/types/database"

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
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />
        </button>
      </div>
    </header>
  )
}

// ─── Selector de proyecto ─────────────────────────────────────

interface ProyectoSelectorProps {
  /** Lista real de proyectos del tenant (desde Supabase) */
  proyectos?: Proyecto[]
  proyectoActualId?: string | null
  onSeleccionar?: (id: string) => void
  className?: string
}

export function ProyectoSelector({
  proyectos = [],
  proyectoActualId,
  onSeleccionar,
  className,
}: ProyectoSelectorProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const actual = proyectos.find((p) => p.id === proyectoActualId) ?? proyectos[0]

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 transition-colors",
          className
        )}
      >
        <FolderOpen className="h-4 w-4 text-slate-400 shrink-0" />
        <span className="font-medium max-w-[200px] truncate">
          {actual?.nombre ?? "Seleccionar proyecto"}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && proyectos.length > 0 && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[240px] bg-white rounded-xl border border-slate-200 shadow-lg py-1 overflow-hidden">
          {proyectos.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setOpen(false)
                onSeleccionar?.(p.id)
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-50 transition-colors"
            >
              <Check className={cn(
                "h-4 w-4 shrink-0",
                p.id === actual?.id ? "text-blue-600" : "text-transparent"
              )} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-800 truncate">{p.nombre}</p>
                {p.codigo && (
                  <p className="text-xs text-slate-400">{p.codigo}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {open && proyectos.length === 0 && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[200px] bg-white rounded-xl border border-slate-200 shadow-lg p-4 text-sm text-slate-500 text-center">
          No hay proyectos activos
        </div>
      )}
    </div>
  )
}
