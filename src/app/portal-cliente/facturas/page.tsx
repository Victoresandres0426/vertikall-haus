import { Fragment } from "react"
import { ChevronDown } from "lucide-react"
import { PortalHeader } from "../portal-header"
import { SinProyecto } from "../sin-proyecto"
import {
  cargarSesionCliente,
  obtenerProyectoCliente,
  descripcionFactura,
  formatoFecha,
  formatoMoneda,
  estadoFacturaLabel,
  estadoFacturaLabelEn,
  estadoFacturaColor,
  type Factura,
  t,
} from "../_shared"

export default async function FacturasClientePage() {
  const { supabase, perfil } = await cargarSesionCliente()
  const proyecto = await obtenerProyectoCliente(supabase)

  const facturaEnIngles = proyecto?.idioma_cliente === "en"
  const tf = t[facturaEnIngles ? "en" : "es"]

  if (!proyecto) {
    return <SinProyecto mensaje={tf.cuentaSinProyecto} contacto={tf.contactaContacto} />
  }

  const { data } = await supabase.rpc("cliente_ver_facturas")
  const facturas = (data ?? []) as Factura[]

  const totalCobrado = facturas.reduce((sum, f) => sum + Number(f.monto_cobrado ?? 0), 0)
  const facturasAnticipo = facturas.filter((f) => f.numero?.startsWith("ANT-"))
  const facturasAvance = facturas.filter((f) => f.numero?.startsWith("EST-"))
  const anticipoFacturado = facturasAnticipo.reduce((s, f) => s + Number(f.monto ?? 0), 0)
  const anticipoPagado = facturasAnticipo.reduce((s, f) => s + Number(f.monto_cobrado ?? 0), 0)
  const avanceFacturado = facturasAvance.reduce((s, f) => s + Number(f.monto ?? 0), 0)
  const avancePagado = facturasAvance.reduce((s, f) => s + Number(f.monto_cobrado ?? 0), 0)
  const saldoPendienteContrato = Math.max((proyecto.presupuesto_venta ?? 0) - totalCobrado, 0)

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <PortalHeader
        proyectoNombre={proyecto.nombre}
        idioma={facturaEnIngles ? "en" : "es"}
        nombreCompleto={perfil.nombre_completo}
        seccion={tf.facturas}
        labelVolver={tf.volver}
      />

      <main className="max-w-4xl mx-auto px-6 py-8">
        {facturas.length === 0 ? (
          <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-xl p-5">{tf.sinFacturas}</p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-5 py-4 border-b border-slate-100 bg-slate-50">
              <div>
                <p className="text-xs text-slate-400">{tf.anticipo}</p>
                <p className="text-sm font-semibold text-slate-800">
                  {formatoMoneda(anticipoPagado)}
                  <span className="text-xs font-normal text-slate-400"> {tf.pagado}</span>
                </p>
                {anticipoFacturado > anticipoPagado && (
                  <p className="text-[11px] text-amber-600">{tf.deFacturado} {formatoMoneda(anticipoFacturado)} {tf.facturado}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-400">{tf.avanceObra}</p>
                <p className="text-sm font-semibold text-slate-800">
                  {formatoMoneda(avancePagado)}
                  <span className="text-xs font-normal text-slate-400"> {tf.pagado}</span>
                </p>
                {avanceFacturado > avancePagado && (
                  <p className="text-[11px] text-amber-600">{tf.deFacturado} {formatoMoneda(avanceFacturado)} {tf.facturado}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-400">{tf.totalPagado}</p>
                <p className="text-sm font-semibold text-emerald-600">{formatoMoneda(totalCobrado)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">{tf.saldoPendiente}</p>
                <p className="text-sm font-semibold text-amber-600">{formatoMoneda(saldoPendienteContrato)}</p>
                <p className="text-[11px] text-slate-400">{tf.deContratado} {formatoMoneda(proyecto.presupuesto_venta)} {tf.contratado}</p>
              </div>
            </div>
            <div className="divide-y divide-slate-50">
              {facturas.map((f) => {
                const bruto = f.monto + (f.amortizacion_anticipo ?? 0) + (f.retencion ?? 0)
                const tieneDesglose = (f.desglose_periodos?.length ?? 0) > 1
                const tieneDesgloseActividades = (f.desglose_actividades?.length ?? 0) > 0
                const tieneDetalle = f.amortizacion_anticipo > 0 || f.retencion > 0 || tieneDesglose || tieneDesgloseActividades
                const Contenedor = tieneDetalle ? "details" : "div"
                return (
                  <Contenedor key={f.id} className="px-5 py-3 group">
                    {(() => {
                      const encabezado = (
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800">{f.numero ?? tf.sinNumero} {f.hito_asociado ? `· ${f.hito_asociado}` : ""}</p>
                            <p className="text-xs text-slate-400">
                              {descripcionFactura(f, facturaEnIngles)} · {tf.vence} {formatoFecha(f.fecha_vencimiento, facturaEnIngles)}
                              {f.periodo_inicio && f.periodo_fin ? ` · ${tf.periodo} ${formatoFecha(f.periodo_inicio, facturaEnIngles)} ${tf.al} ${formatoFecha(f.periodo_fin, facturaEnIngles)}` : ""}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-slate-800 shrink-0">{formatoMoneda(f.monto)}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${estadoFacturaColor[f.estado] ?? "bg-slate-100 text-slate-600"}`}>
                            {(facturaEnIngles ? estadoFacturaLabelEn : estadoFacturaLabel)[f.estado] ?? f.estado}
                          </span>
                          {tieneDetalle && <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180 shrink-0" />}
                        </div>
                      )
                      return tieneDetalle ? (
                        <summary className="cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden">{encabezado}</summary>
                      ) : encabezado
                    })()}

                    {tieneDetalle && (
                      <div className="mt-2 ml-0 bg-slate-50 border border-slate-100 rounded-lg p-3 space-y-1.5">
                        {tieneDesglose && (
                          <div className="space-y-1 mb-2">
                            <p className="text-[11px] font-medium text-slate-500">{tf.cubreMasDeUnPeriodo}</p>
                            {f.desglose_periodos!.map((d, i) => (
                              <div key={i} className="flex items-center justify-between text-xs text-slate-500">
                                <span>{formatoFecha(d.periodo_inicio, facturaEnIngles)} {tf.al} {formatoFecha(d.periodo_fin, facturaEnIngles)} · {d.avance_pct}% {tf.avanceLabel}</span>
                                <span>{formatoMoneda(d.monto_bruto)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {tieneDesgloseActividades && (
                          <div className="mb-2 rounded-lg overflow-hidden border border-slate-100">
                            <p className="text-[11px] font-medium text-slate-500 px-2 pt-2 pb-1 bg-white">{tf.detallePorActividad}</p>
                            <table className="w-full text-xs">
                              <thead className="bg-slate-100">
                                <tr className="text-slate-400">
                                  <th className="text-left font-medium px-2 py-1">{tf.renglon}</th>
                                  <th className="text-right font-medium px-2 py-1">{tf.pctAvance}</th>
                                  <th className="text-right font-medium px-2 py-1">{tf.ejecutado}</th>
                                  <th className="text-right font-medium px-2 py-1">{tf.amortAnticipo}</th>
                                  <th className="text-right font-medium px-2 py-1">{tf.aCobrar}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 bg-white">
                                {f.desglose_actividades!.map((d) => {
                                  const tieneAmortizacion = d.monto_amortizado !== undefined && d.monto_neto !== undefined
                                  if (d.actividades) {
                                    const nombreDisciplina = facturaEnIngles ? (d.disciplina_en || d.disciplina) : d.disciplina
                                    return (
                                      <Fragment key={`grupo-${nombreDisciplina}`}>
                                        <tr className="text-slate-800 bg-slate-50/70">
                                          <td className="px-2 py-1 font-semibold">{nombreDisciplina}</td>
                                          <td className="text-right px-2 py-1 font-semibold">
                                            {d.avance_desde_pct !== undefined ? `${d.avance_desde_pct}%-${d.avance_hasta_pct}%` : `${d.avance_pct}%`}
                                          </td>
                                          <td className="text-right px-2 py-1 font-semibold">{formatoMoneda(d.monto_bruto)}</td>
                                          <td className="text-right px-2 py-1 font-semibold text-amber-600">
                                            {tieneAmortizacion && d.monto_amortizado! > 0 ? `−${formatoMoneda(d.monto_amortizado!)}` : "—"}
                                          </td>
                                          <td className="text-right px-2 py-1 font-semibold text-slate-700">
                                            {formatoMoneda(tieneAmortizacion ? d.monto_neto! : d.monto_bruto)}
                                          </td>
                                        </tr>
                                        {d.actividades.map((sub) => {
                                          const nombreSub = facturaEnIngles ? (sub.nombre_en || sub.nombre) : sub.nombre
                                          return (
                                            <tr key={sub.actividad_id} className="text-slate-400">
                                              <td className="pl-5 pr-2 py-1">{sub.codigo ? `${sub.codigo} — ` : ""}{nombreSub}</td>
                                              <td className="text-right px-2 py-1" colSpan={4}>{sub.avance_actual_pct}% {tf.avanceActual}</td>
                                            </tr>
                                          )
                                        })}
                                      </Fragment>
                                    )
                                  }
                                  const nombreMostrado = facturaEnIngles ? (d.actividad_nombre_en || d.actividad_nombre) : d.actividad_nombre
                                  return (
                                    <tr key={d.actividad_id} className="text-slate-500">
                                      <td className="px-2 py-1">{d.actividad_codigo ? `${d.actividad_codigo} — ` : ""}{nombreMostrado}</td>
                                      <td className="text-right px-2 py-1 text-slate-400">{d.avance_pct}%</td>
                                      <td className="text-right px-2 py-1">{formatoMoneda(d.monto_bruto)}</td>
                                      <td className="text-right px-2 py-1 text-amber-600">
                                        {tieneAmortizacion && d.monto_amortizado! > 0 ? `−${formatoMoneda(d.monto_amortizado!)}` : "—"}
                                      </td>
                                      <td className="text-right px-2 py-1 font-medium text-slate-700">
                                        {formatoMoneda(tieneAmortizacion ? d.monto_neto! : d.monto_bruto)}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>{tf.avanceReconocido}</span>
                          <span>{formatoMoneda(bruto)}</span>
                        </div>
                        {f.amortizacion_anticipo > 0 && (
                          <div className="flex items-center justify-between text-xs text-amber-600">
                            <span>{tf.amortizacionAplicada}</span>
                            <span>−{formatoMoneda(f.amortizacion_anticipo)}</span>
                          </div>
                        )}
                        {f.retencion > 0 && (
                          <div className="flex items-center justify-between text-xs text-amber-600">
                            <span>{tf.retencion}</span>
                            <span>−{formatoMoneda(f.retencion)}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-700 pt-1 border-t border-slate-200">
                          <span>{tf.totalAPagar}</span>
                          <span>{formatoMoneda(f.monto)}</span>
                        </div>
                      </div>
                    )}
                  </Contenedor>
                )
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
