# syntax=docker/dockerfile:1.7

# ---------- Stage 1: build everything ----------
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/host/package.json packages/host/
COPY packages/controller/package.json packages/controller/

RUN npm ci

COPY packages/shared packages/shared
COPY packages/server packages/server
COPY packages/host packages/host
COPY packages/controller packages/controller

RUN npm run build:shared \
 && npm run build -w @igra/server \
 && npm run build -w @igra/host \
 && npm run build -w @igra/controller

# ---------- Stage 2: production runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/

# Install only runtime deps for server + shared. Host/controller are static
# bundles at this point and need no node_modules.
RUN npm ci --omit=dev -w @igra/server -w @igra/shared

COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/host/dist packages/host/dist
COPY --from=builder /app/packages/controller/dist packages/controller/dist

# Server's own static assets (the admin geo-map image served at
# /admin/serbia-map.png and the brand favicons). Resolved at runtime relative
# to dist/ as ../assets, so this dir MUST ship alongside dist or the admin
# editor's Serbia map and the landing/admin favicons 404 in production.
COPY --from=builder /app/packages/server/assets packages/server/assets

# Baked-in default content ("seed"). The live copy lives on the persistent
# volume at DATA_DIR (/data) — on first boot the server copies any missing
# pack dir from here, so edits survive image rebuilds. This dir also powers
# the admin "factory reset".
COPY question-packs     ./seed/question-packs
COPY ko-sam-ja-packs    ./seed/ko-sam-ja-packs
COPY tajni-agenti-packs ./seed/tajni-agenti-packs
COPY gluvo-doba-packs   ./seed/gluvo-doba-packs
COPY spijun-packs       ./seed/spijun-packs
COPY asocijacije-packs  ./seed/asocijacije-packs
COPY fibbage-packs      ./seed/fibbage-packs
COPY bitka-maps         ./seed/bitka-maps

ENV PORT=3001
ENV SAME_ORIGIN_DEPLOY=true
# Daily-rolling JSON logs for Grafana/Loki. Mount the host log dir at
# /storage/logs (docker-compose volume or a Coolify storage mapping) so the
# files persist and a Loki collector can tail them. See logger.ts.
ENV LOG_DIR=/storage/logs
ENV LOG_RETENTION_DAYS=7
# Persist editable content on a volume mounted at /data, seeded from /app/seed.
# Mount a volume at /data (docker-compose / Coolify) or these live in the
# ephemeral container layer (still functional, just not persistent).
ENV DATA_DIR=/data
ENV SEED_DIR=/app/seed
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "packages/server/dist/index.js"]
