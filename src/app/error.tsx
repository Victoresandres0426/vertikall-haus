"use client"

// Boundary de error a nivel de toda la app (dentro del layout raíz).
// Antes no existía NINGÚN error.tsx -- cuando algo fallaba, Next.js
// mostraba su pantalla genérica sin ningún botón ni link de salida.
// Eso es especialmente grave instalada como PWA en una tablet: ahí no
// hay barra de navegador, ni botón "atrás", ni URL que teclear -- el
// usuario quedaba completamente atascado en la pantalla de error sin
// forma de volver al login. Este boundary siempre ofrece "Reintentar"
// (reset() -- vuelve a renderizar sin recargar) y un link directo a
// /login que sí fuerza una recarga completa (por si el error viene de
// un estado roto en memoria que reset() no arregla).
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F9FC] p-6">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-sm p-6 text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-50 flex items-center justify-center">
          <span className="text-2xl">⚠️</span>
        </div>
        <h1 className="text-lg font-semibold text-slate-900 mb-1">Algo salió mal</h1>
        <p className="text-sm text-slate-500 mb-6">
          Ocurrió un error inesperado. Puedes intentar de nuevo o volver a la pantalla de inicio.
        </p>

        <div className="space-y-2">
          <button
            onClick={() => reset()}
            className="w-full h-10 rounded-lg bg-[#3B72D8] text-white text-sm font-medium hover:bg-[#2f5cb0] transition-colors"
          >
            Reintentar
          </button>
          <a
            href="/login"
            className="block w-full h-10 leading-10 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Ir al inicio de sesión
          </a>
        </div>

        {error.digest && (
          <p className="mt-4 text-[10px] text-slate-300 font-mono">Ref: {error.digest}</p>
        )}
      </div>
    </div>
  )
}
