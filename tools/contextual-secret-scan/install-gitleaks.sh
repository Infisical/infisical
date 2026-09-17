#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  echo "This installer supports Linux x86_64. Install Gitleaks 8.30.1 for your platform manually." >&2
  exit 2
fi

destination="${1:?Usage: install-gitleaks.sh DESTINATION}"
mkdir -p "$destination"
temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT
curl --fail --silent --show-error --location --retry 3 \
  https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz \
  --output "$temporary/gitleaks.tar.gz"
echo "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb  $temporary/gitleaks.tar.gz" | sha256sum --check --status
tar -xzf "$temporary/gitleaks.tar.gz" -C "$temporary" gitleaks
install -m 0755 "$temporary/gitleaks" "$destination/gitleaks"
