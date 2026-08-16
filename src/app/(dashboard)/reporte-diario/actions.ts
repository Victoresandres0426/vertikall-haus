"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { ejecutarMotorDiario } from "@/lib/engine/motor"

type EntradaAvance = {
  actividad_id: string
  cantidad_ejecutada_dia: number
  porcentaje_avance_total: number
  incidencias?: string
}

type EntradaAsistencia = {
  trabajador_id: string
  presente: boolean
  horas_regulares: number
  horas_extra: number
  motivo_ausencia?: string
}

export async function crearReporteDiario(input: {
  proyecto_id: string
  fecha: string
  clima?: string
  observaciones?: string
  avances: EntradaAvance[]
  asistencia: EntradaAsistencia[]
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

  // Insertar avances
  if (input.avances.length > 0) {
    const { error: errAvance } = await supabase
      .from("avance_diario")
      .insert(
        input.avances.map((a) => ({
          reporte_id: reporte.id,
          actividad_id: a.actividad_id,
          cantidad_ejecutada_dia: a.cantidad_ejecutada_dia,
          porcentaje_avance_total: a.porcentaje_avance_total,
          incidencias: a.incidencias ?? null,
        }))
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

  // Actualizar avance_porcentaje en actividades
  for (const avance of input.avances) {
    if (avance.porcentaje_avance_total > 0) {
      await supabase
        .from("actividades")
        .update({
          avance_porcentaje: avance.porcentaje_avance_total,
          cantidad_ejecutada: avance.cantidad_ejecutada_dia, // acumulado real del día
          estado: avance.porcentaje_avance_total >= 100 ? "completada" : "en_progreso",
        })
        .eq("id", avance.actividad_id)
    }
  }

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
