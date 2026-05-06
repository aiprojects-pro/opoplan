# OpoPlan v2

Plataforma multi-tenant de preparación de oposiciones. Cada academia (organización) tiene su propio entorno personalizable con marca, datos fiscales, integraciones y planes de suscripción. La plataforma se gestiona globalmente por el rol `superadmin`.

## Arquitectura

```
opoplan-v2/
├── server.js              # Express, monta rutas y servicios + scheduler
├── data/app-data.json     # Base de datos JSON (multi-tenant)
├── uploads/               # Storage local de fallback
├── public/                # SPA vanilla JS
│   ├── index.html
│   ├── styles.css
│   ├── api.js             # Cliente HTTP
│   ├── ui.js              # Toast, modal, helpers, branding
│   ├── calendar.js        # Componente calendario mensual reusable
│   ├── login.js           # Login con selector de academia
│   ├── super.js           # Vista super-administrador
│   ├── admin.js           # Vista admin academia
│   ├── preparador.js      # Vista preparador (agenda, disponibilidad, reservas)
│   ├── opositor.js        # Vista opositor (semana visual, agenda, reservar)
│   └── app.js             # Orquestador
└── src/
    ├── lib/
    │   ├── db.js          # Acceso a datos JSON (sustituible por SQL)
    │   ├── seed.js        # Datos semilla
    │   ├── replan.js      # Motor de recálculo de planes
    │   ├── recurrence.js  # Expansión de eventos recurrentes
    │   ├── scheduler.js   # Recordatorios automáticos (24h y 1h antes)
    │   └── constants.js   # Tipos de pruebas, categorías de materiales
    ├── middleware/auth.js # Sesiones por cookie firmada
    ├── routes/            # Endpoints API agrupados por dominio
    │   ├── auth.js        # Login, logout, sesión
    │   ├── superadmin.js  # Gestión de plataforma
    │   ├── admin.js       # Gestión de academia
    │   ├── files.js       # Subida y descarga de archivos
    │   ├── common.js      # Eventos, disponibilidad, reservas, avisos
    │   ├── roles.js       # Dashboards de preparador y opositor
    │   ├── syllabi.js     # Temarios con adjuntos PDF/audio/vídeo
    │   ├── materials.js   # Biblioteca con visibilidad y tracking
    │   ├── corrections.js # Ejercicios con rúbrica y entrega
    │   ├── assessments.js # Pruebas (8 tipos: test/supuesto/.../física/idioma)
    │   ├── procedures.js  # Trámites con catálogo predefinido
    │   ├── chat.js        # Chatbot Gemini con supervisión del preparador
    │   ├── billing.js     # Stripe Checkout y suscripciones
    │   └── reports.js     # Informes con IA + heurística local
    └── services/          # Storage, email, IA, pagos, notificaciones
        ├── storage.js     # Local | Cloudflare R2 | AWS S3
        ├── email.js       # Mock | Resend | SMTP
        ├── ai.js          # Mock | Google Gemini
        ├── payments.js    # Mock | Stripe (sandbox)
        └── notifications.js # Plantillas HTML con branding por academia
```

### Roles

| Rol          | Alcance                         | Qué puede hacer                                                            |
| ------------ | ------------------------------- | -------------------------------------------------------------------------- |
| `superadmin` | Plataforma global               | Crear/editar academias, planes globales, ver métricas globales             |
| `admin`      | Una academia (organizationId)   | Personalizar marca, datos fiscales, integraciones, gestionar usuarios y planes propios |
| `preparador` | Una academia                    | Gestionar opositores asignados, temarios, tutorías                         |
| `opositor`   | Una academia                    | Su plan personalizado, agenda, materiales, hábitos                         |

### Multi-tenant

Toda la información (usuarios, planes, eventos, materiales, etc.) está marcada con `organizationId`. Las rutas filtran automáticamente por la organización del usuario autenticado. El super-admin puede inspeccionar cualquier academia pasando `?orgId=...`.

## Instalación

```bash
cd opoplan-v2
npm install
cp .env.example .env       # opcional — funciona sin .env
npm start
```

Abre `http://localhost:3000`.

## Configurar integraciones

El proyecto funciona en modo local/mock sin tocar nada (storage en disco, email a consola, IA simulada, pagos simulados). Para activar las versiones reales:

### Email — Resend (recomendado, free tier 3.000/mes)

```env
EMAIL_PROVIDER=resend
EMAIL_FROM="OpoPlan <noreply@opoplan.es>"
RESEND_API_KEY=re_xxxxxxxxxxxxxx
```

### Email — SMTP genérico

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-email@gmail.com
SMTP_PASSWORD=app-password
EMAIL_FROM="OpoPlan <tu-email@gmail.com>"
```

### Cloud storage — Cloudflare R2 (10 GB/mes gratis)

```env
STORAGE_PROVIDER=r2
STORAGE_BUCKET=opoplan-files
STORAGE_ENDPOINT=https://<account>.r2.cloudflarestorage.com
STORAGE_ACCESS_KEY_ID=...
STORAGE_SECRET_ACCESS_KEY=...
STORAGE_PUBLIC_URL=https://files.tu-dominio.com   # opcional
```

### IA — Google Gemini (free tier real)

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-1.5-flash
```

Obtén la API key gratis en `https://aistudio.google.com/apikey`.

### Pagos — Stripe sandbox

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Cada academia puede sobreescribir todas estas integraciones desde el panel de admin (Configuración → Integraciones).

## Estado del refactor

### ✅ Hecho

**Fase 1 (base multi-tenant):** refactor a Express modular, modelo de datos multi-tenant con `organizationId`, super-admin con dashboard global y gestión de academias y planes globales, admin de academia con personalización completa (marca con preview en vivo, datos fiscales, integraciones por tenant, planes propios y suscripciones, usuarios con activar/desactivar y carga de preparador, asignaciones con histórico). Login con selector de academia y pestañas independientes por rol. Servicios con interfaces idénticas para mock y real (Cloudflare R2/S3, Resend/SMTP, Gemini, Stripe).

**Fase 1.B (cierre Fase 1):**
- **Compromiso completo del opositor**: días activos vs descanso (toggle 3-estados), múltiples rangos de vacaciones, examName/examDate/horas semanales/horas diarias.
- **Recálculo automático del plan** (`src/lib/replan.js`) al guardar el compromiso: distribuye horas entre días elegibles, respeta restDays y vacaciones, asigna 60% estudio / 25% repaso / 15% simulacro, prioriza temas con mastery más bajo, conserva tareas completadas.
- **Vista semanal visual** (7 columnas): tareas con código de color por tipo, día actual destacado, días de descanso/vacaciones marcados visualmente, click en tarea abre modal de cumplimiento.
- **Cumplimiento por tarea** (`full` / `partial` / `none`) + observación con histórico — los textos quedan guardados para 2ª y 3ª vuelta de repaso.
- **Foto de perfil** subida al storage y asociada al usuario (Cloudflare R2 si configurado, local si no).
- **Edición de perfil** (nombre, teléfono, contraseña).
- **Recordatorios por email reales** (`src/services/notifications.js`) con plantillas HTML aplicando el branding de cada academia. Plantillas: `welcome`, `assignment`, `eventReminder`, `announcement`. Cada envío queda registrado en `notifications` para auditoría. Se envían automáticamente al crear usuarios, asignar opositores, crear eventos con destinatarios y publicar avisos.

**Fase 2 — Agenda y tutorías reservables:**
- **Calendario mensual interactivo** (componente `calendar.js`) reusable para preparador y opositor: navegación de mes, ocurrencias coloreadas por tipo (tutoría/llamada/tarea/aviso), día actual destacado, click en evento para ver/editar.
- **Eventos con recurrencia** (`src/lib/recurrence.js`): expansión `weekly` / `biweekly` / `monthly`, fecha límite opcional (`recurrenceUntil`), excepciones por fecha (`recurrenceExceptions`).
- **Edición y borrado por ámbito**: `?scope=this` crea un override para esa ocurrencia (mantiene el resto), `?scope=all` modifica el maestro. UI con tres botones: "Solo este día" / "Todos" / "Borrar este día".
- **Multidestinatarios**: chips seleccionables (preparadores y opositores de la academia). Al guardar se manda email a todos los destinatarios.
- **Disponibilidad publicable** (`/availability`): el preparador define huecos recurrentes (día de la semana + hora + duración + frecuencia + fecha límite). El opositor ve solo la disponibilidad de su preparador asignado.
- **Reserva de tutoría** (`/bookings`): el opositor pulsa un hueco y se crea una reserva confirmada y un evento en la agenda de ambos. Doble reserva bloqueada con `already_booked`. Cancelación posible por opositor o preparador.
- **Recordatorios automáticos**: scheduler en proceso (`src/lib/scheduler.js`) que cada minuto detecta ocurrencias a 24h y 1h, envía email con plantilla `eventReminder` aplicando branding de la academia, y registra el envío para no duplicar (`remindersSent`).

**Fase 3 — Contenidos y evaluación:**
- **Adjuntos en temario**: cada tema admite múltiples archivos (PDF, audio, vídeo, imagen, documento) con drag-and-drop. Etiqueta personalizada y detección automática del tipo (icono y categoría visual). El opositor ve los adjuntos del temario de su preparador asignado con enlace directo de descarga.
- **Biblioteca clasificada**: 5 categorías (📘 temario oficial, 📙 complementario, 📝 exámenes y simulacros, 📅 planificación, 📄 plantillas) con barra de filtros. Cada material tiene **visibilidad** `all` (todos los opositores) o `specific` (chips para seleccionar destinatarios). Status `compartido` / `borrador`.
- **Tracking de descargas**: contador `downloads` y array `viewedBy` que se actualizan cuando un opositor pulsa "Descargar". El preparador ve los datos en su panel.
- **Correcciones con rúbrica**: el preparador asigna un ejercicio con rúbrica editable (criterios + pesos en % + nota máxima por criterio). El opositor entrega un archivo (con notas opcionales). El preparador puntúa cada criterio y deja feedback general. La **nota total ponderada se calcula automáticamente sobre 10**. Estados: `pendiente` → `entregado` → `corregido`, con opción de **reabrir** para nueva entrega.
- **Tipos de pruebas ampliados**: 8 tipos disponibles (test, supuesto práctico, oral, desarrollo escrito, psicotécnico, mecanografía, **física**, **idioma**). Filtros por categoría en la vista del opositor.
- **Avisos automáticos por email** en cada paso: nuevo ejercicio asignado, entrega recibida, corrección lista, ejercicio reabierto.

**Fase 4 — Inteligencia, trámites y monetización:**
- **Catálogo de trámites** predefinido con 9 trámites administrativos típicos (instancia, pago de tasas, subsanación, certificado médico, antecedentes, titulación, declaración responsable, presentación al examen, consulta de tribunal). El opositor "instala" los que necesita y luego edita estado, fecha límite y notas. También puede crear trámites personalizados.
- **Tarea recurrente automática "Revisar BOE"**: cada viernes 13:00–14:00 generada al crear un opositor (y para los opositores de la semilla). Modificable o eliminable desde la agenda.
- **Chatbot Gemini por opositor con validación previa del preparador**: el preparador activa o desactiva el asistente por opositor (`chatbotEnabled`). Cuando está desactivado, el opositor ve un aviso. Cuando está activo, el opositor crea hilos de conversación y dialoga con el bot. **El preparador puede ver todas las conversaciones** desde su panel de "Chats IA" (modo lectura). Si Gemini no está configurado, se usa mock con aviso. Configurable a nivel de academia (`organizations.integrations.ai`).
- **Stripe Checkout sandbox**: planes globales (Free, Premium, Premium+tutorías) y planes propios de academia. El opositor selecciona un plan y se le crea sesión de Checkout. Sin claves Stripe, modo mock con confirmación inmediata. Con claves, redirección real y webhook. Cancelación de suscripción desde el panel.
- **Informes con IA**: el preparador pulsa "Generar informe" sobre un opositor y recibe un análisis estructurado con fortalezas, áreas de mejora y recomendaciones concretas. Combina **heurística local** (siempre disponible: media de notas, cumplimiento del plan, dominio por tema) + **análisis Gemini** opcional. Resultado en markdown.
- **Recálculo adaptativo según resultados de pruebas**: el motor `replan.js` lee los últimos 5 `assessments` del opositor y, si en un tema hay nota baja (<50%), penaliza el dominio efectivo de los temas relacionados (-25% para nota muy baja, -10% para mejorable). El plan da entonces más peso a los temas flojos en próximas iteraciones.
- **Mini-gráficas SVG**: el dashboard del preparador muestra dominio medio por opositor y reparto por especialidad. El dashboard del opositor muestra evolución de notas en línea (con umbral del aprobado) y reparto de pruebas por tipo en barras.

---

### 🚧 Pendiente — siguientes turnos

Funcionalidad completa entregada en las 4 fases. Para producción quedaría:
- Migración de BD JSON → PostgreSQL/SQLite (manteniendo la API de `src/lib/db.js`)
- Suite de tests automatizados
- Despliegue en Cloudflare/Fly.io con DNS personalizado por academia (subdominio)
- Procesamiento background con BullMQ para emails y webhooks de Stripe
- App móvil (PWA o nativa) para opositores

## Notas técnicas

- **Sesiones**: cookie firmada con HMAC. Para producción se puede migrar a JWT o `express-session` + Redis.
- **DB**: por simplicidad usamos un único JSON. Cuando crezca, migrar a SQLite/Postgres es un cambio aislado en `src/lib/db.js`.
- **Seguridad**: las contraseñas se almacenan como SHA-256 con prefijo (suficiente para MVP). Migrar a `bcrypt` antes de producción.
- **Webhooks Stripe**: el endpoint `/api/billing/webhook` recibe el body crudo (necesario para verificar la firma) — no mover de su posición en `server.js`.
- **Branding por academia**: el admin guarda los colores y el frontend inyecta variables CSS (`--brand`, `--brand-dark`, `--accent`) que se aplican a toda la UI sin recargar.

## Licencia

Propietaria — uso interno OpoPlan.
