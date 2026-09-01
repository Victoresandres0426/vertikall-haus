// Suma días hábiles (lunes-viernes) a una fecha, redondeando offsets
// fraccionarios al día completo más cercano. Usado para convertir los
// "día inicio / día fin" relativos de un cronograma importado en
// fechas reales de calendario.

export function addBusinessDays(startDate: Date, days: number): Date {
  const wholeDays = Math.max(0, Math.round(days))
  const result = new Date(startDate)
  let added = 0

  while (added < wholeDays) {
    result.setDate(result.getDate() + 1)
    const dow = result.getDay() // 0 = domingo, 6 = sábado
    if (dow !== 0 && dow !== 6) {
      added++
    }
  }

  // Si el offset es 0, y el día de inicio del proyecto cae en fin de
  // semana, lo movemos al siguiente día hábil.
  if (wholeDays === 0) {
    while (result.getDay() === 0 || result.getDay() === 6) {
      result.setDate(result.getDate() + 1)
    }
  }

  return result
}

export function toDateInputValue(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
