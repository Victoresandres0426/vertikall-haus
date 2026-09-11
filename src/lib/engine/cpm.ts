// ============================================================
// Motor de reglas — Ruta crítica (CPM: Critical Path Method)
// ============================================================
// Funciones puras (sin I/O) que calculan, a partir de la red de
// dependencias entre actividades (dependencias_actividad), cuáles
// actividades son críticas y cuánta holgura (float) tiene cada una.
// Reemplaza el uso del campo actividades.es_critica como valor
// capturado manualmente: ahora se recalcula cada vez que corre el
// motor de reglas (spec §4).
//
// Soporta los 4 tipos de dependencia del esquema (fin_a_inicio,
// inicio_a_inicio, fin_a_fin, inicio_a_fin) con lag/lead en días,
// y usa aritmética de índices de día (enteros) para evitar
// problemas de precisión con fechas.
//
// Todo el cálculo (duración, holgura, fechas reprogramadas) se hace en
// DÍAS HÁBILES -- sábados y domingos se saltan, igual que en el Gantt
// (que ya los marca como no laborables) y en el importador de Excel.

export type ActividadCPM = {
  id: string
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
  duracion_plan_dias: number | null
}

export type TipoDependencia = "fin_a_inicio" | "inicio_a_inicio" | "fin_a_fin" | "inicio_a_fin"

export type DependenciaCPM = {
  actividad_id: string // sucesora (la que depende)
  predecesora_id: string
  tipo: TipoDependencia
  lag_dias: number
}

export type ResultadoCPM = {
  es_critica: boolean
  holgura_dias: number
  fecha_inicio_calculada: string
  fecha_fin_calculada: string
}

const MS_DIA = 86400000

function parseFechaSegura(iso: string | null): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

// Las fechas se parsean como ISO (medianoche UTC), así que hay que usar
// getUTCDay() -- no getDay() -- para saber el día de la semana; con
// getDay() el resultado depende de la zona horaria del servidor y
// puede salir corrido un día.
function esFinDeSemana(d: Date): boolean {
  const dow = d.getUTCDay() // 0 = domingo, 6 = sábado
  return dow === 0 || dow === 6
}

// Días HÁBILES (lunes a viernes) con signo entre dos fechas -- saltando
// sábados y domingos. Se usa tanto para medir la duración de una
// actividad como para ubicar sus fechas dentro del cronograma, de modo
// que el cálculo de ruta crítica sea consistente con el resto de la
// app: el Gantt ya marca los fines de semana como no laborables, y el
// importador de Excel también los salta al convertir offsets a fechas.
function diasHabilesEntre(a: Date, b: Date): number {
  if (a.getTime() === b.getTime()) return 0
  const paso = b.getTime() > a.getTime() ? 1 : -1
  let cur = new Date(a)
  let contados = 0
  while (cur.getTime() !== b.getTime()) {
    cur = new Date(cur.getTime() + paso * MS_DIA)
    if (!esFinDeSemana(cur)) contados += paso
  }
  return contados
}

// Suma (o resta, si n es negativo) N días hábiles a una fecha, saltando
// fines de semana -- es la inversa de diasHabilesEntre.
function sumarDiasHabiles(fecha: Date, n: number): Date {
  let cur = new Date(fecha)
  let restante = n
  const paso = restante >= 0 ? 1 : -1
  while (restante !== 0) {
    cur = new Date(cur.getTime() + paso * MS_DIA)
    if (!esFinDeSemana(cur)) restante -= paso
  }
  return cur
}

/**
 * Duración en DÍAS HÁBILES de una actividad, con fallback razonable si
 * falta el dato. Si la actividad no trae duracion_plan_dias explícita,
 * se calcula a partir de sus fechas plan -- contando solo lunes a
 * viernes, no días de calendario.
 */
function duracionDias(a: ActividadCPM): number {
  if (a.duracion_plan_dias && a.duracion_plan_dias > 0) return a.duracion_plan_dias
  const ini = parseFechaSegura(a.fecha_inicio_plan)
  const fin = parseFechaSegura(a.fecha_fin_plan)
  if (ini && fin && fin.getTime() > ini.getTime()) {
    return Math.max(1, diasHabilesEntre(ini, fin))
  }
  return 1
}

/**
 * Calcula la ruta crítica de un conjunto de actividades.
 * Devuelve un mapa actividad_id -> resultado (holgura, es_critica, fechas calculadas).
 * Si hay un ciclo en las dependencias (dato inconsistente), esas actividades
 * involucradas en el ciclo se excluyen del cálculo (no se marcan como críticas)
 * en vez de romper el motor completo.
 */
export function calcularRutaCritica(
  actividades: ActividadCPM[],
  dependencias: DependenciaCPM[]
): Map<string, ResultadoCPM> {
  const resultado = new Map<string, ResultadoCPM>()
  if (actividades.length === 0) return resultado

  const porId = new Map(actividades.map((a) => [a.id, a]))
  const duracion = new Map(actividades.map((a) => [a.id, duracionDias(a)]))

  // Época: la fecha de inicio planificada más temprana entre todas las
  // actividades (o "hoy" si ninguna tiene fecha). Todo se calcula en
  // índices de día relativos a esta época.
  const fechasInicio = actividades
    .map((a) => parseFechaSegura(a.fecha_inicio_plan))
    .filter((d): d is Date => d !== null)
  const epoca = fechasInicio.length > 0
    ? new Date(Math.min(...fechasInicio.map((d) => d.getTime())))
    : new Date()
  epoca.setUTCHours(0, 0, 0, 0)

  // "Índice de día" = cuántos días HÁBILES hay entre la época y la
  // fecha (con signo). Antes esto contaba días de calendario -- ahora
  // salta fines de semana, así que la duración, la holgura y las
  // fechas reprogramadas en cascada nunca caen ni se cuentan sobre un
  // sábado/domingo.
  function indiceDia(iso: string | null): number {
    const d = parseFechaSegura(iso)
    if (!d) return 0
    return diasHabilesEntre(epoca, d)
  }

  function fechaDeIndice(idx: number): string {
    return sumarDiasHabiles(epoca, idx).toISOString().slice(0, 10)
  }

  // Filtra dependencias válidas (ambos extremos deben existir en el set de actividades)
  const deps = dependencias.filter((d) => porId.has(d.actividad_id) && porId.has(d.predecesora_id))

  const predecesoras = new Map<string, DependenciaCPM[]>()
  const sucesoras = new Map<string, DependenciaCPM[]>()
  for (const d of deps) {
    if (!predecesoras.has(d.actividad_id)) predecesoras.set(d.actividad_id, [])
    predecesoras.get(d.actividad_id)!.push(d)
    if (!sucesoras.has(d.predecesora_id)) sucesoras.set(d.predecesora_id, [])
    sucesoras.get(d.predecesora_id)!.push(d)
  }

  // ── Orden topológico (Kahn) para poder hacer los pases hacia adelante/atrás ──
  const gradoEntrada = new Map<string, number>(actividades.map((a) => [a.id, 0]))
  for (const d of deps) {
    gradoEntrada.set(d.actividad_id, (gradoEntrada.get(d.actividad_id) ?? 0) + 1)
  }
  const cola: string[] = actividades.filter((a) => (gradoEntrada.get(a.id) ?? 0) === 0).map((a) => a.id)
  const orden: string[] = []
  const gradoRestante = new Map(gradoEntrada)
  while (cola.length > 0) {
    const id = cola.shift()!
    orden.push(id)
    for (const s of sucesoras.get(id) ?? []) {
      const restante = (gradoRestante.get(s.actividad_id) ?? 0) - 1
      gradoRestante.set(s.actividad_id, restante)
      if (restante === 0) cola.push(s.actividad_id)
    }
  }

  // Actividades que quedaron fuera del orden topológico están en un ciclo:
  // se excluyen del cálculo de ruta crítica (dato inconsistente en dependencias_actividad).
  const enCiclo = new Set(actividades.map((a) => a.id).filter((id) => !orden.includes(id)))

  // ── Pase hacia adelante: earliest start / earliest finish ──
  const ES = new Map<string, number>()
  const EF = new Map<string, number>()
  for (const id of orden) {
    const a = porId.get(id)!
    const dur = duracion.get(id)!
    let es = indiceDia(a.fecha_inicio_plan)
    for (const dep of predecesoras.get(id) ?? []) {
      if (enCiclo.has(dep.predecesora_id)) continue
      const predEF = EF.get(dep.predecesora_id)
      const predES = ES.get(dep.predecesora_id)
      if (predEF === undefined || predES === undefined) continue
      let candidato: number
      switch (dep.tipo) {
        case "inicio_a_inicio":
          candidato = predES + dep.lag_dias
          break
        case "fin_a_fin":
          candidato = predEF + dep.lag_dias - dur
          break
        case "inicio_a_fin":
          candidato = predES + dep.lag_dias - dur
          break
        case "fin_a_inicio":
        default:
          candidato = predEF + dep.lag_dias
          break
      }
      es = Math.max(es, candidato)
    }
    ES.set(id, es)
    EF.set(id, es + dur)
  }

  const finProyecto = orden.length > 0 ? Math.max(...orden.map((id) => EF.get(id)!)) : 0

  // ── Pase hacia atrás: latest start / latest finish ──
  const LF = new Map<string, number>()
  const LS = new Map<string, number>()
  for (let i = orden.length - 1; i >= 0; i--) {
    const id = orden[i]
    const dur = duracion.get(id)!
    let lf = finProyecto
    for (const dep of sucesoras.get(id) ?? []) {
      if (enCiclo.has(dep.actividad_id)) continue
      const sucLS = LS.get(dep.actividad_id)
      const sucLF = LF.get(dep.actividad_id)
      if (sucLS === undefined || sucLF === undefined) continue
      let candidato: number
      switch (dep.tipo) {
        case "inicio_a_inicio":
          candidato = sucLS - dep.lag_dias + dur
          break
        case "fin_a_fin":
          candidato = sucLF - dep.lag_dias
          break
        case "inicio_a_fin":
          candidato = sucLF - dep.lag_dias + dur
          break
        case "fin_a_inicio":
        default:
          candidato = sucLS - dep.lag_dias
          break
      }
      lf = Math.min(lf, candidato)
    }
    LF.set(id, lf)
    LS.set(id, lf - dur)
  }

  for (const id of orden) {
    const holgura = LS.get(id)! - ES.get(id)!
    resultado.set(id, {
      es_critica: holgura <= 0,
      holgura_dias: Math.round(holgura),
      fecha_inicio_calculada: fechaDeIndice(ES.get(id)!),
      fecha_fin_calculada: fechaDeIndice(EF.get(id)!),
    })
  }

  return resultado
}
