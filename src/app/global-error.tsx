"use client"

// Boundary para errores en el LAYOUT RAÍZ mismo (fuera del alcance de
// error.tsx) -- casos raros, pero si pasan, Next.js exige que este
// archivo reemplace <html>/<body> por completo (no puede depender del
// layout, porque el layout es justo lo que falló). Mismo motivo que
// error.tsx: sin esto, la app instalada como PWA en una tablet deja al
// usuario sin ninguna forma de salir de la pantalla de error.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="es">
      <body className="antialiased">
        <div className="min-h-screen flex items-center justify-center bg-[#F7F9FC] p-6">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-sm p-6 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-50 flex items-center justify-center">
              <span className="text-2xl">⚠️</span>
            </div>
            <h1 className="text-lg font-semibold text-slate-900 mb-1">Algo salió mal</h1>
            <p className="text-sm text-slate-500 mb-6">
              Ocurrió un error inesperado al cargar la aplicación. Puedes intentar de nuevo o volver a la pantalla de inicio.
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
      </body>
    </html>
  )
}
