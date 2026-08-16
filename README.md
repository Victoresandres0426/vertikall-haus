# Vertikall Haus — Sistema de Gestión Inteligente

App de gestión de construcción (Next.js 16 + Supabase) basada en el documento
*Plan Maestro — Especificaciones Funcionales v2*. Jerarquía: Empresa → Proyecto
→ Proceso → Actividad.

## Estado del proyecto (actualizado 2026-08-16)

Todas las migraciones (001 a 013) están aplicadas en producción y **todos los
módulos fueron probados en vivo en https://vertikall-haus.vercel.app/**:
Materiales, Riesgos, Change Orders, Flujo de Caja, Presupuesto, Equipo por
proyecto, y Reporte Diario completo (asistencia + avance + motor de reglas +
Alertas + IIDP). El sistema funciona de punta a punta.

### Motor de reglas

`src/lib/engine/` — motor de alertas + IIDP basado en reglas explícitas
(spec §19, punto 6 del MVP). Se ejecuta automáticamente al final de
`crearReporteDiario` (`reporte-diario/actions.ts`) cada vez que el capataz
guarda su reporte del día.

Qué hace:
- Compara avance esperado (interpolación lineal del plan) vs. avance real por actividad y genera/actualiza/resuelve alertas de tipo `cronograma`.
- Compara costo real vs. presupuestado por actividad y genera alertas de tipo `costo`.
- Genera alternativas de recuperación (agregar recurso / horas extra / no intervenir), con costo y días estimados, siguiendo el ejemplo del spec §14.
- Calcula un snapshot diario de IIDP (`iidp_snapshots`) con las 6 dimensiones del spec §8, usando los pesos y umbrales de `empresas.configuracion` (con respaldo a los valores de `003_seed_data.sql` si la empresa no tiene configuración propia).

Qué **no** hace todavía (pendiente, ver "Próximos pasos" abajo):
- **Ruta crítica dinámica (CPM).** El campo `actividades.es_critica` se usa tal cual está en la base de datos; no hay todavía un algoritmo que recalcule la ruta crítica a partir de `dependencias_actividad`. Es la pieza más grande pendiente del documento maestro (spec §4).
- Motor de conocimiento histórico / aprendizaje (spec §9) — la tabla `conocimiento_historico` existe pero nada la alimenta ni la consulta aún.
- Simulación de escenarios interactiva (spec §7.1) — hoy el motor genera alternativas fijas por regla, no permite que el usuario elija un criterio dominante (tiempo vs. costo vs. margen) y re-simule.

### Flujo de caja — carga manual interina

`flujo-caja/actions.ts` permite cargar una proyección semanal a mano
(ingresos/egresos plan y real por proyecto). El spec (§11.3) pide que esto se
calcule automáticamente a partir de CxC, CxP, nómina e hitos — esa
automatización completa queda pendiente; por ahora el saldo se calcula por
semana individual, sin acumulado entre semanas.

### Equipo por proyecto y asistencia

`proyectos/[id]/equipo-proyecto.tsx` permite autorizar trabajadores por
proyecto (tabla `proyecto_trabajadores`). El paso de Asistencia en Reporte
Diario ahora respeta esa asignación (antes traía a todos los trabajadores de
la empresa sin filtrar). Falta: check-in por QR desde el celular del
trabajador (la página de check-in existe pero no fue probada en esta ronda).

### Próximos pasos sugeridos (por prioridad)

1. **Ruta crítica (CPM)** — calcular automáticamente qué actividades son
   críticas a partir de `dependencias_actividad`, en vez de depender de un
   campo manual. Es la base para que las alertas de cronograma y el IIDP
   sean realmente precisos.
2. **Flujo de caja automático** — calcular ingresos/egresos proyectados desde
   `facturas_cliente`, `facturas_proveedor` y `periodos_nomina` en vez de
   captura manual semanal.
3. **Motor de conocimiento histórico** — que el sistema aprenda de proyectos
   pasados (`conocimiento_historico`) para mejorar las alternativas que
   sugiere el motor de reglas.
4. **Simulación de escenarios** — permitir elegir un criterio (tiempo, costo,
   margen) y que el motor recalcule alternativas bajo ese criterio.
5. **Check-in QR de trabajadores** — probar y pulir el flujo de asistencia
   por código QR desde el celular.

### Build / verificación

No fue posible correr `npm install` ni `npm run build` desde el entorno de
desarrollo usado para estos cambios (sin acceso a `registry.npmjs.org`). Los
cambios se revisaron de forma estática y se validaron desplegando a Vercel
directamente. Vercel corre `npm run build` en cada push — si un cambio rompe
el build, el deployment anterior se mantiene activo (no hay downtime), pero
conviene revisar el tab de Deployments después de cada push.
