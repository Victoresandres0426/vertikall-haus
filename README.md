# Vertikall Haus — Sistema de Gestión Inteligente

App de gestión de construcción (Next.js 16 + Supabase) basada en el documento
*Plan Maestro — Especificaciones Funcionales v2*. Jerarquía: Empresa → Proyecto
→ Proceso → Actividad.

## Estado del proyecto (actualizado 2026-08-16)

### Aplicar migraciones pendientes

Este sandbox de desarrollo **no tiene acceso a la base de datos Supabase real**
(no hay Supabase CLI enlazada al proyecto ni credenciales configuradas), así
que las migraciones nuevas viven como archivos `.sql` en `supabase/migrations/`
pero no se pudieron aplicar ni verificar contra la base de datos en producción.

Antes de usar las funciones nuevas, aplica en orden (SQL editor de Supabase o
`supabase db push` si conectas la CLI):

- `009_proyecto_trabajadores.sql` — equipo autorizado por proyecto (QR check-in). Puede que ya esté aplicada; revisar si la tabla `proyecto_trabajadores` existe.
- `010_rls_gap_fix.sql` — **importante, es un fix de seguridad.** Varias tablas nunca tuvieron Row Level Security habilitado (`materiales_catalogo`, `presupuestos`, `partidas_presupuesto`, `equipos`, `proveedores`, `subcontratistas`, `cuadrillas`, `periodos_nomina`, `lineas_nomina`, entre otras), y la tabla `alertas` tenía SELECT pero nunca tuvo INSERT/UPDATE. Sin esta migración, el motor de reglas no puede escribir alertas y esas tablas quedan sin aislamiento por empresa.
- `011_partidas_presupuesto_montos.sql` — agrega `monto_presupuestado`, `monto_comprometido`, `monto_ejercido` a `partidas_presupuesto` (el frontend ya las consultaba, pero nunca existieron en el esquema; la página de Presupuesto no podía mostrar nada).

### Motor de reglas (nuevo)

`src/lib/engine/` — motor de alertas + IIDP basado en reglas explícitas
(spec §19, punto 6 del MVP). Se ejecuta automáticamente al final de
`crearReporteDiario` (`reporte-diario/actions.ts`) cada vez que el capataz
guarda su reporte del día.

Qué hace:
- Compara avance esperado (interpolación lineal del plan) vs. avance real por actividad y genera/actualiza/resuelve alertas de tipo `cronograma`.
- Compara costo real vs. presupuestado por actividad y genera alertas de tipo `costo`.
- Genera alternativas de recuperación (agregar recurso / horas extra / no intervenir), con costo y días estimados, siguiendo el ejemplo del spec §14.
- Calcula un snapshot diario de IIDP (`iidp_snapshots`) con las 6 dimensiones del spec §8, usando los pesos y umbrales de `empresas.configuracion` (con respaldo a los valores de `003_seed_data.sql` si la empresa no tiene configuración propia).

Qué **no** hace todavía (fuera de alcance de esta ronda):
- **Ruta crítica dinámica (CPM).** El campo `actividades.es_critica` se usa tal cual está en la base de datos; no hay todavía un algoritmo que recalcule la ruta crítica a partir de `dependencias_actividad`. Es la pieza más grande pendiente del documento maestro (spec §4).
- Motor de conocimiento histórico / aprendizaje (spec §9) — la tabla `conocimiento_historico` existe pero nada la alimenta ni la consulta aún.
- Simulación de escenarios interactiva (spec §7.1) — hoy el motor genera alternativas fijas por regla, no permite que el usuario elija un criterio dominante (tiempo vs. costo vs. margen) y re-simule.

### Flujo de caja — carga manual interina

`flujo-caja/actions.ts` permite cargar una proyección semanal a mano
(ingresos/egresos plan y real por proyecto). El spec (§11.3) pide que esto se
calcule automáticamente a partir de CxC, CxP, nómina e hitos — esa
automatización completa queda pendiente; por ahora el saldo se calcula por
semana individual, sin acumulado entre semanas.

### CRUD agregado en esta ronda

Antes solo se podía leer: `materiales`, `presupuesto`, `riesgos`,
`change-orders`, `flujo-caja`. Ahora tienen formularios de creación
(`actions.ts` + modal en el cliente) restringidos a roles de gestión
(`project_manager`, `administrador`, `dueno`, `superadmin`).

`recursos` (rollup de `costos_reales`) y `desempeno` (IIDP) se mantienen de
solo lectura a propósito: son vistas calculadas, no formularios de captura.

### Build / verificación

No fue posible correr `npm install` ni `npm run build` desde este entorno de
desarrollo (sin acceso a `registry.npmjs.org`). Los cambios se revisaron de
forma estática, siguiendo los mismos patrones ya usados en el código existente
(`personal/actions.ts` + `personal-client.tsx` como referencia). Se recomienda
correr `npm run build` y `npm run lint` en un entorno con acceso a internet
antes de desplegar.
