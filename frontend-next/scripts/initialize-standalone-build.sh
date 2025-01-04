#!/bin/sh

scripts/replace-standalone-build-variable.sh "$BAKED_NEXT_PUBLIC_POSTHOG_API_KEY" "$NEXT_PUBLIC_POSTHOG_API_KEY"

scripts/replace-standalone-build-variable.sh "$BAKED_NEXT_PUBLIC_INTERCOM_ID" "$NEXT_PUBLIC_INTERCOM_ID"

scripts/replace-standalone-build-variable.sh "$BAKED_NEXT_PUBLIC_CAPTCHA_SITE_KEY" "$NEXT_PUBLIC_CAPTCHA_SITE_KEY"

if [ "$TELEMETRY_ENABLED" != "false" ]; then
    echo "Telemetry is enabled"
    scripts/set-standalone-build-telemetry.sh true
else
    echo "Client opted out of telemetry"
    scripts/set-standalone-build-telemetry.sh false
fi
