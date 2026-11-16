#!/usr/bin/env bash
# Points the infisical-standalone-postgres chart at a new Infisical release: sets
# appVersion, which is the default image tag, and records the change in the CHANGELOG.
#
# Usage: ./bump-infisical-core-app-version.sh v0.167.10
#
# The chart version must end up ahead of main's, as ct lint requires of every chart PR.
# A version already ahead of main (an open bump PR, or a hand-made bump) is kept and the
# change joins its CHANGELOG section; otherwise main's version gets a patch bump and a
# new section. Every version merged to main is published, so none is skipped. Compares
# against BASE_REF (default origin/main), so fetch it first. Never moves appVersion
# backwards, so a patch release tagged on an older line after a newer release leaves the
# chart alone.
set -euo pipefail

TAG="${1:-}"
if ! [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage: $0 vX.Y.Z (stable release tags only)" >&2
  exit 1
fi

CHART_DIR="$(cd "$(dirname "$0")/infisical-standalone-postgres" && pwd)"
CHART_FILE="$CHART_DIR/Chart.yaml"
CHANGELOG_FILE="$CHART_DIR/CHANGELOG.md"
OUTPUT_FILE="${GITHUB_OUTPUT:-/dev/null}"
BASE_REF="${BASE_REF:-origin/main}"

read_field() {
  sed -n "s/^$1: *\"\{0,1\}\([^\"]*\)\"\{0,1\} *$/\1/p"
}

is_newer() {
  [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -n 1)" = "$1" ]
}

CURRENT_APP_VERSION="$(read_field appVersion < "$CHART_FILE")"
CHART_VERSION="$(read_field version < "$CHART_FILE")"
BASE_CHART_VERSION="$(git -C "$CHART_DIR" show "$BASE_REF:./Chart.yaml" | read_field version)"

if [ -z "$CURRENT_APP_VERSION" ] || [ -z "$CHART_VERSION" ] || [ -z "$BASE_CHART_VERSION" ]; then
  echo "Could not read version and appVersion from $CHART_FILE, or version from $BASE_REF" >&2
  exit 1
fi

if ! is_newer "${TAG#v}" "${CURRENT_APP_VERSION#v}"; then
  echo "Chart appVersion is $CURRENT_APP_VERSION, which is not older than $TAG. Nothing to do."
  {
    echo "changed=false"
    echo "app_version=$CURRENT_APP_VERSION"
    echo "chart_version=$CHART_VERSION"
  } >> "$OUTPUT_FILE"
  exit 0
fi

if is_newer "$CHART_VERSION" "$BASE_CHART_VERSION"; then
  NEW_CHART_VERSION="$CHART_VERSION"
else
  IFS=. read -r MAJOR MINOR PATCH <<< "$BASE_CHART_VERSION"
  NEW_CHART_VERSION="$MAJOR.$MINOR.$((PATCH + 1))"
fi

BULLET_PREFIX='* Updated the default Infisical image (`appVersion`) from '
TOP_HEADING="$(grep -m 1 '^## ' "$CHANGELOG_FILE")"

if [ "$TOP_HEADING" = "## $NEW_CHART_VERSION" ]; then
  if awk '/^## /{n++} n==1' "$CHANGELOG_FILE" | grep -qF "$BULLET_PREFIX"; then
    # An earlier bump in this section keeps its original "from" version.
    awk -v prefix="$BULLET_PREFIX" -v tag="$TAG" '
      /^## /{n++}
      n==1 && index($0, prefix) == 1 { sub(/to `[^`]*`\.$/, "to `" tag "`.") }
      { print }
    ' "$CHANGELOG_FILE" > "$CHANGELOG_FILE.tmp"
  else
    awk -v line="${BULLET_PREFIX}\`$CURRENT_APP_VERSION\` to \`$TAG\`." '
      /^## /{n++}
      { print }
      n==1 && !done && /^Changes:$/ { print line; done=1 }
    ' "$CHANGELOG_FILE" > "$CHANGELOG_FILE.tmp"
  fi
else
  {
    printf '## %s\nChanges:\n%s`%s` to `%s`.\n\n' \
      "$NEW_CHART_VERSION" "$BULLET_PREFIX" "$CURRENT_APP_VERSION" "$TAG"
    cat "$CHANGELOG_FILE"
  } > "$CHANGELOG_FILE.tmp"
fi
mv "$CHANGELOG_FILE.tmp" "$CHANGELOG_FILE"

sed -e "s/^appVersion:.*/appVersion: \"$TAG\"/" \
    -e "s/^version:.*/version: $NEW_CHART_VERSION/" \
    "$CHART_FILE" > "$CHART_FILE.tmp"
mv "$CHART_FILE.tmp" "$CHART_FILE"

echo "Chart $CHART_VERSION -> $NEW_CHART_VERSION, appVersion $CURRENT_APP_VERSION -> $TAG"
{
  echo "changed=true"
  echo "app_version=$TAG"
  echo "chart_version=$NEW_CHART_VERSION"
} >> "$OUTPUT_FILE"
