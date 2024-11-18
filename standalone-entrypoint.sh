#!/bin/sh

update-ca-certificates

cd frontend-build
scripts/initialize-standalone-build.sh

cd ../

exec node --enable-source-maps dist/main.mjs
