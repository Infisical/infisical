#!/bin/sh

update-ca-certificates

# Initialize SoftHSM token if it doesn't exist
if [ ! -f /etc/softhsm2/tokens/auth-app.db ]; then
  echo "Initializing SoftHSM token..."
  mkdir -p /etc/softhsm2/tokens
  softhsm2-util --init-token --slot 0 --label "auth-app" --pin 1234 --so-pin 0000
  echo "SoftHSM token initialized"
else
  echo "SoftHSM token already exists, skipping initialization"
fi


exec "$@"