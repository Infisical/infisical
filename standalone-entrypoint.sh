#!/bin/sh

update-ca-certificates

exec node --max-old-space-size=1024 --enable-source-maps dist/main.mjs
