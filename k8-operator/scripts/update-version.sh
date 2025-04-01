#!/usr/bin/env bash

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
PATH_TO_HELM_CHART="${SCRIPT_DIR}/../../helm-charts/secrets-operator"

VERSION=$1
VERSION_WITHOUT_V=$(echo "$VERSION" | sed 's/^v//') # needed to validate semver


if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  exit 1
fi


if ! [[ "$VERSION_WITHOUT_V" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Version must follow semantic versioning (e.g. 0.0.1)"
  exit 1
fi

if ! [[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Version must start with 'v' (e.g. v0.0.1)"
  exit 1
fi

# For Linux vs macOS sed compatibility
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS version
  sed -i '' -e '/repository: infisical\/kubernetes-operator/{n;s/tag: .*/tag: '"$VERSION"'/;}' "${PATH_TO_HELM_CHART}/values.yaml"
  sed -i '' 's/appVersion: .*/appVersion: "'"$VERSION"'"/g' "${PATH_TO_HELM_CHART}/Chart.yaml"
  sed -i '' 's/version: .*/version: '"$VERSION"'/g' "${PATH_TO_HELM_CHART}/Chart.yaml"
else
  # Linux version
  sed -i -e '/repository: infisical\/kubernetes-operator/{n;s/tag: .*/tag: '"$VERSION"'/;}' "${PATH_TO_HELM_CHART}/values.yaml"
  sed -i 's/appVersion: .*/appVersion: "'"$VERSION"'"/g' "${PATH_TO_HELM_CHART}/Chart.yaml"
  sed -i 's/version: .*/version: '"$VERSION"'/g' "${PATH_TO_HELM_CHART}/Chart.yaml"
fi