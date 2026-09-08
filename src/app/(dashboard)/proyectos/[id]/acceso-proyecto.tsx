"use client"

import { useState } from "react"
import { ShieldCheck, UserPlus, X, ChevronDown, ChevronUp, Loader2, KeyRound } from "lucide-react"
import { asignarUsuarioAProyecto, removerUsuarioDeProyecto } from "./acceso-actions"
import { cn } from "@/lib/utils"

export type UsuarioAcceso = {
  id: string
  nombre_completo: string
  rol: "capataz" | "project_manager"
}

type Props = {
  proyectoId: string
  asignados: UsuarioAcceso[]
  disponibles: UsuarioAcceso[]
  puedeGestionar: boolean
}

const rolLabel: Record<string, string> = {
  capataz: "Capataz",
  project_manager: "Project Manager",
}

function Avatar({ nombre }: { nombre: string }) {
  return (
    <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-slate-700 text-white">
      {nombre.charAt(0).toUpperCase()}
    </div>
  )
}

export function AccesoProyecto({ proyectoId, asignados: initialAsignados, disponibles: initialDisponibles, puedeGestionar }: Props) {
  const [asignados, setAsignados] = useState<UsuarioAcceso[]>(initialAsignados)
  const [disponibles, setDisponibles] = useState<UsuarioAcceso[]>(initialDisponibles)
  const [showPicker, setShowPicker] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Si nadie tiene permiso de gestión y no hay nadie asignado, no mostramos
  // la sección -- evita ruido para roles que ni ven ni administran esto.
  if (!puedeGestionar && asignados.length === 0) return null

  const handleAsignar = async (u: UsuarioAcceso) => {
    setLoadingId(u.id)
    setErrorMsg(null)
    const res = await asignarUsuarioAProyecto(proyectoId, u.id)
    if (res.error) {
      setErrorMsg(res.error)
    } else {
      setAsignados(prev => [...prev, u].sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo)))
      setDisponibles(prev => prev.filter(d => d.id !== u.id))
    }
    setLoadingId(null)
  }

  const handleRemover = async (u: UsuarioAcceso) => {
    setLoadingId(u.id)
    setErrorMsg(null)
    const res = await removerUsuarioDeProyecto(proyectoId, u.id)
    if (res.error) {
      setErrorMsg(res.error)
    } else {
      setDisponibles(prev => [...prev, u].sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo)))
      setAsignados(prev => prev.filter(a => a.id !== u.id))
    }
    setLoadingId(null)
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-700">Acceso de capataz / PM</h2>
        <span className="text-xs text-slate-400">· {asignados.length} con acceso</span>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <p className="text-xs text-slate-400 mb-3">
          Solo los capataces y project managers asignados aquí pueden ver y operar este proyecto. Dueño, administrador y superadmin siempre tienen acceso completo.
        </p>

        {asignados.length === 0 ? (
          <div className="text-center py-6">
            <KeyRound className="h-8 w-8 mx-auto text-slate-200 mb-2" />
            <p className="text-sm text-slate-400">Nadie asignado todavía</p>
            {puedeGestionar && (
              <p className="text-xs text-slate-400 mt-0.5">
                Un capataz o PM sin asignar no podrá ver este proyecto hasta que lo agregues aquí.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {asignados.map(u => (
              <div key={u.id} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 flex items-center gap-3">
                <Avatar nombre={u.nombre_completo} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{u.nombre_completo}</p>
                  <p className="text-xs text-slate-400">{rolLabel[u.rol] ?? u.rol}</p>
                </div>
                {puedeGestionar && (
                  <button
                    onClick={() => handleRemover(u)}
                    disabled={loadingId === u.id}
                    className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-50 shrink-0"
                    title="Quitar acceso a este proyecto"
                  >
                    {loadingId === u.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <X className="h-3.5 w-3.5" />
                    }
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {errorMsg && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            {errorMsg}
          </p>
        )}

        {puedeGestionar && disponibles.length > 0 && (
          <div>
            <button
              onClick={() => setShowPicker(p => !p)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors",
                showPicker ? "bg-slate-100 text-slate-700" : "bg-slate-900 text-white hover:bg-slate-700"
              )}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Dar acceso
              {showPicker ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {showPicker && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Capataces / PM sin acceso a este proyecto ({disponibles.length})
                </p>
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {disponibles.map(u => (
                    <button
                      key={u.id}
                      onClick={() => handleAsignar(u)}
                      disabled={loadingId === u.id}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-all text-left disabled:opacity-50"
                    >
                      <Avatar nombre={u.nombre_completo} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{u.nombre_completo}</p>
                        <p className="text-xs text-slate-400">{rolLabel[u.rol] ?? u.rol}</p>
                      </div>
                      {loadingId === u.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 shrink-0" />
                        : <UserPlus className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                      }
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
