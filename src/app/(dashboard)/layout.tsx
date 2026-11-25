import { DashboardShell } from "@/components/layout/dashboard-shell"
import { VistaPreviaBanner } from "@/components/layout/vista-previa-banner"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

const ROLES_PORTAL = ["cliente", "colaborador_externo", "subcontratista"]

async function getUserProfile() {
  try {
    const supabase = await createClient()

    // Usuario autenticado
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    // Perfil desde la tabla perfiles_usuario
    const { data: perfil } = await supabase
      .from("perfiles_usuario")
      .select("nombre_completo, rol, empresa_id")
      .eq("id", user.id)
      .single()

    if (!perfil) return null

    // Nombre de la empresa
    const { data: empresa } = await supabase
      .from("empresas")
      .select("nombre")
      .eq("id", perfil.empresa_id)
      .single()

    // "Ver como" (migración 158): solo el dueño/superadmin
    const esDueno = ["dueno", "superadmin"].includes(perfil.rol as string)
    let vistaPrevia: { rol: string; proyecto_id: string | null } | null = null
    let proyectos: { id: string; nombre: string }[] = []
    if (esDueno) {
      try {
        const { data: vp } = await supabase.rpc("vista_previa_actual")
        vistaPrevia = (vp as { rol: string; proyecto_id: string | null } | null) ?? null
      } catch {
        vistaPrevia = null // migración 158 sin correr todavía
      }
      // Con una vista previa activa el RLS filtra como ese rol (un PM/capataz
      // simulado solo ve su proyecto), por eso el selector lista solo lo visible.
      const { data: ps } = await supabase.from("proyectos").select("id, nombre").order("nombre")
      proyectos = (ps ?? []) as { id: string; nombre: string }[]
    }

    return {
      nombre: perfil.nombre_completo as string,
      rol: perfil.rol as string,
      empresaNombre: (empresa?.nombre as string | undefined) ?? "Vertikall Haus",
      esDueno,
      vistaPrevia,
      proyectos,
    }
  } catch {
    return null
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const perfil = await getUserProfile()

  // Rol efectivo: el simulado si el dueño está en "Ver como"
  const rolEfectivo = perfil?.vistaPrevia?.rol ?? perfil?.rol ?? "project_manager"

  // Los clientes, colaboradores externos y subcontratistas no usan el
  // dashboard interno — tienen su propio portal
  if (ROLES_PORTAL.includes(rolEfectivo)) redirect("/portal-cliente")

  return (
    <DashboardShell
      empresaNombre={perfil?.empresaNombre ?? "Vertikall Haus"}
      usuarioNombre={perfil?.nombre ?? "Usuario"}
      usuarioRol={rolEfectivo}
      esDueno={perfil?.esDueno ?? false}
      vistaPreviaRol={perfil?.vistaPrevia?.rol ?? null}
      vistaPreviaProyectoId={perfil?.vistaPrevia?.proyecto_id ?? null}
      proyectosVistaPrevia={perfil?.proyectos ?? []}
    >
      {perfil?.vistaPrevia && <VistaPreviaBanner rol={perfil.vistaPrevia.rol} />}
      {children}
    </DashboardShell>
  )
}
