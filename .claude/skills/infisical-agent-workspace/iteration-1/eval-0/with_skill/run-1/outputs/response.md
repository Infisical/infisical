# Rendering Infisical Secrets to a .env File with Auto-Update

You want to run your Node.js app in Docker with a `.env` file that automatically updates when secrets change. The **Infisical Agent** is perfect for this—it runs as a sidecar daemon, authenticates to Infisical, renders secrets to a file via Go templates, and can trigger your app to reload.

## Quick Overview

The Infisical Agent:
- **Authenticates** using credentials you provide (platform-native auth or universal auth)
- **Renews tokens** automatically before expiration
- **Renders templates** to files (your `.env` in this case)
- **Polls for changes** and can trigger commands (e.g., app restart) when secrets update
- **Works in Docker** as a sidecar service

---

## Complete Agent Config File

Below is a **production-ready config** for a Node.js app in Docker. Adjust the project ID, environment, and auth method for your setup.

### Standard Docker Compose Sidecar Setup

```yaml
# agent-config.yaml
infisical:
  address: "https://app.infisical.com"  # Your Infisical instance (cloud or self-hosted)
  exit-after-auth: false                 # Keep running to watch for secret changes
  revoke-credentials-on-shutdown: true   # Clean up if using dynamic secrets

auth:
  type: "universal-auth"
  config:
    client-id: "/etc/infisical/client-id"           # Path to client ID file
    client-secret: "/etc/infisical/client-secret"   # Path to client secret file
    remove_client_secret_on_read: false

sinks:
  - type: "file"
    config:
      path: "/infisical/secrets/access-token"

templates:
  - template-content: |
      {{- with listSecrets "YOUR_PROJECT_ID" "production" "/" }}
      {{- range . }}
      {{ .Key }}={{ .Value }}
      {{- end }}
      {{- end }}
    destination-path: /infisical/secrets/.env
    config:
      polling-interval: "5m"             # Check for changes every 5 minutes
      execute:
        command: "kill -HUP 1"           # Signal Node process to reload (if app handles SIGHUP)
        timeout: 30
```

**Key settings explained:**

| Setting | Value | Why |
|---------|-------|-----|
| `exit-after-auth` | `false` | Agent keeps running to poll for changes |
| `polling-interval` | `5m` | Check for secret updates every 5 minutes (adjust as needed) |
| `execute.command` | `kill -HUP 1` | Send SIGHUP to Node.js (PID 1) to reload without restarting |
| `revoke-credentials-on-shutdown` | `true` | Clean up if using dynamic secrets |

---

## Docker Compose Setup

```yaml
# docker-compose.yml
version: "3.8"

services:
  infisical-agent:
    image: infisical/cli:latest
    command: agent --config /etc/infisical/agent-config.yaml
    volumes:
      - ./agent-config.yaml:/etc/infisical/agent-config.yaml:ro
      - ./client-id:/etc/infisical/client-id:ro
      - ./client-secret:/etc/infisical/client-secret:ro
      - shared-secrets:/infisical/secrets
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "test", "-f", "/infisical/secrets/.env"]
      interval: 30s
      timeout: 5s
      retries: 3

  app:
    build: .
    depends_on:
      infisical-agent:
        condition: service_healthy
    volumes:
      - shared-secrets:/app/secrets:ro
    environment:
      - NODE_ENV=production
      - PORT=3000
    ports:
      - "3000:3000"
    restart: unless-stopped

volumes:
  shared-secrets:
```

**How it works:**

1. **infisical-agent** starts first, renders `.env` to the shared volume
2. **healthcheck** verifies the file exists before app starts
3. **app** depends on the healthcheck, so it doesn't start until secrets are ready
4. Both containers share `/infisical/secrets` volume (app mounts read-only)

---

## Node.js App Integration

Your Node.js app reads the `.env` file normally:

```javascript
// app.js
require('dotenv').config({ path: '/app/secrets/.env' });

const express = require('express');
const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV });
});

const server = app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});

// Optional: reload secrets on SIGHUP (if execute.command sends kill -HUP 1)
process.on('SIGHUP', () => {
  console.log('Reloading secrets...');
  delete require.cache[require.resolve('dotenv')];
  require('dotenv').config({ path: '/app/secrets/.env', override: true });
});
```

If your app doesn't handle SIGHUP, skip the `execute.command` and just monitor the `.env` file with tools like `nodemon` or app-level watchers.

---

## Template Functions Reference

### For .env files (most common):

**Option 1: `listSecrets` (by project UUID)**
```yaml
template-content: |
  {{- with listSecrets "6553ccb2b7da580d7f6e7260" "dev" "/" }}
  {{- range . }}
  {{ .Key }}={{ .Value }}
  {{- end }}
  {{- end }}
```

**Option 2: `listSecretsByProjectSlug` (easier to read)**
```yaml
template-content: |
  {{- with listSecretsByProjectSlug "my-app" "production" "/" }}
  {{- range . }}
  {{ .Key }}={{ .Value }}
  {{- end }}
  {{- end }}
```

Both render all secrets from the path as `KEY=VALUE` pairs.

**Parameters:**
- `project-id` or `project-slug` — Your Infisical project
- `environment-slug` — `dev`, `staging`, `production`, etc.
- `secret-path` — `/` (root) or `/api`, `/database`, etc.
- Optional 4th param: `{"recursive": true, "expandSecretReferences": true}` to fetch subdirs and resolve `${VAR}` references

---

## Authentication Methods

Choose one based on your environment:

### Universal Auth (Docker Compose, any environment)
```yaml
auth:
  type: "universal-auth"
  config:
    client-id: "/etc/infisical/client-id"
    client-secret: "/etc/infisical/client-secret"
```
**How to get credentials:**
1. In Infisical → Project Settings → Machine Identities
2. Create a new universal auth identity
3. Copy the Client ID and Client Secret
4. Save to files: `client-id` and `client-secret`

### AWS IAM (ECS, EC2)
```yaml
auth:
  type: "aws-iam"
  config:
    identity-id: "MACHINE_IDENTITY_ID_HERE"
```
No credentials files needed—uses the ECS task role or EC2 instance role automatically.

### Kubernetes (K8s)
```yaml
auth:
  type: "kubernetes"
  config:
    identity-id: "/etc/infisical/identity-id"
    service-account-token: "/var/run/secrets/kubernetes.io/serviceaccount/token"
```
Service account token is provided automatically by K8s.

### Azure (ACI, VMs)
```yaml
auth:
  type: "azure"
  config:
    identity-id: "/etc/infisical/identity-id"
```

### GCP (Cloud Run, Compute Engine)
```yaml
auth:
  type: "gcp-id-token"
  config:
    identity-id: "/etc/infisical/identity-id"
```

---

## Advanced Features

### Dynamic Secrets (Database Credentials)

If you need database credentials that auto-rotate:

```yaml
templates:
  # Static secrets
  - template-content: |
      {{- with listSecretsByProjectSlug "my-app" "prod" "/" }}
      {{- range . }}
      {{ .Key }}={{ .Value }}
      {{- end }}
      {{- end }}
    destination-path: /infisical/secrets/app.env

  # Dynamic database credentials
  - template-content: |
      {{ with dynamicSecret "my-app" "prod" "/" "postgres-user" "1h" }}
      DB_HOST=db.internal.example.com
      DB_PORT=5432
      DB_USER={{ .DB_USERNAME }}
      DB_PASSWORD={{ .DB_PASSWORD }}
      {{ end }}
    destination-path: /infisical/secrets/db.env
    config:
      polling-interval: "15m"
      execute:
        command: "./reconnect-db.sh"
        timeout: 30
```

The agent automatically renews credentials before expiration.

### Persistent Caching (Kubernetes only)

If Infisical becomes temporarily unavailable, cached secrets are served:

```yaml
cache:
  persistent:
    type: "kubernetes"
    path: "/home/infisical/cache"
    service-account-token-path: "/var/run/secrets/kubernetes.io/serviceaccount/token"
```

### Init Container Mode (Kubernetes)

For one-shot secret rendering at startup:

```yaml
infisical:
  address: "https://app.infisical.com"
  exit-after-auth: true  # Render once and exit
```

---

## Polling & Performance

**`polling-interval`** controls how often the agent checks for secret changes:

| Interval | Use Case |
|----------|----------|
| `30s` | Latency-sensitive apps (real-time config changes) |
| `5m` | Standard apps (most deployments) |
| `1h` | Stable configs (minimal API load) |

Each poll hits the Infisical API, so tune based on your needs. For Docker, `5m` is a good starting point.

---

## Troubleshooting

### Secrets not rendering
- Check the project ID/slug and environment name in the template
- Verify the machine identity has access to that project
- Check agent logs: `docker logs <container-id>`

### `.env` file exists but app doesn't see changes
- If app caches env vars on startup, it won't see updates
- Use the `execute.command` to trigger reload (e.g., restart or SIGHUP)
- Or use a file watcher in your app (see SIGHUP example above)

### Agent keeps retrying auth
- Invalid client ID/secret
- Machine identity doesn't have permission on the project
- Infisical instance URL is wrong

### Polling too fast/slow
- Increase `polling-interval` to reduce API calls
- Decrease it if you need near-real-time updates

---

## Deployment Checklist

- [ ] Get Infisical project ID/slug and environment name
- [ ] Create a universal auth machine identity in Infisical
- [ ] Save `client-id` and `client-secret` files locally
- [ ] Update `agent-config.yaml` with your project ID and environment
- [ ] Update `docker-compose.yml` volume mounts
- [ ] Test locally: `docker-compose up`
- [ ] Verify `.env` is created in the shared volume
- [ ] Verify your app can read it
- [ ] Deploy to your environment (Docker, ECS, K8s, etc.)

---

## Summary

Your complete setup is:

1. **agent-config.yaml** — The config above (with your project ID and auth creds)
2. **docker-compose.yml** — Two services: agent + app
3. **Shared volume** — Both read/write to `/infisical/secrets`
4. **App code** — Load `.env` from `/app/secrets/.env`
5. **Optional reload** — Use `execute.command` or SIGHUP to detect changes

The agent handles all authentication, token renewal, and secret rendering—your app just reads the `.env` file like normal.
