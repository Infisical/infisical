# SDK Integration

For applications that need to fetch secrets programmatically — not just as environment variables, but within application logic. All SDKs follow the same pattern: initialize → authenticate → fetch secrets.

All SDKs cache secrets and fall back to cached values if requests fail. If no cache exists, they fall back to `process.env` (or equivalent).

## Quick reference

| Language | Package | Min version |
|----------|---------|-------------|
| Node.js | `@infisical/sdk` | Node 20+ (v5+) |
| Python | `infisicalsdk` | Python 3.7+ |
| Go | `github.com/infisical/go-sdk` | Go 1.19+ |
| Java | `com.infisical:sdk` | Java 11+ |
| .NET | `Infisical.Sdk` | .NET 6+ |
| Ruby | `infisical-sdk` | Ruby 2.7+ |

## Node.js

```bash
npm install @infisical/sdk
```

```typescript
import { InfisicalSDK } from '@infisical/sdk';

const client = new InfisicalSDK({
  siteUrl: "https://app.infisical.com" // optional, this is the default
});

// Authenticate with a machine identity
await client.auth().universalAuth.login({
  clientId: "<machine-identity-client-id>",
  clientSecret: "<machine-identity-client-secret>"
});

// List all secrets
const secrets = await client.secrets().listSecrets({
  environment: "dev",
  projectId: "<your-project-id>",
  secretPath: "/"
});

// Get a single secret
const secret = await client.secrets().getSecret({
  secretName: "API_KEY",
  environment: "prod",
  projectId: "<your-project-id>"
});
console.log(secret.secretValue);

// Create a secret
await client.secrets().createSecret({
  secretName: "NEW_KEY",
  secretValue: "value",
  environment: "dev",
  projectId: "<your-project-id>"
});
```

Also supports: `updateSecret`, `deleteSecret`, dynamic secrets (leases), KMS encrypt/decrypt.

## Python

```bash
pip install infisicalsdk
```

```python
from infisical_sdk import InfisicalSDKClient

client = InfisicalSDKClient(
    host="https://app.infisical.com",
    cache_ttl=60  # seconds, None to disable
)

client.auth.universal_auth.login(
    client_id="<client-id>",
    client_secret="<client-secret>"
)

# List secrets
secrets = client.secrets.list_secrets(
    project_id="<project-id>",
    environment_slug="dev",
    secret_path="/"
)

# Get one secret
secret = client.secrets.get_secret(
    secret_name="API_KEY",
    project_id="<project-id>",
    environment_slug="prod"
)
print(secret.secret_value)
```

Auth methods: Universal Auth, AWS IAM, OIDC, LDAP, Token Auth.

## Go

```bash
go get github.com/infisical/go-sdk
```

```go
package main

import (
    "context"
    "fmt"
    infisical "github.com/infisical/go-sdk"
)

func main() {
    client := infisical.NewInfisicalClient(context.Background(), infisical.Config{
        SiteUrl:          "https://app.infisical.com",
        AutoTokenRefresh: true,
    })

    _, err := client.Auth().UniversalAuthLogin("CLIENT_ID", "CLIENT_SECRET")
    if err != nil {
        panic(err)
    }

    secret, err := client.Secrets().Retrieve(infisical.RetrieveSecretOptions{
        SecretKey:   "API_KEY",
        Environment: "prod",
        ProjectID:   "YOUR_PROJECT_ID",
        SecretPath:  "/",
    })
    fmt.Println(secret.SecretValue)
}
```

Auth methods: Universal Auth, GCP (ID Token & IAM), AWS IAM, Azure, Kubernetes, JWT, LDAP, OCI.

**Note**: Set `AutoTokenRefresh: true` for long-running processes. For multiple clients, manage context cancellation properly to avoid leaked goroutines.

## Java

```xml
<dependency>
    <groupId>com.infisical</groupId>
    <artifactId>sdk</artifactId>
    <version>{version}</version>
</dependency>
```

```java
var sdk = new InfisicalSdk(
    new SdkConfig.Builder()
        .withSiteUrl("https://app.infisical.com")
        .build()
);

sdk.Auth().UniversalAuthLogin("CLIENT_ID", "CLIENT_SECRET");

var secret = sdk.Secrets().GetSecret(
    "API_KEY",       // secret name
    "<project-id>",  // project ID
    "prod",          // environment
    "/",             // path
    null, null, null // optional: expandRefs, includeImports, type
);
System.out.println(secret.getValue());
```

## .NET

```bash
dotnet add package Infisical.Sdk
```

```csharp
var settings = new InfisicalSdkSettingsBuilder()
    .WithHostUri("https://app.infisical.com")
    .Build();

var client = new InfisicalClient(settings);

await client.Auth().UniversalAuth().LoginAsync("<client-id>", "<client-secret>");

var secrets = await client.Secrets().ListAsync(new ListSecretsOptions {
    EnvironmentSlug = "prod",
    SecretPath = "/",
    ProjectId = "<project-id>",
    SetSecretsAsEnvironmentVariables = true  // optional: auto-set as env vars
});
```

## Ruby

```bash
gem install infisical-sdk
```

```ruby
require 'infisical-sdk'

client = InfisicalSDK::InfisicalClient.new('https://app.infisical.com')

client.auth.universal_auth(
    client_id: 'CLIENT_ID',
    client_secret: 'CLIENT_SECRET'
)

secret = client.secrets.get(
    secret_name: 'API_KEY',
    project_id: '<project-id>',
    environment: 'prod'
)
puts secret.secret_value
```

Cache default: 5 minutes. Set to 0 to disable.

## When to use SDK vs. CLI

| Scenario | Use |
|----------|-----|
| Local dev, any framework | CLI (`infisical run -- ...`) |
| Docker containers | CLI (see `docker-integration.md`) |
| Need secrets in application logic (not just env vars) | SDK |
| Dynamic secrets / leases | SDK |
| KMS encrypt/decrypt | SDK |
| Kubernetes pods | Operator (see `kubernetes-operator.md`) or SDK |
| CI/CD pipelines | CLI or OIDC action (see `cicd-integration.md`) |

## Auth method availability by SDK

All SDKs support Universal Auth. Cloud-native auth varies:

| Auth method | Node | Python | Go | Java | .NET | Ruby |
|------------|------|--------|-----|------|------|------|
| Universal Auth | Yes | Yes | Yes | Yes | Yes | Yes |
| AWS IAM | Yes | Yes | Yes | — | — | Yes |
| GCP | — | — | Yes | — | — | Yes |
| Azure | — | — | Yes | — | — | Yes |
| Kubernetes | — | — | Yes | — | — | Yes |
| OIDC | — | Yes | — | — | — | — |
| LDAP | — | Yes | Yes | — | Yes | — |
