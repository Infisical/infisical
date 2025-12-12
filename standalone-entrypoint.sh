#!/bin/sh

update-ca-certificates

if [ -d "/backend/frontend-build/assets" ]; then
    cd /backend/frontend-build || { echo "ERROR: Failed to cd to frontend-build"; exit 1; }
    
    if ! /backend/scripts/replace-standalone-build-variable.sh "__INFISICAL_CDN_URL__" "${CDN_URL:-}"; then
        echo "WARNING: CDN URL replacement failed, assets may not load correctly"
    fi
    
    cd /backend || { echo "ERROR: Failed to cd to backend"; exit 1; }
fi

exec node --enable-source-maps dist/main.mjs
