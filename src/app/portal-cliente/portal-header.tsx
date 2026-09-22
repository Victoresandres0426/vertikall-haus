import Image from "next/image"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { CerrarSesionBoton } from "./cerrar-sesion-boton"
import { IdiomaToggle } from "./idioma-toggle"

// Encabezado compartido por las 5 pantallas del portal (inicio +
// cronograma/fotos/reportes/facturas). En inicio muestra el logo; en
// las otras cuatro, un botón "Volver" que regresa a /portal-cliente --
// así cada sección se siente como una pantalla aparte, con una sola
// salida clara, en vez de todo apilado en un scroll interminable.
export function PortalHeader({
  proyectoNombre,
  idioma,
  nombreCompleto,
  seccion,
  labelVolver,
}: {
  proyectoNombre: string
  idioma: "es" | "en"
  nombreCompleto: string
  // Si se pasa, se muestra el botón volver + este título de sección en
  // vez del logo + "Portal del cliente".
  seccion?: string
  labelVolver?: string
}) {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {seccion ? (
            <Link
              href="/portal-cliente"
              className="flex items-center gap-1.5 text-sm font-semibold text-[#3B72D8] shrink-0 -ml-1 px-1 py-1"
            >
              <ArrowLeft className="h-4 w-4" /> {labelVolver ?? "Volver"}
            </Link>
          ) : (
            <Image src="/logo/mark.png" alt="Vertikall Haus" width={36} height={54} className="h-9 w-auto shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.2em] text-[#3B72D8] uppercase truncate">
              {seccion ?? "Portal del cliente"}
            </p>
            <h1 className="text-lg font-bold text-[#0F2040] truncate">{proyectoNombre}</h1>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <IdiomaToggle idiomaInicial={idioma} />
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-slate-700">{nombreCompleto}</p>
            <CerrarSesionBoton />
          </div>
        </div>
      </div>
    </header>
  )
}
