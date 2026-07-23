# Platform Syncs: GitHub, Vercel, Cloudflare

## GitHub

### Prerequisites
- GitHub Connection (via GitHub App or OAuth)
- Network allows inbound requests from Infisical

### Destination Config
| Field | Required | Description |
|-------|----------|-------------|
| GitHub Connection | Yes | The App Connection to authenticate with |
| Scope | Yes | Where secrets are deployed: `organization`, `repository`, or `environment` |

**If scope = `organization`:**
| Field | Required | Description |
|-------|----------|-------------|
| Organization Name | Yes | GitHub org name |
| Visibility | Yes | `all-repositories`, `private-repositories` (requires Pro/Team), or `selected-repositories` |
| Selected Repositories | If visibility=selected | Specific repos to grant access |

**If scope = `repository`:**
| Field | Required | Description |
|-------|----------|-------------|
| Repository | Yes | Target repository (owner/repo) |

**If scope = `environment`:**
| Field | Required | Description |
|-------|----------|-------------|
| Repository | Yes | Target repository |
| Environment | Yes | GitHub environment name (e.g., `production`, `staging`) |

### Sync Options
| Field | Description |
|-------|-------------|
| Initial Sync Behavior | **Only `overwrite-destination`** — GitHub does not support importing secrets |
| Key Schema | Template for key transformation |
| Auto-Sync Enabled | Default on |
| Disable Secret Deletion | Prevent deletion at destination |

### Gotchas
- **GitHub does not support importing secrets.** You cannot read existing GitHub secrets back — only overwrite. This means the initial sync will always be a one-way push.
- Org visibility options depend on GitHub plan (Pro/Team required for `private-repositories`)
- Environment secrets require the environment to already exist in the repository settings

---

## Vercel

### Prerequisites
- Vercel Connection
- Network allows inbound requests from Infisical

### Destination Config
| Field | Required | Description |
|-------|----------|-------------|
| Vercel Connection | Yes | The App Connection to authenticate with |
| Vercel App | Yes | Application to deploy secrets to |
| Vercel App Environment | Yes | Target environment (e.g., `preview`, `production`, `development`) |
| Vercel Preview Branch | No | Specific branch for preview deployments |

### Sync Options
| Field | Description |
|-------|-------------|
| Initial Sync Behavior | `overwrite-destination`, `import-prioritize-infisical`, or `import-prioritize-vercel` |
| Key Schema | Template for key transformation |
| Auto-Sync Enabled | Default on |
| Disable Secret Deletion | Prevent deletion at destination |

### Gotchas
- **Vercel does not expose sensitive env var values.** During initial import, Vercel sensitive variables come in with empty values because Vercel's API doesn't return them.
- After first sync, users must manually re-enter any sensitive variable values in Infisical to keep both platforms aligned.
- Preview branch is optional — if set, secrets only apply to that branch's preview deployments

---

## Cloudflare Workers

### Prerequisites
- Cloudflare Connection

### Destination Config
| Field | Required | Description |
|-------|----------|-------------|
| Cloudflare Connection | Yes | The App Connection to authenticate with |
| Workers Script | Yes | The specific Workers script to sync secrets to |

### Sync Options
| Field | Description |
|-------|-------------|
| Initial Sync Behavior | `overwrite-destination` only — no import support |
| Key Schema | Template for key transformation |
| Auto-Sync Enabled | Default on |
| Disable Secret Deletion | Prevent deletion at destination |

### Gotchas
- Like GitHub, Cloudflare Workers does not support importing existing secrets
- Secrets are synced as Workers secrets (encrypted environment variables), not plain text bindings
