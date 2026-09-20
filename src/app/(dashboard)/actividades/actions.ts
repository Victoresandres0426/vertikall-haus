"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { ejecutarMotorDiario } from "@/lib/engine/motor"

// Tras crear/editar una actividad (sobre todo si cambian sus fechas o
// duración), recalcula la ruta crítica de todo el proyecto -- esto
// reprograma en cascada las actividades sucesoras si el cambio las
// afecta, y refresca es_critica/holgura y las alertas de cronograma. No
// debe romper el guardado si falla: la actividad ya se guardó, que es
// lo crítico; el error queda en logs.
async function recalcularCronograma(supabase: Awaited<ReturnType<typeof createClient>>, proyectoId: string) {
  try {
    const motor = await ejecutarMotorDiario(supabase, proyectoId, new Date())
    if (motor.errores.length > 0) {
      console.error("Motor de reglas (tras editar actividad) terminó con errores:", motor.errores)
    }
  } catch (e) {
    console.error("Motor de reglas (tras editar actividad) falló:", e)
  }
}

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

// ── Historial de avance día por día ─────────────────────────────
// Hoy no hay forma de ver, para una actividad, qué se reportó cada día
// sin ir reporte por reporte en el Historial -- esto junta todo de una
// vez (avance_diario + la fecha de su reporte) para poder ver de un
// vistazo si algo se está duplicando o si falta corregir un día, y
// saltar directo a editar ese reporte si hace falta.
export type EntradaHistorialAvance = {
  reporte_id: string
  fecha: string
  cantidad_ejecutada_dia: number
  incidencias: string | null
}

export async function obtenerHistorialAvance(actividadId: string): Promise<{ error?: string; entradas?: EntradaHistorialAvance[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data, error } = await supabase
    .from("avance_diario")
    .select("reporte_id, cantidad_ejecutada_dia, incidencias, reportes_diarios ( fecha )")
    .eq("actividad_id", actividadId)

  if (error) {
    console.error("obtenerHistorialAvance:", error)
    return { error: "No se pudo cargar el historial de avance." }
  }

  const entradas = ((data ?? []) as unknown as {
    reporte_id: string
    cantidad_ejecutada_dia: number
    incidencias: string | null
    reportes_diarios: { fecha: string } | null
  }[])
    .map((r) => ({
      reporte_id: r.reporte_id,
      fecha: r.reportes_diarios?.fecha ?? "",
      cantidad_ejecutada_dia: r.cantidad_ejecutada_dia,
      incidencias: r.incidencias,
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  return { entradas }
}

// ── Proyecto ─────────────────────────────────────────────────

export type ProyectoInfoInput = {
  nombre: string
  cliente: string | null
  cliente_email: string | null
  cliente_telefono: string | null
  ubicacion: string | null
  presupuesto_base: number
  presupuesto_venta: number
  margen_objetivo: number
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
}

export async function actualizarProyectoInfo(
  proyectoId: string,
  input: ProyectoInfoInput
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  if (!input.nombre?.trim()) return { error: "El nombre del proyecto es obligatorio" }

  const { error } = await supabase
    .from("proyectos")
    .update({
      nombre: input.nombre.trim(),
      cliente: input.cliente || null,
      cliente_email: input.cliente_email || null,
      cliente_telefono: input.cliente_telefono || null,
      ubicacion: input.ubicacion || null,
      presupuesto_base: input.presupuesto_base || 0,
      presupuesto_venta: input.presupuesto_venta || 0,
      margen_objetivo: input.margen_objetivo || 0,
      fecha_inicio_plan: input.fecha_inicio_plan || null,
      fecha_fin_plan: input.fecha_fin_plan || null,
    })
    .eq("id", proyectoId)

  if (error) {
    console.error("actualizarProyectoInfo error:", error)
    return { error: "Error al actualizar el proyecto." }
  }

  revalidatePath("/actividades")
  revalidatePath("/proyectos")
  revalidatePath(`/proyectos/${proyectoId}`)
  return {}
}

// ── Procesos ─────────────────────────────────────────────────

export async function crearProceso(
  proyectoId: string,
  codigo: string,
  nombre: string,
  nombreEn?: string | null
): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  if (!nombre?.trim()) return { error: "El nombre del proceso es obligatorio" }

  const { data: existentes } = await supabase
    .from("procesos")
    .select("orden")
    .eq("proyecto_id", proyectoId)
    .order("orden", { ascending: false })
    .limit(1)

  const siguienteOrden = (existentes?.[0]?.orden ?? -1) + 1

  const { data, error } = await supabase
    .from("procesos")
    .insert({
      proyecto_id: proyectoId,
      codigo: codigo?.trim() || String(siguienteOrden + 1),
      nombre: nombre.trim(),
      nombre_en: nombreEn?.trim() || null,
      orden: siguienteOrden,
    })
    .select("id")
    .single()

  if (error || !data) {
    console.error("crearProceso error:", error)
    return { error: "Error al crear el proceso." }
  }

  revalidatePath("/actividades")
  return { id: data.id }
}

export async function actualizarProceso(
  procesoId: string,
  codigo: string,
  nombre: string,
  nombreEn?: string | null
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  if (!nombre?.trim()) return { error: "El nombre del proceso es obligatorio" }

  const { error } = await supabase
    .from("procesos")
    .update({ codigo: codigo?.trim() || "", nombre: nombre.trim(), nombre_en: nombreEn?.trim() || null })
    .eq("id", procesoId)

  if (error) {
    console.error("actualizarProceso error:", error)
    return { error: "Error al actualizar el proceso." }
  }

  revalidatePath("/actividades")
  return {}
}

export async function eliminarProceso(procesoId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  const { count } = await supabase
    .from("actividades")
    .select("id", { count: "exact", head: true })
    .eq("proceso_id", procesoId)
    .eq("activa", true)

  if ((count ?? 0) > 0) {
    return { error: "Este proceso todavía tiene actividades. Elimínalas primero." }
  }

  const { error } = await supabase.from("procesos").delete().eq("id", procesoId)

  if (error) {
    console.error("eliminarProceso error:", error)
    return { error: "Error al eliminar el proceso." }
  }

  revalidatePath("/actividades")
  return {}
}

// ── Actividades ──────────────────────────────────────────────

export type ActividadInput = {
  codigo: string
  nombre: string
  // Nombre en inglés -- solo se usa hoy para el desglose de la factura
  // del cliente cuando el proyecto tiene idioma_cliente='en' (migración
  // 092). Opcional: si queda vacío, la factura cae de vuelta al nombre
  // en español.
  nombre_en: string | null
  disciplina: string | null
  costo_material: number
  costo_mano_obra: number
  cantidad_objetivo: number | null
  unidad: string | null
  duracion_plan_dias: number
  personal_planeado: number | null
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
  es_critica: boolean
}

export async function crearActividad(
  proyectoId: string,
  procesoId: string,
  input: ActividadInput
): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  if (!input.nombre?.trim()) return { error: "El nombre de la actividad es obligatorio" }

  const costoMaterial = input.costo_material || 0
  const costoManoObra = input.costo_mano_obra || 0

  const { data, error } = await supabase
    .from("actividades")
    .insert({
      proyecto_id: proyectoId,
      proceso_id: procesoId,
      codigo: input.codigo?.trim() || "",
      nombre: input.nombre.trim(),
      nombre_en: input.nombre_en?.trim() || null,
      disciplina: input.disciplina || null,
      costo_material: costoMaterial,
      costo_mano_obra: costoManoObra,
      costo_presupuesto: costoMaterial + costoManoObra,
      cantidad_objetivo: input.cantidad_objetivo ?? null,
      unidad: input.unidad || null,
      duracion_plan_dias: Math.max(1, Math.round(input.duracion_plan_dias || 1)),
      personal_planeado: input.personal_planeado != null ? Math.max(1, Math.round(input.personal_planeado)) : null,
      fecha_inicio_plan: input.fecha_inicio_plan || null,
      fecha_fin_plan: input.fecha_fin_plan || null,
      es_critica: !!input.es_critica,
    })
    .select("id")
    .single()

  if (error || !data) {
    console.error("crearActividad error:", error)
    return { error: "Error al crear la actividad." }
  }

  await recalcularCronograma(supabase, proyectoId)

  revalidatePath("/actividades")
  revalidatePath("/gantt")
  revalidatePath("/dashboard")
  revalidatePath("/alertas")
  return { id: data.id }
}

export async function actualizarActividad(
  actividadId: string,
  input: ActividadInput
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  if (!input.nombre?.trim()) return { error: "El nombre de la actividad es obligatorio" }

  const costoMaterial = input.costo_material || 0
  const costoManoObra = input.costo_mano_obra || 0

  // avance_porcentaje/estado normalmente se recalculan solos con un
  // trigger sobre avance_diario (migración 064) cada vez que se guarda
  // un Reporte Diario -- pero ese trigger solo se dispara con cambios en
  // avance_diario, nunca con un cambio directo a cantidad_objetivo desde
  // este editor. Sin esto, cambiar la "Cantidad propuesta" aquí dejaba
  // el % de avance mostrado con el valor viejo (calculado contra la
  // cantidad anterior) hasta el próximo Reporte Diario de esa actividad
  // -- justo el síntoma reportado en 00.02. Se recalcula aquí con la
  // MISMA fórmula que usa el trigger (_recalcular_avance_actividad,
  // migración 064: cantidad_ejecutada / cantidad_objetivo × 100) para
  // que ambos caminos den siempre el mismo resultado.
  const { data: actual } = await supabase
    .from("actividades")
    .select("cantidad_ejecutada, estado")
    .eq("id", actividadId)
    .single()

  const cantidadEjecutada = Number(actual?.cantidad_ejecutada ?? 0)
  const nuevoObjetivo = input.cantidad_objetivo ?? null
  // Sin cantidad_objetivo no hay forma de calcular % -- se deja como esté
  // (igual que el trigger).
  const nuevoPct = nuevoObjetivo && nuevoObjetivo > 0
    ? Math.round((cantidadEjecutada / nuevoObjetivo) * 100)
    : null

  const cambiosAvance: Record<string, unknown> = {}
  if (nuevoPct !== null) {
    cambiosAvance.avance_porcentaje = nuevoPct
    cambiosAvance.estado = nuevoPct >= 100
      ? "completada"
      : cantidadEjecutada > 0
        ? "en_progreso"
        : (actual?.estado ?? "no_iniciada")
  }

  const { data, error } = await supabase
    .from("actividades")
    .update({
      codigo: input.codigo?.trim() || "",
      nombre: input.nombre.trim(),
      nombre_en: input.nombre_en?.trim() || null,
      disciplina: input.disciplina || null,
      costo_material: costoMaterial,
      costo_mano_obra: costoManoObra,
      costo_presupuesto: costoMaterial + costoManoObra,
      cantidad_objetivo: nuevoObjetivo,
      unidad: input.unidad || null,
      duracion_plan_dias: Math.max(1, Math.round(input.duracion_plan_dias || 1)),
      personal_planeado: input.personal_planeado != null ? Math.max(1, Math.round(input.personal_planeado)) : null,
      fecha_inicio_plan: input.fecha_inicio_plan || null,
      fecha_fin_plan: input.fecha_fin_plan || null,
      es_critica: !!input.es_critica,
      ...cambiosAvance,
    })
    .eq("id", actividadId)
    .select("proyecto_id")
    .single()

  if (error) {
    console.error("actualizarActividad error:", error)
    return { error: "Error al actualizar la actividad." }
  }

  // Si se tocó la fecha/duración, esto puede correr o atrasar toda la
  // ruta crítica -- recalculamos el cronograma completo del proyecto
  // (ver recalcularCronograma arriba) para que las actividades sucesoras
  // se reprogramen automáticamente si corresponde.
  if (data?.proyecto_id) await recalcularCronograma(supabase, data.proyecto_id)

  revalidatePath("/actividades")
  revalidatePath("/gantt")
  revalidatePath("/dashboard")
  revalidatePath("/alertas")
  return {}
}

export async function eliminarActividad(actividadId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  // Baja lógica: preserva historial (reportes, costos reales, asistencia, etc.)
  // que pudieran referenciar esta actividad.
  const { error } = await supabase
    .from("actividades")
    .update({ activa: false })
    .eq("id", actividadId)

  if (error) {
    console.error("eliminarActividad error:", error)
    return { error: "Error al eliminar la actividad." }
  }

  revalidatePath("/actividades")
  return {}
}

// ── Traducción automática de nombres de actividad ────────────────
// Rellena nombre_en para las actividades del proyecto que todavía no
// lo tienen -- pensado para proyectos con decenas/cientos de
// actividades (ej. Radnor con ~198) donde traducir una por una a mano
// no es práctico. Nunca pisa un nombre_en que alguien ya haya escrito
// o corregido a mano.
export type ActividadPorTraducir = { id: string; codigo: string; nombre: string }

async function llamarAnthropicTraduccion(actividades: ActividadPorTraducir[]): Promise<Record<string, string>> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY")

  const lista = actividades.map((a) => ({ id: a.id, nombre: a.nombre }))

  const respuesta = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 8192,
      system: `Eres un traductor especializado en construcción/remodelación residencial. Traduces nombres de actividades de obra del español al inglés, con terminología que usaría un contratista general en Estados Unidos (no una traducción literal palabra por palabra).

Recibes un array JSON de objetos {id, nombre}. Devuelve ÚNICAMENTE un JSON válido (sin texto antes ni después, sin markdown, sin \`\`\`), con esta forma exacta:

{ "traducciones": [ { "id": string, "nombre_en": string } ] }

Debes devolver una traducción para cada "id" recibido. El "id" debe coincidir exactamente con el recibido. Mantén nombres de habitación reconocibles (ej. "cocina" -> "kitchen", "closet master" -> "master closet") y abreviaturas de materiales tal como se usarían en inglés.`,
      messages: [
        { role: "user", content: JSON.stringify(lista) },
      ],
    }),
  })

  if (!respuesta.ok) {
    const textoError = await respuesta.text()
    console.error("Error de Anthropic API (traducción actividades):", respuesta.status, textoError)
    throw new Error(`Anthropic respondió ${respuesta.status}`)
  }

  const json = await respuesta.json()
  const bloques: Array<{ type?: string; text?: string }> = Array.isArray(json?.content) ? json.content : []
  const texto = bloques.find((b) => b.type === "text")?.text ?? ""

  let parsed: { traducciones?: { id: string; nombre_en: string }[] }
  try {
    parsed = JSON.parse(texto)
  } catch {
    const match = texto.match(/\{[\s\S]*\}/)
    if (!match) throw new Error("Respuesta de traducción no es JSON válido")
    parsed = JSON.parse(match[0])
  }

  const mapa: Record<string, string> = {}
  for (const t of parsed.traducciones ?? []) {
    if (t.id && t.nombre_en) mapa[t.id] = t.nombre_en
  }
  return mapa
}

export async function traducirActividadesAlIngles(proyectoId: string): Promise<{ error?: string; traducidas?: number }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  const { data: actividades, error: errorLectura } = await supabase
    .from("actividades")
    .select("id, codigo, nombre")
    .eq("proyecto_id", proyectoId)
    .eq("activa", true)
    .is("nombre_en", null)

  if (errorLectura) {
    console.error("traducirActividadesAlIngles lectura error:", errorLectura)
    return { error: "No se pudo leer las actividades del proyecto." }
  }

  if (!actividades || actividades.length === 0) {
    return { traducidas: 0 }
  }

  // En lotes de 60 para no pasarnos de un tamaño de respuesta razonable
  // en proyectos muy grandes.
  const LOTE = 60
  let totalTraducidas = 0

  try {
    for (let i = 0; i < actividades.length; i += LOTE) {
      const lote = actividades.slice(i, i + LOTE)
      const traducciones = await llamarAnthropicTraduccion(lote)

      for (const act of lote) {
        const nombreEn = traducciones[act.id]
        if (!nombreEn) continue
        const { error: errorUpdate } = await supabase
          .from("actividades")
          .update({ nombre_en: nombreEn })
          .eq("id", act.id)
          .is("nombre_en", null) // no pisa si alguien ya lo editó a mano mientras tanto
        if (!errorUpdate) totalTraducidas++
      }
    }
  } catch (e) {
    console.error("traducirActividadesAlIngles falló:", e)
    return { error: "No se pudo completar la traducción automática. Intenta de nuevo." }
  }

  revalidatePath("/actividades")
  return { traducidas: totalTraducidas }
}

// Mismo mecanismo que traducirActividadesAlIngles, pero para los
// nombres de "proceso" (las agrupaciones que se ven en el Cronograma
// del portal del cliente, ej. "Demolición", "Instalaciones
// eléctricas") -- también necesitan nombre_en para que el portal
// respete el idioma del cliente en esa sección.
export async function traducirProcesosAlIngles(proyectoId: string): Promise<{ error?: string; traducidas?: number }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  const { data: procesos, error: errorLectura } = await supabase
    .from("procesos")
    .select("id, codigo, nombre")
    .eq("proyecto_id", proyectoId)
    .is("nombre_en", null)

  if (errorLectura) {
    console.error("traducirProcesosAlIngles lectura error:", errorLectura)
    return { error: "No se pudo leer los procesos del proyecto." }
  }

  if (!procesos || procesos.length === 0) {
    return { traducidas: 0 }
  }

  let totalTraducidas = 0
  try {
    const traducciones = await llamarAnthropicTraduccion(procesos)
    for (const proc of procesos) {
      const nombreEn = traducciones[proc.id]
      if (!nombreEn) continue
      const { error: errorUpdate } = await supabase
        .from("procesos")
        .update({ nombre_en: nombreEn })
        .eq("id", proc.id)
        .is("nombre_en", null)
      if (!errorUpdate) totalTraducidas++
    }
  } catch (e) {
    console.error("traducirProcesosAlIngles falló:", e)
    return { error: "No se pudo completar la traducción automática de procesos. Intenta de nuevo." }
  }

  revalidatePath("/actividades")
  return { traducidas: totalTraducidas }
}
