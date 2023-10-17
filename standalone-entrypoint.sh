#!/bin/sh

cd frontend-build
scripts/initialize-standalone-build.sh

cd ../

exec node build/index.js
