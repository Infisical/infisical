# Cloud Secret Manager Syncs: AWS, GCP, Azure

## AWS Secrets Manager

### Prerequisites
- AWS Connection with **Secret Sync** permissions
- Network allows inbound requests from Infisical

### Destination Config
| Field | Required | Description |
|-------|----------|-------------|
| AWS Connection | Yes | The App Connection to authenticate with |
| Region | Yes | AWS region (e.g., `us-east-1`) |
| Mapping Behavior | Yes | `one-to-one` (each secret → separate AWS secret) or `many-to-one` (all secrets → single AWS secret as JSON) |
| Secret Name | If many-to-one | Name of the single AWS secret for many-to-one mapping |

### Sync Options
| Field | Description |
|-------|-------------|
| Initial Sync Behavior | `overwrite-destination`, `import-prioritize-infisical`, or `import-prioritize-aws-secrets-manager` |
| Key Schema | Template for key transformation (e.g., `INFISICAL_{{secretKey}}`) |
| KMS Key | Optional AWS KMS key ID or alias for encryption |
| Tags | Optional tags added to synced secrets |
| Sync Secret Metadata as Tags | If enabled, Infisical metadata becomes AWS tags (manual tags take precedence) |
| Auto-Sync Enabled | Default on — sync on changes |
| Disable Secret Deletion | Prevent Infisical from deleting destination secrets |

### Gotchas
- Mapping behavior is unique to AWS SM — choose carefully as it affects how secrets are structured
- Many-to-one is ideal for apps that read a single JSON secret; one-to-one is better for per-secret access patterns

---

## GCP Secret Manager

### Prerequisites
- GCP Connection with **Secret Sync** permissions
- Enable APIs: Cloud Resource Manager API, Secret Manager API, Service Usage API
- Network allows inbound requests from Infisical

### Destination Config
| Field | Required | Description |
|-------|----------|-------------|
| GCP Connection | Yes | The App Connection to authenticate with |
| Project | Yes | GCP project ID |
| Scope | Yes | `global` (all regions) or `region` (specific region) |
| Region | If scope=region | GCP region for regional secrets |

### Sync Options
| Field | Description |
|-------|-------------|
| Initial Sync Behavior | `overwrite-destination`, `import-prioritize-infisical`, or `import-prioritize-gcp-secret-manager` |
| Key Schema | Template for key transformation |
| Auto-Sync Enabled | Default on |
| Disable Secret Deletion | Prevent deletion at destination |

### Gotchas
- Three GCP APIs must be enabled before creating the connection
- Regional scope restricts secret availability to that region only

---

## Azure Key Vault

### Prerequisites
- Azure Key Vault Connection
- User/service principal needs these secret permissions: `secrets/list`, `secrets/get`, `secrets/set`, `secrets/recover`
- Recommended role: **Key Vault Secrets Officer**
- Network allows inbound requests from Infisical

### Destination Config
| Field | Required | Description |
|-------|----------|-------------|
| Azure Connection | Yes | The App Connection to authenticate with |
| Vault Base URL | Yes | Full URL of the Key Vault (e.g., `https://my-vault.vault.azure.net`) |

### Sync Options
| Field | Description |
|-------|-------------|
| Initial Sync Behavior | `overwrite-destination`, `import-prioritize-infisical`, or `import-prioritize-azure-key-vault` |
| Key Schema | Template for key transformation |
| Auto-Sync Enabled | Default on |
| Disable Secret Deletion | Prevent deletion at destination |
| Disable Certificate Import | Skip importing certificate objects from Azure Key Vault |

### Gotchas
- **Underscores are converted to hyphens.** Azure Key Vault does not allow underscores in secret names. `DATABASE_URL` becomes `DATABASE-URL` at the destination.
- The `secrets/recover` permission is needed because Azure soft-deletes secrets — Infisical may need to recover a previously deleted secret before updating it.
