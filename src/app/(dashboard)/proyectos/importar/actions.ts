"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import * as XLSX from "xlsx"
import { addBusinessDays, toDateInputValue } from "@/lib/business-days"

const ROLES_IMPORTAN = ["project_manager", "administrador", "dueno", "superadmin"]

// ── Tipos del resultado extraído por la IA ──────────────────────

export type ActividadExtraida = {
  codigo: string
  nombre: string
  costo_material: number
  costo_mano_obra: number
  cantidad: number | null
  unidad: string | null
  dias_duracion: number
  dia_inicio: number
  dia_fin: number
  es_critica: boolean
  disciplina: string | null
}

export type ProcesoExtraido = {
  codigo: string
  nombre: string
  orden: number
  actividades: ActividadExtraida[]
}

export type ProyectoExtraido = {
  nombre: string
  cliente: string | null
  cliente_email: string | null
  cliente_telefono: string | null
  ubicacion: string | null
  presupuesto_base: number
  presupuesto_venta: number
  margen_objetivo: number
}

export type ExtraccionResultado = {
  proyecto: ProyectoExtraido
  procesos: ProcesoExtraido[]
  notas: string | null
}

// ── Paso 1: parsear el Excel y mandarlo a la IA ─────────────────

function volcarExcelATexto(buffer: ArrayBuffer): string {
  const wb = XLSX.read(buffer, { type: "array" })
  const partes: string[] = []

  for (const nombreHoja of wb.SheetNames) {
    const hoja = wb.Sheets[nombreHoja]
    const filas: unknown[][] = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "", raw: true })

    // Filtramos filas completamente vacías, y limitamos tamaño por si acaso.
    const filasNoVacias = filas.filter((f) => f.some((c) => c !== "" && c !== null && c !== undefined))
    const filasLimitadas = filasNoVacias.slice(0, 800)

    partes.push(`=== HOJA: ${nombreHoja} ===`)
    for (const fila of filasLimitadas) {
      partes.push(fila.map((c) => (c === null || c === undefined ? "" : String(c))).join(" | "))
    }
    partes.push("")
  }

  return partes.join("\n")
}

const PROMPT_SISTEMA = `Eres un asistente que extrae datos estructurados de estimados/presupuestos de construcción a partir de archivos Excel, sin importar cómo estén organizados, en cualquier idioma.

Recibirás el contenido completo de un archivo Excel (todas sus hojas, fila por fila, celdas separadas por " | "). Tu trabajo es identificar:

1. Datos generales del proyecto: nombre del proyecto, cliente (nombre), email del cliente, teléfono del cliente, ubicación/dirección.
2. Resumen financiero: costo directo total, costos indirectos (supervisión, seguros, movilización, etc.), contingencia, margen/utilidad del contratista, y el gran total del contrato.
3. El desglose detallado de actividades: agrupadas por división/proceso/disciplina (grupos), y dentro de cada grupo, las actividades o subactividades individuales con: código, nombre, costo de MATERIAL y costo de MANO DE OBRA por separado (NO los sumes — si el archivo trae una sola columna de costo sin distinguir origen, pon todo en costo_material y dilo en "notas"), cantidad (número) y unidad de medida (texto corto: SF, LF, EA, m2, m3, ml, und, etc. — si el archivo no la indica explícitamente, usa null en ambos, NO inventes una unidad), duración en días, día de inicio y día de fin relativos al inicio del proyecto (si no existen explícitamente, estímalos acumulando las duraciones en el orden en que aparecen), si es ruta crítica (true/false), y la disciplina o cuadrilla responsable si se menciona.

Responde ÚNICAMENTE con un JSON válido (sin texto antes ni después, sin markdown, sin \`\`\`), con esta forma exacta:

{
  "proyecto": {
    "nombre": string,
    "cliente": string | null,
    "cliente_email": string | null,
    "cliente_telefono": string | null,
    "ubicacion": string | null,
    "presupuesto_base": number,
    "presupuesto_venta": number,
    "margen_objetivo": number
  },
  "procesos": [
    {
      "codigo": string,
      "nombre": string,
      "orden": number,
      "actividades": [
        {
          "codigo": string,
          "nombre": string,
          "costo_material": number,
          "costo_mano_obra": number,
          "cantidad": number | null,
          "unidad": string | null,
          "dias_duracion": number,
          "dia_inicio": number,
          "dia_fin": number,
          "es_critica": boolean,
          "disciplina": string | null
        }
      ]
    }
  ],
  "notas": string | null
}

Notas importantes:
- "presupuesto_base" = costo directo + indirectos + contingencia (el total ANTES del margen del contratista). Si no encuentras esa distinción, usa la suma de todos los costos de actividades.
- "presupuesto_venta" = el gran total / precio final al cliente (incluyendo margen). Si no hay margen explícito, usa el mismo valor que presupuesto_base.
- "margen_objetivo" = el margen/utilidad como PORCENTAJE (número, ej. 15.3), calculado como (presupuesto_venta - presupuesto_base) / presupuesto_venta * 100. Si no se puede determinar, usa 0.
- Si una fila es un encabezado de grupo/división (sin costo propio, es la suma de sus subactividades), trátala como un "proceso", no como una actividad.
- MUY IMPORTANTE: si el archivo tiene una hoja de resumen (por disciplina, división o categoría) con un subtotal de costo para un grupo, pero ese grupo NO aparece desglosado en subactividades en ninguna otra hoja, de todas formas créalo como una actividad única dentro de su proceso, usando el nombre del grupo y el subtotal completo como costo (en costo_material si no se puede distinguir mano de obra). No omitas nunca un monto que aparezca en un resumen financiero solo porque no tiene desglose línea por línea — el total de todas las actividades debe cuadrar con el subtotal de costos directos del archivo.
- Usa "notas" para avisar de cualquier ambigüedad, dato faltante, o suposición importante que hiciste, en español, breve.
- Si de verdad no hay ninguna actividad identificable en el archivo, devuelve "procesos": [] y explica por qué en "notas".`

export async function analizarExcelProyecto(
  formData: FormData
): Promise<{ data?: ExtraccionResultado; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_IMPORTAN.includes(perfil.rol)) {
    return { error: "No tienes permisos para importar proyectos" }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { error: "El importador con IA aún no está configurado (falta la clave de Anthropic)." }
  }

  const file = formData.get("archivo") as File | null
  if (!file) return { error: "No se recibió ningún archivo" }

  const nombreLower = file.name.toLowerCase()
  if (!nombreLower.endsWith(".xlsx") && !nombreLower.endsWith(".xls")) {
    return { error: "El archivo debe ser un Excel (.xlsx o .xls)" }
  }

  let textoHojas: string
  try {
    const buffer = await file.arrayBuffer()
    textoHojas = volcarExcelATexto(buffer)
  } catch (err) {
    console.error("Error leyendo el Excel:", err)
    return { error: "No se pudo leer el archivo. Verifica que sea un Excel válido." }
  }

  if (!textoHojas.trim()) {
    return { error: "El archivo parece estar vacío." }
  }

  try {
    const respuesta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 32000,
        system: PROMPT_SISTEMA,
        messages: [
          {
            role: "user",
            content: `Contenido del archivo Excel:\n\n${textoHojas}`,
          },
        ],
      }),
    })

    if (!respuesta.ok) {
      const textoError = await respuesta.text()
      console.error("Error de Anthropic API:", respuesta.status, textoError)
      return { error: `Error al analizar el archivo con IA (código ${respuesta.status}).` }
    }

    const json = await respuesta.json()

    if (json?.type === "error" || !json?.content) {
      console.error(`Anthropic devolvió una respuesta sin contenido | status=${respuesta.status} | body=${JSON.stringify(json).slice(0, 800)}`)
      return { error: "La IA no pudo procesar el archivo (respuesta sin contenido). Intenta de nuevo en unos minutos." }
    }

    // El modelo puede devolver varios bloques de contenido (p. ej. uno de
    // razonamiento interno antes del de texto) — juntamos solo los de tipo "text".
    const bloques: Array<{ type?: string; text?: string }> = Array.isArray(json?.content) ? json.content : []
    const textoRespuesta: string = bloques
      .filter((b) => b?.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("\n")
    const detenidoPorLimite = json?.stop_reason === "max_tokens"

    let limpio = textoRespuesta.trim()
    if (limpio.startsWith("```")) {
      limpio = limpio.replace(/^```(json)?/i, "").replace(/```$/, "").trim()
    }

    let parsed: ExtraccionResultado
    try {
      parsed = JSON.parse(limpio)
    } catch (err) {
      console.error(
        `Error parseando JSON de la IA | stop_reason=${json?.stop_reason} | bloques=${bloques.map((b) => b?.type).join(",")} | texto_len=${textoRespuesta.length} | texto_preview=${JSON.stringify(limpio.slice(0, 800))} | err=${String(err)}`
      )
      if (detenidoPorLimite) {
        return { error: "El archivo tiene demasiadas actividades para analizarlo de una vez. Divídelo en partes más pequeñas o avísame para ajustar el límite." }
      }
      return { error: "La IA no devolvió un resultado válido. Intenta de nuevo." }
    }

    if (!parsed?.proyecto?.nombre || !Array.isArray(parsed.procesos)) {
      return { error: "No se pudo extraer información reconocible del archivo." }
    }

    return { data: parsed }
  } catch (err) {
    console.error("Error llamando a Anthropic:", err)
    return { error: "Error de conexión al analizar el archivo con IA." }
  }
}

// ── Paso 2: crear el proyecto real a partir de los datos revisados ──

export type CrearDesdeImportacionInput = {
  codigo: string
  fecha_inicio_plan: string // YYYY-MM-DD
  proyecto: ProyectoExtraido
  procesos: ProcesoExtraido[]
}

export async function crearProyectoDesdeImportacion(
  input: CrearDesdeImportacionInput
): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol, empresa_id")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_IMPORTAN.includes(perfil.rol)) {
    return { error: "No tienes permisos para crear proyectos" }
  }

  const codigo = input.codigo?.trim()
  if (!codigo) return { error: "El código del proyecto es obligatorio" }
  if (!input.fecha_inicio_plan) return { error: "La fecha de inicio es obligatoria" }
  if (!input.proyecto?.nombre?.trim()) return { error: "El nombre del proyecto es obligatorio" }

  const fechaInicio = new Date(input.fecha_inicio_plan + "T00:00:00")
  if (isNaN(fechaInicio.getTime())) return { error: "Fecha de inicio inválida" }

  // Fecha de fin plan = el mayor "dia_fin" entre todas las actividades.
  let maxDiaFin = 0
  for (const proc of input.procesos) {
    for (const act of proc.actividades) {
      if ((act.dia_fin ?? 0) > maxDiaFin) maxDiaFin = act.dia_fin
    }
  }
  const fechaFin = addBusinessDays(fechaInicio, maxDiaFin)

  const { data: proyectoCreado, error: errorProyecto } = await supabase
    .from("proyectos")
    .insert({
      empresa_id: perfil.empresa_id,
      codigo,
      nombre: input.proyecto.nombre.trim(),
      cliente: input.proyecto.cliente || null,
      cliente_email: input.proyecto.cliente_email || null,
      cliente_telefono: input.proyecto.cliente_telefono || null,
      ubicacion: input.proyecto.ubicacion || null,
      fecha_inicio_plan: toDateInputValue(fechaInicio),
      fecha_fin_plan: toDateInputValue(fechaFin),
      presupuesto_base: input.proyecto.presupuesto_base || 0,
      presupuesto_venta: input.proyecto.presupuesto_venta || 0,
      margen_objetivo: input.proyecto.margen_objetivo || 0,
      estado: "activo",
      activo: true,
    })
    .select("id")
    .single()

  if (errorProyecto || !proyectoCreado) {
    console.error("crearProyectoDesdeImportacion - proyecto:", errorProyecto)
    if (errorProyecto?.code === "23505") return { error: "Ya existe un proyecto con ese código" }
    return { error: "Error al crear el proyecto." }
  }

  const proyectoId = proyectoCreado.id

  // Presupuesto base (versión 1) donde quedará el desglose material/mano de obra.
  const { data: presupuestoCreado, error: errorPresupuesto } = await supabase
    .from("presupuestos")
    .insert({
      proyecto_id: proyectoId,
      version: 1,
      nombre_version: "Importado desde Excel",
      es_baseline_actual: true,
      total: 0,
    })
    .select("id")
    .single()

  if (errorPresupuesto) {
    console.error("crearProyectoDesdeImportacion - presupuesto:", errorPresupuesto)
  }
  const presupuestoId: string | null = presupuestoCreado?.id ?? null

  // Partidas de material/mano de obra a insertar al final, una vez que
  // tengamos los IDs reales de las actividades recién creadas.
  const partidasPendientes: Array<{
    presupuesto_id: string
    actividad_id: string
    proceso_id: string
    codigo: string | null
    descripcion: string
    tipo_recurso: "material" | "mano_obra"
    monto_total: number
    monto_presupuestado: number
  }> = []

  for (let i = 0; i < input.procesos.length; i++) {
    const proc = input.procesos[i]

    const { data: procesoCreado, error: errorProceso } = await supabase
      .from("procesos")
      .insert({
        proyecto_id: proyectoId,
        codigo: proc.codigo || String(i + 1),
        nombre: proc.nombre || `Proceso ${i + 1}`,
        orden: proc.orden ?? i,
      })
      .select("id")
      .single()

    if (errorProceso || !procesoCreado) {
      console.error("crearProyectoDesdeImportacion - proceso:", errorProceso)
      continue // seguimos con los demás procesos en vez de abortar todo
    }

    if (!proc.actividades?.length) continue

    const filasActividades = proc.actividades.map((act) => {
      const inicio = addBusinessDays(fechaInicio, act.dia_inicio ?? 0)
      const fin = addBusinessDays(fechaInicio, act.dia_fin ?? act.dia_inicio ?? 0)
      const costoMaterial = act.costo_material || 0
      const costoManoObra = act.costo_mano_obra || 0
      return {
        proceso_id: procesoCreado.id,
        proyecto_id: proyectoId,
        codigo: act.codigo || "",
        nombre: act.nombre || "Actividad sin nombre",
        disciplina: act.disciplina || null,
        fecha_inicio_plan: toDateInputValue(inicio),
        fecha_fin_plan: toDateInputValue(fin),
        duracion_plan_dias: Math.max(1, Math.round(act.dias_duracion || 1)),
        es_critica: !!act.es_critica,
        costo_presupuesto: costoMaterial + costoManoObra,
        costo_material: costoMaterial,
        costo_mano_obra: costoManoObra,
        cantidad_objetivo: act.cantidad ?? null,
        unidad: act.unidad || null,
      }
    })

    const { data: actividadesCreadas, error: errorActividades } = await supabase
      .from("actividades")
      .insert(filasActividades)
      .select("id")

    if (errorActividades) {
      console.error("crearProyectoDesdeImportacion - actividades:", errorActividades)
      continue
    }

    // Si tenemos presupuesto y los IDs de las actividades recién creadas
    // (vienen en el mismo orden en que se insertaron), armamos las partidas
    // de material y mano de obra por separado.
    if (presupuestoId && actividadesCreadas) {
      proc.actividades.forEach((act, idx) => {
        const actividadId = actividadesCreadas[idx]?.id
        if (!actividadId) return
        const costoMaterial = act.costo_material || 0
        const costoManoObra = act.costo_mano_obra || 0
        if (costoMaterial > 0) {
          partidasPendientes.push({
            presupuesto_id: presupuestoId,
            actividad_id: actividadId,
            proceso_id: procesoCreado.id,
            codigo: act.codigo || null,
            descripcion: `${act.nombre || "Actividad"} (material)`,
            tipo_recurso: "material",
            monto_total: costoMaterial,
            monto_presupuestado: costoMaterial,
          })
        }
        if (costoManoObra > 0) {
          partidasPendientes.push({
            presupuesto_id: presupuestoId,
            actividad_id: actividadId,
            proceso_id: procesoCreado.id,
            codigo: act.codigo || null,
            descripcion: `${act.nombre || "Actividad"} (mano de obra)`,
            tipo_recurso: "mano_obra",
            monto_total: costoManoObra,
            monto_presupuestado: costoManoObra,
          })
        }
      })
    }
  }

  if (presupuestoId && partidasPendientes.length) {
    const { error: errorPartidas } = await supabase.from("partidas_presupuesto").insert(partidasPendientes)
    if (errorPartidas) {
      console.error("crearProyectoDesdeImportacion - partidas_presupuesto:", errorPartidas)
    } else {
      const totalPartidas = partidasPendientes.reduce((s, p) => s + p.monto_presupuestado, 0)
      await supabase.from("presupuestos").update({ total: totalPartidas }).eq("id", presupuestoId)
    }
  }

  revalidatePath("/proyectos")
  return { id: proyectoId }
}
