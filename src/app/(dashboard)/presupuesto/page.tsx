import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { SelectorProyectoActivo } from "@/components/layout/selector-proyecto-activo"
import { PresupuestoClient, type Presupuesto, type ProyectoOpcion } from "./presupuesto-client"
import { getProyectoActivoId, resolverProyectoActivo } from "@/lib/proyecto-activo"

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

  const { data: proyectos } = await supabase
    .from("proyectos")
    .select("id, nombre, codigo")
    .order("nombre")

  const todosLosProyectos = proyectos ?? []
  const cookieId = await getProyectoActivoId()
  const proyectoActivo = resolverProyectoActivo(todosLosProyectos, cookieId)

  let presupuestos: Presupuesto[] = []
  let avancePonderadoActual: number | null = null
  if (proyectoActivo) {
    const [{ data }, { data: snap }] = await Promise.all([
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
        .eq("proyecto_id", proyectoActivo.id)
        .order("created_at", { ascending: false }),
      // Última corrida de la facturación automática -- es el mismo %
      // que usa generar_facturas_semanales para prorratear los
      // indirectos, así que sirve para comparar "gastado real" vs
      // "lo que según el prorrateo ya se le debería haber reconocido"
      // a cada partida indirecta (ver FilaPartida en presupuesto-client).
      supabase
        .from("avance_snapshots_semanales")
        .select("avance_ponderado_pct, fecha")
        .eq("proyecto_id", proyectoActivo.id)
        .order("fecha", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    presupuestos = (data ?? []) as unknown as Presupuesto[]
    avancePonderadoActual = snap?.avance_ponderado_pct ?? null
  }

  return {
    presupuestos,
    // Lista completa: la usa el modal de "Nueva versión" para elegir a
    // qué proyecto pertenece -- no se limita al proyecto activo.
    proyectos: (proyectos ?? []) as ProyectoOpcion[],
    puedeCrear: !!perfil && ROLES_GESTION.includes(perfil.rol),
    todosLosProyectos,
    proyectoActivoId: proyectoActivo?.id ?? null,
    avancePonderadoActual,
  }
}

export default async function PresupuestoPage() {
  const { presupuestos, proyectos, puedeCrear, todosLosProyectos, proyectoActivoId, avancePonderadoActual } = await getData()

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
        acciones={
          todosLosProyectos.length > 0 ? (
            <SelectorProyectoActivo proyectos={todosLosProyectos} proyectoActualId={proyectoActivoId} />
          ) : undefined
        }
      />
      <PresupuestoClient presupuestosIniciales={presupuestos} proyectos={proyectos} puedeCrear={puedeCrear} avancePonderadoActual={avancePonderadoActual} />
    </div>
  )
}
