# Infisical Agent Configuration Reference

## Running the Agent

```bash
infisical agent --config /path/to/agent-config.yaml
```

Requires the Infisical CLI to be installed first.

## Full Config File Structure

```yaml
infisical:
  address: "https://app.infisical.com"      # Infisical instance URL
  exit-after-auth: false                      # Exit after first auth + render
  revoke-credentials-on-shutdown: false       # Revoke leases/tokens on shutdown
  retry-strategy:
    max-retries: 3                            # Max retry attempts
    max-delay: "5s"                           # Max delay between retries
    base-delay: "200ms"                       # Base delay (exponential backoff)

auth:
  type: "<auth-method>"                       # See Auth Methods below
  config:
    # Auth-method-specific fields

sinks:                                        # Where access tokens are deposited
  - type: "file"
    config:
      path: "/path/to/access-token"

cache:                                        # Optional persistent caching
  persistent:
    type: "kubernetes"
    path: "/home/infisical/cache"
    service-account-token-path: "/var/run/secrets/kubernetes.io/serviceaccount/token"

templates:                                    # Secret rendering templates
  - source-path: "/path/to/template.tpl"      # File-based template
    # OR
    template-content: |                       # Inline template
      {{- with listSecrets "project-id" "env" "/" }}
      {{- range . }}
      {{ .Key }}={{ .Value }}
      {{- end }}
      {{- end }}
    destination-path: "/path/to/output/.env"
    config:
      polling-interval: "5m"                  # How often to check for changes
      execute:
        command: "./reload-app.sh"            # Run on secret change
        timeout: 30                           # Command timeout in seconds
```

## Auth Methods

### Universal Auth (fallback for any environment)
```yaml
auth:
  type: "universal-auth"
  config:
    client-id: "./client-id"                  # Path to file containing client ID
    client-secret: "./client-secret"          # Path to file containing client secret
    remove_client_secret_on_read: false       # Delete secret file after reading
```

### Kubernetes (recommended on K8s)
```yaml
auth:
  type: "kubernetes"
  config:
    identity-id: "./identity-id"              # Path to file with machine identity ID
    service-account-token: "/var/run/secrets/kubernetes.io/serviceaccount/token"  # Optional
```

### AWS IAM (recommended on AWS)
```yaml
auth:
  type: "aws-iam"
  config:
    identity-id: "./identity-id"              # Path to file with machine identity ID
```
Uses the instance's IAM role automatically — no access keys needed.

### Azure (recommended on Azure)
```yaml
auth:
  type: "azure"
  config:
    identity-id: "./identity-id"              # Path to file with machine identity ID
```

### GCP ID Token (recommended on GCP)
```yaml
auth:
  type: "gcp-id-token"
  config:
    identity-id: "./identity-id"              # Path to file with machine identity ID
```

### GCP IAM
```yaml
auth:
  type: "gcp-iam"
  config:
    identity-id: "./identity-id"              # Path to file with machine identity ID
    service-account-key: "./key.json"         # Path to GCP service account JSON key
```

## Sinks

Sinks are where the agent deposits renewed access tokens. Currently only file sinks are supported.

```yaml
sinks:
  - type: "file"
    config:
      path: "/tmp/access-token"
```

**Important distinction:** Sinks deposit raw access tokens (for SDK/API use). Templates render actual secret values to files. Most users want templates, not sinks.

## Token Renewal Lifecycle

1. Agent starts → authenticates using configured auth method
2. If auth fails → retries with exponential backoff (base-delay up to max-delay)
3. Token obtained → written to all sinks
4. Agent monitors token expiry → renews before expiration
5. Each renewal → writes new token to all sinks
6. Templates rendered → secrets fetched using the token
7. Templates re-render on polling-interval → detects secret changes
8. If secrets changed and `execute.command` is set → command runs

## Caching (Kubernetes only)

Persistent caching stores secrets locally so the agent can serve them even if Infisical is temporarily unavailable.

```yaml
cache:
  persistent:
    type: "kubernetes"
    path: "/home/infisical/cache"
    service-account-token-path: "/var/run/secrets/kubernetes.io/serviceaccount/token"
```

- Only available in Kubernetes environments
- Stale dynamic secret leases are auto-evicted and refreshed
- Cache GC runs every 10 minutes

## Key Config Options

| Setting | When to use |
|---------|------------|
| `exit-after-auth: true` | Init containers, one-shot renders (render secrets once and exit) |
| `revoke-credentials-on-shutdown: true` | Clean up dynamic secret leases when agent stops |
| `polling-interval: "30s"` | Latency-sensitive apps that need fast secret updates |
| `polling-interval: "60m"` | Stable configs where secrets rarely change |
| `execute.command` | Trigger app restarts or config reloads on secret changes |
