#!/bin/sh

cd frontend-build
scripts/initialize-standalone-build.sh

cd ../

exec node dist/main.mjs
