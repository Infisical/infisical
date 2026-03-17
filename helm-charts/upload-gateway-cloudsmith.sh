#!/usr/bin/env sh
set -e

if [ -z "$CLOUDSMITH_API_KEY" ] || [ -z "$CLOUDSMITH_USERNAME" ]; then
    echo "Error: CLOUDSMITH_API_KEY and CLOUDSMITH_USERNAME environment variables must be set."
    exit 1
fi

cd "infisical-gateway"
helm dependency update
helm package .

echo "$CLOUDSMITH_API_KEY" | helm registry login helm.oci.cloudsmith.io \
    --username "$CLOUDSMITH_USERNAME" \
    --password-stdin

for i in *.tgz; do
    [ -f "$i" ] || break
    cloudsmith push helm --republish infisical/helm-charts "$i"
    helm push "$i" oci://helm.oci.cloudsmith.io/infisical/helm-charts
done

helm registry logout helm.oci.cloudsmith.io

cd ..