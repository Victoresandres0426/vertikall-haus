"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { ejecutarMotorDiario } from "@/lib/engine/motor"
import { extraerFilasCuadrillaDeExcel, type FilaCuadrilla } from "@/lib/importar-cuadrilla"
import { procesarEnLotes } from "@/lib/utils"

const ROLES_EDITAN = ["project_manager", "administrador", "dueno", "superadmin"]

async function verificarAcceso(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_EDITAN.includes(perfil.rol)) {
    return { ok: false as const, error: "No tienes permisos para editar" }
  }
  return { ok: true as const }
}

export type FilaCuadrillaRevision = FilaCuadrilla & {
  actividadId: string | null
  nombreActual: string | null
  personalPlaneadoActual: number | null
  cantidadObjetivoActual: number | null
  duracionPlanDiasActual: number | null
  costoMaterialActual: number | null
  costoManoObraActual: number | null
  costoPresupuestoActual: number | null
}

// ── Paso 1: leer el Excel y proponer los cambios (sin tocar la BD) ──
export async function analizarCuadrillaExcel(
  proyectoId: string,
  formData: FormData
): Promise<{ filas?: FilaCuadrillaRevision[]; sinEmparejar?: number; error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  const file = formData.get("archivo") as File | null
  if (!file) return { error: "No se recibió ningún archivo" }

  const nombreLower = file.name.toLowerCase()
  if (!nombreLower.endsWith(".xlsx") && !nombreLower.endsWith(".xls")) {
    return { error: "El archivo debe ser un Excel (.xlsx o .xls)" }
  }

  let extraido: ReturnType<typeof extraerFilasCuadrillaDeExcel>
  try {
    const buffer = await file.arrayBuffer()
    extraido = extraerFilasCuadrillaDeExcel(buffer)
  } catch (err) {
    console.error("analizarCuadrillaExcel - lectura:", err)
    return { error: "No se pudo leer el archivo. Verifica que sea un Excel válido." }
  }

  if (extraido.error) return { error: extraido.error }
  if (extraido.filas.length === 0) {
    return { error: "No se encontraron filas de actividad con cuadrilla en el archivo." }
  }

  const { data: actividadesExistentes, error: errActividades } = await supabase
    .from("actividades")
    .select("id, codigo, nombre, personal_planeado, cantidad_objetivo, duracion_plan_dias, costo_material, costo_mano_obra, costo_presupuesto")
    .eq("proyecto_id", proyectoId)

  if (errActividades) {
    console.error("analizarCuadrillaExcel - actividades:", errActividades)
    return { error: "No se pudieron leer las actividades del proyecto." }
  }

  type ActividadExistente = {
    id: string
    codigo: string
    nombre: string
    personal_planeado: number | null
    cantidad_objetivo: number | null
    duracion_plan_dias: number | null
    costo_material: number | null
    costo_mano_obra: number | null
    costo_presupuesto: number | null
  }

  const porCodigo = new Map(
    ((actividadesExistentes ?? []) as ActividadExistente[]).map((a) => [a.codigo, a])
  )

  let sinEmparejar = 0
  const filas: FilaCuadrillaRevision[] = extraido.filas.map((f) => {
    const existente = porCodigo.get(f.codigo)
    if (!existente) sinEmparejar++
    return {
      ...f,
      actividadId: existente?.id ?? null,
      nombreActual: existente?.nombre ?? null,
      personalPlaneadoActual: existente?.personal_planeado ?? null,
      cantidadObjetivoActual: existente?.cantidad_objetivo ?? null,
      duracionPlanDiasActual: existente?.duracion_plan_dias ?? null,
      costoMaterialActual: existente?.costo_material ?? null,
      costoManoObraActual: existente?.costo_mano_obra ?? null,
      costoPresupuestoActual: existente?.costo_presupuesto ?? null,
    }
  })

  return { filas, sinEmparejar }
}

// ── Paso 2: aplicar los cambios revisados/confirmados ───────────────
export async function aplicarActualizacionCuadrilla(
  proyectoId: string,
  filas: FilaCuadrillaRevision[]
): Promise<{ error?: string; actualizadas?: number }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  const filasAplicables = filas.filter((f) => f.actividadId)
  if (filasAplicables.length === 0) {
    return { error: "No hay actividades emparejadas para actualizar." }
  }

  // avance_porcentaje/estado normalmente se recalculan solos con un
  // trigger sobre avance_diario (migración 064) cada vez que se guarda
  // un Reporte Diario -- pero ese trigger NUNCA se dispara con este
  // UPDATE directo a cantidad_objetivo desde el Excel. Sin esto, traer
  // una nueva cantidad propuesta desde el Excel deja el % de avance
  // mostrado calculado contra la cantidad VIEJA hasta el próximo reporte
  // de esa actividad (mismo síntoma reportado en la actividad 00.02).
  // Se trae cantidad_ejecutada/estado de una sola vez para recalcular
  // con la misma fórmula que usa el trigger (_recalcular_avance_actividad,
  // migración 064).
  const idsConCantidadNueva = filasAplicables.filter((f) => f.actividadId && f.cantidadObjetivo !== null).map((f) => f.actividadId as string)
  const ejecutadaPorActividad = new Map<string, { cantidad_ejecutada: number; estado: string }>()
  if (idsConCantidadNueva.length > 0) {
    const { data: actualesRaw } = await supabase
      .from("actividades")
      .select("id, cantidad_ejecutada, estado")
      .in("id", idsConCantidadNueva)
    for (const a of (actualesRaw ?? []) as { id: string; cantidad_ejecutada: number | null; estado: string }[]) {
      ejecutadaPorActividad.set(a.id, { cantidad_ejecutada: Number(a.cantidad_ejecutada ?? 0), estado: a.estado })
    }
  }

  // Antes esto era un for-loop con un await por fila -- con ~90
  // actividades eso son ~90 idas y vueltas SECUENCIALES a Supabase antes
  // de siquiera llegar al motor (que hace su propia tanda de llamadas
  // secuenciales), lo que en la práctica se sentía como que el botón
  // "Aplicar" se quedaba colgado varios minutos. Disparar las 90 a la
  // vez con un solo Promise.all tampoco funcionó bien en la práctica --
  // probablemente agota el pool de conexiones del proyecto de Supabase,
  // dejando varias esperando un turno que nunca llega (mismo síntoma:
  // colgado, sin error). Se procesan en lotes de 10 en paralelo.
  const resultados = await procesarEnLotes(filasAplicables, 10, async (f) => {
      // personal_planeado/composicion_cuadrilla/productividad_plan_texto son
      // siempre de referencia (null si el Excel no traía nada). Cantidad,
      // duración y costos SOLO se tocan si el Excel trajo un número --
      // así una columna vacía en una fila puntual nunca borra un dato
      // bueno que ya existía.
      const cambios: Record<string, unknown> = {
        personal_planeado: f.personalPlaneado,
        composicion_cuadrilla: f.composicionCuadrilla,
        productividad_plan_texto: f.productividadTexto,
      }
      if (f.cantidadObjetivo !== null) cambios.cantidad_objetivo = f.cantidadObjetivo
      if (f.duracionPlanDias !== null) cambios.duracion_plan_dias = f.duracionPlanDias
      if (f.costoMaterial !== null) cambios.costo_material = f.costoMaterial
      if (f.costoManoObra !== null) cambios.costo_mano_obra = f.costoManoObra
      if (f.costoPresupuesto !== null) cambios.costo_presupuesto = f.costoPresupuesto

      if (f.cantidadObjetivo !== null && f.actividadId) {
        const actual = ejecutadaPorActividad.get(f.actividadId)
        if (actual && f.cantidadObjetivo > 0) {
          const nuevoPct = Math.round((actual.cantidad_ejecutada / f.cantidadObjetivo) * 100)
          cambios.avance_porcentaje = nuevoPct
          cambios.estado = nuevoPct >= 100
            ? "completada"
            : actual.cantidad_ejecutada > 0
              ? "en_progreso"
              : actual.estado
        }
      }

      const { error } = await supabase
        .from("actividades")
        .update(cambios)
        .eq("id", f.actividadId as string)
        .eq("proyecto_id", proyectoId)

      if (error) console.error(`aplicarActualizacionCuadrilla - actividad ${f.actividadId}:`, error)
      return { codigo: f.codigo, ok: !error }
  })

  let actualizadas = 0
  const errores: string[] = []
  for (const r of resultados) {
    if (r.ok) actualizadas++
    else errores.push(r.codigo)
  }

  // El motor recalcula el rendimiento/IIDP tomando en cuenta el nuevo
  // personal_planeado -- una sola corrida al final, no una por fila.
  try {
    const motor = await ejecutarMotorDiario(supabase, proyectoId, new Date())
    if (motor.errores.length > 0) {
      console.error("Motor de reglas (tras actualizar cuadrilla) terminó con errores:", motor.errores)
    }
  } catch (e) {
    console.error("Motor de reglas (tras actualizar cuadrilla) falló:", e)
  }

  revalidatePath("/actividades")
  revalidatePath("/dashboard")
  revalidatePath("/proyectos")
  revalidatePath("/gantt")
  revalidatePath("/presupuesto")

  if (errores.length > 0) {
    return { error: `Se actualizaron ${actualizadas}, pero fallaron: ${errores.join(", ")}`, actualizadas }
  }
  return { actualizadas }
}
