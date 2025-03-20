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




sed -i '' -e '/repository: infisical\/kubernetes-operator/{n;s/tag: .*/tag: '"$VERSION"'/;}' "${PATH_TO_HELM_CHART}/values.yaml"

# Update ../helm-charts/secrets-operator/Chart.yaml appVersion with the new version
sed -i '' 's/appVersion: .*/appVersion: "'"$VERSION"'"/g' "${PATH_TO_HELM_CHART}/Chart.yaml"

# Update ../helm-charts/secrets-operator/Chart.yaml version with the new version
sed -i '' 's/version: .*/version: '"$VERSION"'/g' "${PATH_TO_HELM_CHART}/Chart.yaml"