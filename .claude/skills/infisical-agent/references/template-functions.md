# Infisical Agent Template Functions

Templates use Go's `text/template` syntax. All functions are available inside template blocks.

## listSecrets

Fetch all secrets from a project environment and path. **Most common function** — use for rendering .env files.

```
listSecrets "<project-id>" "<environment-slug>" "<secret-path>" "<optional-modifier>"
```

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| project-id | string | UUID of the project |
| environment-slug | string | `dev`, `staging`, `prod`, etc. |
| secret-path | string | `/`, `/api`, `/database`, etc. |
| optional-modifier | JSON string | `{"recursive": bool, "expandSecretReferences": bool}` |

- `recursive` (default: `false`) — Fetch secrets from subdirectories too
- `expandSecretReferences` (default: `true`) — Resolve `${SECRET_NAME}` references

**Returns:** Array of objects with: `Key`, `Value`, `SecretPath`, `WorkspaceId`, `Type`, `ID`, `Comment`

**Example — .env file:**
```go
{{- with listSecrets "6553ccb2b7da580d7f6e7260" "dev" "/" `{"recursive": false, "expandSecretReferences": true}` }}
{{- range . }}
{{ .Key }}={{ .Value }}
{{- end }}
{{- end }}
```

**Example — recursive with paths:**
```go
{{- with listSecrets "da8056c8-01e2-4d24-b39f-cb4e004b8d44" "staging" "/" `{"recursive": true, "expandSecretReferences": true}` }}
{{- range . }}
{{- if eq .SecretPath "/"}}
{{ .Key }}={{ .Value }}
{{- else}}
{{ .SecretPath }}/{{ .Key }}={{ .Value }}
{{- end}}
{{- end }}
{{- end }}
```

---

## listSecretsByProjectSlug

Same as `listSecrets` but uses the project slug instead of UUID. Easier to read in configs.

```
listSecretsByProjectSlug "<project-slug>" "<environment-slug>" "<secret-path>" "<optional-modifier>"
```

**Parameters:** Same as `listSecrets`, except first param is project slug (e.g., `"my-project"`) instead of UUID.

**Returns:** Same as `listSecrets`.

**Example:**
```go
{{- with listSecretsByProjectSlug "my-project" "prod" "/" `{"recursive": true}` }}
{{- range . }}
{{ .Key }}={{ .Value }}
{{- end }}
{{- end }}
```

---

## getSecretByName

Fetch a single secret by name.

```
getSecretByName "<project-id>" "<environment-slug>" "<secret-path>" "<secret-name>"
```

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| project-id | string | UUID of the project |
| environment-slug | string | `dev`, `staging`, `prod`, etc. |
| secret-path | string | `/`, `/api`, etc. |
| secret-name | string | Exact secret name (e.g., `DATABASE_URL`) |

**Returns:** Single object with: `Key`, `Value`, `WorkspaceId`, `Type`, `ID`, `Comment`

**Example — config file snippet:**
```go
{{ with getSecretByName "d821f21d-aa90-453b-8448-8c78c1160a0e" "dev" "/" "POSTHOG_HOST" }}
{{ if .Value }}
analytics_host = "{{ .Value }}"
{{ end }}
{{ end }}
```

---

## dynamicSecret

Create and auto-renew a dynamic secret lease. **Use for database credentials, cloud IAM tokens, etc.**

```
dynamicSecret "<project-slug>" "<environment-slug>" "<secret-path>" "<dynamic-secret-name>" "<lease-ttl>"
```

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| project-slug | string | Project slug |
| environment-slug | string | `dev`, `staging`, `prod`, etc. |
| secret-path | string | `/`, `/database`, etc. |
| dynamic-secret-name | string | Name of the dynamic secret (e.g., `postgres-creds`) |
| lease-ttl | string | Lease duration (e.g., `1m`, `1h`, `24h`) |

**Returns:** Object with keys specific to the dynamic secret type:
- SQL databases: `DB_USERNAME`, `DB_PASSWORD`
- AWS IAM: `ACCESS_KEY`, `SECRET_ACCESS_KEY`, `SESSION_TOKEN` (if temporary)
- Redis: `DB_USERNAME`, `DB_PASSWORD`

**Key behaviors:**
- Automatically renews credentials before expiration
- Deduplication: Multiple templates with identical dynamic secret configs share one lease
- Revoked on shutdown if `revoke-credentials-on-shutdown: true`

**Example — PostgreSQL credentials:**
```go
{{ with dynamicSecret "my-project" "dev" "/" "postgres-creds" "1h" }}
DB_HOST=db.example.com
DB_USER={{ .DB_USERNAME }}
DB_PASSWORD={{ .DB_PASSWORD }}
{{ end }}
```

**Example — Redis credentials:**
```go
{{ with dynamicSecret "my-project" "prod" "/" "redis" "30m" }}
REDIS_USER={{ .DB_USERNAME }}
REDIS_PASS={{ .DB_PASSWORD }}
{{ end }}
```

---

## Common Template Patterns

### .env file (most common)
```go
{{- with listSecrets "<project-id>" "dev" "/" }}
{{- range . }}
{{ .Key }}={{ .Value }}
{{- end }}
{{- end }}
```

### JSON config
```go
{
{{- with listSecrets "<project-id>" "prod" "/" }}
{{- range $i, $s := . }}
{{- if $i }},{{ end }}
  "{{ $s.Key }}": "{{ $s.Value }}"
{{- end }}
{{- end }}
}
```

### YAML config
```go
{{- with listSecrets "<project-id>" "dev" "/" }}
{{- range . }}
{{ .Key }}: "{{ .Value }}"
{{- end }}
{{- end }}
```

### Mixed static + dynamic secrets
```go
{{- with listSecrets "<project-id>" "prod" "/" }}
{{- range . }}
{{ .Key }}={{ .Value }}
{{- end }}
{{- end }}
{{ with dynamicSecret "my-project" "prod" "/" "postgres" "1h" }}
DB_DYNAMIC_USER={{ .DB_USERNAME }}
DB_DYNAMIC_PASS={{ .DB_PASSWORD }}
{{ end }}
```

### Export format (for `source .env`)
```go
{{- with listSecrets "<project-id>" "dev" "/" }}
{{- range . }}
export {{ .Key }}="{{ .Value }}"
{{- end }}
{{- end }}
```
