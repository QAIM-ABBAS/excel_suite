#!/usr/bin/env bash
set -e

echo "🚀 Starting Excel Automation Suite..."

cleanup() {
    echo ""
    echo "🛑 Shutting down services..."

    kill "$NGINX_PID" 2>/dev/null || true
    kill "$NEXT_PID" 2>/dev/null || true

    wait

    echo "✅ Shutdown complete."
}

trap cleanup SIGTERM SIGINT

# -----------------------------------------------------------------------------
# Initialize SQLite database
# -----------------------------------------------------------------------------

if [ ! -f /app/db/custom.db ]; then
    echo "📦 Initializing SQLite database..."

    cd /app

    if ! npx prisma db push --skip-generate; then
        echo "❌ Failed to initialize database."
        exit 1
    fi

    echo "✅ Database initialized."
else
    echo "✅ Database already exists."
fi

# -----------------------------------------------------------------------------
# Start Nginx
# -----------------------------------------------------------------------------

echo "🌐 Starting Nginx..."

mkdir -p /var/lib/nginx/body /var/cache/nginx
chown -R nginx:nginx /var/lib/nginx /var/cache/nginx

nginx -g "daemon off;" &
NGINX_PID=$!

sleep 1

if ! kill -0 "$NGINX_PID" 2>/dev/null; then
    echo "❌ Nginx failed to start."
    exit 1
fi

# -----------------------------------------------------------------------------
# Start Next.js
# -----------------------------------------------------------------------------

echo "⚡ Starting Next.js..."

cd /app

node server.js &
NEXT_PID=$!

sleep 1

if ! kill -0 "$NEXT_PID" 2>/dev/null; then
    echo "❌ Next.js failed to start."
    exit 1
fi

echo ""
echo "✅ Excel Automation Suite is running!"
echo "🌐 http://localhost"

# Wait until either process exits
wait -n "$NGINX_PID" "$NEXT_PID"

echo "⚠️ One of the services stopped."

cleanup