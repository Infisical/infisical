#!/usr/bin/env bash

## Infisical local k8s development environment setup script
## using 'kind' and 'ingress-nginx'
## https://kind.sigs.k8s.io/docs/user/ingress/
##

##
## DEVELOPMENT USE ONLY
## DO NOT USE IN PRODUCTION
##

# define variables
cluster_name=infisical
host=infisical.local

# create the local cluster (expose 80/443 on localhost)
cat <<EOF | kind create cluster -n $cluster_name --wait --config=-
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
  kubeadmConfigPatches:
  - |
    kind: InitConfiguration
    nodeRegistration:
      kubeletExtraArgs:
        node-labels: "ingress-ready=true"
  extraPortMappings:
  - containerPort: 80
    hostPort: 80
    protocol: TCP
  - containerPort: 443
    hostPort: 443
    protocol: TCP
EOF

# install ingress-nginx
# kind version : https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
helm upgrade -i --atomic \
  --repo https://kubernetes.github.io/ingress-nginx \
  ingress-nginx ingress-nginx \
  -n ingress-nginx --create-namespace \
  --set controller.service.type="NodePort" \
  --set controller.hostPort.enabled=true \
  --set controller.service.externalTrafficPolicy=Local

kubectl wait -n ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s

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
