#!/usr/bin/env bash

## Infisical local k8s development environment setup script
## using 'helm' and assume you already have a cluster and an ingress (nginx)
##

##
## DEVELOPMENT USE ONLY
## DO NOT USE IN PRODUCTION
##

# define variables
cluster_name=infisical
host=infisical.local

# install infisical (local development)
helm dep update
cat <<EOF | helm upgrade --install --atomic \
  -n infisical-dev --create-namespace \
  -f - \
  infisical-dev .
mailhog:
    enabled: true
backendEnvironmentVariables:
  SITE_URL: https://$host
  SMTP_FROM_ADDRESS: dev@$host
  SMTP_FROM_NAME: Local Infisical
  SMTP_HOST: mailhog
  SMTP_PASSWORD: ""
  SMTP_PORT: 1025
  SMTP_SECURE: false
  SMTP_USERNAME: dev@$host
frontendEnvironmentVariables:
  SITE_URL: https://$host
ingress:
  hostName: $host
EOF