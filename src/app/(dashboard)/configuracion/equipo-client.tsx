"use client"

import { useState, useTransition } from "react"
import { Pencil, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { actualizarRolUsuario, cambiarActivoUsuario } from "./actions"

type Usuario = {
  id: string
  nombre_completo: string
  email: string
  rol: string
  activo: boolean
}

const ROLES_PROTEGIDOS = ["dueno", "superadmin"]

// Roles que se pueden asignar desde este selector -- igual que en el
// formulario de invitar, superadmin nunca se otorga desde la UI. Incluye
// "cliente" solo para que el selector muestre bien su rol actual si
// aparece en esta lista -- lo normal para un cliente es desactivarlo,
// no cambiarle el rol.
const ROLES_ASIGNABLES = ["capataz", "project_manager", "administrador", "dueno", "cliente"] as const

export function EquipoLista({
  equipo,
  perfilActualId,
  perfilActualRol,
  rolLabel,
  rolColor,
}: {
  equipo: Usuario[]
  perfilActualId: string
  perfilActualRol: string
  rolLabel: Record<string, string>
  rolColor: Record<string, string>
}) {
  const puedeGestionar = ["dueno", "superadmin", "administrador"].includes(perfilActualRol)
  const [editandoId, setEditandoId] = useState<string | null>(null)

  return (
    <div className="divide-y divide-slate-50">
      {equipo.map((u) => {
        const esUnoMismo = u.id === perfilActualId
        // Un administrador no puede tocar cuentas de dueño/superadmin
        // (mismo guardado que en el server action).
        const puedeEditarEste =
          puedeGestionar &&
          !esUnoMismo &&
          !(perfilActualRol === "administrador" && ROLES_PROTEGIDOS.includes(u.rol))
        const editando = editandoId === u.id

        return (
          <div key={u.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-slate-600">
                  {u.nombre_completo.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{u.nombre_completo}</span>
                  {!u.activo && (
                    <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Inactivo</span>
                  )}
                  {esUnoMismo && (
                    <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">Tú</span>
                  )}
                </div>
                <p className="text-xs text-slate-400">{u.email}</p>
              </div>
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium shrink-0", rolColor[u.rol] ?? "bg-slate-100 text-slate-600")}>
                {rolLabel[u.rol] ?? u.rol}
              </span>
              {puedeEditarEste && (
                <button
                  onClick={() => setEditandoId(editando ? null : u.id)}
                  className="text-slate-300 hover:text-slate-700 shrink-0"
                  title="Editar cuenta"
                >
                  {editando ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                </button>
              )}
            </div>

            {editando && (
              <FilaEdicion
                usuario={u}
                rolLabel={rolLabel}
                onDone={() => setEditandoId(null)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function FilaEdicion({
  usuario,
  rolLabel,
  onDone,
}: {
  usuario: Usuario
  rolLabel: Record<string, string>
  onDone: () => void
}) {
  const [rol, setRol] = useState(usuario.rol)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  const handleGuardarRol = () => {
    if (rol === usuario.rol) return
    setError("")
    startTransition(async () => {
      const res = await actualizarRolUsuario(usuario.id, rol)
      if (res.error) setError(res.error)
      else onDone()
    })
  }

  const handleToggleActivo = () => {
    const accion = usuario.activo ? "desactivar" : "reactivar"
    if (!confirm(`¿Seguro que quieres ${accion} a ${usuario.nombre_completo}?`)) return
    setError("")
    startTransition(async () => {
      const res = await cambiarActivoUsuario(usuario.id, !usuario.activo)
      if (res.error) setError(res.error)
      else onDone()
    })
  }

  return (
    <div className="mt-2.5 ml-12 flex flex-wrap items-center gap-2 bg-slate-50 rounded-lg p-2.5">
      <select
        value={rol}
        onChange={(e) => setRol(e.target.value)}
        disabled={isPending}
        className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
      >
        {ROLES_ASIGNABLES.map((r) => (
          <option key={r} value={r}>{rolLabel[r] ?? r}</option>
        ))}
      </select>
      <button
        onClick={handleGuardarRol}
        disabled={isPending || rol === usuario.rol}
        className="text-xs font-medium text-white bg-slate-900 hover:bg-slate-700 disabled:opacity-40 rounded-lg px-3 py-1.5"
      >
        Guardar rol
      </button>
      <button
        onClick={handleToggleActivo}
        disabled={isPending}
        className={cn(
          "text-xs font-medium rounded-lg px-3 py-1.5 disabled:opacity-40",
          usuario.activo
            ? "text-red-600 bg-red-50 hover:bg-red-100"
            : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
        )}
      >
        {usuario.activo ? "Desactivar" : "Reactivar"}
      </button>
      {error && <p className="text-[11px] text-red-600 w-full">{error}</p>}
    </div>
  )
}
