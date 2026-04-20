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
COPY question-packs ./question-packs

ENV PORT=3001
ENV SAME_ORIGIN_DEPLOY=true
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "packages/server/dist/index.js"]
