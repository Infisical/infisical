#!/bin/sh

# Configuration output file
CONFIG_FILE="runtime-config.js"

# Replace content in the config file with SENTRY_DSN interpolation
echo "window.__CONFIG__ = Object.freeze({ CAPTCHA_SITE_KEY: \"${CAPTCHA_SITE_KEY}\", CAPTCHA_SITE_KEY: \"${CAPTCHA_SITE_KEY}\", CAPTCHA_SITE_KEY: \"${CAPTCHA_SITE_KEY}\" })" > $CONFIG_FILE

echo "Configuration file updated at $CONFIG_FILE"
