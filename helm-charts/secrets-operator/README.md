

# Infisical Operator Helm Chart

| Name | Chart | Application |
| - | - | - |
| [secrets-operator](https://infisical.com/docs/integrations/platforms/kubernetes#install-operator) | [![Latest version of 'secrets-operator' @ Cloudsmith](https://api-prd.cloudsmith.io/v1/badges/version/infisical/helm-charts/helm/secrets-operator/latest/x/?render=true&show_latest=true)](https://cloudsmith.io/~infisical/repos/helm-charts/packages/detail/helm/secrets-operator/latest/) | `v0.3.3` |

Infisical secrets k8s operator. Sync your secrets from Infisical to your clusters

## Installation & upgrade

To install or upgrade the `secrets-operator` chart, run the following:

```sh
# add the Infisical Helm repository
helm repo add infisical 'https://dl.cloudsmith.io/public/infisical/helm-charts/helm/charts/' && helm repo update
```

```sh
# with default values
helm upgrade --install --atomic \
  -n infisical-dev --create-namespace \
  secrets-operator infisical/secrets-operator

# with custom inline values (replace with your own values)
helm upgrade --install --atomic \
  -n infisical-dev --create-namespace \
  --set ingress.hostName=custom.example.org \
  secrets-operator infisical/secrets-operator

# with custom values file (replace with your own values file)
helm upgrade --install --atomic \
  -n infisical-dev --create-namespace \
  -f custom-values.yaml \
  secrets-operator infisical/secrets-operator
```

Documentation is also available here : https://infisical.com/docs/self-hosting/deployment-options/kubernetes-helm

> [!IMPORTANT]
> If you change the configuration variables in the `infisical-secrets` resource, you might have to restart the infisical deployment to take effect

### Encryption keys

If you did not explicitly set required environment variables, the local setup ([./examples](./examples)) auto-generated them by default. It's recommended to save these credentials somewhere safe. Run the following command in your cluster where Infisical chart is installed.
 
> [!NOTE]
> Requires [`jq`](https://stedolan.github.io/jq/download/)

```sh
# export secrets to a given file
kubectl get secrets -n infisical-dev infisical-secrets \
  -o json | jq '.data | map_values(@base64d)' > \
  infisical-secrets.$(date +%s).bak
```

### Upgrading

Find the chart upgrade instructions below. When upgrading from your version to one of the listed below, please follow every instructions in between to correctly migrate all your data and avoid loss and unexpected issues.

#### Instructions

1. Make sure **you have all the required environment variables** defined in the value file (`values.yaml` or inline `--set`) you'll provide to `helm`
   1. e.g. All the above mentioned variables
1. **Backup your existing secrets** (before the upgrade, for safety precaution)
   1. e.g. `kubectl get secret infisical-secrets --namespace infisical-dev -o json | jq '{name: .metadata.name,data: .data|map_values(@base64d)}'`
2. **Upgrade the chart**, with the [instructions](#upgrading)
3. You're all set!

---

<details open>
<summary>

### **`0.3.4`** (`v0.3.3`)
</summary>

Latest stable version, no breaking changes

</details>

## Parameters

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| controllerManager.kubeRbacProxy.image.repository | string | `"gcr.io/kubebuilder/kube-rbac-proxy"` |  |
| controllerManager.kubeRbacProxy.image.tag | string | `"v0.15.0"` |  |
| controllerManager.kubeRbacProxy.resources.limits.cpu | string | `"500m"` |  |
| controllerManager.kubeRbacProxy.resources.limits.memory | string | `"128Mi"` |  |
| controllerManager.kubeRbacProxy.resources.requests.cpu | string | `"5m"` |  |
| controllerManager.kubeRbacProxy.resources.requests.memory | string | `"64Mi"` |  |
| controllerManager.manager.image.repository | string | `"infisical/kubernetes-operator"` |  |
| controllerManager.manager.image.tag | string | `"latest"` |  |
| controllerManager.manager.resources.limits.cpu | string | `"500m"` |  |
| controllerManager.manager.resources.limits.memory | string | `"128Mi"` |  |
| controllerManager.manager.resources.requests.cpu | string | `"10m"` |  |
| controllerManager.manager.resources.requests.memory | string | `"64Mi"` |  |
| controllerManager.replicas | int | `1` |  |
| kubernetesClusterDomain | string | `"cluster.local"` |  |
| metricsService.ports[0].name | string | `"https"` |  |
| metricsService.ports[0].port | int | `8443` |  |
| metricsService.ports[0].protocol | string | `"TCP"` |  |
| metricsService.ports[0].targetPort | string | `"https"` |  |
| metricsService.type | string | `"ClusterIP"` |  |

## Validation

You can automatically validate your custom `values.yaml` schema and get YAML auto-completion in your IDE, refer to this [section](../README.md#validation)

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
  # time in seconds between each secret re-sync from Infisical (default 60s)
  resyncInterval: 60
  authentication:
    serviceToken:
      # k8s secret which stores then corresponding Infisical token
      serviceTokenSecretReference:
        secretName: service-token
        secretNamespace: default
      # scope of what secrets should be fetched from infisical
      secretsScope:
        envSlug: dev
        secretsPath: "/"
  # secret that's going to be created by the operator and populated with secrets from the above configuration
  managedSecretReference:
    # name of managed secret
    secretName: managed-secret
    # namespace of the managed secret
    secretNamespace: default
EOF
```

Documentation is also available here : https://infisical.com/docs/integrations/platforms/kubernetes#sync-infisical-secrets-to-your-cluster

## Managed secrets

### Methods

To use the above created manage secrets, you can use the below methods:

- `env`
- `envFrom`
- `volumes`

Check the [docs](https://infisical.com/docs/integrations/platforms/kubernetes#using-managed-secret-in-your-deployment) to learn more about their implementation within your k8s resources

### Auto-reload

To [auto-reload](https://infisical.com/docs/integrations/platforms/kubernetes#auto-redeployment) your deployments, add this annotation where the managed secret is consumed:

```yaml
annotations:
  secrets.infisical.com/auto-reload: "true"
```

```yml
# example

apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  labels:
    app: my-app
  annotations:
    # re-deployment annotation
    secrets.infisical.com/auto-reload: "true"
spec:
  ...
```

## Local development

*Coming soon*
