"use client"

import { useState } from "react"
import { UserCheck, UserPlus, X, ChevronDown, ChevronUp, Loader2, Users } from "lucide-react"
import { agregarTrabajadorAProyecto, removerTrabajadorDeProyecto } from "./equipo-actions"
import { cn } from "@/lib/utils"

export type TrabajadorEquipo = {
  id: string
  nombre_completo: string
  rol_obra: string | null
  especialidad: string | null
}

type Props = {
  proyectoId: string
  equipo: TrabajadorEquipo[]
  disponibles: TrabajadorEquipo[]
  puedeGestionar: boolean
}

const rolLabel: Record<string, string> = {
  electricista: "Electricista",
  albañil: "Albañil",
  plomero: "Plomero",
  pintor: "Pintor",
  herrero: "Herrero",
  carpintero: "Carpintero",
  ayudante: "Ayudante",
  impermeabilizador: "Impermeabilizador",
  pisos: "Inst. pisos",
  capataz: "Capataz",
  operador: "Operador",
}

function Avatar({ nombre, selected = false }: { nombre: string; selected?: boolean }) {
  return (
    <div className={cn(
      "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors",
      selected ? "bg-slate-700 text-white" : "bg-slate-200 text-slate-600"
    )}>
      {nombre.charAt(0).toUpperCase()}
    </div>
  )
}

export function EquipoProyecto({ proyectoId, equipo: initialEquipo, disponibles: initialDisponibles, puedeGestionar }: Props) {
  const [equipo, setEquipo] = useState<TrabajadorEquipo[]>(initialEquipo)
  const [disponibles, setDisponibles] = useState<TrabajadorEquipo[]>(initialDisponibles)
  const [showPicker, setShowPicker] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleAgregar = async (t: TrabajadorEquipo) => {
    setLoadingId(t.id)
    setErrorMsg(null)
    const res = await agregarTrabajadorAProyecto(proyectoId, t.id)
    if (res.error) {
      setErrorMsg(res.error)
    } else {
      setEquipo(prev => [...prev, t].sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo)))
      setDisponibles(prev => prev.filter(d => d.id !== t.id))
    }
    setLoadingId(null)
  }

  const handleRemover = async (t: TrabajadorEquipo) => {
    setLoadingId(t.id)
    setErrorMsg(null)
    const res = await removerTrabajadorDeProyecto(proyectoId, t.id)
    if (res.error) {
      setErrorMsg(res.error)
    } else {
      setDisponibles(prev => [...prev, t].sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo)))
      setEquipo(prev => prev.filter(e => e.id !== t.id))
    }
    setLoadingId(null)
  }

  const subtitulo = (t: TrabajadorEquipo) =>
    t.rol_obra ? (rolLabel[t.rol_obra] ?? t.rol_obra) : (t.especialidad ?? "—")

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-700">Equipo autorizado en obra</h2>
        <span className="text-xs text-slate-400">· {equipo.length} trabajador{equipo.length !== 1 ? "es" : ""}</span>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">

        {/* Lista de autorizados */}
        {equipo.length === 0 ? (
          <div className="text-center py-8">
            <UserCheck className="h-8 w-8 mx-auto text-slate-200 mb-2" />
            <p className="text-sm text-slate-400">Sin trabajadores autorizados aún</p>
            {puedeGestionar && (
              <p className="text-xs text-slate-400 mt-0.5">Usa el botón de abajo para agregar al equipo</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {equipo.map(t => (
              <div
                key={t.id}
                className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5"
              >
                <Avatar nombre={t.nombre_completo} selected />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{t.nombre_completo}</p>
                  <p className="text-xs text-slate-400 capitalize">{subtitulo(t)}</p>
                </div>
                {puedeGestionar && (
                  <button
                    onClick={() => handleRemover(t)}
                    disabled={loadingId === t.id}
                    className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-50 shrink-0 ml-1"
                    title="Remover del proyecto"
                  >
                    {loadingId === t.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <X className="h-3.5 w-3.5" />
                    }
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            {errorMsg}
          </p>
        )}

        {/* Botón para abrir picker */}
        {puedeGestionar && disponibles.length > 0 && (
          <div>
            <button
              onClick={() => setShowPicker(p => !p)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors",
                showPicker
                  ? "bg-slate-100 text-slate-700"
                  : "bg-slate-900 text-white hover:bg-slate-700"
              )}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Agregar trabajador
              {showPicker ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {/* Picker */}
            {showPicker && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Trabajadores disponibles ({disponibles.length})
                </p>
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {disponibles.map(t => (
                    <button
                      key={t.id}
                      onClick={() => handleAgregar(t)}
                      disabled={loadingId === t.id}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-all text-left disabled:opacity-50"
                    >
                      <Avatar nombre={t.nombre_completo} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{t.nombre_completo}</p>
                        <p className="text-xs text-slate-400 capitalize">{subtitulo(t)}</p>
                      </div>
                      {loadingId === t.id
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

        {/* No gestionable y sin equipo */}
        {!puedeGestionar && equipo.length === 0 && (
          <p className="text-xs text-slate-400 text-center">
            El capataz aún no ha configurado el equipo para esta obra.
          </p>
        )}
      </div>
    </section>
  )
}
