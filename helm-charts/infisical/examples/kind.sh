#!/usr/bin/env bash

## Infisical local k8s development environment setup script
## using 'kind' and 'ingress-nginx'
## https://kind.sigs.k8s.io/docs/user/ingress/
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
frontend:
    enabled: true
backend:
    enabled: true
mongodb:
    enabled: true
mailhog:
    enabled: true
backendEnvironmentVariables:
  ENCRYPTION_KEY: 6c1fe4e407b8911c104518103505b218
  JWT_AUTH_SECRET: 4be6ba5602e0fa0ac6ac05c3cd4d247f
  JWT_REFRESH_SECRET: 5f2f3c8f0159068dc2bbb3a652a716ff
  JWT_SERVICE_SECRET: f32f716d70a42c5703f4656015e76200
  JWT_SIGNUP_SECRET: 3679e04ca949f914c03332aaaeba805a
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
EOF
