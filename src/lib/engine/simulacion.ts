// ============================================================
// Motor de reglas — Simulación de escenarios (spec §7.1)
// ============================================================
// Función pura (sin I/O) que reordena las alternativas ya generadas
// por el motor según el criterio que el usuario quiera priorizar:
// tiempo (recuperar más días), costo (gastar menos) o margen (mejor
// relación beneficio/costo). No genera alternativas nuevas -- eso ya
// lo hace reglas.ts -- solo cambia el orden/ranking para ayudar a
// decidir. Es intencionalmente independiente de "recomendada" (que
// sigue siendo la sugerencia oficial del motor de reglas / conocimiento
// histórico): esto es una vista exploratoria adicional para el usuario.

export type CriterioSimulacion = "tiempo" | "costo" | "margen"

export type AlternativaSimulable = {
  costo: number
  dias: number // negativo = días que se recuperan (reduce el atraso)
}

/** Puntaje de una alternativa bajo un criterio dado (mayor = mejor). */
export function puntuarAlternativa(alt: AlternativaSimulable, criterio: CriterioSimulacion): number {
  const diasRecuperados = Math.max(0, -alt.dias)

  switch (criterio) {
    case "tiempo":
      // Prioriza recuperar más días; a igualdad de días, menor costo desempata.
      return diasRecuperados * 1_000_000 - Math.max(0, alt.costo)
    case "costo":
      // Prioriza el menor costo (o mayor ahorro si costo es negativo);
      // a igualdad de costo, más días recuperados desempata.
      return -alt.costo * 1_000_000 + diasRecuperados
    case "margen":
    default:
      // "Mejor relación beneficio/costo": días recuperados por cada
      // peso invertido. Si la opción no cuesta nada (o genera ahorro),
      // es automáticamente la mejor para proteger el margen.
      if (alt.costo <= 0) return 1_000_000_000 + diasRecuperados - alt.costo
      return diasRecuperados / alt.costo
  }
}

/** Reordena las alternativas de mejor a peor según el criterio elegido. */
export function simularEscenario<T extends AlternativaSimulable>(
  alternativas: T[],
  criterio: CriterioSimulacion
): T[] {
  return [...alternativas].sort((a, b) => puntuarAlternativa(b, criterio) - puntuarAlternativa(a, criterio))
}

export const CRITERIOS: { valor: CriterioSimulacion; label: string; descripcion: string }[] = [
  { valor: "tiempo", label: "Tiempo", descripcion: "Prioriza recuperar más días de atraso" },
  { valor: "costo", label: "Costo", descripcion: "Prioriza gastar menos" },
  { valor: "margen", label: "Margen", descripcion: "Mejor relación entre días recuperados y costo" },
]
