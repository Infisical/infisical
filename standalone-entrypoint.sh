#!/bin/sh

update-ca-certificates

export SITE_URL="${SITE_URL:-$RENDER_EXTERNAL_URL}"

exec node --enable-source-maps dist/main.mjs
