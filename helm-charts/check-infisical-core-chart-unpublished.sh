#!/usr/bin/env bash
# Writes version=<chart version> and publish=true|false to $GITHUB_OUTPUT: publish is true only
# when that version of the infisical-standalone chart is not in the registry yet. A published
# chart version must never change, so it is never pushed again. Fails when the registry cannot
# say either way. Needs helm and yq v4.
set -euo pipefail

CHART_FILE="$(cd "$(dirname "$0")/infisical-standalone-postgres" && pwd)/Chart.yaml"
OUTPUT_FILE="${GITHUB_OUTPUT:-/dev/stdout}"
VERSION="$(yq '.version' "$CHART_FILE")"
echo "version=$VERSION" >> "$OUTPUT_FILE"

if ERR="$(helm show chart oci://helm.oci.cloudsmith.io/infisical/helm-charts/infisical-standalone --version "$VERSION" 2>&1 >/dev/null)"; then
  echo "::notice::Chart $VERSION is already published. Bump the chart version to release changes."
  echo "publish=false" >> "$OUTPUT_FILE"
elif echo "$ERR" | grep -q ': not found$'; then
  echo "Chart $VERSION is not published yet."
  echo "publish=true" >> "$OUTPUT_FILE"
else
  echo "::error::Could not check whether chart $VERSION is published: $ERR"
  exit 1
fi
