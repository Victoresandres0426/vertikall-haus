"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { iniciarVistaPrevia, terminarVistaPrevia } from "@/app/vista-previa-actions"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import {
  LayoutDashboard,
  FolderKanban,
  ClipboardList,
  BellRing,
  Users,
  UserCheck,
  Package,
  TrendingUp,
  Settings,
  LogOut,
  Building2,
  AlertTriangle,
  Wrench,
  DollarSign,
  FileText,
  Receipt,
  ChevronRight,
  Wallet,
  NotebookPen,
  HardHat,
  Eye,
  ChevronDown,
} from "lucide-react"

type NavItem = {
  href: string
  label: string
  icon: typeof LayoutDashboard
  badge?: string
  ocultoPara?: string[]
}

const navItems: { grupo: string; items: NavItem[] }[] = [
  {
    grupo: "Principal",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/proyectos", label: "Proyectos", icon: FolderKanban },
      { href: "/alertas", label: "Alertas", icon: BellRing, badge: "alertas" },
    ],
  },
  {
    grupo: "Operación",
    items: [
      { href: "/reporte-diario", label: "Reporte Diario", icon: ClipboardList },
      { href: "/actividades", label: "Actividades", icon: Wrench },
      { href: "/bitacora", label: "Bitácora de obra", icon: NotebookPen },
      { href: "/personal", label: "Personal", icon: UserCheck, ocultoPara: ["capataz", "project_manager"] },
      { href: "/recursos", label: "Recursos", icon: Users },
      { href: "/subcontratistas", label: "Subcontratistas", icon: HardHat, ocultoPara: ["capataz"] },
      { href: "/materiales", label: "Materiales", icon: Package },
    ],
  },
  {
    grupo: "Finanzas",
    items: [
      { href: "/presupuesto", label: "Presupuesto", icon: DollarSign, ocultoPara: ["capataz"] },
      { href: "/change-orders", label: "Change Orders", icon: FileText, ocultoPara: ["capataz"] },
      { href: "/facturas", label: "Facturas", icon: Receipt, ocultoPara: ["capataz"] },
      { href: "/flujo-caja", label: "Flujo de Caja", icon: TrendingUp, ocultoPara: ["capataz"] },
      { href: "/nomina", label: "Nómina", icon: Wallet, ocultoPara: ["capataz"] },
    ],
  },
  {
    grupo: "Análisis",
    items: [
      { href: "/desempeno", label: "Desempeño (IIDP)", icon: TrendingUp },
      { href: "/riesgos", label: "Riesgos", icon: AlertTriangle, ocultoPara: ["capataz"] },
    ],
  },
]

export interface SidebarProps {
  empresaNombre?: string
  usuarioNombre?: string
  usuarioRol?: string
  onNavigate?: () => void
  esDueno?: boolean
  vistaPreviaRol?: string | null
  vistaPreviaProyectoId?: string | null
  proyectosVistaPrevia?: { id: string; nombre: string }[]
}

const VISTAS: { rol: string; label: string }[] = [
  { rol: "cliente", label: "Portal del cliente" },
  { rol: "colaborador_externo", label: "Colaborador externo" },
  { rol: "subcontratista", label: "Subcontratista" },
  { rol: "project_manager", label: "Project Manager" },
  { rol: "capataz", label: "Capataz" },
]

function VerComo({
  vistaPreviaRol,
  vistaPreviaProyectoId,
  proyectos,
  onNavigate,
}: {
  vistaPreviaRol: string | null
  vistaPreviaProyectoId: string | null
  proyectos: { id: string; nombre: string }[]
  onNavigate?: () => void
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(!!vistaPreviaRol)
  const [proyectoId, setProyectoId] = useState(vistaPreviaProyectoId ?? proyectos[0]?.id ?? "")
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const elegir = (rol: string) => {
    setError(null)
    start(async () => {
      const r = await iniciarVistaPrevia(rol, proyectoId || null)
      if (r.error) {
        setError(r.error)
        return
      }
      onNavigate?.()
      router.push(r.destino ?? "/dashboard")
      router.refresh()
    })
  }

  const salir = () => {
    start(async () => {
      await terminarVistaPrevia()
      onNavigate?.()
      router.push("/dashboard")
      router.refresh()
    })
  }

  return (
    <div className="mb-2">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
      >
        <Eye className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 text-left">Ver como</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", abierto && "rotate-180")} />
      </button>
      {abierto && (
        <div className="mt-1 ml-3 pl-3 border-l border-slate-700 space-y-1">
          <select
            value={proyectoId}
            onChange={(e) => setProyectoId(e.target.value)}
            className="w-full rounded-md bg-slate-800 border border-slate-700 text-xs text-slate-200 px-2 py-1.5"
          >
            {proyectos.length === 0 && <option value="">Sin proyectos</option>}
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          {VISTAS.map((v) => (
            <button
              key={v.rol}
              disabled={pending}
              onClick={() => elegir(v.rol)}
              className={cn(
                "block w-full text-left rounded-md px-2 py-1.5 text-xs transition-colors disabled:opacity-60",
                vistaPreviaRol === v.rol
                  ? "bg-amber-500/20 text-amber-300 font-medium"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              )}
            >
              {v.label}
            </button>
          ))}
          {vistaPreviaRol && (
            <button
              disabled={pending}
              onClick={salir}
              className="block w-full text-left rounded-md px-2 py-1.5 text-xs text-white bg-white/10 hover:bg-white/20 transition-colors"
            >
              ← Volver a dueño
            </button>
          )}
          {error && <p className="text-[11px] text-red-400 px-1">{error}</p>}
        </div>
      )}
    </div>
  )
}

export function Sidebar({
  empresaNombre = "Vertikall Haus",
  usuarioNombre,
  usuarioRol,
  onNavigate,
  esDueno,
  vistaPreviaRol = null,
  vistaPreviaProyectoId = null,
  proyectosVistaPrevia = [],
}: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <aside className="flex flex-col h-full w-[260px] bg-slate-900 text-white flex-shrink-0">
      {/* Header / Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
          <Building2 className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{empresaNombre}</p>
          <p className="text-xs text-slate-400">Sistema de Gestión</p>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {navItems.map((grupo) => (
          <div key={grupo.grupo} className="mb-5">
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {grupo.grupo}
            </p>
            <div className="space-y-0.5">
              {grupo.items
                .filter((item) => !usuarioRol || !item.ocultoPara?.includes(usuarioRol))
                .map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-white/10 text-white font-medium"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {isActive && <ChevronRight className="h-3 w-3 opacity-50" />}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer con usuario */}
      <div className="border-t border-slate-800 p-3 space-y-1">
        {(esDueno || vistaPreviaRol) && (
          <VerComo
            vistaPreviaRol={vistaPreviaRol}
            vistaPreviaProyectoId={vistaPreviaProyectoId}
            proyectos={proyectosVistaPrevia}
            onNavigate={onNavigate}
          />
        )}
        <Link
          href="/configuracion"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
        >
          <Settings className="h-4 w-4" />
          <span>Configuración</span>
        </Link>
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 mt-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 flex-shrink-0 text-sm font-semibold">
            {usuarioNombre?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">{usuarioNombre ?? "Usuario"}</p>
            <p className="text-xs text-slate-400 capitalize">{usuarioRol?.replace("_", " ") ?? "—"}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-slate-500 hover:text-slate-300 transition-colors"
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
