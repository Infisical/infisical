#!/usr/bin/env bash
# Points the infisical-standalone-postgres chart at a new Infisical release: sets
# appVersion, which is the default image tag, and records the change in the CHANGELOG.
#
# Usage: ./bump-infisical-core-app-version.sh v0.167.10
#
# The chart version must end up ahead of main's, as ct lint requires of every chart PR. It
# follows Infisical's own versioning from main's appVersion to the new release: a new major
# bumps the chart's major, a new minor bumps its minor, and a patch release bumps its patch.
# Infisical has no other signal for breaking changes, so the chart cannot judge them either.
# A version already at or above that bump (an open bump PR, or a hand-made bump) is kept and
# the change joins its CHANGELOG section. Every version merged to main is published, so none
# is skipped. The breaking changes of the releases this run adds are appended to the
# section's upgrade notes for review. Compares against BASE_REF (default origin/main), so
# fetch it and the release tags first. Needs yq v4. Never moves appVersion backwards, so a
# patch release tagged on an older line after a newer release leaves the chart alone.
set -euo pipefail

TAG="${1:-}"
if ! [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage: $0 vX.Y.Z (stable release tags only)" >&2
  exit 1
fi

CHART_DIR="$(cd "$(dirname "$0")/infisical-standalone-postgres" && pwd)"
CHART_FILE="$CHART_DIR/Chart.yaml"
CHANGELOG_FILE="$CHART_DIR/CHANGELOG.md"
IMPACT_DIR="$(cd "$(dirname "$0")/.." && pwd)/upgrade-impact/data/releases"
OUTPUT_FILE="${GITHUB_OUTPUT:-/dev/null}"
BASE_REF="${BASE_REF:-origin/main}"

read_field() {
  sed -n "s/^$1: *\"\{0,1\}\([^\"]*\)\"\{0,1\} *$/\1/p"
}

is_newer() {
  [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -n 1)" = "$1" ]
}

# Stable release tags newer than $1 and no newer than $2, oldest first.
releases_between() {
  git -C "$CHART_DIR" tag --list 'v*' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | while read -r v; do
    if is_newer "${v#v}" "${1#v}" && ! is_newer "${v#v}" "${2#v}"; then
      echo "$v"
    fi
  done
}

CURRENT_APP_VERSION="$(read_field appVersion < "$CHART_FILE")"
CHART_VERSION="$(read_field version < "$CHART_FILE")"
BASE_CHART_FILE="$(git -C "$CHART_DIR" show "$BASE_REF:./Chart.yaml")"
BASE_CHART_VERSION="$(read_field version <<< "$BASE_CHART_FILE")"
BASE_APP_VERSION="$(read_field appVersion <<< "$BASE_CHART_FILE")"

if [ -z "$CURRENT_APP_VERSION" ] || [ -z "$CHART_VERSION" ] || [ -z "$BASE_CHART_VERSION" ] || [ -z "$BASE_APP_VERSION" ]; then
  echo "Could not read version and appVersion from $CHART_FILE or from $BASE_REF" >&2
  exit 1
fi

if ! is_newer "${TAG#v}" "${CURRENT_APP_VERSION#v}"; then
  echo "Chart appVersion is $CURRENT_APP_VERSION, which is not older than $TAG. Nothing to do."
  printf 'app_version=%s\nchart_version=%s\n' "$CURRENT_APP_VERSION" "$CHART_VERSION" >> "$OUTPUT_FILE"
  exit 0
fi

IFS=. read -r BASE_APP_MAJOR BASE_APP_MINOR _ <<< "${BASE_APP_VERSION#v}"
IFS=. read -r TAG_MAJOR TAG_MINOR _ <<< "${TAG#v}"
IFS=. read -r MAJOR MINOR PATCH <<< "$BASE_CHART_VERSION"
if [ "$TAG_MAJOR" != "$BASE_APP_MAJOR" ]; then
  BUMP=major
  TARGET_CHART_VERSION="$((MAJOR + 1)).0.0"
elif [ "$TAG_MINOR" != "$BASE_APP_MINOR" ]; then
  BUMP=minor
  TARGET_CHART_VERSION="$MAJOR.$((MINOR + 1)).0"
else
  BUMP=patch
  TARGET_CHART_VERSION="$MAJOR.$MINOR.$((PATCH + 1))"
fi

if [ "$CHART_VERSION" = "$TARGET_CHART_VERSION" ] || is_newer "$CHART_VERSION" "$TARGET_CHART_VERSION"; then
  NEW_CHART_VERSION="$CHART_VERSION"
else
  NEW_CHART_VERSION="$TARGET_CHART_VERSION"
fi

TOP_HEADING="$(grep -m 1 '^## ' "$CHANGELOG_FILE")"

# A smaller bump this branch already made becomes the larger one, keeping its section.
if [ "$NEW_CHART_VERSION" != "$CHART_VERSION" ] && is_newer "$CHART_VERSION" "$BASE_CHART_VERSION" \
  && [ "$TOP_HEADING" = "## $CHART_VERSION" ]; then
  awk -v from="## $CHART_VERSION" -v to="## $NEW_CHART_VERSION" \
    '!done && $0 == from { print to; done=1; next } { print }' "$CHANGELOG_FILE" > "$CHANGELOG_FILE.tmp"
  mv "$CHANGELOG_FILE.tmp" "$CHANGELOG_FILE"
  TOP_HEADING="## $NEW_CHART_VERSION"
fi

BULLET_PREFIX='* Updated the default Infisical image (`appVersion`) from '

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

NOTES=""
for v in $(releases_between "$CURRENT_APP_VERSION" "$TAG"); do
  DATA_FILE="$IMPACT_DIR/$v.yaml"
  if [ -f "$DATA_FILE" ]; then
    NOTES+="$(V="$v" yq '.breakingChanges[] | "* " + .title + " (`" + strenv(V) + "`): " + ((.description + " " + .action) | sub("\s*\n\s*"; " "))' "$DATA_FILE")"$'\n'
  fi
done
NOTES="$(sed '/^$/d' <<< "$NOTES")"

if [ -n "$NOTES" ]; then
  # Appends to the top section's upgrade notes, so notes a reviewer already edited are kept.
  NOTES="$NOTES" awk '
    BEGIN { notes = ENVIRON["NOTES"] }
    function flush() {
      if (!has_notes) { buf = buf "\nUpgrade notes:\n" }
      printf "%s%s\n", buf, notes
      if (pending_blank) { print "" }
      flushed = 1
    }
    /^## / { n++ }
    n == 1 && /^Upgrade notes:$/ { has_notes = 1 }
    n == 1 { if ($0 == "") { pending_blank++ } else { while (pending_blank > 0) { buf = buf "\n"; pending_blank-- } buf = buf $0 "\n" } next }
    n == 2 && !flushed { flush() }
    { print }
    END { if (!flushed) { pending_blank = 0; flush() } }
  ' "$CHANGELOG_FILE" > "$CHANGELOG_FILE.tmp"
  mv "$CHANGELOG_FILE.tmp" "$CHANGELOG_FILE"
fi

sed -e "s/^appVersion:.*/appVersion: \"$TAG\"/" \
    -e "s/^version:.*/version: $NEW_CHART_VERSION/" \
    "$CHART_FILE" > "$CHART_FILE.tmp"
mv "$CHART_FILE.tmp" "$CHART_FILE"

echo "Chart $CHART_VERSION -> $NEW_CHART_VERSION ($BUMP), appVersion $CURRENT_APP_VERSION -> $TAG"
printf 'app_version=%s\nchart_version=%s\n' "$TAG" "$NEW_CHART_VERSION" >> "$OUTPUT_FILE"
