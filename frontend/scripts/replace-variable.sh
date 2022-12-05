#!/bin/sh

ORIGINAL=$1
REPLACEMENT=$2

if [ "${ORIGINAL}" = "${REPLACEMENT}" ]; then
    echo "Replacement is the same, skipping.."
    exit 0
fi

echo "Replacing pre-baked value.."

find /app/public /app/.next -type f ! -name "*.png" ! -name "*.svg" ! -name "*.gif" ! -name "*.jpg" ! -name "*.jpeg" ! -name "*.ico" |
while read file; do
    sed -i "s|$ORIGINAL|$REPLACEMENT|g" "$file"
done
