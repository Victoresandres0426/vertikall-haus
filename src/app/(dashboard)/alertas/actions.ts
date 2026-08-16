"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function registrarDecision(
  alertaId: string,
  alternativaSeleccionada: string,
  labelAlternativa: string
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("id, rol, empresa_id, nombre_completo")
    .eq("id", user.id)
    .single()

  if (!perfil) return { error: "Sin perfil de usuario" }

  // Obtener la alerta para registrar la decisión correctamente
  const { data: alerta } = await supabase
    .from("alertas")
    .select("proyecto_id, actividad_id, titulo")
    .eq("id", alertaId)
    .single()

  if (!alerta) return { error: "Alerta no encontrada" }

  // 1. Crear registro de decisión
  const { data: decision, error: errDecision } = await supabase
    .from("decisiones")
    .insert({
      proyecto_id: alerta.proyecto_id,
      alerta_id: alertaId,
      actividad_id: alerta.actividad_id,
      descripcion: `Decisión sobre: ${alerta.titulo}`,
      alternativa_seleccionada: alternativaSeleccionada,
      razon: `Opción seleccionada: ${labelAlternativa}`,
      aprobado_por: perfil.id,
      rol_aprobador: perfil.rol,
    })
    .select("id")
    .single()

  if (errDecision) return { error: errDecision.message }

  // 2. Actualizar la alerta a en_revision
  const { error: errAlerta } = await supabase
    .from("alertas")
    .update({ estado: "en_revision", decision_tomada_id: decision.id })
    .eq("id", alertaId)

  if (errAlerta) return { error: errAlerta.message }

  revalidatePath("/alertas")
  return {}
}
