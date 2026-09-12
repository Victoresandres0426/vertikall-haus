import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { SelectorProyectoActivo } from "@/components/layout/selector-proyecto-activo"
import { ActividadesClient, type ProyectoConActividades } from "./actividades-client"
import { ActualizarCuadrillaBoton } from "./actualizar-cuadrilla-boton"
import { getProyectoActivoId, resolverProyectoActivo } from "@/lib/proyecto-activo"

const ROLES_EDITAN = ["project_manager", "administrador", "dueno", "superadmin"]

async function getProyectosConActividades(): Promise<{
  proyectos: ProyectoConActividades[]
  todosLosProyectos: { id: string; codigo: string; nombre: string }[]
  puedeEditar: boolean
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [{ data: proyectosActivos }, { data: perfil }] = await Promise.all([
    supabase
      .from("proyectos")
      .select("id, codigo, nombre")
      .eq("activo", true)
      .order("created_at", { ascending: false }),
    supabase.from("perfiles_usuario").select("rol").eq("id", user.id).single(),
  ])

  const todosLosProyectos = proyectosActivos ?? []
  const puedeEditar = !!perfil && ROLES_EDITAN.includes(perfil.rol)

  // Actividades ahora se limita al proyecto "activo" (elegido con el
  // selector de arriba) en vez de mostrar todos los proyectos mezclados.
  const cookieId = await getProyectoActivoId()
  const proyectoActivo = resolverProyectoActivo(todosLosProyectos, cookieId)

  if (!proyectoActivo) {
    return { proyectos: [], todosLosProyectos, puedeEditar }
  }

  const { data, error } = await supabase
    .from("proyectos")
    .select(`
      id, codigo, nombre, cliente, cliente_email, cliente_telefono, ubicacion,
      presupuesto_base, presupuesto_venta, margen_objetivo,
      fecha_inicio_plan, fecha_fin_plan,
      procesos (
        id, codigo, nombre, orden,
        actividades (
          id, codigo, nombre, estado, activa,
          avance_porcentaje, es_critica, riesgo_nivel, disciplina,
          fecha_inicio_plan, fecha_fin_plan, duracion_plan_dias, holgura_dias,
          costo_presupuesto, costo_real, costo_material, costo_mano_obra,
          cantidad_objetivo, cantidad_ejecutada, unidad, personal_planeado,
          composicion_cuadrilla, productividad_plan_texto
        )
      )
    `)
    .eq("id", proyectoActivo.id)

  if (error) {
    console.error("Error cargando actividades:", error.message)
    return { proyectos: [], todosLosProyectos, puedeEditar }
  }

  const proyectos = ((data ?? []) as unknown as ProyectoConActividades[]).map((proy) => ({
    ...proy,
    procesos: (proy.procesos ?? [])
      .sort((a, b) => a.orden - b.orden)
      .map((proc) => ({
        ...proc,
        actividades: (proc.actividades ?? [])
          .filter((a) => a.activa !== false)
          .sort((a, b) => a.codigo.localeCompare(b.codigo)),
      })),
  }))

  return { proyectos, todosLosProyectos, puedeEditar }
}

export default async function ActividadesPage() {
  const { proyectos, todosLosProyectos, puedeEditar } = await getProyectosConActividades()

  const totalActs = proyectos.flatMap((p) => p.procesos.flatMap((pr) => pr.actividades))
  const enProgreso = totalActs.filter((a) => a.estado === "en_progreso").length
  const completadas = totalActs.filter((a) => a.estado === "completada").length
  const bloqueadas = totalActs.filter((a) => a.estado === "bloqueada").length

  return (
    <div>
      <Header
        titulo="Actividades"
        subtitulo={`${totalActs.length} actividades · ${enProgreso} en progreso · ${completadas} completadas`}
        acciones={
          todosLosProyectos.length > 0 ? (
            <div className="flex items-center gap-2">
              {puedeEditar && proyectos[0]?.id && (
                <ActualizarCuadrillaBoton proyectoId={proyectos[0].id} />
              )}
              <SelectorProyectoActivo
                proyectos={todosLosProyectos}
                proyectoActualId={proyectos[0]?.id ?? null}
              />
            </div>
          ) : undefined
        }
      />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total", val: totalActs.length, color: "text-slate-900" },
            { label: "En progreso", val: enProgreso, color: "text-blue-600" },
            { label: "Completadas", val: completadas, color: "text-emerald-600" },
            { label: "Bloqueadas", val: bloqueadas, color: "text-red-600" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
              <p className="text-sm text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <ActividadesClient proyectos={proyectos} puedeEditar={puedeEditar} />
      </div>
    </div>
  )
}
