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
if [ -f /tmp/cursor/nginx/nginx.pid ] && kill -0 "$(cat /tmp/cursor/nginx/nginx.pid)" 2>/dev/null; then
  sudo nginx -c "$ROOT/.cursor/nginx.dev.conf" -s reload || true
else
  sudo nginx -c "$ROOT/.cursor/nginx.dev.conf"
fi

echo "start.sh: infrastructure ready (Postgres, Redis, nginx :8080)"
