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
npm install
npm install --prefix backend
npm install --prefix frontend

echo "install.sh: done"
