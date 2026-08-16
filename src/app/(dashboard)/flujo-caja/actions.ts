"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

// Nota: esto es una carga MANUAL interina. El documento maestro (spec §11.3)
// describe un flujo de caja predictivo automático (a partir de CxC, CxP,
// nómina e hitos). Automatizarlo por completo queda fuera de esta ronda;
// mientras tanto, project_manager/administrador/dueño pueden cargar la
// proyección semana a semana a mano.
const ROLES_GESTION = ["project_manager", "dueno", "superadmin", "administrador"]

export async function crearProyeccionSemanal(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_GESTION.includes(perfil.rol)) {
    return { error: "No tienes permisos para cargar flujo de caja" }
  }

  const proyecto_id = formData.get("proyecto_id") as string
  const semana = formData.get("semana") as string
  if (!proyecto_id) return { error: "Selecciona un proyecto" }
  if (!semana) return { error: "Selecciona la semana (fecha de inicio)" }

  const num = (key: string) => {
    const raw = formData.get(key) as string
    const v = raw ? parseFloat(raw) : 0
    return isNaN(v) ? 0 : v
  }

  const ingresos_plan = num("ingresos_plan")
  const ingresos_real = num("ingresos_real")
  const egresos_plan = num("egresos_plan")
  const egresos_real = num("egresos_real")

  // Saldo simple de la semana (ingresos reales/plan - egresos reales/plan).
  // El saldo ACUMULADO entre semanas es responsabilidad del motor
  // predictivo completo (pendiente); esto es una aproximación por semana.
  const saldo_proyectado = (ingresos_real || ingresos_plan) - (egresos_real || egresos_plan)
  const alerta_liquidez = saldo_proyectado < 0

  const { error } = await supabase.from("flujo_caja_proyecciones").upsert(
    {
      proyecto_id,
      semana,
      ingresos_plan,
      ingresos_real,
      egresos_plan,
      egresos_real,
      saldo_proyectado,
      alerta_liquidez,
    },
    { onConflict: "proyecto_id,semana" }
  )

  if (error) {
    console.error("crearProyeccionSemanal error:", error)
    return { error: "Error al guardar la proyección." }
  }

  revalidatePath("/flujo-caja")
  return {}
}
