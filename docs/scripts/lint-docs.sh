#!/usr/bin/env bash
#
# Runs Vale over the documentation. Both `make lint-docs` and the GitHub
# workflow call this script so local and CI results cannot drift apart.
#
#   lint-docs.sh --all                      every .mdx file under docs/
#   lint-docs.sh --changed [--base <ref>]   only .mdx files this branch touched
#
# Exits non-zero when Vale reports an error

set -euo pipefail

REPO_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
DOCS_DIR="$REPO_ROOT/docs"

MODE=all
BASE=main

usage() {
  echo "Usage: lint-docs.sh [--all | --changed] [--base <ref>]" >&2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --all) MODE=all; shift ;;
    --changed) MODE=changed; shift ;;
    --base) BASE="${2:-}"; [ -n "$BASE" ] || { usage; exit 2; }; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

if ! command -v vale >/dev/null 2>&1; then
  echo "vale not found. Install it with: brew install vale" >&2
  exit 1
fi

PINNED_VERSION="$(tr -d '[:space:]' < "$DOCS_DIR/.vale-version")"
INSTALLED_VERSION="$(vale --version | awk '{print $NF}')"
if [ "$INSTALLED_VERSION" != "$PINNED_VERSION" ]; then
  echo "warning: vale $INSTALLED_VERSION is installed but CI runs $PINNED_VERSION." >&2
  echo "         Results may differ. Upgrade with: brew upgrade vale" >&2
fi

cd "$DOCS_DIR"

if [ "$MODE" = "all" ]; then
  exec vale --glob='*.mdx' .
fi

if ! MERGE_BASE="$(git -C "$REPO_ROOT" merge-base "$BASE" HEAD 2>/dev/null)"; then
  echo "error: no merge base between '$BASE' and HEAD. Pass --base <ref> to pick another base branch." >&2
  exit 1
fi

FILES=()
while IFS= read -r path; do
  case "$path" in
    *.mdx) ;;
    *) continue ;;
  esac
  [ -f "$REPO_ROOT/$path" ] || continue
  FILES+=("${path#docs/}")
done < <(
  {
    git -C "$REPO_ROOT" diff --name-only --diff-filter=ACMR "$MERGE_BASE" -- docs
    git -C "$REPO_ROOT" ls-files --others --exclude-standard -- docs
  } | sort -u
)

if [ ${#FILES[@]} -eq 0 ]; then
  echo "No .mdx files changed against $BASE. Nothing to lint."
  exit 0
fi

echo "Linting ${#FILES[@]} file(s) changed against $BASE:"
printf '  %s\n' "${FILES[@]}"
echo

exec vale --glob='*.mdx' "${FILES[@]}"
