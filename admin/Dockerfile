# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so they
# must be present here. Railway passes matching service variables in as build
# args automatically when they are declared with ARG.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ADMIN_API_TOKEN
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ADMIN_API_TOKEN=$NEXT_PUBLIC_ADMIN_API_TOKEN

RUN npm run build

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/.next ./.next
COPY next.config.mjs server.mjs ./

# server.mjs binds 0.0.0.0 and reads process.env.PORT (Railway injects it).
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/login', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.mjs"]
