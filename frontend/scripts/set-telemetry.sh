#!/bin/sh

VALUE=$1

find /app/public /app/.next -type f ! -name "*.png" ! -name "*.svg" ! -name "*.gif" ! -name "*.jpg" ! -name "*.jpeg" ! -name "*.ico" |
while read file; do
    sed -i "s|TELEMETRY_CAPTURING_ENABLED|$VALUE|g" "$file"
done
