"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

const ROLES_NOMINA = ["dueno", "superadmin", "administrador"]
const PERIODOS_VALIDOS = ["semanal", "quincenal", "mensual"]

async function verificarAcceso(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol, empresa_id")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_NOMINA.includes(perfil.rol)) return { ok: false as const, error: "Sin permisos" }
  return { ok: true as const, userId: user.id, empresaId: perfil.empresa_id as string }
}

export async function crearPeriodoNomina(input: {
  periodo: string
  fecha_inicio: string
  fecha_fin: string
}): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  if (!PERIODOS_VALIDOS.includes(input.periodo)) return { error: "Tipo de periodo inválido" }
  if (!input.fecha_inicio || !input.fecha_fin) return { error: "Faltan las fechas del periodo" }
  if (input.fecha_fin < input.fecha_inicio) return { error: "La fecha de fin no puede ser antes que la de inicio" }

  const { data, error } = await supabase
    .from("periodos_nomina")
    .insert({
      empresa_id: acceso.empresaId,
      periodo: input.periodo,
      fecha_inicio: input.fecha_inicio,
      fecha_fin: input.fecha_fin,
    })
    .select("id")
    .single()

  if (error) return { error: error.message }
  revalidatePath("/nomina")
  return { id: data.id }
}

export async function recalcularNominaPeriodo(periodoId: string): Promise<{ error?: string; trabajadores?: number }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  const { data, error } = await supabase.rpc("calcular_nomina_periodo", { p_periodo_id: periodoId })
  if (error) return { error: error.message }

  revalidatePath("/nomina")
  return { trabajadores: (data as { trabajadores?: number } | null)?.trabajadores }
}

export async function actualizarLineaNomina(
  lineaId: string,
  campo: "bonos" | "deducciones" | "anticipos" | "extra_monto",
  valor: number
): Promise<{ error?: string; neto?: number }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  const { data: linea, error: errGet } = await supabase
    .from("lineas_nomina")
    .select("salario_base, extra_monto, bonos, deducciones, anticipos")
    .eq("id", lineaId)
    .single()

  if (errGet || !linea) return { error: "Línea no encontrada" }

  const actualizado = { ...linea, [campo]: valor }
  const neto =
    Number(actualizado.salario_base ?? 0) +
    Number(actualizado.extra_monto ?? 0) +
    Number(actualizado.bonos ?? 0) -
    Number(actualizado.deducciones ?? 0) -
    Number(actualizado.anticipos ?? 0)

  const { error } = await supabase
    .from("lineas_nomina")
    .update({ [campo]: valor, neto_a_pagar: neto })
    .eq("id", lineaId)

  if (error) return { error: error.message }
  revalidatePath("/nomina")
  return { neto }
}

export async function marcarPeriodoPagado(periodoId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  const { error } = await supabase
    .from("periodos_nomina")
    .update({ estado: "pagado", cerrado_por: acceso.userId, cerrado_at: new Date().toISOString() })
    .eq("id", periodoId)

  if (error) return { error: error.message }
  revalidatePath("/nomina")
  return {}
}
