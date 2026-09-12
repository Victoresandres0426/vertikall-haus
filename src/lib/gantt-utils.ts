// Utilidades compartidas entre la vista de Gantt para imprimir
// (src/app/gantt/[id]/page.tsx) y la vista interactiva para arrastrar y
// estirar barras (src/app/gantt/[id]/editar) -- viven aquí para que
// ambas calculen fechas y colores exactamente igual y no se desalineen
// con el tiempo.

export type ActividadGanttMin = {
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
  es_critica: boolean
  estado: string | null
}

// Todo en horario local, sin componentes de hora -- una fecha "YYYY-MM-DD"
// se interpreta como medianoche local, nunca UTC, para que no se corra un
// día según la zona horaria del navegador/servidor.
export function parseISO(iso: string): Date {
  return new Date(iso + "T00:00:00")
}

export function diasEntre(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

export function formatISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

export const DIA_SEMANA = ["D", "L", "M", "M", "J", "V", "S"]

// Color de la barra según el estado real de la actividad -- prioridad:
// completada (verde) > atrasada (rojo) > en progreso (ámbar) >
// programada/no iniciada (azul). La ruta crítica ya no se distingue por
// color (chocaría con "atrasada" en rojo) sino con un borde oscuro
// encima del color de estado, para poder ver ambas cosas a la vez.
//
// "Atrasada" cubre DOS casos, no solo uno:
//   - Ya pasó la fecha de fin plan y no está completada.
//   - Ya pasó la fecha de INICIO plan y todavía no arrancó (sigue
//     "no_iniciada"/"bloqueada") -- una actividad que debía haber
//     empezado ayer y sigue sin arrancar ya está atrasada, aunque su
//     fecha de fin todavía no haya llegado.
export function colorBarra(act: ActividadGanttMin, hoy: Date): string {
  if (act.estado === "completada") return "bg-emerald-500"
  const inicioPlan = act.fecha_inicio_plan ? parseISO(act.fecha_inicio_plan) : null
  const finPlan = act.fecha_fin_plan ? parseISO(act.fecha_fin_plan) : null
  const noTerminoATiempo = finPlan !== null && finPlan < hoy
  const noArrancoATiempo = act.estado !== "en_progreso" && inicioPlan !== null && inicioPlan < hoy
  if (noTerminoATiempo || noArrancoATiempo) return "bg-red-500"
  if (act.estado === "en_progreso") return "bg-amber-500"
  return "bg-[#3B72D8]"
}

// "Hoy" en la zona horaria del proyecto (no siempre México -- ver
// proyectos.zona_horaria) -- así la línea/color de hoy cae en el día
// correcto sin importar en qué servidor/zona corre el build, desde qué
// navegador se abre, o dónde esté físicamente la obra.
export function hoyMexico(zonaHoraria?: string | null): Date {
  // Último recurso si el proyecto todavía no tiene coordenadas
  // configuradas (y por lo tanto zona horaria calculada) -- no se
  // asume México ni ninguna zona al azar, se usa la sede real de la
  // empresa (Miami) hasta que se configuren las coordenadas del proyecto.
  return parseISO(new Date().toLocaleDateString("en-CA", { timeZone: zonaHoraria || "America/New_York" }))
}
