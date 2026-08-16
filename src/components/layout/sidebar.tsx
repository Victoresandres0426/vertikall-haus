"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
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
} from "lucide-react"

const navItems = [
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
      { href: "/personal", label: "Personal", icon: UserCheck },
      { href: "/recursos", label: "Recursos", icon: Users },
      { href: "/materiales", label: "Materiales", icon: Package },
    ],
  },
  {
    grupo: "Finanzas",
    items: [
      { href: "/presupuesto", label: "Presupuesto", icon: DollarSign },
      { href: "/change-orders", label: "Change Orders", icon: FileText },
      { href: "/facturas", label: "Facturas", icon: Receipt },
      { href: "/flujo-caja", label: "Flujo de Caja", icon: TrendingUp },
    ],
  },
  {
    grupo: "Análisis",
    items: [
      { href: "/desempeno", label: "Desempeño (IIDP)", icon: TrendingUp },
      { href: "/riesgos", label: "Riesgos", icon: AlertTriangle },
    ],
  },
]

interface SidebarProps {
  empresaNombre?: string
  usuarioNombre?: string
  usuarioRol?: string
}

export function Sidebar({ empresaNombre = "Vertikall Haus", usuarioNombre, usuarioRol }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="flex flex-col h-screen w-[260px] bg-slate-900 text-white flex-shrink-0">
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
              {grupo.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
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
          <button className="text-slate-500 hover:text-slate-300 transition-colors">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
