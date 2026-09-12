import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Sparkles } from "lucide-react"
import { Header } from "@/components/layout/header"
import { ProyectosClient, type ProyectoFromDB } from "./proyectos-client"
import { NuevoProyectoBoton } from "./nuevo-proyecto-boton"
import { scoreProductividad } from "@/lib/engine/iidp"
import { pesosDesdeConfig } from "@/lib/engine/types"

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
      iidp_snapshots ( score_total, score_cronograma, score_finanzas, score_calidad,
                        score_logistica, score_gestion, horas_reales_dia,
                        horas_equivalentes_plan_dia, fecha ),
      alertas ( nivel, estado ),
      actividades ( avance_porcentaje, costo_real, costo_presupuesto,
                    fecha_inicio_plan, fecha_fin_plan )
    `
      )
      .eq("activo", true)
      .order("created_at", { ascending: false }),
    supabase.from("perfiles_usuario").select("rol, empresa_id").eq("id", user.id).single(),
  ])

  if (error) {
    console.error("Error cargando proyectos:", error.message)
    return { proyectos: [], esDueno: perfil?.rol === "dueno" }
  }

  // Productividad "en vivo" por proyecto: el snapshot más reciente POR
  // FECHA puede quedarse con un score_productividad (y por lo tanto un
  // score_total) viejo si lo último que se editó fue un reporte de un
  // día PASADO (vía historial) -- ver mismo fix en proyectos/[id]/page.tsx
  // y lib/dashboard/queries.ts. Aquí se recalcula igual: se suman las
  // columnas crudas de TODOS los snapshots del proyecto y se recompone
  // score_total con esa productividad fresca, para que la tarjeta de la
  // lista coincida con la ficha del proyecto y el dashboard.
  let pesosConfig: { iidp_pesos?: Record<string, number> } | null = null
  if (perfil?.empresa_id) {
    const { data: empresaRow } = await supabase
      .from("empresas")
      .select("configuracion")
      .eq("id", perfil.empresa_id)
      .single()
    pesosConfig = (empresaRow?.configuracion ?? null) as { iidp_pesos?: Record<string, number> } | null
  }
  const pesos = pesosDesdeConfig(pesosConfig as never)

  const proyectosConIIDPFresco = ((data ?? []) as unknown as ProyectoFromDB[]).map((p) => {
    const snaps = (p.iidp_snapshots ?? []) as unknown as Array<{
      score_total: number; score_cronograma: number; score_finanzas: number
      score_calidad: number; score_logistica: number; score_gestion: number
      horas_reales_dia: number | null; horas_equivalentes_plan_dia: number | null
      fecha: string
    }>
    if (snaps.length === 0) return p

    let sumaHorasReales = 0
    let sumaHorasEquivPlan = 0
    for (const s of snaps) {
      sumaHorasReales += Number(s.horas_reales_dia ?? 0)
      sumaHorasEquivPlan += Number(s.horas_equivalentes_plan_dia ?? 0)
    }
    const productividadActual = scoreProductividad(sumaHorasEquivPlan, sumaHorasReales)

    const ultimo = [...snaps].sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
    const scoreTotalActual =
      ultimo.score_cronograma * pesos.cronograma +
      ultimo.score_finanzas * pesos.finanzas +
      productividadActual * pesos.productividad +
      ultimo.score_calidad * pesos.calidad +
      ultimo.score_logistica * pesos.logistica +
      ultimo.score_gestion * pesos.gestion

    return {
      ...p,
      iidp_snapshots: [{ score_total: scoreTotalActual, fecha: ultimo.fecha }],
    }
  })

  return { proyectos: proyectosConIIDPFresco, esDueno: perfil?.rol === "dueno" }
}

export default async function ProyectosPage() {
  const { proyectos, esDueno } = await getProyectos()
  const activos = proyectos.filter((p) => p.estado === "activo").length

  return (
    <div>
      <Header
        titulo="Proyectos"
        subtitulo={`${proyectos.length} proyecto${proyectos.length !== 1 ? "s" : ""} · ${activos} activo${activos !== 1 ? "s" : ""}`}
        acciones={
          <div className="flex items-center gap-2">
            <Link
              href="/proyectos/importar"
              className="inline-flex items-center gap-1.5 text-sm font-medium border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              Importar desde Excel
            </Link>
            <NuevoProyectoBoton />
          </div>
        }
      />
      <ProyectosClient proyectos={proyectos} esDueno={esDueno} />
    </div>
  )
}
