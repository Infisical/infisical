# Syncing Secrets from Infisical to Azure Key Vault

## Secret Naming with Underscores

### The Issue
Yes, you will encounter issues with underscore naming when syncing to Azure Key Vault. Azure Key Vault has strict naming requirements that differ from most secret management systems.

**Azure Key Vault naming constraints:**
- Only alphanumeric characters (a-z, A-Z, 0-9) and hyphens (-) are permitted
- Must start with a letter or number
- Underscores are **not allowed**

### Impact on Your Secrets
Secret names like `DATABASE_URL` and `API_KEY` will fail validation when attempting to sync to Azure Key Vault. The sync operation will either:
1. Reject the secrets outright with a validation error
2. Automatically transform the names (if your sync tool supports this)

### Solutions

**Option 1: Transform During Sync (Recommended)**
Configure your Infisical-to-Azure sync to automatically replace underscores with hyphens:
- `DATABASE_URL` → `DATABASE-URL`
- `API_KEY` → `API-KEY`

Most sync tools provide this transformation option. This keeps your source naming intact while ensuring Azure compliance.

**Option 2: Rename in Infisical**
Update your secret names in Infisical to use hyphens from the start:
- Rename `DATABASE_URL` to `DATABASE-URL`
- Rename `API_KEY` to `API-KEY`

This ensures consistency across all integrations but requires migration effort.

**Option 3: Custom Mapping**
If your sync tool supports it, maintain a mapping file that specifies transformation rules for specific secrets. This is useful if you want different naming conventions in different target systems.

### Case Sensitivity Note
Azure Key Vault treats secret names as case-insensitive for access, but preserves the case you specify. The transformation should maintain readability—using hyphens instead of underscores is the standard practice.

---

## Azure Service Principal Permissions

### Required Roles and Permissions

For your service principal to successfully sync secrets to Azure Key Vault, it needs the following permissions:

#### 1. **Minimum Built-in Role**
Assign your service principal the **Key Vault Secrets Officer** role at the Key Vault scope:
```
Microsoft.KeyVault/vaults/secrets/createOrUpdate/action
Microsoft.KeyVault/vaults/secrets/delete/action
Microsoft.KeyVault/vaults/secrets/backup/action
Microsoft.KeyVault/vaults/secrets/restore/action
Microsoft.KeyVault/vaults/secrets/purge/action
```

**Note:** This is the modern preferred role (introduced in 2021). The older "Contributor" role also works but grants excessive permissions—avoid it for principle of least privilege.

#### 2. **Detailed Permission Matrix**

| Action | Purpose | Required |
|--------|---------|----------|
| `secrets/set` or `secrets/createOrUpdate` | Create or update secrets | **Yes** |
| `secrets/get` | Read secret values (for verification) | **Optional** but recommended |
| `secrets/delete` | Remove secrets during sync cleanup | **If sync supports deletion** |
| `secrets/list` | Enumerate existing secrets | **Optional** (useful for sync validation) |
| `secrets/backup` | Backup secrets before updates | Optional |
| `vaults/read` | Access Key Vault metadata | Typically included in role |

#### 3. **Assignment Steps**

1. **Navigate to your Key Vault** in the Azure Portal
2. **Access Control (IAM)** → **Add role assignment**
3. **Role:** Select "Key Vault Secrets Officer"
4. **Members:** Search for and select your service principal (by app ID or name)
5. **Scope:** Ensure it's set to your specific Key Vault (not subscription-level)

#### 4. **Using Azure CLI**
If you prefer automation:
```bash
az role assignment create \
  --role "Key Vault Secrets Officer" \
  --assignee <service-principal-object-id> \
  --scope /subscriptions/<subscription-id>/resourceGroups/<resource-group>/providers/Microsoft.KeyVault/vaults/<vault-name>
```

### Authentication Methods

Your sync process will need to authenticate using one of these methods:

**Option A: Service Principal with Secret**
```
Tenant ID: <your-azure-tenant-id>
Client ID: <service-principal-app-id>
Client Secret: <generated-secret-value>
```

**Option B: Service Principal with Certificate** (more secure)
Upload a certificate to your service principal and use it for authentication instead of a secret.

**Option C: Managed Identity** (if running on Azure infrastructure)
If your sync process runs on an Azure VM, App Service, or Functions, use a managed identity instead of service principal credentials—it's more secure and requires no secret management.

### Security Best Practices

1. **Principle of Least Privilege:** Use "Key Vault Secrets Officer" rather than broader roles like Contributor or Owner

2. **Secret Rotation:** If using a client secret for authentication, rotate it regularly (every 90 days recommended)

3. **Audit & Monitoring:** Enable Azure Key Vault logging and monitoring to track all secret modifications

4. **Network Security:** If possible, restrict Key Vault access to specific IP ranges or use Private Endpoints

5. **Secret Delivery:** Store the service principal credentials securely in your sync environment (e.g., GitHub Secrets, environment variables, or a secrets manager)—never commit them to version control

### Troubleshooting Common Issues

**"Access Denied" errors:**
- Verify the service principal has the "Key Vault Secrets Officer" role assigned
- Confirm the role is scoped to the correct Key Vault (not just the subscription)
- Check that the service principal's credentials (Client ID, secret) are correct

**"Invalid secret name" errors:**
- This indicates the underscore naming issue described above—transform underscores to hyphens
- Verify the secret name doesn't start with a number (Azure allows this, but it's uncommon)

**"Vault access denied" (even with correct permissions):**
- Check if the Key Vault has network restrictions (firewall rules) that block your sync source
- Verify the subscription and tenant IDs are correct

---

## Summary

| Aspect | Recommendation |
|--------|-----------------|
| **Underscore handling** | Transform to hyphens during sync (`DATABASE_URL` → `DATABASE-URL`) |
| **Service principal role** | "Key Vault Secrets Officer" (least privilege) |
| **Required permission** | `secrets/createOrUpdate` at minimum |
| **Authentication** | Service principal with secret or certificate |
| **Best practice** | Use managed identity if running on Azure infrastructure |
