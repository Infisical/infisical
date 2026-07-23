# Infisical Agent: Rendering Static & Dynamic PostgreSQL Secrets

This guide shows you how to configure the Infisical Agent to render both **static secrets** (API keys, tokens, configuration) and **auto-renewing dynamic PostgreSQL credentials** into separate config files.

## Quick Overview

The Infisical Agent is a daemon that:
1. Authenticates to Infisical using a platform-native auth method
2. Renews tokens automatically before expiration
3. Renders secrets to files using Go templates
4. Watches for changes and triggers on-change commands (app reloads, etc.)
5. Automatically renews dynamic secret leases (like database credentials)

For your use case, you'll need:
- **One template** for static secrets (using `listSecrets` or `listSecretsByProjectSlug`)
- **One template** for dynamic PostgreSQL credentials (using `dynamicSecret`)
- Polling interval short enough to catch renewal timing
- Optional: `revoke-credentials-on-shutdown` to clean up DB users on exit

---

## Complete Agent Config

Here's a production-ready `agent-config.yaml` that renders both static and dynamic secrets:

```yaml
# Infisical Agent Configuration
infisical:
  address: "https://app.infisical.com"           # Your Infisical instance
  exit-after-auth: false                          # Keep running to auto-renew
  revoke-credentials-on-shutdown: true            # Clean up DB users on shutdown
  retry-strategy:
    max-retries: 3
    max-delay: "5s"
    base-delay: "200ms"

# Authentication (choose one based on your platform)
auth:
  type: "universal-auth"                          # For local dev / Docker
  config:
    client-id: "./client-id"                      # Path to file with client ID
    client-secret: "./client-secret"              # Path to file with client secret
    remove_client_secret_on_read: false           # Keep files after reading

# Token storage (optional, for SDK/API access)
sinks:
  - type: "file"
    config:
      path: "/tmp/infisical-token"

# Secret rendering templates
templates:
  # Template 1: Static secrets (.env format)
  - template-content: |
      {{- with listSecretsByProjectSlug "my-project" "prod" "/" }}
      {{- range . }}
      {{ .Key }}={{ .Value }}
      {{- end }}
      {{- end }}
    destination-path: /app/secrets/app.env
    config:
      polling-interval: "5m"
      execute:
        command: "./reload-config.sh"
        timeout: 30

  # Template 2: Dynamic PostgreSQL credentials
  - template-content: |
      {{ with dynamicSecret "my-project" "prod" "/" "postgres-creds" "1h" }}
      # PostgreSQL auto-renewed credentials (TTL: 1h)
      DB_HOST=db.internal.example.com
      DB_PORT=5432
      DB_NAME=myapp
      DB_USER={{ .DB_USERNAME }}
      DB_PASSWORD={{ .DB_PASSWORD }}
      {{ end }}
    destination-path: /app/secrets/postgres.env
    config:
      polling-interval: "5m"
      execute:
        command: "./reconnect-db.sh"
        timeout: 30
```

---

## Template Explanations

### Static Secrets Template

```go
{{- with listSecretsByProjectSlug "my-project" "prod" "/" }}
{{- range . }}
{{ .Key }}={{ .Value }}
{{- end }}
{{- end }}
```

**What it does:**
- `listSecretsByProjectSlug` — fetch all secrets from the `my-project` project in the `prod` environment at path `/`
- `range` — iterate over each secret
- `{{ .Key }}={{ .Value }}` — render as `KEY=VALUE` pairs
- Whitespace control (`{{-` and `-}}`) — removes extra newlines

**Output example:**
```
API_KEY=sk-12345...
DATABASE_URL=postgresql://...
STRIPE_SECRET=rk-live-...
```

### Dynamic PostgreSQL Credentials Template

```go
{{ with dynamicSecret "my-project" "prod" "/" "postgres-creds" "1h" }}
DB_HOST=db.internal.example.com
DB_PORT=5432
DB_NAME=myapp
DB_USER={{ .DB_USERNAME }}
DB_PASSWORD={{ .DB_PASSWORD }}
{{ end }}
```

**What it does:**
- `dynamicSecret` — creates and renews a PostgreSQL credential lease
  - `"my-project"` — project slug
  - `"prod"` — environment slug
  - `"/"` — secret path where the dynamic secret is defined
  - `"postgres-creds"` — name of the dynamic secret in Infisical
  - `"1h"` — lease TTL (agent will auto-renew before expiration)
- `{{ .DB_USERNAME }}` and `{{ .DB_PASSWORD }}` — inject the generated credentials
- Host, port, and database name are static; credentials rotate automatically

**Output example:**
```
DB_HOST=db.internal.example.com
DB_PORT=5432
DB_NAME=myapp
DB_USER=generated_user_xyz
DB_PASSWORD=a1b2c3d4e5f6...
```

---

## How Auto-Renewal Works

### Dynamic Secret Lifecycle

1. **Initial lease creation:** Agent calls `dynamicSecret` → Infisical creates PostgreSQL user and password
2. **Lease stored:** Generated credentials stored in-memory (TTL = 1 hour in this example)
3. **Polling cycle:** Every 5 minutes, agent re-renders template
4. **Auto-renewal:** Before TTL expires (typically at 80% of TTL), agent auto-renews the lease
   - Old PostgreSQL user is revoked (or kept alive per your config)
   - New user/password created with fresh TTL
5. **Template re-renders:** New credentials injected into `/app/secrets/postgres.env`
6. **On-change command:** If credentials changed, runs `./reconnect-db.sh` to reconnect with new creds

### Why This Works

- **Deduplication:** If multiple templates reference the same dynamic secret, only one lease exists
- **Graceful rotation:** Your app gets a reload command to pick up new credentials before the old ones expire
- **Automatic cleanup:** With `revoke-credentials-on-shutdown: true`, PostgreSQL users are cleaned up when the agent exits

---

## Step-by-Step Setup

### 1. Create or Find Your Infisical Secrets

In the Infisical web UI:

**Static secrets** (in `/` path):
- `API_KEY` = your API key
- `DATABASE_URL` = static connection info (optional; you'll also have dynamic creds)
- `STRIPE_SECRET` = your Stripe secret key
- etc.

**Dynamic secret** (in `/` path):
- Name: `postgres-creds`
- Type: PostgreSQL
- Configuration: point to your PostgreSQL instance
  - Host
  - Port
  - Master user (with CREATE ROLE permissions)
  - Database
  - Optional: Role templates or TTL settings

### 2. Create Machine Identity

Create a **Machine Identity** in Infisical with access to your project. Get its:
- `client-id` (for universal-auth)
- `client-secret` (for universal-auth)

Or use platform-native auth (Kubernetes, AWS IAM, Azure, GCP).

### 3. Save Credentials Locally (for local dev / Docker)

Create files in your working directory:

```bash
# ./client-id
abc123def456...

# ./client-secret
xyz789uvw012...

# Make sure they're not world-readable
chmod 600 client-id client-secret
```

### 4. Create agent-config.yaml

Copy the complete config from the section above. Update:
- `client-id` and `client-secret` paths (or use platform-native auth)
- `listSecretsByProjectSlug "my-project"` → your actual project slug
- `dynamicSecret "my-project"` → your actual project slug
- `postgres-creds` → your dynamic secret name in Infisical
- `destination-path` values → where you want files written
- `execute.command` → your reload scripts

### 5. Create Reload Scripts

**`./reload-config.sh`** — called when static secrets change:
```bash
#!/bin/bash
set -e
echo "Static secrets updated, reloading application..."
# Signal your app to reload config
kill -HUP $(pgrep -f "my-app") || true
exit 0
```

**`./reconnect-db.sh`** — called when PostgreSQL credentials rotate:
```bash
#!/bin/bash
set -e
echo "Database credentials rotated, reconnecting..."
# Your app should read new credentials from /app/secrets/postgres.env
# and reconnect to PostgreSQL
kill -HUP $(pgrep -f "my-app") || true
exit 0
```

Make them executable:
```bash
chmod +x reload-config.sh reconnect-db.sh
```

### 6. Run the Agent

```bash
infisical agent --config ./agent-config.yaml
```

Watch the output:
```
[INFO] Starting Infisical Agent
[INFO] Authenticating with universal-auth...
[INFO] Token obtained, valid until 2026-04-14T12:00:00Z
[INFO] Rendering template 1/2: /app/secrets/app.env
[INFO] Rendering template 2/2: /app/secrets/postgres.env
[INFO] Dynamic secret lease created: postgres-creds (TTL: 1h)
[INFO] Polling every 5m for secret changes
```

### 7. Verify Output Files

```bash
# Static secrets
cat /app/secrets/app.env
# API_KEY=sk-12345...
# DATABASE_URL=...
# STRIPE_SECRET=...

# Dynamic PostgreSQL credentials
cat /app/secrets/postgres.env
# DB_HOST=db.internal.example.com
# DB_PORT=5432
# DB_NAME=myapp
# DB_USER=generated_user_xyz
# DB_PASSWORD=a1b2c3d4e5f6...
```

### 8. Source in Your Application

Load both files in your app startup:

**Node.js/JavaScript:**
```javascript
require('dotenv').config({ path: '/app/secrets/app.env' });
require('dotenv').config({ path: '/app/secrets/postgres.env' });
```

**Python:**
```python
from dotenv import load_dotenv
load_dotenv('/app/secrets/app.env')
load_dotenv('/app/secrets/postgres.env')
```

**Shell/Bash:**
```bash
source /app/secrets/app.env
source /app/secrets/postgres.env
```

---

## Polling Interval Tuning

The `polling-interval` controls how often the agent checks for secret changes.

**When to use short intervals (30s - 1m):**
- Rapid credential rotation needed (e.g., high-security environments)
- Applications that reconnect on every request
- Development/testing where fast feedback is important

**When to use long intervals (5m - 60m):**
- Stable production deployments
- Reduce API calls to Infisical
- Apps that maintain persistent database connections

In the example above, both templates use **5m**, which balances:
- Quick credential pickup (PostgreSQL user created within 5 minutes)
- Reasonable API load
- Safe renewal window (1h TTL with 5m refresh = 55m buffer before expiration)

---

## Dynamic Secret TTL Considerations

The TTL value in `dynamicSecret "..." "..." "..." "..." "1h"` is the **lease duration** Infisical will assign to the generated credentials.

**Recommended values:**
- **Short-lived (15m - 1h):** For high-security, frequent-rotation scenarios
- **Medium (1h - 4h):** Standard production default (example uses 1h)
- **Long-lived (4h - 24h):** Stable deployments with infrequent reconnects

**Auto-renewal timing:**
- Agent renews at ~80% of TTL
- For 1h TTL → renewal attempt at ~48 minutes
- Polling every 5m means new credentials appear within 5m of renewal

---

## Template Variations

### If using project ID instead of slug:

Replace:
```go
listSecretsByProjectSlug "my-project"
dynamicSecret "my-project"
```

With:
```go
listSecrets "6553ccb2b7da580d7f6e7260"
dynamicSecret "my-project"  # dynamicSecret requires slug, not ID
```

### If you want recursive secrets (subdirectories):

```go
{{- with listSecretsByProjectSlug "my-project" "prod" "/" `{"recursive": true}` }}
{{- range . }}
{{ .Key }}={{ .Value }}
{{- end }}
{{- end }}
```

### If you need JSON output instead of .env:

```go
{
{{- with listSecretsByProjectSlug "my-project" "prod" "/" }}
{{- range $i, $s := . }}
{{- if $i }},{{ end }}
  "{{ $s.Key }}": "{{ $s.Value }}"
{{- end }}
{{- end }}
}
```

### If you have multiple databases:

```yaml
templates:
  - template-content: |
      {{ with dynamicSecret "my-project" "prod" "/" "postgres-primary" "1h" }}
      PRIMARY_DB_USER={{ .DB_USERNAME }}
      PRIMARY_DB_PASS={{ .DB_PASSWORD }}
      {{ end }}
    destination-path: /app/secrets/postgres-primary.env

  - template-content: |
      {{ with dynamicSecret "my-project" "prod" "/" "postgres-replica" "1h" }}
      REPLICA_DB_USER={{ .DB_USERNAME }}
      REPLICA_DB_PASS={{ .DB_PASSWORD }}
      {{ end }}
    destination-path: /app/secrets/postgres-replica.env
```

Each gets its own lease and auto-renewal cycle.

---

## Troubleshooting

### "Dynamic secret lease not created"

- Verify the dynamic secret exists in Infisical with the correct name
- Check that the machine identity has permission to create dynamic secret leases
- Look for errors in agent logs: `infisical agent --config ... --debug` (if available)

### "Credentials expire before renewal"

- Increase TTL in the `dynamicSecret` call (e.g., `"2h"` instead of `"1h"`)
- Decrease `polling-interval` (e.g., `"1m"` instead of `"5m"`)
- Ensure your app's database connection pools reconnect when notified

### "On-change command not running"

- Verify the script path is correct and executable (`chmod +x`)
- Check that the script doesn't require shell (use `#!/bin/bash` shebang)
- Ensure the agent process has permission to execute the script
- Test manually: `./reload-config.sh` should succeed without errors

### "Secrets not updating in app"

- Confirm app reads from the correct file paths at startup
- For persistent connections (database, cache), your reload script must signal the app
- Check file permissions: agent must write, app must read
- Verify polling interval isn't so long that changes are missed during testing

---

## Security Best Practices

1. **File permissions:** Set restrictive permissions on secret files
   ```bash
   chmod 600 /app/secrets/*.env
   ```

2. **Machine identity credentials:** Never commit `client-id` or `client-secret` files
   ```bash
   echo "client-id" >> .gitignore
   echo "client-secret" >> .gitignore
   ```

3. **Revoke on shutdown:** Set `revoke-credentials-on-shutdown: true` so PostgreSQL users are cleaned up
   ```yaml
   infisical:
     revoke-credentials-on-shutdown: true
   ```

4. **No logs with secrets:** The agent never logs secret values — it only logs key names and paths

5. **Use platform-native auth:** Avoid storing client secrets; use Kubernetes, AWS IAM, Azure, or GCP auth when available

---

## Summary

You now have a complete, production-ready configuration that:

✓ Renders static secrets from Infisical to `/app/secrets/app.env`  
✓ Creates auto-renewing PostgreSQL credentials in `/app/secrets/postgres.env`  
✓ Automatically renews database credentials before expiration  
✓ Polls every 5 minutes for changes and reloads your app  
✓ Cleans up database users on shutdown  
✓ Handles multiple dynamic secrets independently  

The agent runs continuously, maintains token lifecycle, and ensures your application always has fresh credentials without manual intervention.
