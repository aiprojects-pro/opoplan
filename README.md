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

## Propuesta de precios (3 paquetes por rol)

Tres paquetes para cada uno de los tres roles. La cadena de IA es opcional en los tres niveles: el opositor o el preparador puede conectar su propia API key (Gemini/OpenAI/Anthropic) y asume el coste de su uso; si no la conecta, hereda la de su academia; si la academia tampoco la tiene activada, se usa la de la plataforma o un mock.

### Opositor individual (B2C)

| Plan | Precio | Para quién | Incluye |
| --- | ---: | --- | --- |
| **Free** | 0 € | Probar la plataforma | Plan básico, agenda, 1 simulacro/mes, 5 temas propios, comunidad. IA opcional con tu API key. |
| **Pro** | 14,99 €/mes | Opositor autodidacta | Plan adaptativo, simulacros ilimitados, generación IA (tests / resúmenes conciso o desarrollado / mapas), asistente IA 24/7, trámites, retos. |
| **Pro + Tutorías** | 39,99 €/mes | Con seguimiento humano | Todo Pro + 2 tutorías de 30 min/mes con preparador asignado, correcciones personalizadas, informes mensuales. |

Trial de 14 días en Pro y Pro+Tutorías. Líneas adicionales `EBAU` y `Universidad` a 9,99 €/mes.

### Preparador independiente

| Plan | Precio | Cuotas | Notas |
| --- | ---: | --- | --- |
| **Solo** | 29 €/mes (o 290 €/año) | 5 opositores · 1 proceso | Marca personal, IA opcional con su API key, soporte por email. |
| **Pro** | 79 €/mes (o 790 €/año) | 20 opositores · 3 procesos | Branding completo, carga masiva CSV, retos, chatbot con 4 modos. |
| **Business** | 149 €/mes (o 1.490 €/año) | 50 opositores · 10 procesos | Subdominio propio, informes automáticos, NPS a sus alumnos, videoconferencia integrada, API Moodle. |

Trial 30 días en Solo, 14 días en los demás.

### Academia (B2B)

| Plan | Precio | Cuotas | Notas |
| --- | ---: | --- | --- |
| **Starter** | 199 €/mes (o 1.990 €/año) | 3 preparadores · 100 opositores · 5 procesos | Branding básico, NPS, Jitsi, email/storage del sistema. IA opcional. |
| **Growth** | 499 €/mes (o 4.990 €/año) | 10 preparadores · 500 opositores · 20 procesos | Subdominio + branding completo, Moodle, Stripe Checkout propio, Zoom/Meet/Teams con sus credenciales, S3/R2 propio, SMTP propio. |
| **Enterprise** | 1.299 €/mes (o 12.990 €/año) | Ilimitado | White-label / reseller, IA premium centralizada, API completa, auditoría inicial de apuntes, SLA 99,9 %, soporte 24h. |

Trial de 30 días en Starter. Enterprise sin trial (contrato comercial).

### Política de IA y costes

- La IA es **opcional en los tres niveles**. Cada uno puede conectar la suya (Gemini, OpenAI o Anthropic) o heredar la del nivel superior.
- Cuando un opositor conecta su API personal (Pro / Pro+Tutorías), **el coste de cada generación se carga a su cuenta** y no a la academia.
- En el plan Enterprise de academia, se ofrece IA premium centralizada para sus opositores: la academia paga el consumo, sus alumnos no necesitan API key.
- En todos los planes B2C/B2B, el cobro funciona con suscripción mensual recurrente (Stripe sandbox por ahora) y se puede cancelar desde el panel del usuario.

### Catálogo extendido (servicios mencionados, propuestos para fases siguientes)

Estos servicios figuran en el catálogo de referencia pero no están implementados todavía. Cuando se prioricen, encajan en los planes así:

- **Generador IA con dificultad calibrada y modo anti-reciclado** (catálogo §A.1 ampliado): se acopla al `Generador de tests` actual sin tocar precios; sale en plan Pro/Business del preparador y Growth/Enterprise de academia.
- **Monitor normativo automatizado** (§A.2): add-on independiente, 99–499 €/mes adicionales según el número de oposiciones monitorizadas.
- **Dashboard analítico pedagógico** (§A.3 — mapa de calor, distractor dominante, ROI por tema): incluido en Growth y Enterprise; add-on separado para Starter.
- **Detección temprana de abandono con scoring 0-100** (§A.4): incluido en Growth y Enterprise.
### Catálogo extendido — Fase 6 (implementado)

Los 7 servicios siguientes están implementados sobre la plataforma. Cada uno indica qué parte funciona con datos reales del sistema y qué parte es scaffold listo para enchufar a un servicio externo.

#### 1. Dashboard analítico pedagógico (catálogo §A.3)

**Real:** mapa de calor del temario por tasa de acierto, ranking de preguntas más falladas con distractor dominante, comparativa entre preparadores de la misma academia, rendimiento individual con tendencia (regresión lineal sobre últimos 5 simulacros) y calibración (¿declara confianza acertada?). Endpoints: `GET /api/analytics/heatmap`, `/most-failed`, `/group-comparison`, `/opositor/:id/performance`. UI: pestaña "Analítica pedagógica" del admin.

#### 2. Detección temprana de abandono (catálogo §A.4)

**Real:** scoring 0-100 por opositor combinando inactividad (`activityLog`), tendencia descendente en últimos 3 simulacros, racha de días sin cumplir compromiso y nivel de estrés reciente. Niveles `low / low_medium / medium / high` con acción sugerida automática (email automático, alerta a tutor con guion, llamada). Endpoint: `GET /api/analytics/abandon-risk`. UI: en la misma pestaña de Analítica.

#### 3. Predictor de fecha óptima (catálogo §B.3)

**Real:** regresión lineal sobre los últimos 8 simulacros, proyección al umbral configurable (5,0 por defecto), distribución normal acumulada para calcular probabilidad de aprobar hoy y en la fecha de examen. Brecha por tema con ROI = brecha × peso. Endpoints: `GET /api/predictor/forecast`, `/predictor/gap`. UI: sección "Predictor" del opositor.

**Limitaciones declaradas:** modelo intencionadamente sencillo. La probabilidad asume distribución normal de la nota; con muestras pequeñas (<5 simulacros) el resultado es orientativo. La ponderación por tema asume peso uniforme — en producción se carga del proceso o de exámenes históricos reales.

#### 4. Monitor normativo (catálogo §A.2)

**Scaffold + datos de muestra:** modelo `normativeAlerts` con niveles `critical / important / informative`, cruce contra `topicIds` y `questionIds`, diff visible y acciones (descartar / resolver). El servicio `normativeMonitor.js` expone `fromEnv()` con dos providers: `mock` (devuelve sin operación, usado por defecto) y `boe` (estructura lista para conectar al feed JSON oficial del BOE — `https://www.boe.es/datosabiertos/api/...`). En modo demo, el superadmin puede generar alertas sintéticas con `POST /api/normative/synthetic`.

**Para activar el feed real**: implementar el `runOnce()` del provider BOE iterando sobre el feed de identificadores y comparando con `questionBank.norm`. Cada CCAA requiere su propio adaptador (BOJA, DOGC, BOPV…).

#### 5. Marketplace B2B de bancos de preguntas (catálogo §A.8)

**Real:** modelo `marketplacePacks` y `marketplacePurchases`, filtros por categoría/oposición/certificación/búsqueda, listado de packs propios con estadísticas de ventas, comisión 18 % calculada sobre cada venta. La compra copia las preguntas del pack al `questionBank` de la academia compradora. Endpoints: `GET /api/marketplace/packs`, `/my-listings`, `/my-purchases`; `POST /api/marketplace/listings`, `/buy/:id`. UI: pestaña "Marketplace" del admin.

**No implementado:** flujo de pago entre dos academias. Requiere Stripe Connect (cuentas conectadas, transferencias platform-fee con `application_fee_amount`). Las compras quedan en estado `paymentStatus: "pending_transfer"` hasta que se enchufe la pasarela.

#### 6. Bienestar y gestión del estrés (catálogo §B.7)

**Real:** cuestionario semanal de estrés (5 ítems calibrados sobre DASS-21 abreviado, escala 1-5), histograma de evolución, biblioteca de 5 micro-recursos (respiración 4-7-8, Pomodoro adaptado, rutina pre-examen, protocolo de bloqueo en pregunta, visualización), indicador de sostenibilidad calculado de horas/día + último estrés con consejo automático. Endpoints: `GET/POST /api/wellbeing/stress-check`, `/stress-history`, `/resources`, `/sustainability`. UI: sección "Bienestar" del opositor.

**No implementado:** audio TTS de los recursos (los `audioUrl` están vacíos), red de apoyo entre opositores, sesiones en directo con psicólogos.

#### 7. Simulacros con análisis cognitivo (catálogo §A.6, §B simulacros)

**Real:** flujo completo `begin → answer → finish` con métricas por pregunta: tiempo invertido en ms, nº de cambios de respuesta, nivel de confianza declarado (`sure / doubt / guess`), orden de resolución. Análisis post-simulacro con calibración (¿confía cuando acierta?), preguntas más lentas, mapa de vulnerabilidad (acierta pero con baja confianza o muchos cambios — riesgo bajo presión). Endpoints: `POST /api/simulacros/begin`, `/:id/answer`, `/:id/finish`; `GET /api/simulacros/mine`, `/:id/analysis`. UI: sección "Simulacro avanzado" del opositor con timer por pregunta y selector de confianza.

#### 8. Contenido multi-canal (catálogo §B.4)

**Real:** "Pregunta del día" estable por día (mismo seed para todos los opositores), generación server-side de PDF de repaso por tema (Markdown + HTML imprimible que el navegador exporta a PDF con su función nativa), tarjetas SVG 1080×1080 para compartir en redes con la marca de la academia. Endpoints: `GET /api/multichannel/daily-question`, `/study-recap?topicId=...`, `/share-card?qbId=...`.

**No implementado:** bot de Telegram (requiere `BOT_TOKEN` y webhook), Instagram Graph API, audio TTS, smartwatch (apps nativas).

### Catálogo extendido — Fase 6 ampliada (implementado)

Resto de servicios del catálogo. **B2B2C (A.10.2 Plan opositor empleado)** queda fuera por decisión de producto.

#### 9. Pendientes de la transcripción

- **Trámite "Día del examen"** (transcripción ~20:32): añadido al catálogo `PROCEDURE_CATALOG` con checklist de DNI, convocatoria, bolígrafos, agua, ruta. También se añadió `reclamacion` para recurso contra calificación.
- **Recordatorio periódico por proximidad de examen** (transcripción ~20:30): nuevo job `checkExamProximity` en `scheduler.js` que dispara emails con frecuencia adaptativa según la distancia al examen — cada 3 días si quedan <30, cada 7 si <90, cada 14 si <180. Plantilla `examProximity` en notifications con tres tonos (high/medium/low) según urgencia.
- **Informes automáticos programados** (transcripción ~20:15): cada `assignment` ahora tiene `reportSchedule: { enabled, frequency, lastSentAt }` con frecuencias `weekly | fortnightly | monthly`. El job `checkScheduledReports` recorre las asignaciones y envía un informe con datos reales (asistencias, simulacros, hábitos del periodo). Endpoint: `PATCH /api/preparador/assignments/:id/report-schedule`. **Real**, datos calculados; el contenido se genera por heurística local para no bloquear el cron con llamadas a IA.

También arreglado un bug en el job de inactividad: `INACTIVITY_PRESETS` se trataba como objeto cuando es array — ahora se busca por `id`.

#### 10. A.10.3 Certificación interna de nivel

**Real:** modelo `certificates` con verificación pública por código alfanumérico (formato `XXXX-XXXX`). Niveles configurables por academia (defaults: L1 con 3 simulacros ≥5,0; L2 con 6 ≥6,0; L3 con 10 ≥7,0; L4 con 15 ≥7,5). El opositor reclama el certificado cuando cumple criterio; se emite SVG 1240×877 con la marca de la academia y queda verificable. Endpoints: `GET /api/certifications/levels` (config), `/mine` (elegibilidad del opositor), `POST /api/certifications/issue/:levelId`, `GET /api/certifications/:id?code=XXX` (verificación pública), `/:id/render` (SVG). UI: pestaña "🎖️ Mis certificaciones" del opositor + sub-pestaña "Certificaciones" en Avanzado del admin.

#### 11. A.10.5 White-label de IA tutora

**Real:** la academia configura `tutorPersona` con `name`, `avatar` (emoji), `role` (especialidad), `tone`, `greeting` y `systemAddon` (instrucciones extra). El system prompt del chat usa esa persona; el endpoint `/api/chat/status` devuelve nombre, avatar y saludo para que el opositor vea "Carlos el tutor de Andalucía 👨‍🏫" en lugar de un genérico. UI: sub-pestaña "Tutor IA" en Avanzado del admin.

**Limitación:** el RAG sobre el corpus específico de la academia (que el catálogo describe en §A.10.5) requiere un servicio de indexación de los materiales propios. El modelo está preparado para enchufarlo (cuando se cargue, el `systemAddon` se enriquece con extractos relevantes), pero el indexador no está implementado.

#### 12. A.10.4 Simulacros interacadémicos

**Real:** modelo `alliances` con miembros, owner y pendientes; `crossSimulacros` que una academia publica al pool de la alianza. El admin puede crear alianza, invitar a otra academia por slug, aceptar invitaciones, salir, publicar simulacros propios. El opositor de cualquier academia miembro ve los simulacros del resto de academias en la alianza. Endpoints: `GET /api/alliances/mine`, `/invites`, `/simulacros`; `POST /api/alliances`, `/:id/invite`, `/:id/accept`, `/:id/leave`, `/:id/publish-simulacro`. UI: sub-pestaña "Alianzas" en Avanzado del admin.

**Limitación honesta:** el catálogo (§A.10.4) menciona "la plataforma gestiona la facturación entre academias" — eso requeriría Stripe Connect (cuentas conectadas, `application_fee_amount`). En MVP los simulacros entre aliados son sin coste; cuando se integre la pasarela, basta con añadir cobro y reparto sobre cada simulacro consumido.

#### 13. A.10.1 Seguro de convocatoria

**Real:** modelo `insurancePolicies` (que la academia define) y `insuranceEnrollments` (suscripción del opositor). Cada póliza tiene prima en %, condiciones (% del programa, % de simulacros, convocatorias presentadas) y beneficio (extensión gratuita o devolución parcial). El sistema calcula automáticamente la elegibilidad del opositor con `computeCompliance()` y permite reclamar el beneficio cuando se cumplen condiciones y no se ha aprobado. Las reclamaciones tienen ciclo `pending_review → approved | rejected` revisadas por admin. Endpoints: `GET /api/insurance/policies`, `/mine`; `POST /api/insurance/policies`, `/enroll`, `/enrollments/:id/register-attempt`, `/enrollments/:id/claim`. UI: sub-pestaña "Seguros" en Avanzado del admin.

**No implementado:**
- **Cálculo actuarial real**: el catálogo asume que "los alumnos que aprueban rápido subvencionan a los que tardan". Sin datos reales de aprobados/no aprobados a escala, no se puede calibrar. La plataforma deja la prima fijada por la academia.
- **Cobro de la prima**: las suscripciones quedan en `premiumStatus: "pending"` hasta que se conecte Stripe.
- **Alianza con aseguradora externa**: out of scope MVP.

#### 14. A.7 CRM especializado

**Real:** modelo `leads` con pipeline de 6 etapas (`lead → contacted → demo → negotiating → matriculated | lost`), tags libres para segmentación, histórico de eventos (creación, cambios de etapa, comentarios, conversión), búsqueda por texto/etapa/tag. Modelo `alumni` con testimonio, año, puesto, estado (`approved / in_position / ambassador`) y flag `offersMentoring`. Endpoint público `/api/crm/mentors` que el opositor consume desde la sección Comunidad. Endpoints: `GET /api/crm/leads`, `/alumni`, `/mentors`; `POST /api/crm/leads`, `/leads/:id/convert`, `/alumni`. UI: pestaña "📇 CRM y alumni" del admin con tres sub-pestañas.

**No implementado:** nurturing por email automático segmentado por etapa (las plantillas existen, falta el motor de campañas), integración con Mailchimp/HubSpot (out of scope MVP).

#### 15. A.9 Auditoría de apuntes

**Real (workflow):** modelo `auditRequests` con estados `requested → in_review → report_ready → delivered | cancelled`, comentarios bidireccionales (admin de academia ↔ superadmin de plataforma), ciclo de vida con histórico de eventos. El superadmin sube el informe final con discrepancias y preguntas afectadas. Endpoints: `GET /api/audits/mine`, `/all` (superadmin), `/statuses`; `POST /api/audits`, `/:id/comment`; `PATCH /api/audits/:id`. UI: sub-pestaña "Auditorías" en Avanzado del admin.

**Honestidad:** el análisis automático de discrepancias normativas es trabajo humano (posiblemente apoyado por una herramienta de IA con RAG sobre el corpus normativo). Este módulo solo gestiona el ciclo del servicio, no lo automatiza.

#### 16. B.5 Comunidad gamificada extendida

**Real:**
- **Rachas globales**: días consecutivos con actividad de estudio (sumando `habits` y tareas del plan completadas). Endpoint `/api/community/streak`. Tabla de clasificación opt-in con `profile.publicLeaderboard`.
- **Salas Pomodoro compartidas**: hasta 8 opositores con temporizador sincronizado (modos 25/5 y 50/10). El servidor avanza fases automáticamente cuando se consulta el estado, los clientes hacen polling cada 10 segundos. Endpoints: `GET/POST /api/community/study-rooms`, `/:id/state`, `/:id/join`, `/:id/leave`.
- **Modo duelo**: dos opositores se retan a 10 preguntas; gana el de más aciertos (desempate por tiempo). Endpoints: `/api/community/duels`, `/duels/:id/accept`, `/duels/:id/submit`. UI con flujo simple de `prompt()` para responder — versión cómoda con UI dedicada queda como mejora.
- **Foros**: hilos por etiqueta opcional, respuestas, autor con rol. Endpoints: `/api/community/forum/threads`.
- **Mentoring**: el opositor solicita sesión a un alumnus con `offersMentoring=true` desde la sub-pestaña Mentores. Endpoint: `POST /api/community/mentoring/request`.

UI: pestaña "👥 Comunidad" del opositor con cinco sub-pestañas (Mi racha, Salas Pomodoro, Duelos, Foro, Mentores).

**Limitación honesta:** las salas Pomodoro y duelos en tiempo real usan polling simple sobre HTTP, sin WebSockets. Funciona perfectamente para pequeños grupos pero no escala a cientos de salas concurrentes. Cuando crezca la base de usuarios, migrar a WebSocket o Server-Sent Events.



## Notas técnicas

- **Sesiones**: cookie firmada con HMAC. Para producción se puede migrar a JWT o `express-session` + Redis.
- **DB**: por simplicidad usamos un único JSON. Cuando crezca, migrar a SQLite/Postgres es un cambio aislado en `src/lib/db.js`.
- **Contraseñas**: bcrypt (`bcryptjs`, 10 rounds por defecto, configurable con `BCRYPT_ROUNDS`). El sistema mantiene compatibilidad con el formato antiguo SHA-256: cuando un usuario con hash heredado hace login con su contraseña correcta, el servidor lo re-hashea con bcrypt y lo persiste en la misma petición — migración transparente sin intervención del usuario.
- **Webhooks Stripe**: el endpoint `/api/billing/webhook` recibe el body crudo (necesario para verificar la firma) — no mover de su posición en `server.js`.
- **Branding por academia**: el admin guarda los colores y el frontend inyecta variables CSS (`--brand`, `--brand-dark`, `--accent`) que se aplican a toda la UI sin recargar.

## Infraestructura adicional (bloques de Fase 6 ampliada)

### Tests automatizados

Suite formal con `node --test`. Ejecutar `npm test` corre todo en serie (concurrencia 1 para evitar conflictos en la DB JSON compartida). Cubre auth, los 7 servicios de Fase 6, los 9 servicios de Fase 6 ampliada, Stripe Connect, RAG y Telegram (mock). 34 tests verdes al cierre. Helpers en `tests/helpers.js` arrancan el servidor en puerto aleatorio importando `server.js` exportado, hacen login con cookies persistentes y exponen `asAdmin/asLucia/asAlvaro/asPreparador/asSuperadmin`.

### Stripe Connect (catálogo §A.8 + §A.10.1)

Servicio dual `mock | stripe` en `src/services/paymentsConnect.js`. El mock auto-confirma PaymentIntents al crearlos para que la demo funcione end-to-end sin claves; el provider real usa la librería oficial `stripe` (cargada lazy). Activar con `STRIPE_CONNECT=stripe`, `STRIPE_SECRET_KEY=sk_…`, `STRIPE_WEBHOOK_SECRET=whsec_…`. Marketplace ya integra el provider: si la academia vendedora está onboardeada (status `active`) crea un PaymentIntent con `application_fee_amount` (18 % comisión); si no, la compra queda en `pending_transfer` para resolución manual.

### WebSocket realtime (catálogo §B.5)

`src/services/realtime.js` monta WS en path `/ws` sobre el mismo servidor HTTP. Autenticación por cookie de sesión. Canales seguros (`room:<id>`, `duel:<id>`, `org:<orgId>`) con `canSubscribe()` que verifica pertenencia. Eventos emitidos desde `community.js`: `member_joined`, `member_left`, `phase_changed`, `accepted`, `answer_submitted`, `finished`. Cliente en `public/realtime.js` con reconexión automática cada 5 s y fallback transparente a polling si la conexión falla — la app sigue funcionando sin WS.

### RAG sobre corpus propio (catálogo §A.10.5)

`src/lib/rag.js` con embedders `openai` (text-embedding-3-small), `gemini` (text-embedding-004) y `mock` (hash bag-of-words 64D L2-normalizado). Cadena de selección: usuario → academia → env → mock. Chunking por palabras (~200 con overlap 30). Vector store en `ragChunks` (memoria + persistido en JSON). `reindexOrg()` borra todos los chunks anteriores y regenera desde syllabi + questionBank + materials. `retrieve()` calcula cosine similarity contra el embedding de la query y devuelve top-K hits. El chat inyecta automáticamente los hits con score ≥ 0.4 en el system prompt antes del contexto del estudiante. Endpoints: `GET /api/rag/status`, `POST /api/rag/reindex`, `POST /api/rag/search`. Limitación: el vector store en memoria no escala más allá de ~10K chunks; cuando crezca, migrar a SQLite con la extensión `sqlite-vec` o a un vector store dedicado.

### Feed BOE real (catálogo §A.2)

Reescrito `src/services/normativeMonitor.js` con dos providers: `mock` (devuelve sin operación) y `boe` real que hace fetch al sumario diario del BOE Datos Abiertos (`https://boe.es/datosabiertos/api/boe/sumario/{YYYYMMDD}`) — endpoint público sin auth. Para cada disposición busca coincidencias contra `questionBank.norm` con heurística (título contiene la norma o tokens), genera alertas idempotentes con `externalId` (no se duplican). `levelFor()` asigna `important` a Sección I y `informative` al resto. Activación: `NORMATIVE_PROVIDER=boe`. El superadmin dispara `runOnce` con `POST /api/normative/run-once` (body: `{organizationId}`). Limitación: solo BOE; CCAA quedan como providers separados a añadir cuando se priorice.

### Telegram bot (catálogo §B.4)

`src/services/telegramBot.js` con doble factory `mock | real`. El real usa `fetch` directo a `https://api.telegram.org/bot{TOKEN}/{method}` (sin dependencia adicional). Comandos: `/start` genera código de 8 dígitos para vincular (caduca 10 min); `/preguntadia` envía pregunta del banco con seed por fecha y la respuesta como spoiler de MarkdownV2; `/miprogreso` muestra racha + media de simulacros; `/examen` cuenta días al examen con tip motivacional adaptativo; `/help`. El opositor introduce el código en `POST /api/telegram/confirm`. Activar con `TELEGRAM_BOT_TOKEN=…` y `TELEGRAM_WEBHOOK_SECRET=…` en `.env`; tras desplegar, `POST /api/telegram/setup-webhook` (solo superadmin) con la URL pública. Sin `BOT_TOKEN` el módulo se carga pero responde con `enabled: false` — los endpoints siguen montados sin fallar el arranque.

### TTS cliente con Web Speech API (catálogo §B.4)

`public/audio.js` con módulo `window.__audio` que envuelve `speechSynthesis` del navegador. Sin coste ni claves: funciona en Chrome, Edge, Safari y derivados. API mínima: `speak(text, opts)`, `pause()`, `resume()`, `stop()`, `isSpeaking()`, `list()`. Selección de voz preferida `es-ES` con fallback a cualquier `es-*` y luego default. Integrado en la biblioteca de bienestar: cada recurso muestra un botón "🔊 Escuchar" si el navegador soporta TTS. La pregunta del día puede leerse igual con un botón análogo (mismo patrón). Linux puede no traer voces es-ES por defecto — en ese caso la lista queda vacía y el botón se oculta.

### PWA + Web Push (sustituto honesto del smartwatch nativo)

Tres piezas:
1. **`public/manifest.webmanifest`** + `<link rel="manifest">` y `theme-color` en `index.html`. Cuando el usuario "Añade a pantalla de inicio" en su móvil, OpoPlan se instala como PWA en standalone.
2. **`public/sw.js`** registra cache estático de la app shell (cache-first para assets, network-only para `/api/`) y maneja eventos `push` y `notificationclick`.
3. **`src/routes/webpush.js`** + librería `web-push`. Genera VAPID keys al arrancar (configurables vía `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` para persistir entre reinicios). Endpoints: `GET /api/webpush/public-key`, `POST /api/webpush/subscribe`, `/unsubscribe`, `/test`. Cliente en `public/push.js` (`window.__push`) registra el SW, pide permiso y envía la suscripción al servidor.

El scheduler de proximidad de examen ya envía push además del email cuando hay suscripción activa. Honestidad: **no es Apple Watch nativo ni Wear OS app**, pero en la práctica una PWA instalada en móvil con permiso de notificaciones hace llegar los avisos al smartwatch del usuario a través del puente del smartphone.

### Instagram (catálogo §B.4) — no implementado

Decisión consciente: la integración con Instagram requiere registrar una app en Meta Developer Console, pasar **App Review** (proceso de aprobación que tarda semanas), tener una cuenta de Instagram Business verificada vinculada a una página de Facebook, y obtener un long-lived access token para cada cliente. Es un trabajo de integración + burocracia que bloquea durante semanas.

Lo que sí está preparado para cuando se priorice:
- El generador de SVG de "tarjeta para compartir" (`/api/multichannel/share-card?qbId=…`) ya produce el asset visual con la marca de la academia. Solo hay que convertirlo a JPEG (con `sharp`) y publicarlo vía Graph API.
- La estructura `src/services/instagramPublisher.js` se añadirá con doble provider `mock | meta` siguiendo el mismo patrón que Telegram y Stripe Connect.
- En `multichannel.js` ya hay un endpoint `POST /api/multichannel/publish-instagram?qbId=…` reservado mentalmente para enchufarlo en su día.

Mientras tanto, la academia puede descargar el SVG, convertirlo localmente y publicarlo manualmente desde Instagram Creator Studio o la app móvil — exactamente igual que cualquier otro contenido visual.

## Despliegue en producción

OpoPlan funciona en desarrollo con valores por defecto (mock providers, JSON en disco). Para producción hay cuatro cosas que **debes** configurar antes de servir tráfico real:

### 1. Variables de entorno obligatorias

```bash
NODE_ENV=production
SESSION_SECRET=<48 bytes hex aleatorios>
VAPID_PUBLIC_KEY=<generar con npm run gen-vapid>
VAPID_PRIVATE_KEY=<generar con npm run gen-vapid>
```

Genera un `SESSION_SECRET` fuerte con:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Genera las claves VAPID con:
```bash
npm run gen-vapid
# Copia las dos líneas resultantes a tu .env
```

OpoPlan **rehúsa arrancar** en producción si: (a) `SESSION_SECRET` es el de dev o tiene menos de 32 caracteres, (b) faltan las claves VAPID. Esto es deliberado: arrancar con esos valores comprometidos es peor que no arrancar.

### 2. Base de datos: migrar a SQLite

El JSON único es cómodo en desarrollo pero NO escala. Para producción:

```bash
# 1. Instalar la dependencia opcional
npm install better-sqlite3

# 2. Migrar el JSON existente a SQLite (idempotente, no destructivo)
npm run migrate-sqlite

# 3. Arrancar con el nuevo backend
OPOPLAN_DB=sqlite npm start
```

El JSON original queda intacto como backup. Si algo va mal, basta con quitar `OPOPLAN_DB=sqlite` para volver a JSON.

SQLite con WAL y `synchronous=NORMAL` soporta cómodamente decenas de miles de filas y centenares de usuarios concurrentes. Si crece más allá de eso, el siguiente paso natural es PostgreSQL — el contrato de `src/lib/db.js` se mantendría, solo cambiaría la implementación.

### 3. HTTPS + reverse proxy

OpoPlan no termina TLS por sí mismo: ponlo detrás de Caddy, nginx o un balanceador. Cuando `NODE_ENV=production`:

- Las cookies de sesión se marcan `Secure` (solo viajan por HTTPS)
- `app.set("trust proxy", 1)` se activa para que `req.ip` y `req.protocol` reflejen al cliente real
- El rate limiter por IP funciona correctamente

Ejemplo mínimo de `Caddyfile`:
```
opoplan.tu-dominio.com {
    reverse_proxy localhost:3000
}
```

Caddy gestiona Let's Encrypt automáticamente. Si usas nginx, asegúrate de enviar los headers `X-Forwarded-For`, `X-Forwarded-Proto` y `Host`.

### 4. Rate limiting

Activo por defecto en producción (deshabilitado en tests):

| Endpoint | Límite |
| --- | --- |
| `POST /api/auth/login` | 5 intentos / 15 min / IP |
| `POST /api/auth/register-opositor` | 10 / hora / IP |
| `/api/*` (general) | 200 / minuto / IP |
| Webhooks externos | 60 / minuto / IP |

Los límites se definen en `src/middleware/rateLimits.js`. Subirlos o bajarlos es trivial. Requiere `trust proxy` configurado (paso 3) — si no, la IP que ve el limiter es la del proxy y bloqueas a todo el mundo o a nadie.

### Checklist de pre-producción

```
[ ] NODE_ENV=production
[ ] SESSION_SECRET (≥32 chars, aleatorio)
[ ] VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (npm run gen-vapid)
[ ] BCRYPT_ROUNDS=12 (más fuerte que el default de 10)
[ ] OPOPLAN_DB=sqlite + npm run migrate-sqlite ejecutado
[ ] Reverse proxy HTTPS (Caddy/nginx) configurado
[ ] data/ con backup automático (la DB vive aquí)
[ ] uploads/ con backup automático (los archivos viven aquí)
[ ] Logs redirigidos (PM2, systemd, journalctl)
[ ] Email provider real (SMTP/Resend) si quieres avisos por email
[ ] Variables de proveedores externos si los usas: Stripe, Telegram, BOE, AI
```

## Licencia

Propietaria — uso interno OpoPlan.
