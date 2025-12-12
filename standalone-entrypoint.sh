#!/bin/sh

update-ca-certificates

if [ -d "/backend/frontend-build/assets" ]; then
    cd /backend/frontend-build
    /backend/scripts/replace-standalone-build-variable.sh "__INFISICAL_CDN_URL__" "${CDN_URL:-}"
    cd /backend
fi

exec node --enable-source-maps dist/main.mjs
