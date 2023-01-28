# Infisical Helm Charts

Find our available charts and repository below. It requires you to have `helm` installed locally ([install]())

## Repository setup

Assuming you have `helm` already installed, it is straight-forward to add a Cloudsmith-based chart repository:

```sh
helm repo add infisical 'https://dl.cloudsmith.io/public/infisical/helm-charts/helm/charts/' && helm repo update
```

List our available charts :

```sh
helm search repo infisical
```

## Helm Chart Installation

Install one of our Helm charts by firstly connecting to a infrastructure orchestrator of your choice, and then run the following (examples below) :

```sh
# Install Infisical
helm upgrade --install \
  --create-namespace --namespace infisical \
  infisical/infisical

# Install Infisical Secrets Operator
helm upgrade --install \
  --create-namespace --namespace infisical \
  infisical/secrets-operator
```