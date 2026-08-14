#!/usr/bin/env bash
# Cloud Agent install: refresh JS dependencies and generate the dev .env files.
# Idempotent; safe to re-run. Postgres/Redis/nginx are started by start.sh.
#
# TEMPORARY DIAGNOSTIC BUILD: this version never aborts and writes a diagnostic
# report to .cursor/install-debug.log so a booted agent can show exactly what
# happened on the agent VM (fresh checkout vs warm-fork, registry reachability,
# npm exit codes). Revert to the strict version once diagnosed.
set +e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 0

DBG="$ROOT/.cursor/install-debug.log"
{
  echo "==== install.sh diagnostic $(date -u +%FT%TZ) ===="
  echo "whoami=$(whoami) pwd=$PWD"
  echo "node=$(node -v 2>&1) npm=$(npm -v 2>&1)"
  echo "npm registry=$(npm config get registry 2>&1)"
  for d in "$ROOT" "$ROOT/backend" "$ROOT/frontend"; do
    if [ -d "$d/node_modules" ]; then
      echo "node_modules PRESENT in ${d#"$ROOT"} ($(find "$d/node_modules" -maxdepth 1 -type d 2>/dev/null | wc -l) entries)"
    else
      echo "node_modules ABSENT in ${d#"$ROOT"}"
    fi
  done
  echo -n "registry reachability: "
  curl -sS -m 10 -o /dev/null -w "HTTP %{http_code} in %{time_total}s\n" https://registry.npmjs.org/ 2>&1 || echo "UNREACHABLE ($?)"
} >"$DBG" 2>&1

# 1. Generate a native (non-FIPS) dev .env from the committed example.
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

# 2. Install JS dependencies for each workspace (diagnostic: never abort).
hash_lock() { [ -f "$1/package-lock.json" ] && sha256sum "$1/package-lock.json" | cut -d' ' -f1 || true; }
install_deps() {
  local dir="$1"
  local marker="$dir/node_modules/.deps-lock-hash"
  if [ -d "$dir/node_modules" ] && [ "$(cat "$marker" 2>/dev/null)" = "$(hash_lock "$dir")" ]; then
    echo "install.sh: deps up-to-date in ${dir#"$ROOT"/}, skipping npm install" | tee -a "$DBG"
    return 0
  fi
  ( cd "$dir" && npm install --no-audit --no-fund --prefer-offline )
  local rc=$?
  echo "install.sh: npm install in ${dir#"$ROOT"/} exited rc=$rc" | tee -a "$DBG"
  if [ "$rc" -eq 0 ]; then hash_lock "$dir" >"$marker"; fi
}
install_deps "$ROOT"
install_deps "$ROOT/backend"
install_deps "$ROOT/frontend"

echo "install.sh: done (diagnostic, exit 0)" | tee -a "$DBG"
exit 0
