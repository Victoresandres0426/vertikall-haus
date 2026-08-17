import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { PersonalClient } from "./personal-client"

export default async function PersonalPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("id, empresa_id, nombre_completo, rol")
    .eq("id", user.id)
    .single()

  if (!perfil) redirect("/sin-acceso")

  const ROLES_VEN_PERSONAL = ["dueno", "superadmin", "administrador", "project_manager"]
  if (!ROLES_VEN_PERSONAL.includes(perfil.rol)) redirect("/sin-acceso")

  const [{ data: trabajadores }, { data: proyectos }] = await Promise.all([
    supabase
      .from("trabajadores")
      .select("id, nombre_completo, codigo, especialidad, rol_obra, nivel_experiencia, tarifa_diaria, moneda, activo, fecha_ingreso, notas, usuario_id, telefono_personal, direccion, contacto_emergencia_nombre, contacto_emergencia_telefono")
      .eq("empresa_id", perfil.empresa_id)
      .order("nombre_completo"),
    supabase
      .from("proyectos")
      .select("id, nombre")
      .eq("empresa_id", perfil.empresa_id)
      .eq("estado", "activo"),
  ])

  const puedeEditar = ["dueno", "superadmin", "administrador", "project_manager"].includes(perfil.rol)

  return (
    <div className="flex flex-col h-screen">
      <Header
        titulo="Personal"
        subtitulo="Trabajadores y operarios registrados"
      />
      <div className="flex-1 overflow-auto">
        <PersonalClient
          trabajadores={trabajadores ?? []}
          proyectos={proyectos ?? []}
          puedeEditar={puedeEditar}
          empresaId={perfil.empresa_id}
        />
      </div>
    </div>
  )
}
