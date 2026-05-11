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
    │   ├── superadmin.js  # Gestión de plataforma (línea de planes, file uploads)
    │   ├── admin.js       # Gestión de academia (NPS, CSV bulk, toggle planes globales)
    │   ├── files.js       # Subida y descarga de archivos
    │   ├── common.js      # Eventos, disponibilidad multi-día, reservas con regla 48h
    │   ├── roles.js       # Dashboards de preparador y opositor + ver compromiso
    │   ├── syllabi.js     # Temarios con adjuntos PDF/audio/vídeo
    │   ├── materials.js   # Biblioteca con visibilidad y tracking
    │   ├── corrections.js # Ejercicios con rúbrica + adjuntos a instrucciones
    │   ├── assessments.js # Pruebas (8 tipos: test/supuesto/.../física/idioma)
    │   ├── procedures.js  # Trámites con catálogo + registro de presentación
    │   ├── chat.js        # Chatbot multi-modo (off/supervised/auto_general/auto_full)
    │   ├── processes.js   # ⭐ Procesos selectivos del preparador (con cuotas)
    │   ├── aiTools.js     # ⭐ Generación tests/resúmenes/mapas con IA personal
    │   ├── nps.js         # ⭐ Encuesta NPS (clásica/extendida + cooldown)
    │   ├── challenges.js  # ⭐ Retos y rankings con opt-in
    │   ├── billing.js     # Stripe Checkout y suscripciones
    │   └── reports.js     # Informes con IA + heurística local
    └── services/          # Storage, email, IA, pagos, notificaciones
        ├── storage.js     # Local | Cloudflare R2 | AWS S3
        ├── email.js       # Mock | Resend | SMTP
        ├── ai.js          # Mock | Gemini | OpenAI | Anthropic (multi-proveedor)
        ├── payments.js    # Mock | Stripe (sandbox)
        └── notifications.js # 11 plantillas HTML con branding por academia
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

### Videoconferencia — Jitsi (recomendado, sin claves)

```env
VIDEOCONFERENCE_PROVIDER=jitsi
# Opcional: si tienes instancia auto-hospedada
VIDEOCONFERENCE_ACCOUNT_ID=meet.mi-academia.es
```

Con Jitsi público (`meet.jit.si`) funciona out-of-the-box sin registrarse en nada. Cada reserva genera una URL única.

### Videoconferencia — Zoom (Server-to-Server OAuth)

En [marketplace.zoom.us](https://marketplace.zoom.us/) crea una app tipo "Server-to-Server OAuth" con scopes `meeting:write:meeting:admin` y `user:read:user:admin`.

```env
VIDEOCONFERENCE_PROVIDER=zoom
VIDEOCONFERENCE_ACCOUNT_ID=tu-account-id
VIDEOCONFERENCE_API_KEY=tu-client-id
VIDEOCONFERENCE_CLIENT_SECRET=tu-client-secret
```

### Videoconferencia — Google Meet

Requiere un proyecto en [Google Cloud Console](https://console.cloud.google.com/) con la Google Calendar API activada y un OAuth2 Client ID. Necesitas un `refresh_token` del organizador (con scope `https://www.googleapis.com/auth/calendar.events`).

```env
VIDEOCONFERENCE_PROVIDER=meet
VIDEOCONFERENCE_API_KEY=tu-client-id.apps.googleusercontent.com
VIDEOCONFERENCE_CLIENT_SECRET=tu-client-secret
VIDEOCONFERENCE_REFRESH_TOKEN=1//0g...
```

### Videoconferencia — Microsoft Teams

App registrada en [Azure AD](https://portal.azure.com/) con permiso `OnlineMeetings.ReadWrite`. Necesitas un `refresh_token` con dicho scope.

```env
VIDEOCONFERENCE_PROVIDER=teams
VIDEOCONFERENCE_ACCOUNT_ID=tu-tenant-id
VIDEOCONFERENCE_API_KEY=tu-app-client-id
VIDEOCONFERENCE_CLIENT_SECRET=tu-client-secret
VIDEOCONFERENCE_REFRESH_TOKEN=...
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

**Fase 5 — Mejoras desde la revisión con cliente (transcripción de mayo 2026):**

*Bugs corregidos:*
- 🐞 **Dashboard superadmin** ahora cuenta admin como cuenta activa (`totalActiveAccounts = subs + organizations activas`).
- 🐞 **Chat IA** corregido: la activación del chatbot por opositor ya no se rompía si el preparador no había configurado modo. Ahora respeta el modo del preparador.
- 🐞 **Cancelación de tutorías** una a una: la lista de reservas siempre muestra confirmación individual; no hay cancelación masiva accidental.

*Superadmin:*
- **Subida directa de logos y favicon** desde el modal de creación de academia (drop-zones que suben al storage configurado).
- **Tipos de cuenta**: academia, preparador independiente, universidad/EBAU.
- **Líneas de planes**: oposiciones, universidad, EBAU, preparador independiente. Filtro por línea en el catálogo.
- **Badge de suscriptores activos** por plan + protección al borrar planes con suscriptores (HTTP 409 con `?force=true` para forzar).
- **Cuotas en planes de preparador** (`maxOpositores`, `maxProcesses`) — el backend valida al crear procesos.

*Admin (academia):*
- **Botón de configuración arriba** en el sidebar (acceso rápido).
- **Configuración reorganizada en 9 pestañas**: Marca · Contacto · Datos fiscales · Email/Moodle · Pagos (Stripe + Redsys) · Almacenamiento e IA · **Videoconferencia (Jitsi / Zoom / Meet / Teams con servicio backend real)** · Avisos por defecto · Legal.
- **Toggle por academia para activar/ocultar planes globales** (`globalPlanOverrides`).
- **Carga masiva CSV de opositores** (`POST /api/admin/users/bulk` con `csv` o `rows`). Si el CSV no incluye contraseña, **se genera una temporal aleatoria de 12 caracteres** y se envía al alumno por email con plantilla `welcomeWithCredentials` + flag `mustChangePassword: true` para invitarle a cambiarla en el primer acceso.
- **Encuesta NPS configurable**: dos plantillas (clásica y extendida), periodo de cooldown configurable, panel de resultados con score, % promotores/pasivos/detractores. Envío manual a la audiencia (todos / inscritos recientes).
- **Avisos por defecto a nivel de academia**: presets de inactividad (intensivo 2d / normal 7d / tranquilo 15d / off), aviso al preparador por compromiso roto (días seguidos configurable), aviso al opositor por tutoría mensual sin consumir.

*Preparador:*
- **Múltiples procesos selectivos** (`/api/processes`): el preparador puede gestionar varias convocatorias en paralelo, cada opositor asignado a un proceso. Validación de cuota contra el plan del preparador.
- **Cuatro modos de chatbot** configurables por preparador:
  - `off` — sin IA, todo manual.
  - `supervised` — la IA propone, el preparador aprueba.
  - `auto_general` — la IA contesta dudas generales; las específicas del temario van al preparador.
  - `auto_full` — la IA contesta todo; solo se avisa al preparador de las críticas.
- **Avisos automáticos por opositor según fecha de examen**: el preparador elige el preset de inactividad (2d / 7d / 15d / off).
- **Email automático cuando un opositor rompe el compromiso** N días seguidos (configurable, por defecto 3).
- **Email automático cuando un opositor no consume su tutoría mensual** del plan (último día del mes).
- **Vista del compromiso del opositor**: estado actual del cumplimiento, racha sin cumplir, registro de últimos 7 días, datos del compromiso declarado.
- **Adjuntos en instrucciones de ejercicios** (`instructionFileIds`): se envían junto al enunciado al opositor.
- **Retos / rankings con opt-in del opositor**: el preparador crea retos cronometrados (preguntas en JSON), el opositor solo participa si activó la opción en su perfil. Ranking por mejor intento, bonus por velocidad.
- **48 h de antelación obligatoria para que el opositor cancele tutoría** (admin y preparador pueden saltar la regla). HTTP 409 con `cancel_window_closed`.
- **Email automático al preparador cuando un opositor reserva tutoría** (plantilla `bookingCreated`).
- **Disponibilidad multi-día**: una sola publicación crea huecos en varios días con el mismo horario (`dayOfWeeks: [1,2,3]`).
- **IA personal del preparador**: puede conectar su propia API (Gemini, OpenAI o Anthropic) que se usará en sus respuestas en lugar de la de la academia. El coste lo asume el preparador.

*Opositor:*
- **Reorden del sidebar**: Perfil → Suscripción → Compromiso, con secciones nuevas (Herramientas IA, Retos, Encuesta).
- **WhatsApp con opt-in** explícito en el perfil.
- **Diferenciación visual por rol**: cada rol tiene su gradiente y badge en el sidebar (super morado, admin azul, preparador verde, opositor dorado).
- **IA personal conectable** (Claude / ChatGPT / Gemini): el opositor pone su API key y la usa para sus generaciones. **El coste lo asume el opositor**, no la academia.
- **Dos temarios**: el de la academia (publicado por su preparador) y el suyo propio (`/api/ai/personal-syllabus`) — pueden generar contenido sobre cualquiera de los dos.
- **Generación con IA personal**: tests (3 o 4 opciones), resúmenes en dos modos (**conciso** ideal tipo test, **desarrollado** para oposición de desarrollo), y mapas conceptuales en árbol. **Sin flashcards** (decisión explícita).
- **Historial de generaciones** (`aiArtifacts`) con borrado individual.
- **Trámites con registro de presentación**: cada trámite admite un registro de documentos presentados con fecha y nota libre (e.g. "Sede electrónica n.º 12345"). Sirve como prueba si lo piden más tarde.
- **Reservar tutoría desde la agenda**: panel lateral con próximos huecos libres del preparador asignado, botón directo de reserva.
- **Encuesta NPS** del opositor: si la academia tiene la encuesta activa y no respondió en el cooldown, le aparece la pestaña con la pregunta principal (0-10) más sub-preguntas y comentario libre.

*Backend técnico de Fase 5:*
- Nuevas colecciones en el modelo: `processes`, `personalSyllabi`, `challenges`, `challengeAttempts`, `npsResponses`, `aiArtifacts`, `activityLog`.
- Nuevas rutas: `processes.js`, `aiTools.js`, `nps.js`, `challenges.js`.
- Activity log automático en `middleware/auth.js` (rate-limited a 1/h por usuario opositor) — base para el aviso de inactividad.
- Scheduler ampliado con tres tareas diarias (a las 09:00): inactividad, compromiso roto, tutoría no consumida.
- Servicio de IA multi-proveedor: `makeGemini`, `makeOpenAI`, `makeAnthropic`. Cadena de prioridad: usuario → academia → ENV → mock.
- 7 plantillas de email nuevas: `bookingCreated`, `bookingCancelled`, `inactivity`, `brokenCommitment`, `unconsumedTutoring`, `npsInvite`, `rankingResult`.

> ⚠️ **Migración**: tras actualizar a Fase 5, **borra `data/app-data.json`** para regenerar el seed con los nuevos campos (planes con `line` y `quota`, organizaciones con `type` / `nps` / `defaults`, usuarios con `whatsapp` / `chatbotMode` / `inactivitySettings` / `ai`). Si tu instalación tenía datos reales, ejecuta primero un script de migración manual o alinea el JSON al nuevo esquema (campos nuevos son aditivos y opcionales, no rompen nada).

---

### 🚧 Pendiente — siguientes turnos

Funcionalidad completa entregada en las 5 fases. Para producción quedaría:
- Migración de BD JSON → PostgreSQL/SQLite (manteniendo la API de `src/lib/db.js`)
- Suite de tests automatizados
- Despliegue en Cloudflare/Fly.io con DNS personalizado por academia (subdominio)
- Procesamiento background con BullMQ para emails y webhooks de Stripe
- App móvil (PWA o nativa) para opositores

## Notas técnicas

- **Sesiones**: cookie firmada con HMAC. Para producción se puede migrar a JWT o `express-session` + Redis.
- **DB**: por simplicidad usamos un único JSON. Cuando crezca, migrar a SQLite/Postgres es un cambio aislado en `src/lib/db.js`.
- **Contraseñas**: bcrypt (`bcryptjs`, 10 rounds por defecto, configurable con `BCRYPT_ROUNDS`). El sistema mantiene compatibilidad con el formato antiguo SHA-256: cuando un usuario con hash heredado hace login con su contraseña correcta, el servidor lo re-hashea con bcrypt y lo persiste en la misma petición — migración transparente sin intervención del usuario.
- **Webhooks Stripe**: el endpoint `/api/billing/webhook` recibe el body crudo (necesario para verificar la firma) — no mover de su posición en `server.js`.
- **Branding por academia**: el admin guarda los colores y el frontend inyecta variables CSS (`--brand`, `--brand-dark`, `--accent`) que se aplican a toda la UI sin recargar.

## Licencia

Propietaria — uso interno OpoPlan.
