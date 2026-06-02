# syntax=docker/dockerfile:1.6

# ─── Stage 1: install production dependencies ───────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
# package-lock.json garantiza reproducibilidad. `npm ci --omit=dev` instala
# solo dependencias de producción (no necesitamos dev tooling en el runtime).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ─── Stage 2: runtime ───────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# Permisos compatibles con OpenShift SCC restricted-v2: el cluster asigna un
# UID aleatorio dentro de un rango por namespace, pero el GID siempre es 0
# (root group) como supplementary group. Por eso ponemos los archivos como
# `:0` (grupo root) con permisos rwX para grupo. En Docker plano sigue
# funcionando porque el proceso heredará un uid arbitrario y leerá/escribirá
# por gid 0.
ENV NODE_ENV=production
RUN mkdir -p /app/data /app/uploads \
 && chgrp -R 0 /app \
 && chmod -R g=u /app

COPY --chown=:0 --from=deps /app/node_modules ./node_modules
COPY --chown=:0 . .

# Permisos finales tras el COPY (puede sobreescribir lo de arriba).
RUN chgrp -R 0 /app && chmod -R g=u /app

# UID por defecto en Docker; OpenShift lo sobrescribirá con uno aleatorio.
USER 1001

EXPOSE 3000

# Health probe: /api/health responde con JSON sin auth.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:3000/api/health > /dev/null || exit 1

CMD ["node", "server.js"]
