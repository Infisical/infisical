#!/bin/sh

docker-ensure-initdb.sh
pg_ctl start -D /var/lib/postgresql/data

cd /data/redis
redis-server --daemonize yes

cd /backend/frontend-build
scripts/initialize-standalone-build.sh

cd ../
npm run migration:latest
exec node dist/main.mjs
