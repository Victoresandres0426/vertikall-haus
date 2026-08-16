import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Plus } from "lucide-react"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { ProyectosClient, type ProyectoFromDB } from "./proyectos-client"

async function getProyectos(): Promise<ProyectoFromDB[]> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data, error } = await supabase
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
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error cargando proyectos:", error.message)
    return []
  }

  return (data ?? []) as unknown as ProyectoFromDB[]
}

export default async function ProyectosPage() {
  const proyectos = await getProyectos()
  const activos = proyectos.filter((p) => p.estado === "activo").length

  return (
    <div>
      <Header
        titulo="Proyectos"
        subtitulo={`${proyectos.length} proyecto${proyectos.length !== 1 ? "s" : ""} · ${activos} activo${activos !== 1 ? "s" : ""}`}
        acciones={
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Nuevo proyecto
          </Button>
        }
      />
      <ProyectosClient proyectos={proyectos} />
    </div>
  )
}
