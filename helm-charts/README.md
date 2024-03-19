# Infisical Helm Charts

Welcome to Infisical Helm Charts repository! Find instructions below to setup and install our charts.

## Charts

Here's the link to our charts corresponding installation instructions:

- [**`infisical-standalone`**](./infisical-standalone-postgres/README.md#installation--upgrade) (recommended, postgres version)
  - Official Infisical standalone version
  - https://infisical.com/docs/self-hosting/deployment-options/kubernetes-helm
  - [`infisical`](./infisical/README.md#installation--upgrade) (deprecated)
- [**`secrets-operator`**](./secrets-operator/README.md#installation--upgrade)
  - Official Infisical Secrets Operator version
  - https://infisical.com/docs/integrations/platforms/kubernetes#install-operator

## Validation

Take advantage of our YAML schema validation and auto-completion in your IDE and through Helm commands.

1. Choose and install any plugin which supports the `yaml-language-server` annotation (e.g. [VSCode - YAML](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml))
2. Automatically validate your configuration
   1. Either using the chart's default `values.yaml` already configured
   2. Or create your custom `values.yaml` file and place the following at the top of it
      1. `yaml-language-server: $schema=<path-or-url-to-the-schema>`
      2. e.g. for the latest `infisical-standalone` chart, you'll use `https://raw.githubusercontent.com/Infisical/infisical/main/helm-charts/infisical-standalone-postgres/Chart.yaml`

```yml
# yaml-language-server: $schema=https://raw.githubusercontent.com/Infisical/infisical/main/helm-charts/infisical-standalone-postgres/values.schema.json

foo: bar
...
```

## Documentation

We're trying to follow a documentation convention across our charts, allowing us to auto-generate markdown documentation thanks to [`helm-docs`](https://github.com/norwoodj/helm-docs) and [helm-schema](https://github.com/dadav/helm-schema) to generate the YAML validation file (`values.schema.json`)

You'll need to install these two tools:

- [`helm-docs`](https://github.com/norwoodj/helm-docs#installation)
  - `brew install norwoodj/tap/helm-docs` (unix)
  - `scoop install helm-docs` (windows)
  - `go install github.com/norwoodj/helm-docs/cmd/helm-docs@latest` (binary)
- [`helm-schema`](https://github.com/dadav/helm-schema#installation)
  - `go install github.com/dadav/helm-schema/cmd/helm-schema@latest` (binary)

> [!NOTE]
> Go text templating is used to generate the documentation, please find more details [here](https://pkg.go.dev/text/template) (syntax, functions).

### Manually

To run the update once and don't want to setup the pre-commit hooks, you can just run both binaries and you'll get the same results:

```sh
cd helm-charts/

# generate the docs
helm-docs -t ./_templates.gotmpl -t README.md.gotmpl -s file

# generate the schemas
helm-schema -n -k required,default,additionalProperties
```

### Pre-commit

Using `pre-commit` (recommended) to automatically generate the docs without having to think about it, now and for your future contributions. Will update the docs if your commit contains any of the matching files. Here's how to setup the `pre-commit` hooks:

1. Install [`pre-commit`](https://pre-commit.com/#install)
   1. `brew install pre-commit` (unix)
   2. `pip install pre-commit` (python)
2. Execute the below commands

```sh
# update current pre-commit repos (optional)
pre-commit autoupdate

# install the requirements defined in '.pre-commit-config.yaml'
pre-commit install

# setup the hooks in '.git/hooks'
pre-commit install-hooks
```

For further details about their respective pre-commit configuration:
- https://github.com/norwoodj/helm-docs#pre-commit-hook
- https://github.com/dadav/helm-schema#pre-commit-hook

> [!NOTE]
> You can type `pre-commit run -all` to run the hooks manually