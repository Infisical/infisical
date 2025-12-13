#!/bin/sh

update-ca-certificates

if [ -d "/backend/frontend-build/assets" ]; then
    cd /backend/frontend-build || { echo "ERROR: Failed to cd to frontend-build"; exit 1; }
    
    if ! /backend/scripts/replace-standalone-build-variable.sh "__INFISICAL_CDN_HOST__" "${CDN_HOST:-}"; then
        echo "WARNING: CDN HOST replacement failed, assets may not load correctly"
    fi
    
    cd /backend || { echo "ERROR: Failed to cd to backend"; exit 1; }
fi

exec node --enable-source-maps dist/main.mjs
