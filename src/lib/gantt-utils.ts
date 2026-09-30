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
// completada (verde) > en progreso (ámbar, SIEMPRE que haya avance real,
// sin importar si ya se pasó de fecha) > atrasada -- nunca arrancó
// (rojo) > programada/no iniciada (azul). La ruta crítica ya no se
// distingue por color (chocaría con "atrasada" en rojo) sino con un
// borde oscuro encima del color de estado, para poder ver ambas cosas a
// la vez.
//
// Antes "en progreso" perdía su color ámbar y se pintaba de rojo en
// cuanto se pasaba la fecha de fin plan -- que es el caso MÁS COMÚN en
// una obra real (casi toda actividad activa termina llevándose más
// días de los planeados). Eso hacía que el Gantt se viera casi todo
// rojo y no dejaba distinguir "esto se está trabajando ahora mismo" de
// "esto nunca arrancó". Ahora el rojo se reserva para lo que de verdad
// está detenido: nunca arrancó (sigue no_iniciada/bloqueada) y ya se
// pasó su fecha de inicio O de fin plan. Una actividad en progreso que
// va detrás del plan se sigue marcando (ver estaAtrasadaEnProgreso) con
// un ⚠ dentro de la barra, sin perder el ámbar que indica que sí hay
// trabajo activo.
export function colorBarra(act: ActividadGanttMin, hoy: Date): string {
  if (act.estado === "completada") return "bg-emerald-500"
  if (act.estado === "en_progreso") return "bg-amber-500"
  const inicioPlan = act.fecha_inicio_plan ? parseISO(act.fecha_inicio_plan) : null
  const finPlan = act.fecha_fin_plan ? parseISO(act.fecha_fin_plan) : null
  const noTerminoATiempo = finPlan !== null && finPlan < hoy
  const noArrancoATiempo = inicioPlan !== null && inicioPlan < hoy
  if (noTerminoATiempo || noArrancoATiempo) return "bg-red-500"
  return "bg-[#3B72D8]"
}

// Marca cuando una actividad "en progreso" (ámbar) ya se pasó de su
// fecha de fin plan -- para resaltarlo con un ⚠ dentro de la barra sin
// tener que sacrificar el color que dice "hay trabajo activo aquí".
export function estaAtrasadaEnProgreso(act: ActividadGanttMin, hoy: Date): boolean {
  if (act.estado !== "en_progreso") return false
  const finPlan = act.fecha_fin_plan ? parseISO(act.fecha_fin_plan) : null
  return finPlan !== null && finPlan < hoy
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
