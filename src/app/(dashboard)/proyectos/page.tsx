import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { ProyectosClient, type ProyectoFromDB } from "./proyectos-client"
import { NuevoProyectoBoton } from "./nuevo-proyecto-boton"

async function getProyectos(): Promise<{ proyectos: ProyectoFromDB[]; esDueno: boolean }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [{ data, error }, { data: perfil }] = await Promise.all([
    supabase
      .from("proyectos")
      .select(
        `
      id, codigo, nombre, cliente, ubicacion, estado,
      fecha_fin_plan, fecha_fin_forecast,
      presupuesto_venta, presupuesto_base, margen_objetivo,
      iidp_snapshots ( score_total, fecha ),
      alertas ( nivel, estado ),
      actividades ( avance_porcentaje, costo_real, costo_presupuesto,
                    fecha_inicio_plan, fecha_fin_plan )
    `
      )
      .eq("activo", true)
      .order("created_at", { ascending: false }),
    supabase.from("perfiles_usuario").select("rol").eq("id", user.id).single(),
  ])

  if (error) {
    console.error("Error cargando proyectos:", error.message)
    return { proyectos: [], esDueno: perfil?.rol === "dueno" }
  }

  return { proyectos: (data ?? []) as unknown as ProyectoFromDB[], esDueno: perfil?.rol === "dueno" }
}

export default async function ProyectosPage() {
  const { proyectos, esDueno } = await getProyectos()
  const activos = proyectos.filter((p) => p.estado === "activo").length

  return (
    <div>
      <Header
        titulo="Proyectos"
        subtitulo={`${proyectos.length} proyecto${proyectos.length !== 1 ? "s" : ""} · ${activos} activo${activos !== 1 ? "s" : ""}`}
        acciones={<NuevoProyectoBoton />}
      />
      <ProyectosClient proyectos={proyectos} esDueno={esDueno} />
    </div>
  )
}
