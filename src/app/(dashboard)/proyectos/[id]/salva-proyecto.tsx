"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import * as XLSX from "xlsx"
import { Archive, Download, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { extraerArchivos, type DatosProyecto } from "@/lib/salva/archivos"
import { crearZip, type EntradaZip } from "@/lib/salva/zip"
import { eliminarProyectoDefinitivo } from "../salva-actions"

type Props = {
  proyectoId: string
  proyectoNombre: string
  proyectoCodigo: string
  estado: string
  salvaDescargadaAt: string | null
}

function limpiarNombre(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_").slice(0, 60) || "proyecto"
}

function nombreHoja(base: string, usados: Set<string>) {
  let n = base.replace(/[\\/?*[\]:]/g, "-").slice(0, 31)
  let i = 2
  while (usados.has(n.toLowerCase())) n = base.slice(0, 28) + "_" + i++
  usados.add(n.toLowerCase())
  return n
}

function celda(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null
  if (typeof v === "object") return JSON.stringify(v).slice(0, 32000)
  if (typeof v === "string") return v.slice(0, 32000)
  return v as number | boolean
}

export function SalvaProyecto({ proyectoId, proyectoNombre, proyectoCodigo, estado, salvaDescargadaAt }: Props) {
  const router = useRouter()
  const [trabajando, setTrabajando] = useState(false)
  const [progreso, setProgreso] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [confirmacion, setConfirmacion] = useState("")
  const [borrando, setBorrando] = useState(false)

  const terminado = estado === "completado"

  async function descargarSalva() {
    setTrabajando(true)
    setError(null)
    setAviso(null)
    try {
      const supabase = createClient()

      setProgreso("Leyendo todos los datos del proyecto...")
      const { data, error: errRpc } = await supabase.rpc("exportar_proyecto", { p_proyecto_id: proyectoId })
      if (errRpc) {
        setError(
          errRpc.message?.includes("exportar_proyecto")
            ? "Falta correr la migración 159 en Supabase."
            : "No se pudieron leer los datos: " + errRpc.message
        )
        return
      }
      const datos = (data ?? {}) as DatosProyecto
      const tablas = Object.keys(datos).sort()

      // ── Excel legible: una hoja por tabla con datos + resumen ──
      setProgreso("Armando el Excel...")
      const wb = XLSX.utils.book_new()
      const usados = new Set<string>(["resumen"])
      const resumen: (string | number)[][] = [["Tabla", "Filas"]]
      for (const t of tablas) resumen.push([t, datos[t].length])
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), "Resumen")
      for (const t of tablas) {
        const filas = datos[t]
        if (filas.length === 0) continue
        const cols = Array.from(new Set(filas.flatMap((f) => Object.keys(f))))
        const aoa = [cols, ...filas.map((f) => cols.map((c) => celda(f[c])))]
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), nombreHoja(t, usados))
      }
      const xlsxBytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer)

      const enc = new TextEncoder()
      const entradas: EntradaZip[] = [
        { nombre: "datos.xlsx", datos: xlsxBytes },
        { nombre: "datos.json", datos: enc.encode(JSON.stringify(datos, null, 1)) },
      ]

      // ── Archivos de Storage (fotos, planos, recibos) ──
      const archivos = extraerArchivos(datos)
      const fallidos: string[] = []
      let hechos = 0
      for (const a of archivos) {
        setProgreso(`Descargando archivos ${hechos + 1} de ${archivos.length}...`)
        const { data: blob, error: errDl } = await supabase.storage.from(a.bucket).download(a.path)
        if (errDl || !blob) {
          fallidos.push(`${a.bucket}/${a.path}`)
        } else {
          entradas.push({
            nombre: `archivos/${a.bucket}/${a.path}`,
            datos: new Uint8Array(await blob.arrayBuffer()),
          })
        }
        hechos++
      }

      const leeme = [
        `SALVA DEL PROYECTO ${proyectoCodigo} - ${proyectoNombre}`,
        `Generada: ${new Date().toLocaleString("es-MX")}`,
        "",
        "datos.xlsx  -> una hoja por tabla (resumen en la primera hoja)",
        "datos.json  -> todos los datos completos, tal como estaban en la base",
        "archivos/   -> fotos, planos y recibos subidos al proyecto",
        "",
        `Tablas: ${tablas.length} | Filas: ${tablas.reduce((s, t) => s + datos[t].length, 0)}`,
        `Archivos: ${archivos.length - fallidos.length} de ${archivos.length} descargados`,
        ...(fallidos.length ? ["", "ARCHIVOS QUE NO SE PUDIERON DESCARGAR:", ...fallidos] : []),
      ].join("\n")
      entradas.unshift({ nombre: "LEEME.txt", datos: enc.encode(leeme) })

      setProgreso("Creando el ZIP...")
      const zip = crearZip(entradas)
      const fecha = new Date().toISOString().slice(0, 10)
      const url = URL.createObjectURL(zip)
      const link = document.createElement("a")
      link.href = url
      link.download = `salva_${limpiarNombre(proyectoCodigo)}_${limpiarNombre(proyectoNombre)}_${fecha}.zip`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)

      if (fallidos.length > 0) {
        setAviso(
          `Se descargó el ZIP, pero ${fallidos.length} archivo(s) no se pudieron bajar (ver LEEME.txt dentro del ZIP). La salva NO se marcó como completa, así que el borrado sigue bloqueado.`
        )
      } else {
        const { error: errReg } = await supabase.rpc("registrar_salva_proyecto", { p_proyecto_id: proyectoId })
        if (errReg) {
          setAviso("El ZIP se descargó, pero no se pudo registrar la salva: " + errReg.message)
        } else {
          setAviso("Salva descargada y registrada. Revisa que el ZIP abra bien y guárdalo en tu nube antes de borrar el proyecto.")
          router.refresh()
        }
      }
    } catch (e) {
      setError("Falló la salva: " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setTrabajando(false)
      setProgreso("")
    }
  }

  async function borrar() {
    setBorrando(true)
    setError(null)
    const r = await eliminarProyectoDefinitivo(proyectoId, confirmacion)
    if (r.error) {
      setError(r.error)
      setBorrando(false)
      return
    }
    router.push("/proyectos")
    router.refresh()
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Archive className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-700">Salva y cierre del proyecto</h2>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div>
          <p className="text-sm text-slate-600 mb-3">
            Descarga un ZIP con todo el proyecto: Excel por tabla, datos completos en JSON y todos los archivos
            subidos (fotos, planos, recibos).
          </p>
          <button
            onClick={descargarSalva}
            disabled={trabajando}
            className="inline-flex items-center gap-2 rounded-lg bg-[#3B72D8] hover:bg-[#2f5cb0] disabled:opacity-60 text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            <Download className="h-4 w-4" />
            {trabajando ? "Trabajando..." : salvaDescargadaAt ? "Descargar salva otra vez" : "Descargar salva"}
          </button>
          {progreso && <p className="text-xs text-slate-500 mt-2">{progreso}</p>}
          {salvaDescargadaAt && !progreso && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-600 mt-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Última salva registrada: {new Date(salvaDescargadaAt).toLocaleString("es-MX")}
            </p>
          )}
        </div>

        {aviso && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">{aviso}</p>}
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

        <div className="border-t border-slate-100 pt-4">
          <p className="flex items-center gap-1.5 text-sm font-medium text-red-700 mb-1">
            <AlertTriangle className="h-4 w-4" /> Borrar el proyecto del programa
          </p>
          {!terminado ? (
            <p className="text-xs text-slate-500">
              Solo se puede borrar cuando el proyecto está en estado <strong>Completado</strong>.
            </p>
          ) : !salvaDescargadaAt ? (
            <p className="text-xs text-slate-500">Primero descarga la salva; sin ella el borrado está bloqueado.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                Esto elimina <strong>definitivamente</strong> el proyecto y todos sus datos y archivos. No se puede
                deshacer. Escribe el nombre del proyecto para confirmar:
              </p>
              <input
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                placeholder={proyectoNombre}
                className="w-full max-w-sm rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <div>
                <button
                  onClick={borrar}
                  disabled={borrando || confirmacion.trim() !== proyectoNombre.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  {borrando ? "Borrando..." : "Borrar proyecto definitivamente"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
