# ─── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:20-bookworm AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN corepack enable && bun install --frozen-lockfile

# ─── Stage 2: Build Next.js ───────────────────────────────────────────────────
FROM node:20-bookworm AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ─── Stage 3: Production image (pure Node.js, no Python) ─────────────────────
FROM node:20-bookworm-slim

# Install nginx for reverse proxy + curl for healthchecks
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        nginx \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ─── Copy Next.js standalone build ───────────────────────────────────────────
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# ─── Copy Prisma runtime ─────────────────────────────────────────────────────
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# ─── Ensure data directories ─────────────────────────────────────────────────
RUN mkdir -p /app/download /app/db /app/tmp-uploads

# ─── Copy nginx config ───────────────────────────────────────────────────────
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -f /etc/nginx/sites-enabled/default

# ─── Copy entrypoint ─────────────────────────────────────────────────────────
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# ─── Environment ─────────────────────────────────────────────────────────────
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=file:/app/db/custom.db

# Expose nginx port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Volumes for persistent data
VOLUME ["/app/db", "/app/download"]

ENTRYPOINT ["/entrypoint.sh"]
