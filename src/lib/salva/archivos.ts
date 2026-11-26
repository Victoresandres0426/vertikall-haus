// Detecta qué archivos de Storage pertenecen a un proyecto, a partir del JSON
// que devuelve exportar_proyecto (migración 159). Lo usan tanto la descarga de
// la salva (navegador) como el borrado definitivo (servidor).

export type ArchivoSalva = { bucket: string; path: string }

type Fila = Record<string, unknown>
export type DatosProyecto = Record<string, Fila[]>

function fotosDe(valor: unknown): string[] {
  if (!Array.isArray(valor)) return []
  const rutas: string[] = []
  for (const f of valor) {
    if (f && typeof f === "object") {
      const p = (f as { storage_path?: unknown }).storage_path
      if (typeof p === "string" && p) rutas.push(p)
    }
  }
  return rutas
}

export function extraerArchivos(datos: DatosProyecto): ArchivoSalva[] {
  const out = new Map<string, ArchivoSalva>()
  const add = (bucket: string, path: string) => out.set(`${bucket}::${path}`, { bucket, path })

  for (const f of datos.proyecto_archivos ?? []) {
    if (typeof f.storage_path === "string" && f.storage_path) add("proyecto-archivos", f.storage_path)
  }
  for (const f of datos.bitacora_proyecto ?? []) {
    for (const p of fotosDe(f.fotos)) add("bitacora-fotos", p)
  }
  for (const f of datos.avance_diario ?? []) {
    for (const p of fotosDe(f.fotos)) add("reporte-fotos", p)
  }
  for (const f of datos.facturas_gasto ?? []) {
    if (typeof f.foto_referencia === "string" && f.foto_referencia.includes("/")) {
      add("recibos", f.foto_referencia)
    }
  }
  return [...out.values()]
}
