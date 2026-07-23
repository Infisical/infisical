# Azure Key Vault Secret Sync: Underscores and Permissions

## Underscores in Secret Names

Yes, this **will cause a change** in your secret names, but it's handled automatically and transparently.

### The Issue
Azure Key Vault **does not allow underscores in secret names**. When you sync secrets from Infisical to Azure Key Vault, all underscores are automatically converted to hyphens.

**Example mappings:**
- `DATABASE_URL` → `DATABASE-URL`
- `API_KEY` → `API-KEY`
- `AWS_SECRET_ACCESS_KEY` → `AWS-SECRET-ACCESS-KEY`

### Impact
This conversion happens automatically during sync, so you don't need to do anything special — just be aware that:
1. Your application code that reads secrets from Azure Key Vault should reference the hyphenated names
2. If you're migrating existing secrets and already have them stored with underscores elsewhere, they'll appear with hyphens in Azure
3. The conversion is consistent and idempotent — syncing multiple times produces the same result

### Best Practice
If you want to maintain exact control over secret naming or avoid any character transformation, you can use a **key schema** template. For example, setting the key schema to `INFISICAL_{{secretKey}}` would transform names like:
- `DATABASE_URL` → `INFISICAL_DATABASE-URL` (underscore still converted to hyphen)

However, the underscore-to-hyphen conversion still happens since it's a requirement of Azure Key Vault itself.

---

## Service Principal Permissions

Your service principal (or Azure user account) needs the following **secrets permissions** on the Key Vault:

### Required Permissions
| Permission | Purpose |
|-----------|---------|
| `secrets/list` | List all secrets in the vault (needed to check what exists) |
| `secrets/get` | Read secret values (for import operations) |
| `secrets/set` | Create and update secrets (primary operation) |
| `secrets/recover` | Recover soft-deleted secrets (Azure soft-deletes secrets, so Infisical may need to recover before updating) |

### Recommended Role
**Key Vault Secrets Officer** — This built-in Azure role includes all the permissions above and is specifically designed for secret management operations.

### How to Set This Up

1. **If using a service principal:**
   - Go to your Key Vault in Azure Portal
   - Access Control (IAM) → Add role assignment
   - Select "Key Vault Secrets Officer"
   - Assign to your service principal

2. **If using a user account:**
   - Same process, but assign to your user identity

3. **Verify permissions:** After assignment, wait 1-2 minutes for permissions to propagate, then test in Infisical when creating the App Connection.

### Why `secrets/recover` Matters
Azure Key Vault uses soft-delete by default, meaning deleted secrets remain recoverable for a retention period. If Infisical attempts to update a secret that was recently deleted, it needs the `secrets/recover` permission to restore it first before updating. This is a common gotcha — even if you have `secrets/set`, the sync can fail on a deleted secret without `secrets/recover`.

---

## Setting Up the Sync

Once your service principal has the correct permissions, here's the workflow:

1. **Create an Azure App Connection** in Infisical with your service principal credentials (client ID, tenant ID, client secret)
2. **Create a Secret Sync** with:
   - **Source:** Your Infisical environment and folder path
   - **Destination:** Select your Key Vault's base URL (e.g., `https://my-vault.vault.azure.net`)
   - **Key Schema (optional):** Add a prefix if you want to scope which secrets Infisical manages
   - **Initial Sync Behavior:** Choose `overwrite-destination` if this is a fresh vault, or `import-prioritize-infisical` if you have existing secrets and want Infisical to be the source of truth
   - **Auto-Sync:** Enabled by default (secrets sync automatically when changed in Infisical)

3. **Test:** Infisical will validate the connection and sync your secrets. Check Azure Key Vault to confirm `DATABASE-URL`, `API-KEY`, etc. appear with hyphens.

---

## Summary

- **Underscores**: Will be converted to hyphens in Azure Key Vault. This is automatic and intentional.
- **Permissions**: Your service principal needs `secrets/list`, `secrets/get`, `secrets/set`, and `secrets/recover` — assign the **Key Vault Secrets Officer** role to get all of these at once.
- **No additional setup needed** beyond standard Azure RBAC configuration.

If you encounter any permission errors during sync, double-check that the service principal has been assigned the role (roles can take a minute or two to propagate), and verify the Key Vault's access policy doesn't conflict with the role assignment.
