# Vertikall Haus — Guía de Despliegue
## Cómo poner el sistema online en ~20 minutos (gratis)

---

## Paso 1: Crear tu base de datos en Supabase (gratis)

1. Ve a **https://supabase.com** y crea una cuenta gratuita
2. Haz clic en **"New Project"**
   - Nombre: `vertikall-haus`
   - Contraseña: elige una contraseña segura (guárdala)
   - Región: elige la más cercana (US East o South America)
3. Espera ~2 minutos a que el proyecto se cree
4. Ve a **Settings → API** y copia:
   - `Project URL` → lo necesitas como `NEXT_PUBLIC_SUPABASE_URL`
   - `anon / public` key → lo necesitas como `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Ve a **SQL Editor** y ejecuta los archivos en este orden:
   - Copia y pega el contenido de `supabase/migrations/001_initial_schema.sql`
   - Copia y pega el contenido de `supabase/migrations/002_rls_policies.sql`
   - Copia y pega el contenido de `supabase/migrations/003_seed_data.sql`

---

## Paso 2: Desplegar la app en Vercel (gratis)

1. Ve a **https://github.com** y crea un repositorio vacío llamado `vertikall-haus`
2. Sube el código de esta carpeta a ese repositorio:
   ```
   git remote add origin https://github.com/TU-USUARIO/vertikall-haus.git
   git add .
   git commit -m "Vertikall Haus v1.0 — Fase 1"
   git push -u origin main
   ```
3. Ve a **https://vercel.com** y crea cuenta (puedes entrar con GitHub)
4. Haz clic en **"Add New Project"** y selecciona tu repositorio
5. En **"Environment Variables"**, agrega:
   - `NEXT_PUBLIC_SUPABASE_URL` = la URL de tu proyecto Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la anon key de Supabase
6. Haz clic en **"Deploy"** y espera ~3 minutos
7. Vercel te dará una URL como `https://vertikall-haus.vercel.app`

---

## Paso 3: Crear el primer usuario (Dueño)

1. En Supabase, ve a **Authentication → Users**
2. Haz clic en **"Invite user"** e ingresa el email del Dueño
3. El Dueño recibirá un email para establecer su contraseña
4. En **SQL Editor**, ejecuta para asignar el rol de Dueño:
   ```sql
   INSERT INTO perfiles_usuario (id, empresa_id, nombre_completo, email, rol)
   SELECT 
     id,
     '00000000-0000-0000-0000-000000000001',
     'Tu Nombre',
     'tu@email.com',
     'dueno'
   FROM auth.users 
   WHERE email = 'tu@email.com';
   ```
5. Repite el proceso para cada usuario, cambiando el rol según corresponda:
   - `dueno` — Dueño/Director
   - `project_manager` — Project Manager
   - `administrador` — Administrador
   - `capataz` — Capataz

---

## Estructura del código

```
src/
  app/
    (auth)/login/          ← Página de inicio de sesión
    (dashboard)/
      dashboard/           ← Dashboard ejecutivo con IIDP
      proyectos/           ← Lista de proyectos multi-proyecto
      actividades/         ← Vista jerárquica Proceso→Actividad
      reporte-diario/      ← Flujo de captura del Capataz (4 pasos)
      alertas/             ← Centro de alertas con Motor de Decisiones
  components/
    ui/                    ← Componentes de diseño (botones, cards, etc.)
    layout/                ← Sidebar, Header
  lib/
    supabase/              ← Cliente de base de datos
    utils.ts               ← Funciones de utilidad (IIDP, fechas, etc.)
  types/
    database.ts            ← Tipos TypeScript de todas las entidades

supabase/migrations/
  001_initial_schema.sql   ← Todas las tablas y relaciones
  002_rls_policies.sql     ← Seguridad por rol y empresa
  003_seed_data.sql        ← Datos iniciales de Vertikall Haus
```

---

## Lo que está construido (Fase 1)

✅ Página de login con manejo de errores
✅ Sistema de roles: Capataz, Administrador, PM, Dueño
✅ Seguridad multi-tenant (cada empresa ve solo sus datos)
✅ Dashboard ejecutivo con IIDP, alertas, KPIs, flujo de caja
✅ Vista de proyectos multi-proyecto con métricas
✅ Vista de actividades jerarquizada (Proceso → Actividad)
✅ Reporte diario del Capataz (4 pasos: asistencia, avance, materiales, envío)
✅ Centro de alertas con Motor de Decisiones y alternativas
✅ Base de datos completa con 21 tablas y todas las entidades del documento
✅ Tipos TypeScript de todas las entidades
✅ Funciones de cálculo (IIDP, variaciones, semáforos)

## Lo que viene (próximas fases)

📋 Fase 2: Gantt interactivo y ruta crítica dinámica
📋 Fase 3: Conexión real con Supabase (datos reales)
📋 Fase 4: Motor de alertas automático (se ejecuta al guardar reporte)
📋 Fase 5: Gestión de materiales y recursos
📋 Fase 6: Motor de IA con Claude para recomendaciones explicables
📋 Fase 7: Presupuesto, costos y forecast financiero
📋 Fase 8: Nómina con distribución por proyecto
📋 Fase 9: Change Orders y flujo de caja
📋 Fase 10: PWA móvil con soporte offline para el Capataz
```
