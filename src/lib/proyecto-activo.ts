import { cookies } from "next/headers"

// Cookie que recuerda qué proyecto está "activo" mientras navegas entre
// Reporte Diario, Actividades, Materiales, Recursos, Presupuesto, Change
// Orders, Facturas y Flujo de Caja -- para que todas esas vistas muestren
// solo ese proyecto en vez de mezclar todos los de la empresa.
export const PROYECTO_ACTIVO_COOKIE = "proyecto_activo"

export async function getProyectoActivoId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(PROYECTO_ACTIVO_COOKIE)?.value ?? null
}

// Dada la lista de proyectos activos de la empresa y el id guardado en la
// cookie, decide cuál usar: el de la cookie si sigue siendo válido (existe
// y sigue activo), o si no, el primero de la lista como default razonable.
export function resolverProyectoActivo<T extends { id: string }>(
  proyectos: T[],
  cookieId: string | null
): T | null {
  if (proyectos.length === 0) return null
  if (cookieId) {
    const encontrado = proyectos.find((p) => p.id === cookieId)
    if (encontrado) return encontrado
  }
  return proyectos[0]
}
