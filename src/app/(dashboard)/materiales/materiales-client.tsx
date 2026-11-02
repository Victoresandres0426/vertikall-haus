"use client"

import { useMemo, useState, useTransition } from "react"
import { Ruler, Receipt, CalendarClock, AlertTriangle, CheckCircle2, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  GastosClient,
  type FacturaGasto,
  type ActividadOpcion,
  type PartidaOpcion,
  type MaterialOpcion,
} from "./gastos-client"
import { actualizarDiasAnticipacion } from "./presupuesto-actions"
import { formatoPct, type CompraMaterial, type ComparativoMaterial, type EstadoCompra } from "@/lib/materiales/comparativo"

type Tab = "asignacion" | "gastos" | "comprar"

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`
const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 })

function formatoFecha(iso: string | null) {
  if (!iso) return "—"
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

export function MaterialesClient({
  comparativo,
  compras,
  nombreProceso,
  lineasPorConfirmar,
  hoy,
  puedeCrear,
  facturasIniciales,
  actividadesOpciones,
  partidasIndirectasOpciones,
  materialesOpciones,
  proyectoActivoId,
}: {
  comparativo: ComparativoMaterial[]
  compras: CompraMaterial[]
  nombreProceso: Record<string, string>
  lineasPorConfirmar: number
  hoy: string
  puedeCrear: boolean
  facturasIniciales: FacturaGasto[]
  actividadesOpciones: ActividadOpcion[]
  partidasIndirectasOpciones: PartidaOpcion[]
  materialesOpciones: MaterialOpcion[]
  proyectoActivoId: string | null
}) {
  const [tab, setTab] = useState<Tab>("asignacion")

  const sobre = comparativo.filter((m) => m.estado === "sobreconsumo").length
  const aviso = comparativo.filter((m) => m.estado === "aviso").length
  const porComprar = compras.filter((c) => c.estado_compra === "vencida" || c.estado_compra === "comprar_ya").length

  const tabs: { id: Tab; label: string; icon: typeof Ruler; badge?: number; badgeColor?: string }[] = [
    { id: "asignacion", label: "Asignación", icon: Ruler, badge: sobre + aviso, badgeColor: sobre > 0 ? "bg-red-500" : "bg-amber-500" },
    { id: "gastos", label: "Gastos", icon: Receipt, badge: lineasPorConfirmar, badgeColor: "bg-sky-500" },
    { id: "comprar", label: "Cuándo comprar", icon: CalendarClock, badge: porComprar, badgeColor: "bg-amber-500" },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="inline-flex bg-slate-100 rounded-lg p-1 gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md transition-colors",
              tab === t.id ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
            {!!t.badge && t.badge > 0 && (
              <span className={cn("ml-0.5 rounded-full px-1.5 text-[10px] font-semibold text-white", t.badgeColor)}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "gastos" && (
        <GastosClient
          facturasIniciales={facturasIniciales}
          actividadesOpciones={actividadesOpciones}
          partidasIndirectasOpciones={partidasIndirectasOpciones}
          materialesOpciones={materialesOpciones}
          puedeCrear={puedeCrear}
          proyectoActivoId={proyectoActivoId}
        />
      )}
      {tab === "asignacion" && (
        <AsignacionTab comparativo={comparativo} nombreProceso={nombreProceso} lineasPorConfirmar={lineasPorConfirmar} onIrAGastos={() => setTab("gastos")} />
      )}
      {tab === "comprar" && (
        <ComprarTab compras={compras} nombreProceso={nombreProceso} hoy={hoy} puedeCrear={puedeCrear} />
      )}
    </div>
  )
}

// ── Asignación: hoja S2 + comparación contra lo comprado ─────────────

function barraColor(estado: ComparativoMaterial["estado"]) {
  if (estado === "sobreconsumo") return "bg-red-500"
  if (estado === "aviso") return "bg-amber-500"
  if (estado === "normal") return "bg-emerald-500"
  return "bg-slate-200"
}

function AsignacionTab({
  comparativo,
  nombreProceso,
  lineasPorConfirmar,
  onIrAGastos,
}: {
  comparativo: ComparativoMaterial[]
  nombreProceso: Record<string, string>
  lineasPorConfirmar: number
  onIrAGastos: () => void
}) {
  const [busqueda, setBusqueda] = useState("")
  const [soloAlertas, setSoloAlertas] = useState(false)

  const totalPresupuesto = comparativo.reduce((s, m) => s + m.costo_total, 0)
  const totalComprado = comparativo.reduce((s, m) => s + m.comprado_monto, 0)
  const sobre = comparativo.filter((m) => m.estado === "sobreconsumo").length
  const aviso = comparativo.filter((m) => m.estado === "aviso").length

  const grupos = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const mapa = new Map<string, ComparativoMaterial[]>()
    for (const m of comparativo) {
      if (soloAlertas && m.estado !== "aviso" && m.estado !== "sobreconsumo") continue
      if (q && !`${m.descripcion} ${m.codigo ?? ""} ${m.proveedor ?? ""}`.toLowerCase().includes(q)) continue
      const clave = m.proceso_id ? nombreProceso[m.proceso_id] ?? m.seccion ?? "Sin división" : m.seccion ?? "Sin división"
      const arr = mapa.get(clave) ?? []
      arr.push(m)
      mapa.set(clave, arr)
    }
    return Array.from(mapa.entries())
  }, [comparativo, busqueda, soloAlertas, nombreProceso])

  if (comparativo.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-400">
        <Ruler className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-lg font-medium">Este proyecto no tiene materiales presupuestados</p>
        <p className="text-sm mt-1 max-w-md mx-auto">
          Aquí aparece el cómputo de materiales (hoja S2 del presupuesto) y se compara contra lo que registras en Gastos.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Materiales presupuestados", val: money(totalPresupuesto), sub: `${comparativo.length} líneas`, color: "text-slate-900" },
          { label: "Comprado (confirmado)", val: money(totalComprado), sub: formatoPct(totalPresupuesto ? totalComprado / totalPresupuesto : 0) + " del total", color: "text-blue-600" },
          { label: "Cerca del límite (≥90%)", val: String(aviso), sub: "materiales", color: "text-amber-600" },
          { label: "Sobreconsumo (>100%)", val: String(sobre), sub: "materiales", color: "text-red-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
            <p className={cn("text-2xl font-bold", s.color)}>{s.val}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            <p className="text-[11px] text-slate-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {lineasPorConfirmar > 0 && (
        <button
          onClick={onIrAGastos}
          className="w-full text-left bg-sky-50 border border-sky-200 rounded-xl p-3 text-sm text-sky-800 hover:bg-sky-100"
        >
          Hay {lineasPorConfirmar} línea(s) de gastos con material sugerido por la IA pendientes de confirmar. No cuentan en esta
          comparación hasta que las confirmes → ir a Gastos
        </button>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar material, código o proveedor"
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg w-72 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={soloAlertas} onChange={(e) => setSoloAlertas(e.target.checked)} />
          Solo con aviso o sobreconsumo
        </label>
      </div>

      {grupos.length === 0 && <p className="text-sm text-slate-400 italic">Ningún material coincide con el filtro.</p>}

      {grupos.map(([division, items]) => {
        const presupuesto = items.reduce((s, m) => s + m.costo_total, 0)
        const comprado = items.reduce((s, m) => s + m.comprado_monto, 0)
        return (
          <div key={division} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">{division}</h3>
              <p className="text-xs text-slate-500">
                {items.length} materiales · presupuesto {money(presupuesto)} · comprado {money(comprado)}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 uppercase tracking-wide">
                    <th className="px-3 py-2 font-medium">Código</th>
                    <th className="px-3 py-2 font-medium">Material</th>
                    <th className="px-3 py-2 font-medium">UM</th>
                    <th className="px-3 py-2 font-medium text-right">Cant. neta</th>
                    <th className="px-3 py-2 font-medium text-right">Desp.</th>
                    <th className="px-3 py-2 font-medium text-right">Cant. total</th>
                    <th className="px-3 py-2 font-medium text-right">P. unit.</th>
                    <th className="px-3 py-2 font-medium text-right">Costo</th>
                    <th className="px-3 py-2 font-medium">Plano</th>
                    <th className="px-3 py-2 font-medium">Proveedor</th>
                    <th className="px-3 py-2 font-medium text-right">Comprado</th>
                    <th className="px-3 py-2 font-medium w-32">Consumo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((m) => (
                    <tr
                      key={m.id}
                      className={cn(
                        m.estado === "sobreconsumo" && "bg-red-50/60",
                        m.estado === "aviso" && "bg-amber-50/60"
                      )}
                    >
                      <td className="px-3 py-1.5 font-mono text-slate-400">{m.codigo ?? "—"}</td>
                      <td className="px-3 py-1.5 text-slate-800 min-w-[220px]">{m.descripcion}</td>
                      <td className="px-3 py-1.5 text-slate-500">{m.unidad ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right text-slate-600">{num(m.cantidad_neta)}</td>
                      <td className="px-3 py-1.5 text-right text-slate-500">{m.desperdicio_pct ? `${num(m.desperdicio_pct)}%` : "—"}</td>
                      <td className="px-3 py-1.5 text-right text-slate-700">{num(m.cantidad_total)}</td>
                      <td className="px-3 py-1.5 text-right text-slate-600">${num(m.precio_unitario)}</td>
                      <td className="px-3 py-1.5 text-right font-medium text-slate-900">{money(m.costo_total)}</td>
                      <td className="px-3 py-1.5 text-slate-500">{m.estado_plano ?? "—"}</td>
                      <td className="px-3 py-1.5 text-slate-500">{m.proveedor ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right text-slate-700">
                        {m.lineas === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <>
                            {money(m.comprado_monto)}
                            {m.pct_cantidad !== null && (
                              <span className="block text-[10px] text-slate-400">
                                {num(m.comprado_cantidad)} {m.unidad ?? ""}
                              </span>
                            )}
                            {m.unidades_distintas && (
                              <span className="block text-[10px] text-amber-600">unidad distinta</span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                            <div className={cn("h-full", barraColor(m.estado))} style={{ width: `${Math.min(100, m.pct * 100)}%` }} />
                          </div>
                          <span
                            className={cn(
                              "w-9 text-right font-medium",
                              m.estado === "sobreconsumo" ? "text-red-600" : m.estado === "aviso" ? "text-amber-600" : "text-slate-500"
                            )}
                          >
                            {m.lineas === 0 ? "" : formatoPct(m.pct)}
                          </span>
                          {m.estado === "sobreconsumo" && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Cuándo comprar ───────────────────────────────────────────────────

const GRUPOS_COMPRA: { estado: EstadoCompra; titulo: string; descripcion: string; color: string }[] = [
  { estado: "vencida", titulo: "Ya debió comprarse", descripcion: "La división ya inició y el material no está comprado.", color: "border-red-200 bg-red-50 text-red-800" },
  { estado: "comprar_ya", titulo: "Comprar ahora", descripcion: "Con la anticipación configurada, ya toca pedirlo.", color: "border-amber-200 bg-amber-50 text-amber-800" },
  { estado: "proxima", titulo: "Próximas 2 semanas", descripcion: "Se acerca la fecha de compra.", color: "border-sky-200 bg-sky-50 text-sky-800" },
  { estado: "futura", titulo: "Más adelante", descripcion: "Todavía hay tiempo.", color: "border-slate-200 bg-slate-50 text-slate-700" },
  { estado: "sin_fecha", titulo: "Sin fecha en el cronograma", descripcion: "La división no tiene actividades con fecha de inicio planificada.", color: "border-slate-200 bg-slate-50 text-slate-600" },
]

function ComprarTab({
  compras,
  nombreProceso,
  hoy,
  puedeCrear,
}: {
  compras: CompraMaterial[]
  nombreProceso: Record<string, string>
  hoy: string
  puedeCrear: boolean
}) {
  const [verComprados, setVerComprados] = useState(false)
  const comprados = compras.filter((c) => c.estado_compra === "comprado")

  if (compras.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-400">
        <CalendarClock className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-lg font-medium">Sin materiales presupuestados</p>
        <p className="text-sm mt-1">Cuando el proyecto tenga su cómputo de materiales, aquí verás cuándo comprar cada uno.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">
        Fecha de compra = inicio de la división en el cronograma − días de anticipación (7 por defecto, editable por material).
        Un material se considera comprado al registrar ≥90% de lo presupuestado. Hoy: {formatoFecha(hoy)}.
      </p>

      {GRUPOS_COMPRA.map((g) => {
        const items = compras
          .filter((c) => c.estado_compra === g.estado)
          .sort((a, b) => (a.fecha_compra ?? "9999").localeCompare(b.fecha_compra ?? "9999"))
        if (items.length === 0) return null
        return (
          <FilaGrupo key={g.estado} titulo={g.titulo} descripcion={g.descripcion} color={g.color} items={items} nombreProceso={nombreProceso} puedeCrear={puedeCrear} />
        )
      })}

      {comprados.length > 0 && (
        <div>
          <button onClick={() => setVerComprados(!verComprados)} className="flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-900">
            <CheckCircle2 className="h-4 w-4" /> {comprados.length} material(es) ya comprados {verComprados ? "(ocultar)" : "(ver)"}
          </button>
          {verComprados && (
            <div className="mt-2">
              <FilaGrupo titulo="Comprados" descripcion="" color="border-emerald-200 bg-emerald-50 text-emerald-800" items={comprados} nombreProceso={nombreProceso} puedeCrear={puedeCrear} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FilaGrupo({
  titulo,
  descripcion,
  color,
  items,
  nombreProceso,
  puedeCrear,
}: {
  titulo: string
  descripcion: string
  color: string
  items: CompraMaterial[]
  nombreProceso: Record<string, string>
  puedeCrear: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [dias, setDias] = useState<Record<string, string>>({})

  const guardar = (id: string, original: number) => {
    const valor = dias[id]
    if (valor === undefined || valor === String(original)) return
    const n = Number(valor)
    if (!Number.isFinite(n) || n < 0 || n > 365) {
      alert("Días inválidos (0 a 365)")
      return
    }
    startTransition(async () => {
      const res = await actualizarDiasAnticipacion(id, n)
      if (res.error) alert(res.error)
    })
  }

  return (
    <div className={cn("border rounded-xl overflow-hidden", isPending && "opacity-70")}>
      <div className={cn("px-4 py-2 border-b", color)}>
        <p className="text-sm font-semibold">
          {titulo} <span className="font-normal opacity-70">· {items.length}</span>
        </p>
        {descripcion && <p className="text-xs opacity-80">{descripcion}</p>}
      </div>
      <div className="bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-400 uppercase tracking-wide">
              <th className="px-3 py-2 font-medium">Material</th>
              <th className="px-3 py-2 font-medium">División</th>
              <th className="px-3 py-2 font-medium text-right">Costo</th>
              <th className="px-3 py-2 font-medium">Inicio división</th>
              <th className="px-3 py-2 font-medium text-right">Anticipación (días)</th>
              <th className="px-3 py-2 font-medium">Comprar el</th>
              <th className="px-3 py-2 font-medium text-right">Faltan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {items.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-1.5 text-slate-800 min-w-[220px]">{c.descripcion}</td>
                <td className="px-3 py-1.5 text-slate-500">{c.proceso_id ? nombreProceso[c.proceso_id] ?? c.seccion ?? "—" : c.seccion ?? "—"}</td>
                <td className="px-3 py-1.5 text-right text-slate-700">{money(c.costo_total)}</td>
                <td className="px-3 py-1.5 text-slate-600">{formatoFecha(c.fecha_inicio)}</td>
                <td className="px-3 py-1.5 text-right">
                  {puedeCrear ? (
                    <input
                      type="number"
                      min={0}
                      max={365}
                      value={dias[c.id] ?? String(c.dias_anticipacion)}
                      onChange={(e) => setDias((p) => ({ ...p, [c.id]: e.target.value }))}
                      onBlur={() => guardar(c.id, c.dias_anticipacion)}
                      className="w-16 border border-slate-200 rounded-md px-1.5 py-0.5 text-right text-xs"
                    />
                  ) : (
                    c.dias_anticipacion
                  )}
                </td>
                <td className="px-3 py-1.5 font-medium text-slate-800">{formatoFecha(c.fecha_compra)}</td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right font-medium",
                    c.dias_para_comprar === null ? "text-slate-300" : c.dias_para_comprar <= 0 ? "text-red-600" : "text-slate-600"
                  )}
                >
                  {c.dias_para_comprar === null
                    ? "—"
                    : c.dias_para_comprar <= 0
                      ? `${Math.abs(c.dias_para_comprar)} d de atraso`
                      : `${c.dias_para_comprar} d`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
