/**
 * Dashboard — Server Component
 * Fetches real data from Supabase and passes it to the client view.
 * RLS ensures users only see their own company's data.
 */

import { getProyectos, getDashboardData } from "@/lib/dashboard/queries"
import { DashboardView } from "./DashboardView"

interface SearchParams {
  proyecto?: string
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const proyectoId = params.proyecto ?? null

  // Fetch en paralelo: lista de proyectos + datos del dashboard
  const [proyectos, data] = await Promise.all([
    getProyectos(),
    getDashboardData(proyectoId),
  ])

  // Si no se especificó un proyecto pero hay uno cargado, usamos su ID
  const proyectoActualId = data.proyecto?.id ?? proyectoId

  return (
    <DashboardView
      proyectos={proyectos}
      proyectoActualId={proyectoActualId}
      data={data}
    />
  )
}
