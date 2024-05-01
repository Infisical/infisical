#!/bin/bash

TEST_ENV_FILE=".test.env"

# Check if the .env file exists
if [ ! -f "$TEST_ENV_FILE" ]; then
    echo "$TEST_ENV_FILE does not exist."
    exit 1
fi

# Export the variables
while IFS='=' read -r key value
do
    # Skip empty lines and lines starting with #
    if [[ -z "$key" || "$key" =~ ^\# ]]; then
        continue
    fi
    # Use eval to correctly handle values with spaces
    eval export $key='$value'
done < "$TEST_ENV_FILE"

echo "Test environment variables set."
