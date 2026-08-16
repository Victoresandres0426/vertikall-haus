"use client"

import { useState, useTransition } from "react"
import {
  Search, UserCheck, UserX, Phone, Calendar, DollarSign,
  Star, Plus, X, ChevronDown, QrCode,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { crearTrabajador } from "./actions"

// ──────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────
export type TrabajadorFromDB = {
  id: string
  nombre_completo: string
  codigo: string | null
  especialidad: string | null
  rol_obra: string | null
  nivel_experiencia: string | null
  tarifa_diaria: number | null
  moneda: string
  activo: boolean
  fecha_ingreso: string | null
  notas: string | null
  usuario_id: string | null
}

type ProyectoOption = {
  id: string
  nombre: string
}

const nivelColor: Record<string, string> = {
  junior:  "bg-slate-100 text-slate-600",
  medio:   "bg-blue-100 text-blue-700",
  senior:  "bg-emerald-100 text-emerald-700",
}

const nivelLabel: Record<string, string> = {
  junior: "Junior",
  medio: "Medio",
  senior: "Senior",
}

function formatMXN(n: number | null, moneda = "MXN") {
  if (!n) return "—"
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 0 })} ${moneda}/día`
}

// ──────────────────────────────────────────────
// Componente
// ──────────────────────────────────────────────
interface PersonalClientProps {
  trabajadores: TrabajadorFromDB[]
  proyectos: ProyectoOption[]
  puedeEditar: boolean
  empresaId: string
}

export function PersonalClient({
  trabajadores: initial,
  proyectos,
  puedeEditar,
  empresaId,
}: PersonalClientProps) {
  const [trabajadores, setTrabajadores] = useState(initial)
  const [busqueda, setBusqueda] = useState("")
  const [filtroActivo, setFiltroActivo] = useState<"todos" | "activo" | "inactivo">("todos")
  const [filtroRol, setFiltroRol] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [errorModal, setErrorModal] = useState("")

  // Roles únicos disponibles
  const roles = Array.from(
    new Set(trabajadores.map((t) => t.rol_obra).filter(Boolean))
  ).sort() as string[]

  const filtrados = trabajadores.filter((t) => {
    const matchSearch =
      t.nombre_completo.toLowerCase().includes(busqueda.toLowerCase()) ||
      (t.codigo ?? "").toLowerCase().includes(busqueda.toLowerCase()) ||
      (t.especialidad ?? "").toLowerCase().includes(busqueda.toLowerCase()) ||
      (t.rol_obra ?? "").toLowerCase().includes(busqueda.toLowerCase())
    const matchActivo =
      filtroActivo === "todos" ||
      (filtroActivo === "activo" ? t.activo : !t.activo)
    const matchRol = !filtroRol || t.rol_obra === filtroRol
    return matchSearch && matchActivo && matchRol
  })

  const activos = trabajadores.filter((t) => t.activo).length

  return (
    <>
      <div className="p-6 space-y-5">
        {/* Resumen */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{trabajadores.length}</p>
            <p className="text-sm text-slate-500 mt-0.5">Total personal</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{activos}</p>
            <p className="text-sm text-slate-500 mt-0.5">Activos</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-2xl font-bold text-slate-400">{trabajadores.length - activos}</p>
            <p className="text-sm text-slate-500 mt-0.5">Inactivos</p>
          </div>
        </div>

        {/* Filtros y botón agregar */}
        <div className="flex gap-3 items-center flex-wrap">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              placeholder="Buscar por nombre, código, rol..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>

          {/* Filtro estado */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {(["todos", "activo", "inactivo"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltroActivo(f)}
                className={cn(
                  "px-3 py-2 text-xs capitalize transition-colors",
                  filtroActivo === f
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                {f === "todos" ? "Todos" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Filtro rol */}
          {roles.length > 0 && (
            <div className="relative">
              <select
                value={filtroRol}
                onChange={(e) => setFiltroRol(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white text-slate-700"
              >
                <option value="">Todos los roles</option>
                {roles.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          )}

          {puedeEditar && (
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => setShowModal(true)}
            >
              <Plus className="h-4 w-4" />
              Agregar trabajador
            </Button>
          )}
        </div>

        {/* Lista */}
        {filtrados.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <UserCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">Sin trabajadores registrados</p>
            <p className="text-sm mt-1">
              {busqueda || filtroRol ? "Intenta ajustar los filtros" : "Agrega el primer trabajador al sistema"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtrados.map((t) => (
              <Card key={t.id} className={cn("transition-shadow hover:shadow-md", !t.activo && "opacity-60")}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {t.codigo && (
                          <span className="text-xs font-mono text-slate-400">{t.codigo}</span>
                        )}
                        {t.nivel_experiencia && (
                          <span className={cn(
                            "text-xs px-1.5 py-0.5 rounded font-medium",
                            nivelColor[t.nivel_experiencia] ?? "bg-slate-100 text-slate-600"
                          )}>
                            {nivelLabel[t.nivel_experiencia] ?? t.nivel_experiencia}
                          </span>
                        )}
                        {t.usuario_id && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">
                            App
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-slate-900 truncate">{t.nombre_completo}</h3>
                      {t.especialidad && (
                        <p className="text-sm text-slate-500 truncate">{t.especialidad}</p>
                      )}
                    </div>
                    <div className={cn(
                      "flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold",
                      t.activo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
                    )}>
                      {t.nombre_completo.charAt(0).toUpperCase()}
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-500">
                    {t.rol_obra && (
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="h-3 w-3 text-slate-400 shrink-0" />
                        <span className="capitalize">{t.rol_obra}</span>
                      </div>
                    )}
                    {t.tarifa_diaria && (
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="h-3 w-3 text-slate-400 shrink-0" />
                        <span>{formatMXN(t.tarifa_diaria, t.moneda)}</span>
                      </div>
                    )}
                    {t.fecha_ingreso && (
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
                        <span>Desde {new Date(t.fecha_ingreso).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}</span>
                      </div>
                    )}
                  </div>

                  {t.notas && (
                    <p className="mt-2 text-xs text-slate-400 italic line-clamp-2">{t.notas}</p>
                  )}

                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full",
                      t.activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                    )}>
                      {t.activo ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modal agregar trabajador */}
      {showModal && (
        <ModalAgregarTrabajador
          onClose={() => { setShowModal(false); setErrorModal("") }}
          onSuccess={(nuevo) => {
            setTrabajadores((prev) => [nuevo, ...prev])
            setShowModal(false)
          }}
          empresaId={empresaId}
        />
      )}
    </>
  )
}

// ──────────────────────────────────────────────
// Modal para agregar trabajador
// ──────────────────────────────────────────────
function ModalAgregarTrabajador({
  onClose,
  onSuccess,
  empresaId,
}: {
  onClose: () => void
  onSuccess: (t: TrabajadorFromDB) => void
  empresaId: string
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")
    const formData = new FormData(e.currentTarget)
    formData.set("empresa_id", empresaId)

    startTransition(async () => {
      const result = await crearTrabajador(formData)
      if (result.error) {
        setError(result.error)
      } else if (result.trabajador) {
        onSuccess(result.trabajador)
      }
    })
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !isPending) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto">
        <button
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 disabled:opacity-50"
          onClick={onClose}
          disabled={isPending}
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="text-lg font-semibold text-slate-900 mb-5">Agregar trabajador</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nombre completo *</label>
            <input
              name="nombre_completo"
              required
              placeholder="Ej. Juan García López"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Código</label>
              <input
                name="codigo"
                placeholder="Ej. T-001"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Rol en obra</label>
              <input
                name="rol_obra"
                placeholder="Ej. electricista"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Especialidad</label>
            <input
              name="especialidad"
              placeholder="Ej. Instalaciones eléctricas de alta tensión"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nivel</label>
              <select
                name="nivel_experiencia"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              >
                <option value="">Sin especificar</option>
                <option value="junior">Junior</option>
                <option value="medio">Medio</option>
                <option value="senior">Senior</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tarifa diaria (MXN)</label>
              <input
                name="tarifa_diaria"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Fecha de ingreso</label>
            <input
              name="fecha_ingreso"
              type="date"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Notas</label>
            <textarea
              name="notas"
              rows={2}
              placeholder="Observaciones adicionales..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" isLoading={isPending}>
              Agregar
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
