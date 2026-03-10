# ─── Stage 1: Build Angular client ───────────────────────────────────────────
FROM node:20-alpine AS client-builder

WORKDIR /build

# Copy root workspace manifests
COPY package.json package-lock.json* ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Install all workspace deps
RUN npm ci

# Copy client source and build
COPY client/ ./client/
RUN npm run build --workspace=client


# ─── Stage 2: Build Fastify server ───────────────────────────────────────────
FROM node:20-alpine AS server-builder

WORKDIR /build

COPY package.json package-lock.json* ./
COPY client/package.json ./client/
COPY server/package.json ./server/

RUN npm ci

COPY server/ ./server/
RUN npm run build --workspace=server


# ─── Stage 3: Production runtime ─────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Non-root user
RUN addgroup -g 1001 -S dispatch && \
    adduser  -u 1001 -S dispatch -G dispatch

# Copy root manifests for production install
COPY package.json package-lock.json* ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Install production deps only
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy compiled server (strip sourcemaps)
COPY --from=server-builder /build/server/dist ./server/dist
RUN find server/dist -name '*.map' -delete

# Copy Angular build output into server/public (served as static files)
COPY --from=client-builder /build/client/dist/client/browser ./server/public

# Data directory (will be volume-mounted)
RUN mkdir -p /data && chown dispatch:dispatch /data

USER dispatch

EXPOSE 3000
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server/dist/index.js"]
