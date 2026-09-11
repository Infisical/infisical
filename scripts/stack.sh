#!/usr/bin/env sh
# Runs this checkout as its own Infisical stack, so several branches can be up
# at once. Reached through `make stack-<cmd>`; see
# docs/contributing/platform/developing.mdx.
#
# Every host port in docker-compose.dev.yml is parameterised with a default, so
# this only has to put the right values in .env. With none set, the dev stack
# behaves exactly as it always has.
set -eu

# Written into .env on first init so it is visible and editable there. Point it
# at another volume to seed from that instead, or blank it to always start with
# an empty database.
DEFAULT_SEED_VOLUME=infisical_postgres-data1

usage() {
  echo "usage: $0 {init|up|down|rm|db}" >&2
  exit 64
}

# --- .env helpers -----------------------------------------------------------
get() { [ -f .env ] && sed -n "s/^$1=\\(.*\\)$/\\1/p" .env | head -1 | grep . || return 1; }

set_var() {
  if [ -f .env ] && grep -q "^$1=" .env; then
    tmp=$(mktemp) && sed "s|^$1=.*|$1=$2|" .env > "$tmp" && mv "$tmp" .env
  else
    printf '%s=%s\n' "$1" "$2" >> .env
  fi
}

# Ports are derived from the stack name, so they are identical on every run and
# differ between checkouts. cksum is POSIX, so macOS and Linux agree. The range
# sits above the well-known ports and below the ephemeral range.
port_for() {
  printf '%s' $(( 20000 + ($(printf '%s' "$1" | cksum | cut -d' ' -f1) % 20000) ))
}

stack_name() {
  get STACK_NAME && return 0
  # The directory, not the branch: switching branches inside a checkout must
  # not move its ports or orphan its database.
  printf '%s' "$(basename "$(pwd)")" | tr 'A-Z' 'a-z' | tr -c 'a-z0-9-\n' '-' \
    | sed 's/--*/-/g; s/^-*//; s/-*$//' | cut -c1-40 | sed 's/-*$//'
}

require_stack() {
  [ -f .env ] || { echo "No .env here. Run 'make stack-init' first." >&2; exit 1; }
  NAME=$(get STACK_NAME) || { echo "No STACK_NAME in .env. Run 'make stack-init' first." >&2; exit 1; }
}

compose() {
  docker compose --env-file .env -p "$NAME" -f docker-compose.dev.yml "$@"
}

# --- commands ---------------------------------------------------------------
cmd_init() {
  if [ ! -f .env ]; then
    [ -f .env.example ] || { echo "Run this from the repo root." >&2; exit 1; }
    cp .env.example .env
    echo "Created .env from .env.example."
  fi

  NAME=$(stack_name)
  [ -n "$NAME" ] || { echo "Could not determine a stack name." >&2; exit 1; }

  set_var STACK_NAME "$NAME"
  set_var SITE_URL "https://$NAME.test"
  set_var VITE_ALLOWED_HOSTS "$NAME.test"
  set_var STACK_NGINX_PORT  "$(port_for "$NAME")"
  set_var STACK_DB_PORT  "$(port_for "db-$NAME")"
  set_var STACK_REDIS_PORT  "$(port_for "redis-$NAME")"
  set_var STACK_MAIL_PORT  "$(port_for "mail-$NAME")"
  set_var STACK_SMTP_PORT  "$(port_for "smtp-$NAME")"
  set_var STACK_API_PORT  "$(port_for "api-$NAME")"
  set_var STACK_METRICS_PORT  "$(port_for "metrics-$NAME")"
  set_var STACK_DEBUG_PORT  "$(port_for "debug-$NAME")"
  set_var STACK_PGADMIN_PORT  "$(port_for "pgadmin-$NAME")"
  set_var STACK_REDIS_COMMANDER_PORT  "$(port_for "rediscmd-$NAME")"

  # Compose names the volume <project>_postgres-data and the project is the
  # stack name, so creating it here is what compose will pick up. Seeding from
  # an existing volume is far quicker than migrating an empty database, but the
  # data only reads back with the ENCRYPTION_KEY that wrote it.
  grep -q '^STACK_SEED_VOLUME=' .env || set_var STACK_SEED_VOLUME "$DEFAULT_SEED_VOLUME"
  seed=$(get STACK_SEED_VOLUME || true)

  volume="${NAME}_postgres-data"
  if ! docker volume inspect "$volume" >/dev/null 2>&1; then
    docker volume create "$volume" >/dev/null
    if [ -z "$seed" ]; then
      echo "STACK_SEED_VOLUME is empty, so starting empty. Migrations run on first boot."
    elif docker volume inspect "$seed" >/dev/null 2>&1; then
      echo "Seeding $volume from $seed..."
      docker run --rm -v "$seed":/from:ro -v "$volume":/to alpine sh -c 'cp -a /from/. /to/'
      grep -q '^ENCRYPTION_KEY=.' .env \
        || echo "Warning: .env has no ENCRYPTION_KEY, so seeded data will not decrypt." >&2
    else
      echo "$seed not found, so starting empty. Migrations run on first boot."
    fi
  fi

  if command -v portless >/dev/null 2>&1; then
    portless alias "$NAME" "$(get STACK_NGINX_PORT)" --tld test --force >/dev/null 2>&1 || true
    portless alias "mail.$NAME" "$(get STACK_MAIL_PORT)" --tld test --force >/dev/null 2>&1 || true
  else
    echo "portless not installed, so no .test hostname. See the contributing guide." >&2
  fi

  echo "Stack '$NAME' initialised. Run 'make stack-up'."
}

cmd_up() {
  require_stack
  compose up --build -d
  printf '\nStack %s is running:\n' "$NAME"
  echo "  App:      https://$NAME.test"
  echo "  Mail:     https://mail.$NAME.test"
  echo "  Postgres: localhost:$(get STACK_DB_PORT)"
}

cmd_down() { require_stack; compose down; }

cmd_rm() {
  require_stack
  compose down -v
  docker image rm "infisical-dev-backend:$NAME" "infisical-dev-frontend:$NAME" >/dev/null 2>&1 || true
  portless alias --remove "$NAME" >/dev/null 2>&1 || true
  portless alias --remove "mail.$NAME" >/dev/null 2>&1 || true
  echo "Stack '$NAME' removed. The checkout itself is untouched."
}

cmd_db() {
  require_stack
  PGPASSWORD=infisical psql -h localhost -p "$(get STACK_DB_PORT)" -U infisical -d infisical -P pager=off
}

[ $# -eq 1 ] || usage
case "$1" in
  init) cmd_init ;;
  up)   cmd_up ;;
  down) cmd_down ;;
  rm)   cmd_rm ;;
  db)   cmd_db ;;
  *)    usage ;;
esac
