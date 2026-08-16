// ============================================================
// Motor de reglas — Conocimiento histórico / aprendizaje (spec §9)
// ============================================================
// Funciones puras (sin I/O) que cierran el loop de aprendizaje descrito
// en el esquema (tabla "decisiones": resultado_observado, resultado_fecha,
// prediccion_fue_correcta, aprendizaje) pero que hasta ahora nadie
// completaba. La idea es simple:
//
//  1. Cuando un PM/dueño elige una alternativa para resolver una alerta
//     (alertas/actions.ts → registrarDecision), queda un registro en
//     "decisiones" sin evaluar.
//  2. Unos días después, el motor revisa: ¿la alerta se resolvió?
//     ¿la decisión funcionó? Eso llena resultado_observado/
//     prediccion_fue_correcta y queda un "aprendizaje" en texto.
//  3. Ese resultado se agrega a "conocimiento_historico": cuántas veces
//     se ha visto que tal alternativa funciona para tal tipo de alerta.
//  4. La próxima vez que el motor genera alternativas, si ya hay
//     suficiente histórico, recomienda la que mejor le ha funcionado a
//     ESTA empresa en el pasado, en vez de la regla fija por defecto.

export type DecisionParaEvaluar = {
  id: string
  fecha_decision: string // ISO timestamp
  alternativa_seleccionada: string | null
  tipo_alerta: string
  alerta_estado: string // activa | en_revision | resuelta | descartada
}

export type ResultadoEvaluacion = {
  resultado_observado: string
  resultado_fecha: string
  prediccion_fue_correcta: boolean
  aprendizaje: string
}

// Margen de días antes de considerar que una decisión "no funcionó" si
// la alerta sigue activa. Antes de este plazo, se considera prematuro
// juzgar (la actividad podría seguir en ejecución).
const DIAS_GRACIA = 7

/**
 * Evalúa si una decisión ya tomada tuvo el resultado esperado.
 * Devuelve null si todavía es pronto para juzgar (la alerta sigue
 * activa pero no ha pasado el plazo de gracia) o si la alerta fue
 * descartada (no aplica evaluar una decisión sobre algo descartado).
 */
export function evaluarDecision(d: DecisionParaEvaluar, hoy: Date): ResultadoEvaluacion | null {
  const fechaDecision = new Date(d.fecha_decision)
  const diasTranscurridos = Math.max(0, Math.floor((hoy.getTime() - fechaDecision.getTime()) / 86400000))
  const alternativa = d.alternativa_seleccionada ?? "la alternativa elegida"
  const hoyISO = hoy.toISOString().slice(0, 10)

  if (d.alerta_estado === "descartada") return null

  if (d.alerta_estado === "resuelta") {
    return {
      resultado_observado: `La alerta se resolvió ${diasTranscurridos} día(s) después de tomar la decisión.`,
      resultado_fecha: hoyISO,
      prediccion_fue_correcta: true,
      aprendizaje: `"${alternativa}" fue efectiva para resolver alertas de tipo ${d.tipo_alerta}.`,
    }
  }

  if (diasTranscurridos >= DIAS_GRACIA) {
    return {
      resultado_observado: `La alerta sigue activa ${diasTranscurridos} días después de la decisión (más del plazo esperado).`,
      resultado_fecha: hoyISO,
      prediccion_fue_correcta: false,
      aprendizaje: `"${alternativa}" no fue suficiente para resolver alertas de tipo ${d.tipo_alerta} dentro del plazo esperado.`,
    }
  }

  return null // aún dentro del plazo de gracia, es pronto para juzgar
}

export type EstadisticaAlternativa = {
  tipo_alerta: string
  alternativa: string
  exitos: number
  total: number
}

export function calcularConfianza(exitos: number, total: number): number {
  if (total <= 0) return 0.5
  return Math.round((exitos / total) * 100) / 100
}

/**
 * De las alternativas observadas para un tipo de alerta, devuelve el
 * identificador de la que ha funcionado más veces, solo si hay
 * suficientes observaciones para confiar en el patrón (evita
 * recomendar en base a 1 solo caso).
 */
export function mejorAlternativaConocida(
  estadisticas: EstadisticaAlternativa[],
  tipoAlerta: string,
  minObservaciones = 3
): string | null {
  const candidatas = estadisticas.filter((e) => e.tipo_alerta === tipoAlerta && e.total >= minObservaciones)
  if (candidatas.length === 0) return null
  const conTasa = candidatas.map((c) => ({ ...c, tasa: c.exitos / c.total }))
  conTasa.sort((a, b) => b.tasa - a.tasa)
  // Solo recomendar por histórico si claramente funciona más de la mitad de las veces
  return conTasa[0].tasa >= 0.5 ? conTasa[0].alternativa : null
}
