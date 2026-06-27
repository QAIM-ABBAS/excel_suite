# syntax=docker/dockerfile:1.7

########################################
# Builder
########################################
FROM node:20-bookworm AS builder

WORKDIR /app

# Install curl (required for Bun installation)
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Copy dependency files first for better layer caching
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy application source
COPY . .

# Generate Prisma client
RUN bunx prisma generate

# Build Next.js
RUN bun run build


########################################
# Runtime
########################################
FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install only required runtime packages
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        nginx \
        curl && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r nextjs && \
    useradd -r -g nextjs nextjs

# Create Nginx directories and give ownership to nextjs
RUN mkdir -p /var/lib/nginx /var/cache/nginx && \
    chown -R nextjs:nextjs /var/lib/nginx /var/cache/nginx

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

# Copy configuration files
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

# Create writable directories
RUN mkdir -p /app/db /app/download && \
    chown -R nextjs:nextjs /app

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fs http://localhost:3000/ || exit 1

ENTRYPOINT ["/entrypoint.sh"]