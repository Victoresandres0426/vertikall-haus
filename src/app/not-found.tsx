// Misma razón que error.tsx/global-error.tsx: sin esto, una URL o
// link roto (ej. un proyecto ya borrado, un enlace viejo) mostraba el
// 404 genérico de Next.js sin ninguna salida -- atascado igual en la
// tablet instalada como PWA.
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F9FC] p-6">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-sm p-6 text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center">
          <span className="text-2xl">🔍</span>
        </div>
        <h1 className="text-lg font-semibold text-slate-900 mb-1">Página no encontrada</h1>
        <p className="text-sm text-slate-500 mb-6">
          Lo que buscas no existe o ya no está disponible.
        </p>
        <a
          href="/login"
          className="block w-full h-10 leading-10 rounded-lg bg-[#3B72D8] text-white text-sm font-medium hover:bg-[#2f5cb0] transition-colors"
        >
          Ir al inicio de sesión
        </a>
      </div>
    </div>
  )
}
