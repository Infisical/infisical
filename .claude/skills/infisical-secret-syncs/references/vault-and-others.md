# HashiCorp Vault & Other Syncs

## HashiCorp Vault

### Prerequisites
- HashiCorp Vault Connection (token or AppRole auth)

### Destination Config
| Field | Required | Description |
|-------|----------|-------------|
| Vault Connection | Yes | The App Connection to authenticate with |
| Secrets Engine Mount | Yes | KV secrets engine mount point (e.g., `secret`, `kv`) |
| Path | Yes | Path within the engine (e.g., `dev/nested`, `myapp/config`) |

### Sync Options
| Field | Description |
|-------|-------------|
| Initial Sync Behavior | `overwrite-destination`, `import-prioritize-infisical`, or `import-prioritize-hashicorp-vault` |
| Key Schema | Template for key transformation |
| Auto-Sync Enabled | Default on |
| Disable Secret Deletion | Prevent deletion at destination |

### Gotchas
- Paths are auto-created if they don't exist — no need to pre-create them in Vault
- Works with KV v2 secrets engines
- This is useful for migrating from Vault to Infisical gradually — sync back to Vault while transitioning

---

## Other Supported Destinations

All destinations follow the same general pattern: App Connection → Source → Destination → Sync Options. Key differences are in the destination config fields.

### AWS Parameter Store
- **Destination Config:** Region, KMS Key ID (optional), Path prefix
- **Mapping:** Each Infisical secret → separate SSM parameter
- **Type:** Secrets stored as `SecureString` parameters

### GitLab
- **Destination Config:** Group or Project, Environment scope
- **Mapping:** CI/CD variables

### Bitbucket
- **Destination Config:** Workspace, Repository
- **Mapping:** Repository variables

### Netlify
- **Destination Config:** Site, Context (production/deploy-preview/branch-deploy)

### Railway
- **Destination Config:** Project, Environment, Service (optional)

### Render
- **Destination Config:** Service

### Fly.io
- **Destination Config:** App name

### Heroku
- **Destination Config:** App name
- **Note:** Secrets synced as config vars — Heroku restarts the dyno on changes

### Terraform Cloud
- **Destination Config:** Organization, Workspace
- **Mapping:** Workspace variables (sensitive)

### Databricks
- **Destination Config:** Host, Secret Scope

### 1Password
- **Destination Config:** Vault

### Supabase
- **Destination Config:** Project reference

### TeamCity
- **Destination Config:** Project

### CircleCI
- **Destination Config:** Organization, Project

### Digital Ocean App Platform
- **Destination Config:** App ID

## Choosing a Sync Destination

| If the user wants to... | Recommend... |
|--------------------------|-------------|
| Secrets in AWS services | AWS Secrets Manager (app-level) or AWS Parameter Store (config/infra-level) |
| Secrets in GCP services | GCP Secret Manager |
| Secrets in Azure services | Azure Key Vault |
| Secrets in GitHub Actions | GitHub sync with `repository` or `environment` scope |
| Secrets in Vercel deployments | Vercel sync targeting the correct app + environment |
| Gradual migration from Vault | HashiCorp Vault sync (bidirectional via import) |
| Secrets in CI/CD pipelines | GitHub, GitLab, Bitbucket, CircleCI, or TeamCity sync depending on their CI provider |
| Secrets in PaaS platforms | Vercel, Netlify, Railway, Render, Fly.io, Heroku, or Digital Ocean sync |
