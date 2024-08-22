#!/bin/sh

scripts/replace-variable.sh "$BAKED_NEXT_PUBLIC_POSTHOG_API_KEY" "$NEXT_PUBLIC_POSTHOG_API_KEY"

scripts/replace-variable.sh "$BAKED_NEXT_PUBLIC_INTERCOM_ID" "$NEXT_PUBLIC_INTERCOM_ID"

scripts/replace-variable.sh "$BAKED_NEXT_SAML_ORG_SLUG" "$NEXT_PUBLIC_SAML_ORG_SLUG"

scripts/replace-variable.sh "$BAKED_NEXT_PUBLIC_CAPTCHA_SITE_KEY" "$NEXT_PUBLIC_CAPTCHA_SITE_KEY"

if [ "$TELEMETRY_ENABLED" != "false" ]; then
    echo "Telemetry is enabled"
    scripts/set-telemetry.sh true
else
    echo "Client opted out of telemetry"
    scripts/set-telemetry.sh false
fi


node server.js
