"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { ejecutarMotorDiario } from "@/lib/engine/motor"

export type EntradaAvance = {
  actividad_id: string
  cantidad_ejecutada_dia: number
  porcentaje_avance_total: number
  incidencias?: string
}

export type EntradaAsistencia = {
  trabajador_id: string
  presente: boolean
  horas_regulares: number
  horas_extra: number
  motivo_ausencia?: string
}

export type EntradaHorasActividad = {
  trabajador_id: string
  actividad_id: string
  rol_aplicado: string | null
  horas: number
  avance_cantidad?: number
}

export async function crearReporteDiario(input: {
  proyecto_id: string
  fecha: string
  clima?: string
  observaciones?: string
  avances: EntradaAvance[]
  asistencia: EntradaAsistencia[]
  horasPorActividad?: EntradaHorasActividad[]
}): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  // Crear el reporte
  const { data: reporte, error: errReporte } = await supabase
    .from("reportes_diarios")
    .insert({
      proyecto_id: input.proyecto_id,
      capataz_id: user.id,
      fecha: input.fecha,
      clima: input.clima ?? null,
      observaciones_generales: input.observaciones ?? null,
    })
    .select("id")
    .single()

  if (errReporte) return { error: errReporte.message }

  // Insertar avances -- upsert (no insert) por (reporte_id, actividad_id):
  // nunca debería llegar la misma actividad dos veces en un mismo envío,
  // pero si por algún bug llegara a pasar, esto la reemplaza en vez de
  // duplicarla (migración 065 agrega el candado único a nivel de BD).
  if (input.avances.length > 0) {
    const { error: errAvance } = await supabase
      .from("avance_diario")
      .upsert(
        input.avances.map((a) => ({
          reporte_id: reporte.id,
          actividad_id: a.actividad_id,
          cantidad_ejecutada_dia: a.cantidad_ejecutada_dia,
          porcentaje_avance_total: a.porcentaje_avance_total,
          incidencias: a.incidencias ?? null,
        })),
        { onConflict: "reporte_id,actividad_id" }
      )
    if (errAvance) return { error: errAvance.message }
  }

  // Insertar asistencia (si hay trabajadores)
  if (input.asistencia.length > 0) {
    const { error: errAsist } = await supabase
      .from("asistencia_diaria")
      .insert(
        input.asistencia.map((a) => ({
          reporte_id: reporte.id,
          trabajador_id: a.trabajador_id,
          presente: a.presente,
          horas_regulares: a.horas_regulares,
          horas_extra: a.horas_extra,
        }))
      )
    if (errAsist) return { error: errAsist.message }
  }

  // Costo real de mano de obra por actividad/rol (migración 050) --
  // no debe romper el guardado del reporte si falla (ej. rol sin
  // tarifa configurada): el reporte y la asistencia ya se guardaron,
  // que es lo crítico. El error queda en logs para revisarlo.
  if (input.horasPorActividad && input.horasPorActividad.length > 0) {
    try {
      const { error: errHoras } = await supabase.rpc("registrar_asistencia_actividad", {
        p_reporte_id: reporte.id,
        p_entradas: input.horasPorActividad,
      })
      if (errHoras) console.error(`registrar_asistencia_actividad falló: ${errHoras.message}`)
    } catch (e) {
      console.error(`registrar_asistencia_actividad falló: ${e}`)
    }
  }

  // NOTA: ya no hace falta actualizar aquí avance_porcentaje/
  // cantidad_ejecutada/estado a mano -- el trigger
  // trg_avance_diario_sync_cantidad (migración 064) se dispara solo con
  // el INSERT INTO avance_diario de arriba, y recalcula esos campos
  // como la SUMA real acumulada de todos los reportes de la actividad
  // (antes se sobreescribían con solo lo de ESTE reporte, perdiendo lo
  // acumulado en reportes anteriores).

  // ── Motor de reglas: recalcula desviaciones, alertas e IIDP ──
  // No debe romper el guardado del reporte si falla: el capataz ya
  // guardó sus datos, que es lo crítico. Los errores quedan en logs.
  try {
    const motor = await ejecutarMotorDiario(supabase, input.proyecto_id, new Date(input.fecha))
    if (motor.errores.length > 0) {
      console.error("Motor de reglas terminó con errores:", motor.errores)
    }
  } catch (e) {
    console.error("Motor de reglas falló:", e)
  }

  revalidatePath("/reporte-diario")
  revalidatePath("/actividades")
  revalidatePath("/dashboard")
  revalidatePath("/alertas")
  revalidatePath("/desempeno")

  return { id: reporte.id }
}

// ── Editar un reporte YA enviado de un día anterior ──
// Solo dueno/superadmin/administrador/project_manager (el capataz que lo
// llenó no puede editarlo después) -- la función SQL actualizar_reporte_
// diario (migración 059) valida el rol y el acceso al proyecto de nuevo
// por su cuenta, así que esto no depende únicamente del gating en la UI.
export async function actualizarReporteDiario(input: {
  reporte_id: string
  proyecto_id: string
  fecha: string
  clima?: string
  observaciones?: string
  avances: EntradaAvance[]
  asistencia: EntradaAsistencia[]
  horasPorActividad?: EntradaHorasActividad[]
}): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { error: rpcError } = await supabase.rpc("actualizar_reporte_diario", {
    p_reporte_id: input.reporte_id,
    p_clima: input.clima ?? null,
    p_observaciones: input.observaciones ?? null,
    p_asistencias: input.asistencia,
    p_avances: input.avances,
    p_horas_actividad: input.horasPorActividad ?? [],
  })

  if (rpcError) {
    if (rpcError.message?.includes("sin_permisos")) {
      return { error: "No tienes permisos para editar reportes ya enviados" }
    }
    if (rpcError.message?.includes("sin_acceso")) {
      return { error: "No tienes acceso a este proyecto" }
    }
    if (rpcError.message?.includes("reporte_no_encontrado")) {
      return { error: "Ese reporte ya no existe" }
    }
    return { error: "No se pudo guardar la edición: " + rpcError.message }
  }

  // ── Motor de reglas: recalcula desviaciones, alertas e IIDP del día editado ──
  try {
    const motor = await ejecutarMotorDiario(supabase, input.proyecto_id, new Date(input.fecha))
    if (motor.errores.length > 0) {
      console.error("Motor de reglas terminó con errores:", motor.errores)
    }
  } catch (e) {
    console.error("Motor de reglas falló:", e)
  }

  revalidatePath("/reporte-diario")
  revalidatePath("/reporte-diario/historial")
  revalidatePath(`/reporte-diario/historial/${input.reporte_id}`)
  revalidatePath("/actividades")
  revalidatePath("/dashboard")
  revalidatePath("/alertas")
  revalidatePath("/desempeno")
  revalidatePath("/personal")

  return {}
}
