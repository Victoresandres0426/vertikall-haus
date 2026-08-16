import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { Building2, Users, Settings, Bell, Shield } from "lucide-react"
import { cn } from "@/lib/utils"

type Empresa = {
  id: string
  nombre: string
  rfc_tax_id: string | null
  logo_url: string | null
  jurisdiccion: string
  configuracion: Record<string, unknown>
}

type Perfil = {
  id: string
  nombre_completo: string
  email: string
  rol: string
  activo: boolean
  configuracion_notificaciones: { email: boolean; push: boolean }
}

async function getData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("id, nombre_completo, email, rol, activo, configuracion_notificaciones, empresa_id")
    .eq("id", user.id)
    .single()

  if (!perfil) redirect("/login")

  const { data: empresa } = await supabase
    .from("empresas")
    .select("id, nombre, rfc_tax_id, logo_url, jurisdiccion, configuracion")
    .eq("id", perfil.empresa_id)
    .single()

  const { data: equipo } = await supabase
    .from("perfiles_usuario")
    .select("id, nombre_completo, email, rol, activo")
    .eq("empresa_id", perfil.empresa_id)
    .order("rol")
    .order("nombre_completo")

  return {
    empresa: empresa as Empresa,
    perfil: perfil as Perfil & { empresa_id: string },
    equipo: (equipo ?? []) as Perfil[],
  }
}

const rolLabel: Record<string, string> = {
  superadmin: "Super Admin",
  dueno: "Dueño",
  project_manager: "Project Manager",
  administrador: "Administrador",
  capataz: "Capataz",
}

const rolColor: Record<string, string> = {
  superadmin: "bg-purple-100 text-purple-700",
  dueno: "bg-slate-900 text-white",
  project_manager: "bg-blue-100 text-blue-700",
  administrador: "bg-emerald-100 text-emerald-700",
  capataz: "bg-amber-100 text-amber-700",
}

export default async function ConfiguracionPage() {
  const { empresa, perfil, equipo } = await getData()

  return (
    <div>
      <Header
        titulo="Configuración"
        subtitulo={`${empresa?.nombre ?? "—"} · ${equipo.length} usuario${equipo.length !== 1 ? "s" : ""}`}
      />

      <div className="p-6 space-y-6 max-w-3xl">
        {/* ── Mi perfil ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-700">Mi perfil</h2>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-full bg-slate-900 flex items-center justify-center shrink-0">
                <span className="text-white text-lg font-bold">
                  {perfil.nombre_completo.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="text-base font-semibold text-slate-900">{perfil.nombre_completo}</h3>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", rolColor[perfil.rol] ?? "bg-slate-100 text-slate-600")}>
                    {rolLabel[perfil.rol] ?? perfil.rol}
                  </span>
                </div>
                <p className="text-sm text-slate-500">{perfil.email}</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                  <Bell className="h-3 w-3" /> Notificaciones email
                </p>
                <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                  perfil.configuracion_notificaciones?.email ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                  {perfil.configuracion_notificaciones?.email ? "Activas" : "Desactivadas"}
                </span>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                  <Bell className="h-3 w-3" /> Notificaciones push
                </p>
                <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                  perfil.configuracion_notificaciones?.push ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                  {perfil.configuracion_notificaciones?.push ? "Activas" : "Desactivadas"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Empresa ── */}
        {empresa && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-700">Empresa</h2>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-4">
                {empresa.logo_url ? (
                  <img src={empresa.logo_url} alt={empresa.nombre} className="h-12 w-12 rounded-lg object-contain" />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-slate-100 flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-slate-400" />
                  </div>
                )}
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{empresa.nombre}</h3>
                  {empresa.rfc_tax_id && (
                    <p className="text-sm text-slate-500">RFC: {empresa.rfc_tax_id}</p>
                  )}
                  <p className="text-xs text-slate-400">Jurisdicción: {empresa.jurisdiccion}</p>
                </div>
              </div>

              {/* Configuración / umbrales */}
              {Object.keys(empresa.configuracion ?? {}).length > 0 && (
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Umbrales configurados</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(empresa.configuracion).map(([key, val]) => (
                      <div key={key} className="bg-slate-50 rounded-lg px-3 py-2">
                        <p className="text-xs text-slate-400 capitalize">{key.replace(/_/g, " ")}</p>
                        <p className="text-sm font-medium text-slate-700">{String(val)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-400 italic">
                Para modificar datos de la empresa, contacta a soporte o usa la API de administración.
              </p>
            </div>
          </section>
        )}

        {/* ── Equipo ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-700">Equipo</h2>
            <span className="text-xs text-slate-400">· {equipo.length} usuarios</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="divide-y divide-slate-50">
              {equipo.map((u) => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
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
                      {u.id === perfil.id && (
                        <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">Tú</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </div>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium shrink-0", rolColor[u.rol] ?? "bg-slate-100 text-slate-600")}>
                    {rolLabel[u.rol] ?? u.rol}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Sobre el sistema ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Settings className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-700">Sobre Vertikall Haus</h2>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[
                { label: "Versión", val: "0.1.0 Beta" },
                { label: "Base de datos", val: "Supabase (PostgreSQL)" },
                { label: "Hosting", val: "Vercel" },
                { label: "Soporte", val: "contacto@vertikallhaus.mx" },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-xs text-slate-400">{item.label}</p>
                  <p className="text-sm font-medium text-slate-700">{item.val}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
