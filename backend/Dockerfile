# syntax=docker/dockerfile:1

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

# Install build tools required by better-sqlite3 native bindings
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
# Cache npm's download cache across builds (keyed by this stage) — same
# `npm ci` result either way, just skips re-downloading unchanged packages
# when package*.json changes and this layer can't be reused as-is.
RUN --mount=type=cache,target=/root/.npm npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Strip devDependencies in place (no re-download, no re-compiling the native
# canvas/sharp bindings we just built) — the runner stage below copies this
# already-pruned tree instead of running `npm ci` a second time from scratch.
RUN npm prune --omit=dev

# ── Stage 2: Production ────────────────────────────────────────────────────────
FROM node:20-slim AS runner

# No python3/make/g++ here — nothing in the runner compiles native modules
# anymore (that already happened in the builder stage above).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer libreoffice-calc libreoffice-impress \
    fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 5000) + '/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]
