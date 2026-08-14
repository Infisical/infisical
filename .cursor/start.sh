#!/usr/bin/env bash
# Cloud Agent start: bring up the infrastructure the app needs on every boot
# (Postgres, Redis, and the nginx reverse proxy). Idempotent and non-blocking:
# it starts each service, waits for readiness, and returns. The backend and
# frontend dev servers run as `terminals` (see environment.json).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- PostgreSQL 16 ---------------------------------------------------------
if ! sudo pg_ctlcluster 16 main status >/dev/null 2>&1; then
  sudo pg_ctlcluster 16 main start || true
fi
for _ in $(seq 1 30); do
  sudo -u postgres psql -tc "SELECT 1" >/dev/null 2>&1 && break
  sleep 1
done
# Ensure the app role and database exist (survives a snapshot but cheap to check).
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='infisical'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE infisical LOGIN PASSWORD 'infisical' SUPERUSER;"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='infisical'" | grep -q 1 \
  || sudo -u postgres createdb -O infisical infisical

# --- Redis -----------------------------------------------------------------
redis-cli ping >/dev/null 2>&1 || sudo redis-server /etc/redis/redis.conf --daemonize yes

# --- nginx reverse proxy (single origin on :8080) --------------------------
sudo mkdir -p /tmp/cursor/nginx/body /tmp/cursor/nginx/proxy /tmp/cursor/nginx/fastcgi \
  /tmp/cursor/nginx/uwsgi /tmp/cursor/nginx/scgi
sudo chown -R "$(whoami)" /tmp/cursor/nginx
if [ -f /tmp/cursor/nginx/nginx.pid ] && sudo kill -0 "$(cat /tmp/cursor/nginx/nginx.pid)" 2>/dev/null; then
  sudo nginx -c "$ROOT/.cursor/nginx.dev.conf" -s reload || true
else
  sudo nginx -c "$ROOT/.cursor/nginx.dev.conf"
fi

# --- App dev servers -------------------------------------------------------
# Launch the backend (Fastify, :4000, runs DB migrations on boot) and frontend
# (Vite, :3000) in the background. Guarded on the listening port so re-running
# start.sh (or a terminal already running the server) never double-starts.
LOG_DIR="${TMPDIR:-/tmp}/infisical-dev"
mkdir -p "$LOG_DIR"
port_listening() { ss -ltn 2>/dev/null | grep -q ":$1[[:space:]]"; }
start_app() {
  local name="$1" dir="$2" port="$3"
  if port_listening "$port"; then
    echo "$name already listening on :$port"
    return
  fi
  # Fully detach: new session (setsid) with stdio redirected so `start` returns
  # cleanly instead of holding the parent's terminal open.
  setsid bash -c "cd '$ROOT/$dir' && exec npm run dev" >"$LOG_DIR/$name.log" 2>&1 </dev/null &
  disown 2>/dev/null || true
  echo "$name starting on :$port (logs: $LOG_DIR/$name.log)"
}
start_app backend backend 4000
start_app frontend frontend 3000

echo "start.sh: infrastructure ready (Postgres, Redis, nginx :8080) + app dev servers launching"
