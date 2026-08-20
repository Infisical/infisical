# Secret Syncs Overview

## What are Secret Syncs?

Secret Syncs are project-level resources that automatically push secrets from an Infisical source (environment + folder path) to third-party services. When secrets change in Infisical, the sync propagates those changes to the destination.

**Infisical is the source of truth.** Secrets at the destination not present in Infisical may be overwritten depending on the initial sync behavior setting.

## Prerequisites

Every sync requires an **App Connection** — an authenticated connection to the target service with the correct permissions. Create the App Connection first, then create the sync.

## Common Setup Workflow

1. **Create App Connection** for the target service (one-time setup, reusable across syncs)
2. **Navigate to** Project → Integrations → Secret Syncs tab → Add Sync
3. **Select destination** (e.g., AWS Secrets Manager, GitHub, etc.)
4. **Configure Source:**
   - Environment: project environment slug (e.g., `dev`, `staging`, `prod`)
   - Secret Path: folder path (e.g., `/`, `/api-keys`, `/database`)
5. **Configure Destination:** provider-specific fields (region, vault URL, repo, etc.)
6. **Configure Sync Options:**
   - Initial Sync Behavior
   - Key Schema (recommended)
   - Auto-Sync toggle
   - Disable Secret Deletion toggle
7. **Name the sync** and create

## Key Concepts

### Initial Sync Behavior

Controls what happens on the first sync:

| Option | Behavior |
|--------|----------|
| **Overwrite Destination** | Removes any secrets at the destination not present in Infisical |
| **Import (Prioritize Infisical)** | Imports existing destination secrets into Infisical first, Infisical values win on conflict |
| **Import (Prioritize Destination)** | Imports existing destination secrets into Infisical first, destination values win on conflict |

> Not all destinations support importing. GitHub only supports "Overwrite Destination."

### Key Schema

A template that transforms secret names when syncing. Uses `{{secretKey}}` as a placeholder for the original name and `{{environment}}` for the environment slug.

**Example:** Key schema `INFISICAL_{{secretKey}}` transforms Infisical key `DATABASE_URL` into `INFISICAL_DATABASE_URL` at the destination.

**Why use it:** Prevents Infisical from accidentally managing secrets it didn't create. Highly recommended for all syncs.

When importing secrets, the key schema is stripped from keys before importing into Infisical.

### Mapping Behavior (AWS Secrets Manager only)

- **One-to-One:** Each Infisical secret becomes a separate secret in the destination
- **Many-to-One:** All Infisical secrets are packed into a single destination secret (as JSON key-value pairs)

### Auto-Sync

Enabled by default. Secrets automatically sync when changes occur in the Infisical source. Disable for manual-only syncing.

### Disable Secret Deletion

When enabled, Infisical will not remove secrets from the destination. Use this if you manage some secrets manually outside of Infisical.

## Supported Destinations (38+)

Cloud Secret Managers: AWS Secrets Manager, AWS Parameter Store, GCP Secret Manager, Azure Key Vault, OCI Vault, HashiCorp Vault

CI/CD & Platforms: GitHub, GitLab, Bitbucket, Vercel, Netlify, Cloudflare Workers, Cloudflare Pages, Railway, Render, Fly.io, Heroku, Northflank, Digital Ocean, Supabase

DevOps & Monitoring: TeamCity, CircleCI, Jenkins (via Octopus Deploy), Terraform Cloud, Humanitec, Chef, Camunda, Checkly, Windmill, Zabbix, Databricks, Laravel Forge

Other: 1Password, Azure DevOps, Azure Entra ID (SCIM), External Infisical instance

## Secret Imports for Multiple Paths

If you need to sync secrets from multiple folder locations into a single sync, use Infisical's **Secret Imports** feature to consolidate them into one path first, then sync that path.
