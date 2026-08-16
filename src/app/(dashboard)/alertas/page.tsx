import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { AlertasClient, type AlertaDB } from "./alertas-client"

async function getAlertas(): Promise<AlertaDB[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data, error } = await supabase
    .from("alertas")
    .select(`
      id, tipo, nivel, estado, titulo,
      que_ocurrio, causa_probable,
      desviacion_actual, proyeccion_sin_accion,
      impacto_financiero, fecha_limite_accion, rol_que_decide,
      alternativas,
      actividades ( nombre, codigo )
    `)
    .in("estado", ["activa", "en_revision"])
    .order("nivel", { ascending: true })
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error cargando alertas:", error.message)
    return []
  }

  // Ordenar: rojo → amarillo → verde
  const orden: Record<string, number> = { rojo: 0, amarillo: 1, verde: 2 }
  return ((data ?? []) as unknown as AlertaDB[]).sort(
    (a, b) => (orden[a.nivel] ?? 9) - (orden[b.nivel] ?? 9)
  )
}

export default async function AlertasPage() {
  const alertas = await getAlertas()
  const rojas = alertas.filter((a) => a.nivel === "rojo").length
  const amarillas = alertas.filter((a) => a.nivel === "amarillo").length

  return (
    <div>
      <Header
        titulo="Centro de Alertas"
        subtitulo={`${rojas} roja${rojas !== 1 ? "s" : ""} · ${amarillas} amarilla${amarillas !== 1 ? "s" : ""} · Motor de decisiones activo`}
      />
      <AlertasClient alertas={alertas} />
    </div>
  )
}
