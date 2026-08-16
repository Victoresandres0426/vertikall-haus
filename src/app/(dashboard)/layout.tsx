import { Sidebar } from "@/components/layout/sidebar"
import { createClient } from "@/lib/supabase/server"

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

    return {
      nombre: perfil.nombre_completo as string,
      rol: perfil.rol as string,
      empresaNombre: (empresa?.nombre as string | undefined) ?? "Vertikall Haus",
    }
  } catch {
    return null
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const perfil = await getUserProfile()

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar
        empresaNombre={perfil?.empresaNombre ?? "Vertikall Haus"}
        usuarioNombre={perfil?.nombre ?? "Usuario"}
        usuarioRol={perfil?.rol ?? "project_manager"}
      />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
