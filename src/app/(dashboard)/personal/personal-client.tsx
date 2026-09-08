"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Search, UserCheck, UserX, Phone, Calendar, DollarSign,
  Star, Plus, X, ChevronDown, ChevronUp, QrCode, Pencil, MapPin, ShieldAlert, Wallet, Coins,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { crearTrabajador, actualizarTrabajador, guardarTarifaTrabajo, eliminarTarifaTrabajo } from "./actions"

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
  telefono_personal: string | null
  direccion: string | null
  contacto_emergencia_nombre: string | null
  contacto_emergencia_telefono: string | null
}

type ProyectoOption = {
  id: string
  nombre: string
}

export type UsuarioSistema = {
  id: string
  nombre_completo: string
  rol: string
}

const rolSistemaLabel: Record<string, string> = {
  dueno: "Dueño",
  superadmin: "Superadmin",
  administrador: "Administrador",
  project_manager: "Project Manager",
  capataz: "Capataz",
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

function formatMXN(n: number | null, moneda = "USD") {
  if (!n) return "—"
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 0 })} ${moneda}/día`
}

export type TarifaTrabajo = { id: string; rol_obra: string; tarifa_hora: number | null }

// Ganancias del día -- lo que un trabajador ganó en una fecha puntual,
// desglosado por actividad (viene de asistencia_actividad_diaria, que ya
// alimenta costos_reales y nómina -- ver migraciones 050/054).
export type GananciaDetalle = {
  proyecto: string; actividad: string; horas: number
  avance_cantidad: number | null; modo_pago: string; costo: number
}
export type GananciaTrabajador = { total: number; detalle: GananciaDetalle[] }

function formatUSD(n: number) {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

// Ganancias del día para un trabajador -- mismo patrón desplegable que
// TarifasPorRol, pero de solo lectura (el monto ya quedó calculado y
// guardado desde el Reporte Diario, no se edita aquí).
function GananciasDelDia({ ganancia }: { ganancia: GananciaTrabajador | undefined }) {
  const [abierto, setAbierto] = useState(false)
  if (!ganancia || ganancia.total <= 0) {
    return (
      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-xs text-slate-300">
        <Coins className="h-3 w-3" />
        Sin ganancias registradas hoy
      </div>
    )
  }

  return (
    <div className="mt-2 pt-2 border-t border-slate-100">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-emerald-700 hover:text-emerald-900 font-medium"
      >
        <Coins className="h-3 w-3" />
        Ganó hoy: {formatUSD(ganancia.total)}
        {abierto ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {abierto && (
        <div className="mt-2 space-y-1.5">
          {ganancia.detalle.map((d, i) => (
            <div key={i} className="text-xs bg-emerald-50/60 rounded-lg px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-700 truncate">{d.actividad}</span>
                <span className="font-medium text-emerald-700 shrink-0">{formatUSD(d.costo)}</span>
              </div>
              <p className="text-[11px] text-slate-400">
                {d.proyecto}
                {d.modo_pago === "destajo" && d.avance_cantidad != null
                  ? ` · ${d.avance_cantidad} a destajo`
                  : ` · ${d.horas}h`}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Tarifas específicas por rol -- para cuando el mismo trabajador gana
// distinto según la actividad que hace (ej. $80/h como ayudante, $150/h
// como electricista), incluso dentro del mismo proyecto. Si no hay una
// tarifa aquí para el rol con el que se le registra una actividad en
// Reporte Diario, se usa la tarifa general (tarifa_diaria) de arriba.
function TarifasPorRol({ trabajadorId, tarifasIniciales, puedeEditar }: { trabajadorId: string; tarifasIniciales: TarifaTrabajo[]; puedeEditar: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const [tarifas, setTarifas] = useState(tarifasIniciales)
  const [nuevoRol, setNuevoRol] = useState("")
  const [nuevaTarifa, setNuevaTarifa] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!puedeEditar && tarifas.length === 0) return null

  const handleAgregar = () => {
    setError(null)
    const monto = Number(nuevaTarifa)
    startTransition(async () => {
      const res = await guardarTarifaTrabajo(trabajadorId, nuevoRol, monto)
      if (res.error) {
        setError(res.error)
      } else if (res.tarifa) {
        setTarifas((prev) => [...prev.filter((t) => t.rol_obra !== res.tarifa!.rol_obra), res.tarifa!])
        setNuevoRol("")
        setNuevaTarifa("")
      }
    })
  }

  const handleEliminar = (id: string) => {
    startTransition(async () => {
      const res = await eliminarTarifaTrabajo(id)
      if (!res.error) setTarifas((prev) => prev.filter((t) => t.id !== id))
    })
  }

  return (
    <div className="mt-2 pt-2 border-t border-slate-100">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800"
      >
        <Wallet className="h-3 w-3" />
        Tarifas por rol {tarifas.length > 0 && `(${tarifas.length})`}
        {abierto ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {abierto && (
        <div className="mt-2 space-y-1.5">
          {tarifas.map((t) => (
            <div key={t.id} className="flex items-center gap-2 text-xs bg-slate-50 rounded-lg px-2 py-1.5">
              <span className="flex-1 capitalize text-slate-700">{t.rol_obra}</span>
              <span className="font-medium text-slate-800">${Number(t.tarifa_hora ?? 0).toLocaleString()}/h</span>
              {puedeEditar && (
                <button onClick={() => handleEliminar(t.id)} disabled={isPending} className="text-slate-300 hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}

          {puedeEditar && (
            <div className="flex items-center gap-1.5">
              <input
                value={nuevoRol}
                onChange={(e) => setNuevoRol(e.target.value)}
                placeholder="Rol (ej. electricista)"
                className="flex-1 min-w-0 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <input
                type="number"
                value={nuevaTarifa}
                onChange={(e) => setNuevaTarifa(e.target.value)}
                placeholder="$/h"
                className="w-16 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <button
                onClick={handleAgregar}
                disabled={isPending || !nuevoRol.trim() || !nuevaTarifa}
                className="text-slate-500 hover:text-slate-800 disabled:opacity-40 shrink-0"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
          {error && <p className="text-[11px] text-red-600">{error}</p>}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// Componente
// ──────────────────────────────────────────────
interface PersonalClientProps {
  trabajadores: TrabajadorFromDB[]
  proyectos: ProyectoOption[]
  puedeEditar: boolean
  empresaId: string
  tarifasPorTrabajador?: Record<string, TarifaTrabajo[]>
  usuariosSistema?: UsuarioSistema[]
  gananciasPorTrabajador?: Record<string, GananciaTrabajador>
  fechaGanancias?: string
}

export function PersonalClient({
  trabajadores: initial,
  proyectos,
  puedeEditar,
  empresaId,
  tarifasPorTrabajador = {},
  usuariosSistema = [],
  gananciasPorTrabajador = {},
  fechaGanancias,
}: PersonalClientProps) {
  const router = useRouter()
  const [trabajadores, setTrabajadores] = useState(initial)
  const [busqueda, setBusqueda] = useState("")
  const [filtroActivo, setFiltroActivo] = useState<"todos" | "activo" | "inactivo">("todos")
  const [filtroRol, setFiltroRol] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [trabajadorAEditar, setTrabajadorAEditar] = useState<TrabajadorFromDB | null>(null)
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
  const usuarioPorId = new Map(usuariosSistema.map((u) => [u.id, u]))
  // Cuentas ya vinculadas a algún trabajador -- para no ofrecerlas dos veces
  const usuariosUsados = new Map(
    trabajadores.filter((t) => t.usuario_id).map((t) => [t.usuario_id as string, t.id])
  )

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
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
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

          {/* Fecha de las "ganancias del día" que se muestran en cada tarjeta */}
          {puedeEditar && fechaGanancias && (
            <div className="flex items-center gap-1.5">
              <Coins className="h-4 w-4 text-emerald-500 shrink-0" />
              <input
                type="date"
                value={fechaGanancias}
                onChange={(e) => router.push(`/personal?fecha=${e.target.value}`)}
                className="border border-slate-200 rounded-lg px-2 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
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
                          <span className="text-xs px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium" title="Vinculado a una cuenta del sistema">
                            App{usuarioPorId.has(t.usuario_id) ? ` · ${usuarioPorId.get(t.usuario_id)!.nombre_completo}` : ""}
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
                    {t.telefono_personal && puedeEditar && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                        <span>{t.telefono_personal}</span>
                      </div>
                    )}
                    {t.direccion && puedeEditar && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                        <span className="truncate">{t.direccion}</span>
                      </div>
                    )}
                    {t.contacto_emergencia_nombre && puedeEditar && (
                      <div className="flex items-center gap-1.5">
                        <ShieldAlert className="h-3 w-3 text-slate-400 shrink-0" />
                        <span className="truncate">
                          {t.contacto_emergencia_nombre}
                          {t.contacto_emergencia_telefono && ` · ${t.contacto_emergencia_telefono}`}
                        </span>
                      </div>
                    )}
                  </div>

                  {t.notas && (
                    <p className="mt-2 text-xs text-slate-400 italic line-clamp-2">{t.notas}</p>
                  )}

                  {puedeEditar && (
                    <TarifasPorRol
                      trabajadorId={t.id}
                      tarifasIniciales={tarifasPorTrabajador[t.id] ?? []}
                      puedeEditar={puedeEditar}
                    />
                  )}

                  {puedeEditar && t.activo && (
                    <GananciasDelDia ganancia={gananciasPorTrabajador[t.id]} />
                  )}

                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full",
                      t.activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                    )}>
                      {t.activo ? "Activo" : "Inactivo"}
                    </span>
                    {puedeEditar && (
                      <button
                        onClick={() => setTrabajadorAEditar(t)}
                        className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1"
                      >
                        <Pencil className="h-3 w-3" />
                        Editar
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modal agregar trabajador */}
      {showModal && (
        <ModalTrabajador
          usuariosSistema={usuariosSistema}
          usuariosUsados={usuariosUsados}
          onClose={() => { setShowModal(false); setErrorModal("") }}
          onSuccess={(nuevo) => {
            setTrabajadores((prev) => [nuevo, ...prev])
            setShowModal(false)
          }}
        />
      )}

      {/* Modal editar trabajador */}
      {trabajadorAEditar && (
        <ModalTrabajador
          trabajador={trabajadorAEditar}
          usuariosSistema={usuariosSistema}
          usuariosUsados={usuariosUsados}
          onClose={() => setTrabajadorAEditar(null)}
          onSuccess={(actualizado) => {
            setTrabajadores((prev) => prev.map((t) => (t.id === actualizado.id ? actualizado : t)))
            setTrabajadorAEditar(null)
          }}
        />
      )}
    </>
  )
}

// ──────────────────────────────────────────────
// Modal para agregar / editar trabajador
// ──────────────────────────────────────────────
function ModalTrabajador({
  trabajador,
  usuariosSistema = [],
  usuariosUsados = new Map(),
  onClose,
  onSuccess,
}: {
  trabajador?: TrabajadorFromDB
  usuariosSistema?: UsuarioSistema[]
  usuariosUsados?: Map<string, string>
  onClose: () => void
  onSuccess: (t: TrabajadorFromDB) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const esEdicion = !!trabajador

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = esEdicion
        ? await actualizarTrabajador(trabajador!.id, formData)
        : await crearTrabajador(formData)
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

        <h3 className="text-lg font-semibold text-slate-900 mb-5">
          {esEdicion ? "Editar trabajador" : "Agregar trabajador"}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nombre completo *</label>
            <input
              name="nombre_completo"
              required
              defaultValue={trabajador?.nombre_completo}
              placeholder="Ej. Juan García López"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Código</label>
              <input
                name="codigo"
                defaultValue={trabajador?.codigo ?? ""}
                placeholder="Ej. T-001"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Rol en obra</label>
              <input
                name="rol_obra"
                defaultValue={trabajador?.rol_obra ?? ""}
                placeholder="Ej. electricista"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Especialidad</label>
            <input
              name="especialidad"
              defaultValue={trabajador?.especialidad ?? ""}
              placeholder="Ej. Instalaciones eléctricas de alta tensión"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nivel</label>
              <select
                name="nivel_experiencia"
                defaultValue={trabajador?.nivel_experiencia ?? ""}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              >
                <option value="">Sin especificar</option>
                <option value="junior">Junior</option>
                <option value="medio">Medio</option>
                <option value="senior">Senior</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tarifa diaria (USD)</label>
              <input
                name="tarifa_diaria"
                type="number"
                min="0"
                step="0.01"
                defaultValue={trabajador?.tarifa_diaria ?? ""}
                placeholder="0.00"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Fecha de ingreso</label>
            <input
              name="fecha_ingreso"
              type="date"
              defaultValue={trabajador?.fecha_ingreso ?? ""}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-400 mb-3 mt-3">Información personal (opcional)</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Teléfono personal</label>
                <input
                  name="telefono_personal"
                  type="tel"
                  defaultValue={trabajador?.telefono_personal ?? ""}
                  placeholder="+1 305 555 0100"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Dirección</label>
                <input
                  name="direccion"
                  defaultValue={trabajador?.direccion ?? ""}
                  placeholder="Calle, número, ciudad"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Contacto de emergencia</label>
                  <input
                    name="contacto_emergencia_nombre"
                    defaultValue={trabajador?.contacto_emergencia_nombre ?? ""}
                    placeholder="Nombre"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Teléfono de emergencia</label>
                  <input
                    name="contacto_emergencia_telefono"
                    type="tel"
                    defaultValue={trabajador?.contacto_emergencia_telefono ?? ""}
                    placeholder="+1 305 555 0100"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>
            </div>
          </div>

          {usuariosSistema.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <label className="block text-xs font-medium text-slate-700 mb-1 mt-3">
                Vincular con cuenta del sistema (opcional)
              </label>
              <select
                name="usuario_id"
                defaultValue={trabajador?.usuario_id ?? ""}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              >
                <option value="">Ninguna</option>
                {usuariosSistema
                  .filter((u) => {
                    const usadoPor = usuariosUsados.get(u.id)
                    return !usadoPor || usadoPor === trabajador?.id
                  })
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre_completo} ({rolSistemaLabel[u.rol] ?? u.rol})
                    </option>
                  ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                Si este trabajador es también capataz o PM en el sistema, vincúlalo aquí para que las tareas de campo que registre en Reporte Diario se paguen igual que a cualquier otro trabajador.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Notas</label>
            <textarea
              name="notas"
              rows={2}
              defaultValue={trabajador?.notas ?? ""}
              placeholder="Observaciones adicionales..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
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
              {esEdicion ? "Guardar cambios" : "Agregar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
