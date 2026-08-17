import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { PresupuestoClient, type Presupuesto, type ProyectoOpcion } from "./presupuesto-client"

const ROLES_GESTION = ["project_manager", "dueno", "superadmin", "administrador"]

async function getData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_GESTION.includes(perfil.rol)) redirect("/sin-acceso")

  const [{ data }, { data: proyectos }] = await Promise.all([
    supabase
      .from("presupuestos")
      .select(`
        id, version, nombre_version, es_baseline_actual,
        monto_total:total,
        proyectos ( nombre, codigo ),
        partidas:partidas_presupuesto (
          id, codigo, descripcion, tipo_recurso,
          cantidad, unidad, precio_unitario,
          monto_presupuestado, monto_comprometido, monto_ejercido,
          proceso_id, actividad_id,
          procesos ( nombre, codigo )
        )
      `)
      .order("created_at", { ascending: false }),
    supabase
      .from("proyectos")
      .select("id, nombre, codigo")
      .order("nombre"),
  ])

  return {
    presupuestos: (data ?? []) as unknown as Presupuesto[],
    proyectos: (proyectos ?? []) as ProyectoOpcion[],
    puedeCrear: !!perfil && ROLES_GESTION.includes(perfil.rol),
  }
}

export default async function PresupuestoPage() {
  const { presupuestos, proyectos, puedeCrear } = await getData()

  const totalPartidas = presupuestos.reduce((s, p) => s + p.partidas.length, 0)
  const totalPresupuestado = presupuestos.reduce((s, p) => s + (p.monto_total ?? 0), 0)

  function formatMXN(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
    return `$${n.toLocaleString()}`
  }

  return (
    <div>
      <Header
        titulo="Presupuesto"
        subtitulo={
          presupuestos.length === 0
            ? "Sin presupuestos cargados"
            : `${presupuestos.length} versión${presupuestos.length !== 1 ? "es" : ""} · ${totalPartidas} partidas · ${formatMXN(totalPresupuestado)} total`
        }
      />
      <PresupuestoClient presupuestosIniciales={presupuestos} proyectos={proyectos} puedeCrear={puedeCrear} />
    </div>
  )
}
