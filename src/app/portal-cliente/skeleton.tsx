// Placeholder mientras carga cada pantalla del portal -- Next.js
// muestra esto automáticamente (vía loading.tsx en cada carpeta)
// mientras el Server Component de esa página espera sus datos. Antes,
// en una conexión lenta (tablet de obra), la pantalla se quedaba en
// blanco varios segundos sin ninguna señal; esto da una sensación de
// carga inmediata en vez de "se congeló".
export function PortalSkeleton({ conGrafica = false }: { conGrafica?: boolean }) {
  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="h-9 w-9 rounded-lg bg-slate-100 animate-pulse" />
          <div className="h-6 w-24 rounded bg-slate-100 animate-pulse" />
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        {conGrafica && <div className="h-40 rounded-2xl bg-white border border-slate-200 animate-pulse" />}
        <div className="h-28 rounded-2xl bg-white border border-slate-200 animate-pulse" />
        <div className="h-20 rounded-2xl bg-white border border-slate-200 animate-pulse" />
        <div className="h-20 rounded-2xl bg-white border border-slate-200 animate-pulse" />
      </div>
    </div>
  )
}
