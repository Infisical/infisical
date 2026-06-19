# Infisical Agent Deployment Examples

## Basic Local Development

```yaml
# agent-config.yaml
infisical:
  address: "https://app.infisical.com"

auth:
  type: "universal-auth"
  config:
    client-id: "./client-id"
    client-secret: "./client-secret"

sinks:
  - type: "file"
    config:
      path: "/tmp/infisical-token"

templates:
  - template-content: |
      {{- with listSecrets "6553ccb2b7da580d7f6e7260" "dev" "/" }}
      {{- range . }}
      {{ .Key }}={{ .Value }}
      {{- end }}
      {{- end }}
    destination-path: /app/.env
    config:
      polling-interval: 5m
      execute:
        command: ./restart-app.sh
        timeout: 30
```

**Run:** `infisical agent --config agent-config.yaml`

---

## Docker Compose Sidecar

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

  app:
    image: myapp:latest
    volumes:
      - shared-secrets:/app/secrets:ro
    depends_on:
      - infisical-agent

volumes:
  shared-secrets:
```

```yaml
# agent-config.yaml (for Docker Compose)
infisical:
  address: "https://app.infisical.com"

auth:
  type: "universal-auth"
  config:
    client-id: "/etc/infisical/client-id"
    client-secret: "/etc/infisical/client-secret"

sinks:
  - type: "file"
    config:
      path: "/infisical/secrets/access-token"

templates:
  - template-content: |
      {{- with listSecrets "<project-id>" "dev" "/" }}
      {{- range . }}
      {{ .Key }}={{ .Value }}
      {{- end }}
      {{- end }}
    destination-path: /infisical/secrets/.env
    config:
      polling-interval: 5m
```

---

## AWS ECS Sidecar

Use `aws-iam` auth so no credentials need to be stored. The agent uses the ECS task role automatically.

```yaml
# agent-config.yaml (for ECS)
infisical:
  address: "https://app.infisical.com"
  exit-after-auth: true                    # Render once and exit (init-style)

auth:
  type: "aws-iam"
  config:
    identity-id: "<machine-identity-id>"   # Inline ID (no file path needed in ECS)

sinks:
  - type: "file"
    config:
      path: "/infisical/secrets/access-token"

templates:
  - template-content: |
      {{- with listSecretsByProjectSlug "my-project" "prod" "/" }}
      {{- range . }}
      {{ .Key }}={{ .Value }}
      {{- end }}
      {{- end }}
    destination-path: /infisical/secrets/.env
```

**ECS Task Definition snippet:**
```json
{
  "containerDefinitions": [
    {
      "name": "infisical-agent",
      "image": "infisical/cli:latest",
      "command": ["agent", "--config", "/etc/infisical/agent-config.yaml"],
      "essential": false,
      "mountPoints": [
        { "sourceVolume": "secrets", "containerPath": "/infisical/secrets" }
      ],
      "environment": [
        { "name": "INFISICAL_MACHINE_IDENTITY_ID", "value": "<identity-id>" }
      ]
    },
    {
      "name": "app",
      "image": "myapp:latest",
      "essential": true,
      "dependsOn": [
        { "containerName": "infisical-agent", "condition": "COMPLETE" }
      ],
      "mountPoints": [
        { "sourceVolume": "secrets", "containerPath": "/app/secrets", "readOnly": true }
      ]
    }
  ],
  "volumes": [
    { "name": "secrets" }
  ]
}
```

---

## Kubernetes Init Container

Use `exit-after-auth: true` to render secrets once and let the main container start.

```yaml
# agent-config.yaml (for K8s init container)
infisical:
  address: "https://app.infisical.com"
  exit-after-auth: true

auth:
  type: "kubernetes"
  config:
    identity-id: "/etc/infisical/identity-id"
    service-account-token: "/var/run/secrets/kubernetes.io/serviceaccount/token"

templates:
  - template-content: |
      {{- with listSecretsByProjectSlug "my-project" "prod" "/" }}
      {{- range . }}
      {{ .Key }}={{ .Value }}
      {{- end }}
      {{- end }}
    destination-path: /infisical/secrets/.env
```

```yaml
# Kubernetes Pod spec
apiVersion: v1
kind: Pod
metadata:
  name: my-app
spec:
  serviceAccountName: my-app-sa
  initContainers:
    - name: infisical-agent
      image: infisical/cli:latest
      command: ["infisical", "agent", "--config", "/etc/infisical/agent-config.yaml"]
      volumeMounts:
        - name: secrets
          mountPath: /infisical/secrets
        - name: agent-config
          mountPath: /etc/infisical
  containers:
    - name: app
      image: myapp:latest
      volumeMounts:
        - name: secrets
          mountPath: /app/secrets
          readOnly: true
  volumes:
    - name: secrets
      emptyDir: {}
    - name: agent-config
      configMap:
        name: infisical-agent-config
```

---

## Kubernetes Sidecar (continuous sync)

For apps that need live secret updates, run the agent as a sidecar instead of an init container.

```yaml
# agent-config.yaml (sidecar mode)
infisical:
  address: "https://app.infisical.com"
  # exit-after-auth: false (default — keep running)

auth:
  type: "kubernetes"
  config:
    identity-id: "/etc/infisical/identity-id"

cache:
  persistent:
    type: "kubernetes"
    path: "/home/infisical/cache"

templates:
  - template-content: |
      {{- with listSecretsByProjectSlug "my-project" "prod" "/" }}
      {{- range . }}
      {{ .Key }}={{ .Value }}
      {{- end }}
      {{- end }}
    destination-path: /infisical/secrets/.env
    config:
      polling-interval: "1m"
      execute:
        command: "kill -HUP 1"              # Signal main process to reload
        timeout: 10
```

---

## With Dynamic Secrets (Database Credentials)

```yaml
# agent-config.yaml
infisical:
  address: "https://app.infisical.com"
  revoke-credentials-on-shutdown: true     # Clean up DB users on shutdown

auth:
  type: "aws-iam"
  config:
    identity-id: "<machine-identity-id>"

templates:
  # Static secrets
  - template-content: |
      {{- with listSecretsByProjectSlug "my-project" "prod" "/" }}
      {{- range . }}
      {{ .Key }}={{ .Value }}
      {{- end }}
      {{- end }}
    destination-path: /app/secrets/static.env

  # Dynamic database credentials
  - template-content: |
      {{ with dynamicSecret "my-project" "prod" "/" "postgres-creds" "1h" }}
      DB_HOST=db.internal.example.com
      DB_PORT=5432
      DB_NAME=myapp
      DB_USER={{ .DB_USERNAME }}
      DB_PASS={{ .DB_PASSWORD }}
      {{ end }}
    destination-path: /app/secrets/db.env
    config:
      polling-interval: "5m"
      execute:
        command: "./reconnect-db.sh"
        timeout: 30
```
