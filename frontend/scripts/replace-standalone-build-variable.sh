#!/bin/sh

ORIGINAL=$1
REPLACEMENT=$2

if [ "${ORIGINAL}" = "${REPLACEMENT}" ]; then
    echo "Environment variable replacement is the same, skipping.."
    exit 0
fi

echo "Replacing pre-baked value.."

# Escape special characters in REPLACEMENT for sed to avoid regex issues and injection attacks
ESCAPED_REPLACEMENT=$(printf '%s\n' "$REPLACEMENT" | sed 's/[\/&]/\\&/g')

# Replace in JS files in assets directory
find assets -type f -name "*.js" |
while read file; do
    sed -i "s|$ORIGINAL|$ESCAPED_REPLACEMENT|g" "$file"
done

# Replace in index.html (for asset references)
if [ -f "index.html" ]; then
    sed -i "s|$ORIGINAL|$ESCAPED_REPLACEMENT|g" "index.html"
fi
