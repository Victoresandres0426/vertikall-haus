// Tipos compartidos entre la página server (page.tsx) y los componentes
// cliente de la vista interactiva del Gantt (barras arrastrables +
// dependencias). Viven en un archivo aparte porque tanto
// gantt-editable-client.tsx como dependencias-modal.tsx los necesitan, y
// así ninguno de los dos depende del otro solo para tomar un tipo.

import type { TipoDependencia } from "@/lib/engine/cpm"

export type { TipoDependencia }

export type ActividadEditable = {
  id: string
  codigo: string
  nombre: string
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
  es_critica: boolean
  activa: boolean | null
  estado: string | null
}

export type ProcesoEditable = {
  id: string
  codigo: string
  nombre: string
  orden: number
  actividades: ActividadEditable[]
}

// Una fila de dependencias_actividad: "actividad_id" es la SUCESORA (la
// que depende), "predecesora_id" la que debe ir antes -- mismo sentido
// que usa el motor de ruta crítica (src/lib/engine/cpm.ts).
export type DependenciaEditable = {
  id: string
  actividad_id: string
  predecesora_id: string
  tipo: TipoDependencia
  lag_dias: number
}

export const ETIQUETA_TIPO_DEPENDENCIA: Record<TipoDependencia, string> = {
  fin_a_inicio: "Fin → Inicio (la sucesora empieza cuando esta termina)",
  inicio_a_inicio: "Inicio → Inicio (empiezan juntas)",
  fin_a_fin: "Fin → Fin (terminan juntas)",
  inicio_a_fin: "Inicio → Fin (la sucesora termina cuando esta empieza)",
}
