import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { SelectorProyectoActivo } from "@/components/layout/selector-proyecto-activo"
import { BitacoraClient, type EntradaBitacora } from "./bitacora-client"
import { getProyectoActivoId, resolverProyectoActivo } from "@/lib/proyecto-activo"

// Quién puede ESCRIBIR en la bitácora -- equipo de gestión interno.
// Capataz no escribe aquí (ya tiene Reporte Diario); cliente tampoco
// escribe (solo lee, desde el portal).
const ROLES_ESCRIBEN = ["dueno", "superadmin", "administrador", "project_manager"]

export default async function BitacoraPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [{ data: proyectosActivos }, { data: perfil }] = await Promise.all([
    supabase
      .from("proyectos")
      .select("id, codigo, nombre")
      .eq("activo", true)
      .order("created_at", { ascending: false }),
    supabase.from("perfiles_usuario").select("rol, nombre_completo").eq("id", user.id).single(),
  ])

  const todosLosProyectos = proyectosActivos ?? []
  const puedeEscribir = !!perfil && ROLES_ESCRIBEN.includes(perfil.rol)

  const cookieId = await getProyectoActivoId()
  const proyectoActivo = resolverProyectoActivo(todosLosProyectos, cookieId)

  let entradas: EntradaBitacora[] = []
  if (proyectoActivo) {
    const { data, error } = await supabase
      .from("bitacora_proyecto")
      .select("id, autor_nombre, autor_rol, autor_titulo, nota, fotos, created_at")
      .eq("proyecto_id", proyectoActivo.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error cargando bitácora (¿falta correr la migración 120?):", error.message)
    } else {
      entradas = (data ?? []) as EntradaBitacora[]
    }

    // Firmar las URLs de las fotos de cada entrada.
    const todasLasFotos = entradas.flatMap((e) => e.fotos ?? [])
    if (todasLasFotos.length > 0) {
      await Promise.all(
        todasLasFotos.map(async (f) => {
          const { data: firmada } = await supabase.storage
            .from("bitacora-fotos")
            .createSignedUrl(f.storage_path, 3600)
          if (firmada?.signedUrl) f.url = firmada.signedUrl
        })
      )
    }
  }

  return (
    <div>
      <Header
        titulo="Bitácora de obra"
        subtitulo={`${entradas.length} ${entradas.length === 1 ? "entrada" : "entradas"}`}
        acciones={
          todosLosProyectos.length > 0 ? (
            <SelectorProyectoActivo
              proyectos={todosLosProyectos}
              proyectoActualId={proyectoActivo?.id ?? null}
            />
          ) : undefined
        }
      />

      <div className="p-6">
        {!proyectoActivo ? (
          <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-xl p-5">
            No hay proyectos activos.
          </p>
        ) : (
          <BitacoraClient
            proyectoId={proyectoActivo.id}
            entradas={entradas}
            puedeEscribir={puedeEscribir}
          />
        )}
      </div>
    </div>
  )
}
