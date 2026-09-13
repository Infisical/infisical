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
  echo "usage: $0 {init|up|down|rm|db|proxy}" >&2
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

# Explain the block before writing it, once. Everything in it has a default, so
# these are notes on when you would override one, not instructions.
write_stack_header() {
  grep -q '^# --- stack ---' .env 2>/dev/null && return 0
  # Collapse any run of blank lines at the end, so stripping a previous stack
  # block does not leave a gap here.
  tmp=$(mktemp) && awk 'BEGIN{n=0} /^$/{n++;next} {while(n>0){print "";n--} print}' .env > "$tmp" && mv "$tmp" .env
  cat >> .env <<'EOF'

# --- stack --- written by `make stack-init`, all optional
#   STACK_NAME         renames the stack; ports and hostname derive from it
#   STACK_*_PORT       hashed from the name; change one only if it clashes
#   STACK_SEED_VOLUME  volume to seed the database from; blank starts empty
# SITE_URL and VITE_ALLOWED_HOSTS below are rewritten to match STACK_NAME.
EOF
}

# A .env whose last line has no newline would have the first appended setting
# glued onto it. Fix that once here rather than guarding every append.
end_with_newline() {
  [ -s .env ] || return 0
  [ "$(tail -c 1 .env | wc -l)" -eq 0 ] && printf '\n' >> .env
  return 0
}

# Ports are derived from the stack name, so they are identical on every run and
# differ between checkouts. cksum is POSIX, so macOS and Linux agree. The range
# sits above the well-known ports and below the ephemeral range.
port_for() {
  printf '%s' $(( 20000 + ($(printf '%s' "$1" | cksum | cut -d' ' -f1) % 20000) ))
}

# Suffix the stacks use. The proxy serves this alongside portless's default.
TLD=test

# Read the hostname from `portless list`, the documented live view. Do not read
# ~/.portless/routes.json: which directory is authoritative has moved between
# portless versions, so a file that looks like the route store can be months out
# of date. `portless get` is no good either, since for an unknown name it invents
# one from the project directory and still exits 0.
stack_host() {
  esc=$(printf '\033')
  portless list 2>/dev/null \
    | sed "s/${esc}\[[0-9;]*m//g" \
    | sed -n 's|^[[:space:]]*https\{0,1\}://\('"$1"'\.[^:/[:space:]]*\).*|\1|p' \
    | head -1
}

# A route takes its suffix from the proxy, and a running proxy keeps whichever
# suffixes it started with. `portless doctor` reports them on its Mode line,
# which is the only supported way to ask.
proxy_serves_tld() {
  portless doctor 2>/dev/null \
    | sed -n 's/^Mode:.*/&/p' \
    | grep -q "\.$TLD\([,[:space:]]\|\$\)"
}

# Serve .localhost alongside .test so an existing route under the default suffix
# keeps working across the restart.
start_proxy() {
  portless proxy start --tld "$TLD" --tld localhost "$@"
}

# A registered route still needs to resolve. portless keeps /etc/hosts in step
# with its routes, so when it does not, that sync has drifted.
host_resolves() {
  dscacheutil -q host -a name "$1" 2>/dev/null | grep -q 'ip_address'
}

portless_hint() {
  echo "  That hostname does not resolve yet. If it persists:" >&2
  echo "    portless hosts sync" >&2
  echo "    portless doctor" >&2
}

ensure_proxy() {
  command -v portless >/dev/null 2>&1 || {
    echo "portless is not installed. Install it with: npm install -g portless" >&2
    return 1
  }

  # stdout only: an already-running proxy is normal and noisy, but hiding
  # stderr here once turned a fatal scripting error into a bare exit code.
  start_proxy >/dev/null || true
  proxy_serves_tld && return 0

  echo "Proxy is not serving .$TLD; restarting it so it does."
  echo "This binds port 443, so it may ask for your password."
  # Not hidden: if stop fails the proxy stays up, start then reports an
  # already-running proxy, and the suffix silently never changes.
  portless proxy stop || echo "Could not stop the proxy; it may still be running." >&2
  start_proxy || { echo "Could not start the proxy." >&2; return 1; }

  proxy_serves_tld || {
    echo "Proxy restarted but is still not serving .$TLD. Run: portless doctor" >&2
    return 1
  }
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
# Where this checkout's main working tree is. Plain git, so it resolves the same
# whether the worktree came from `git worktree add` or from a worktree manager.
main_checkout() {
  common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || return 1
  (cd "$common/.." 2>/dev/null && pwd) || return 1
}

# .env is gitignored, so a new worktree never has one. Prefer the main
# checkout's: it holds the keys this machine's data was encrypted with, and a
# stack seeded from an existing volume can only read that volume with them.
create_env() {
  [ ! -f .env ] || return 0

  main=$(main_checkout) || main=""
  if [ -n "$main" ] && [ "$main" != "$(pwd)" ] && [ -f "$main/.env" ]; then
    # Take the secrets, drop that checkout's identity. Its stack block names a
    # stack and a set of ports that are already in use; inheriting them would
    # point this checkout at the other one's containers and volumes.
    sed -e '/^# --- stack ---/,/^# SITE_URL and VITE_ALLOWED_HOSTS/d' \
        -e '/^STACK_/d' -e '/^SITE_URL=/d' -e '/^VITE_ALLOWED_HOSTS=/d' \
        "$main/.env" > .env
    echo "Created .env from $main/.env (its stack settings are not carried over)"
    return 0
  fi

  [ -f .env.example ] || { echo "No .env or .env.example here. Run this from the repo root." >&2; exit 1; }
  cp .env.example .env
  ENV_FROM_EXAMPLE=1
  echo "Created .env from .env.example."
}

cmd_init() {
  ENV_FROM_EXAMPLE=
  create_env

  end_with_newline
  write_stack_header

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
      if ! grep -q '^ENCRYPTION_KEY=.' .env; then
        echo "Warning: .env has no ENCRYPTION_KEY, so seeded data will not decrypt." >&2
      elif [ -n "$ENV_FROM_EXAMPLE" ]; then
        # The example key is not the key that wrote any real volume, so seeding
        # with it produces a backend that starts and then cannot read anything.
        echo "Warning: seeded from $seed, but ENCRYPTION_KEY came from .env.example." >&2
        echo "  That key did not write this volume, so the backend will not decrypt it." >&2
        echo "  Copy ENCRYPTION_KEY from the checkout that owns the volume, or set" >&2
        echo "  STACK_SEED_VOLUME= in .env to start from an empty database." >&2
      fi
    else
      echo "$seed not found, so starting empty. Migrations run on first boot."
    fi
  fi

  if command -v portless >/dev/null 2>&1; then
    # Order matters: a route takes its suffix from the proxy that is running
    # when it is registered.
    if ensure_proxy; then
      portless alias "$NAME" "$(get STACK_NGINX_PORT)" --force >/dev/null 2>&1 || true
      portless alias "mail.$NAME" "$(get STACK_MAIL_PORT)" --force >/dev/null 2>&1 || true
    else
      echo "Continuing without a hostname. The ports below still work." >&2
    fi
  else
    echo "portless is not installed, so this stack gets no hostname." >&2
    echo "Install it with: npm install -g portless" >&2
  fi

  echo "Stack '$NAME' initialised. Run 'make stack-up'."
}

cmd_up() {
  require_stack
  compose up --build -d

  printf '\nStack %s is running:\n' "$NAME"
  app_host=$(stack_host "$NAME")
  mail_host=$(stack_host "mail.$NAME")
  if [ -n "$app_host" ]; then
    echo "  App:      https://$app_host"
    [ -n "$mail_host" ] && echo "  Mail:     https://$mail_host"
  fi
  db_port=$(get STACK_DB_PORT)
  echo "  App port: localhost:$(get STACK_NGINX_PORT)"
  echo "  Postgres: localhost:$db_port"
  echo "  Redis:    localhost:$(get STACK_REDIS_PORT)"
  echo "  psql:     PGPASSWORD=infisical psql -h localhost -p $db_port -U infisical -d infisical"

  # Reaching the stack by port always works; the hostname only does when the
  # proxy is up, so say so rather than printing a URL that fails to resolve.
  if [ -n "$app_host" ]; then
    host_resolves "$app_host" || portless_hint
  else
    echo "  No portless route is registered for this stack." >&2
    portless_hint
  fi
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
  proxy) ensure_proxy ;;
  *)    usage ;;
esac
