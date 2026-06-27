#!/bin/bash
set -e

echo "🚀 Starting Excel Automation Suite (pure Node.js)..."

# ─── Initialize database if not exists ────────────────────────────────────────
if [ ! -f /app/db/custom.db ]; then
    echo "📦 Initializing SQLite database..."
    cd /app && npx prisma db push --skip-generate 2>/dev/null || true
    echo "✅ Database initialized"
else
    echo "✅ Database already exists"
fi

# ─── Start nginx in background ────────────────────────────────────────────────
echo "🌐 Starting nginx..."
nginx -g "daemon off;" &
NGINX_PID=$!

# ─── Start Next.js standalone server ──────────────────────────────────────────
echo "⚡ Starting Next.js server on port 3000..."
cd /app
node server.js &
NEXT_PID=$!

echo "✅ Excel Automation Suite is ready!"
echo "   Access it at http://localhost:80"

# ─── Wait for either process to exit ──────────────────────────────────────────
wait -n $NGINX_PID $NEXT_PID 2>/dev/null || true

# If either process dies, kill the other
echo "⚠️ A process exited, shutting down..."
kill $NGINX_PID 2>/dev/null || true
kill $NEXT_PID 2>/dev/null || true
wait
