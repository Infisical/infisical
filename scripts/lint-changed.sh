#!/usr/bin/env sh

DIR=$1
shift
FILES="$@"

if [ -z "$FILES" ]; then
    exit 0
fi

# Strip the directory prefix from each file
STRIPPED_FILES=""
for file in $FILES; do
    STRIPPED_FILES="$STRIPPED_FILES ${file#$DIR/}"
done

echo "Linting $DIR files: $STRIPPED_FILES"
(cd "$DIR" && npx eslint --max-warnings 0 $STRIPPED_FILES)
