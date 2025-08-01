#!/bin/bash

CSV_FILE="bundle/manifests/infisical-operator.clusterserviceversion.yaml"
VERSION=$1

if [ ! -f "$CSV_FILE" ]; then
    echo "CSV file not found: $CSV_FILE"
    echo "Run 'make bundle VERSION=1.0.0' first"
    exit 1
fi

if [ -z "$VERSION" ]; then
    echo "VERSION is not set"
    exit 1
fi

# Get base64 logo without newlines
if [ -f "./scripts/logo.png" ]; then
    ICON_BASE64=$(base64 -i ./scripts/logo.png | tr -d '\n')
elif [ -f "./logo.png" ]; then
    ICON_BASE64=$(base64 -i ./logo.png | tr -d '\n')
else
    echo "No logo.png found - exiting"
    exit 1
fi

echo "Customizing CSV: $CSV_FILE"

# Basic metadata replacements (required for OperatorHub)
sed -i.bak 's/maturity: alpha/maturity: stable/' "$CSV_FILE"
sed -i.bak 's/description: K8 Operator description. TODO./description: The Infisical Operator enables you to fetch secrets from Infisical and inject them into your Kubernetes cluster./' "$CSV_FILE"
sed -i.bak 's/displayName: K8 Operator/displayName: Infisical Kubernetes Operator/' "$CSV_FILE"
sed -i.bak 's/email: your@email.com/email: daniel@infisical.com/' "$CSV_FILE"
sed -i.bak 's/name: Maintainer Name/name: Daniel H./' "$CSV_FILE"
sed -i.bak 's/name: Provider Name/name: Infisical/' "$CSV_FILE"
sed -i.bak 's|url: https://your.domain|url: https://infisical.com|' "$CSV_FILE"
sed -i.bak 's/name: K8 Operator/name: Infisical Kubernetes Operator/' "$CSV_FILE"
sed -i.bak 's|url: https://k8-operator.domain|url: https://infisical.com|' "$CSV_FILE"

# Add categories annotation (required for OperatorHub)
sed -i.bak 's/capabilities: Basic Install/capabilities: Basic Install\
    categories: Security/' "$CSV_FILE"

# Add containerImage annotation (required for OperatorHub)
sed -i.bak '/categories: Security/a\
    containerImage: docker.io/infisical/kubernetes-operator:v'"$VERSION"'\
' "$CSV_FILE"

# Add icon (using temp file to avoid sed issues with special chars)
echo "$ICON_BASE64" > /tmp/icon_b64.txt
printf '%s\n' "s|base64data: \"\"|base64data: \"$ICON_BASE64\"|" | sed -i.bak -f - "$CSV_FILE"
sed -i.bak 's/mediatype: ""/mediatype: "image\/png"/' "$CSV_FILE"
rm -f /tmp/icon_b64.txt

# Fix keywords section (remove old keywords, add new ones)
# First remove any existing keyword lines after "keywords:"
sed -i.bak '/^  keywords:/,/^  [a-zA-Z]/{
/^  keywords:/!{
/^  [a-zA-Z]/!d
}
}' "$CSV_FILE"

sed -i.bak '/^  keywords:/a\
  - secrets\
  - security\
  - infisical\
  - secret-management\
' "$CSV_FILE"

sed -i.bak '/^  - k8-operator$/d' "$CSV_FILE"

# Update docker image tag to match new version
sed -i.bak "s|image: infisical/kubernetes-operator:[^[:space:]]*|image: docker.io/infisical/kubernetes-operator:v$VERSION|g" "$CSV_FILE"

rm -f "$CSV_FILE.bak"

echo "CSV customized successfully!"

# Validate the result
echo "Validating CSV syntax..."
if command -v yq >/dev/null 2>&1; then
    if yq eval '.' "$CSV_FILE" > /dev/null 2>&1; then
        echo "YAML syntax is valid"
    else
        echo "YAML syntax error"
        echo "Checking with yq:"
        yq eval '.' "$CSV_FILE"
    fi
else
    echo "yq not found - exiting"
    exit 1
fi

echo "CSV customized successfully."