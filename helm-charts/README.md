# Infisical Helm Charts

Welcome to Infisical Helm Charts repository! Find instructions below to setup and install our charts.

## Installation

```sh
# Add the Infisical repository
helm repo add infisical 'https://dl.cloudsmith.io/public/infisical/helm-charts/helm/charts/' && helm repo update

# Install Infisical (default values)
helm upgrade --install --atomic \
  -n infisical --create-namespace \
  infisical infisical/infisical
  
# Install Infisical Secrets Operator (default values)
helm upgrade --install --atomic \
  -n infisical --create-namespace \
  infisical-secrets-operator infisical/secrets-operator
```

## Charts

Here's the link to our charts corresponding documentation :

- [**`infisical`**](./infisical/README.md)
- [**`secrets-operator`**](./secrets-operator/README.md)

## Documentation

We're trying to follow a documentation convention across our charts, allowing us to auto-generate markdown documentation thanks to [this tool](https://github.com/bitnami-labs/readme-generator-for-helm)

Steps to update the documentation :
1. `cd helm-charts/<chart>`
1. `git clone https://github.com/bitnami-labs/readme-generator-for-helm`
1. `npm install ./readme-generator-for-helm`
1. `npm exec readme-generator -- --readme README.md --values values.yaml`
   - It'll insert the table below the `## Parameters` title
   - It'll output errors if some of the path aren't documented
