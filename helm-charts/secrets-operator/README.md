# Infisical Helm Chart

This is the Infisical Secrets Operator Helm chart. Find the integration documentation [here](https://infisical.com/docs/integrations/platforms/kubernetes)

## Installation

To install the chart, run the following :

```sh
# Add the Infisical repository
helm repo add infisical 'https://dl.cloudsmith.io/public/infisical/helm-charts/helm/charts/' && helm repo update

# Install Infisical Secrets Operator (with default values)
helm upgrade --install --atomic \
  -n infisical-dev --create-namespace \
  infisical-secrets-operator infisical/secrets-operator

# Install Infisical Secrets Operator (with custom inline values, replace with your own values)
helm upgrade --install --atomic \
  -n infisical-dev --create-namespace \
  --set controllerManager.replicas=3 \
  infisical-secrets-operator infisical/secrets-operator

# Install Infisical Secrets Operator (with custom values file, replace with your own values file)
helm upgrade --install --atomic \
  -n infisical-dev --create-namespace \
  -f custom-values.yaml \
  infisical-secrets-operator infisical/secrets-operator
```

## Synchronization

To sync your secrets from Infisical (or from your own instance), create the below resources :

```sh
# Create the tokenSecretReference (replace with your own token)
kubectl create secret generic infisical-example-service-token \
  --from-literal=infisicalToken="<infisical-token-here>"

# Create the InfisicalSecret
cat <<EOF | kubectl apply -f -
apiVersion: secrets.infisical.com/v1alpha1
kind: InfisicalSecret
metadata:
  # Name of of this InfisicalSecret resource
  name: infisicalsecret-example
spec:
  # The host that should be used to pull secrets from. The default value is https://app.infisical.com/api.
  hostAPI: https://app.infisical.com/api

  # The Kubernetes secret the stores the Infisical token
  tokenSecretReference:
    # Kubernetes secret name
    secretName: infisical-example-service-token
    # The secret namespace
    secretNamespace: default

  # The Kubernetes secret that Infisical Operator will create and populate with secrets from the above project
  managedSecretReference:
    # The name of managed Kubernetes secret that should be created
    secretName: infisical-managed-secret
    # The namespace(s) the managed secret should be installed in
    # Single namespace: "default"
    # Multiple namespaces: "ns1,ns2,ns3"
    secretNamespace: default
EOF
```

### Managed secrets

Latest stable version, no breaking changes

**Multi-namespace support:** You can now create secrets in multiple namespaces by providing a comma-separated list:
```yaml
managedSecretReference:
  secretName: infisical-managed-secret
  secretNamespace: namespace1,namespace2,namespace3
```

#### Methods

To use the above created manage secrets, you can use the below methods :
- `env`
- `envFrom`
- `volumes`

Check the [docs](https://infisical.com/docs/integrations/platforms/kubernetes#using-managed-secret-in-your-deployment) to learn more about their implementation within your k8s resources

#### Auto-reload

And if you want to [auto-reload](https://infisical.com/docs/integrations/platforms/kubernetes#auto-redeployment) your deployments, add this annotation where the managed secret is consumed :

```yaml
annotations:
  secrets.infisical.com/auto-reload: "true"
```

## Parameters

*Coming soon*

## Local development

*Coming soon*

## Upgrading

### 0.1.2

Latest stable version, no breaking changes