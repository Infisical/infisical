#!/usr/bin/env bash
# Cloud Agent install: refresh JS dependencies and generate the dev .env files.
# Idempotent; safe to re-run. Postgres/Redis/nginx are started by start.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 1. Generate a native (non-FIPS) dev .env from the committed example.
#    - point DB/Redis at localhost instead of the compose service names
#    - use a 32-byte ENCRYPTION_KEY (valid AES-256 key in software mode; the
#      base64 example key only works under FIPS, which remaps it to
#      ROOT_ENCRYPTION_KEY and base64-decodes it)
#    - drop the compose-only SMTP host (email is optional in dev)
generate_env() {
  local out="$1"
  sed -e 's#redis://redis:6379#redis://127.0.0.1:6379#' \
      -e 's#^SMTP_HOST=host.docker.internal#SMTP_HOST=#' \
      -e 's#^DB_CONNECTION_URI=.*#DB_CONNECTION_URI=postgres://infisical:infisical@127.0.0.1:5432/infisical#' \
      -e 's#^ENCRYPTION_KEY=.*#ENCRYPTION_KEY=f13dbc92aaaf86fa7cb0ed8ac3265f47#' \
      "$ROOT/.env.dev.example" > "$out"
  {
    echo ""
    echo "# --- Cloud Agent native dev overrides ---"
    echo "NODE_ENV=development"
    echo "HOST=0.0.0.0"
    echo "PORT=4000"
  } >> "$out"
}
generate_env "$ROOT/.env"
cp "$ROOT/.env" "$ROOT/backend/.env"

# 2. Install JS dependencies for each workspace.
#    Only hit the network when deps are actually missing or the lockfile changed.
#    On a warm-forked boot (node_modules already present from the snapshot, lockfile
#    unchanged) this is a no-op, so `install` never depends on registry egress at
#    boot — it only installs during the environment build, where network is available.
hash_lock() { [ -f "$1/package-lock.json" ] && sha256sum "$1/package-lock.json" | cut -d' ' -f1 || true; }
install_deps() {
  local dir="$1"
  local marker="$dir/node_modules/.deps-lock-hash"
  if [ -d "$dir/node_modules" ] && [ "$(cat "$marker" 2>/dev/null)" = "$(hash_lock "$dir")" ]; then
    echo "install.sh: deps up-to-date in ${dir#"$ROOT"/}, skipping npm install"
    return 0
  fi
  ( cd "$dir" && npm install --no-audit --no-fund --prefer-offline )
  # npm may normalize the lockfile during install; record the settled hash so the
  # next run matches and skips instead of reinstalling in a loop.
  hash_lock "$dir" >"$marker"
}
install_deps "$ROOT"
install_deps "$ROOT/backend"
install_deps "$ROOT/frontend"

echo "install.sh: done"
