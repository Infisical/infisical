#!/bin/sh

scripts/replace-variable.sh "$BAKED_NEXT_PUBLIC_POSTHOG_API_KEY" "$NEXT_PUBLIC_POSTHOG_API_KEY"

scripts/replace-variable.sh "$BAKED_NEXT_PUBLIC_INTERCOM_ID" "$NEXT_PUBLIC_INTERCOM_ID"

if [ "$TELEMETRY_ENABLED" != "false" ]; then
    echo "Telemetry is enabled"
    scripts/set-telemetry.sh true
else
    echo "Client opted out of telemetry"
    scripts/set-telemetry.sh false
fi


node server.js
