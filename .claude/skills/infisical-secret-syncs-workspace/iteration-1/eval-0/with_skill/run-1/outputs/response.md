# Setting Up Infisical Secret Syncs to AWS Secrets Manager

Great! You're going to automatically push secrets from Infisical to AWS Secrets Manager in **us-east-1**. Your app will read those secrets using the AWS SDK. Here's a complete walkthrough of what you need to configure.

## Overview

Secret Syncs in Infisical automatically push secrets from your Infisical projects to third-party services. Once configured, **Infisical becomes your single source of truth** — any changes to secrets in Infisical automatically propagate to AWS Secrets Manager.

---

## Step 1: Create an AWS App Connection

Before you can sync secrets, you need to create an authenticated connection to AWS. This is a one-time setup that you can reuse for multiple syncs.

### Prerequisites
- AWS account with IAM permissions to create access keys
- Infisical admin/owner access to your organization

### What Permissions AWS Needs

Your AWS IAM user or role needs **Secret Sync** permissions. At minimum:
- `secretsmanager:CreateSecret`
- `secretsmanager:UpdateSecret`
- `secretsmanager:DeleteSecret`
- `secretsmanager:DescribeSecret`
- `secretsmanager:GetSecretValue`
- `secretsmanager:ListSecrets`
- `secretsmanager:TagResource`

Optionally, if using KMS encryption:
- `kms:Decrypt`
- `kms:Encrypt`
- `kms:GenerateDataKey`

### Steps to Create the Connection

1. In Infisical, go to **Organization Settings** → **App Connections** (or **Integrations**)
2. Click **Add Connection**
3. Select **AWS Secrets Manager**
4. Enter your AWS credentials:
   - **Access Key ID** (from your IAM user)
   - **Secret Access Key** (from your IAM user)
5. Name the connection (e.g., `AWS Prod` or `AWS Staging`)
6. Click **Save**

Your connection is now ready to use for multiple syncs.

---

## Step 2: Create the Secret Sync

Now you'll create the actual sync from Infisical to AWS Secrets Manager.

### Navigate to Secret Syncs

1. Open your Infisical **Project**
2. Go to **Integrations** → **Secret Syncs** tab
3. Click **Add Sync** (or **+ Create Sync**)

### Configure the Source (Infisical)

This tells Infisical which secrets to sync.

| Setting | What to Enter |
|---------|---------------|
| **Environment** | The environment slug you want to sync from (e.g., `prod`, `staging`, `dev`) |
| **Secret Path** | The folder path containing your secrets (e.g., `/` for all secrets, or `/api-keys` for a specific folder) |

**Example:** If you want to sync all production secrets, select `Environment: prod` and `Secret Path: /`.

### Configure the Destination (AWS)

This tells Infisical where and how to store secrets in AWS.

| Setting | What to Enter |
|---------|---------------|
| **AWS Connection** | Select the App Connection you just created |
| **Region** | `us-east-1` (as you specified) |
| **Mapping Behavior** | Choose one: <br> **one-to-one** (recommended): Each Infisical secret becomes a separate secret in AWS. Example: secret `DATABASE_URL` in Infisical → secret `DATABASE_URL` in AWS Secrets Manager. <br> **many-to-one**: All secrets are packed into a single AWS secret as a JSON object. Example: `{"DATABASE_URL": "...", "API_KEY": "..."}` in one secret. Use this if your app reads one large JSON secret. |
| **Secret Name** | Only needed for many-to-one. Give the AWS secret a name like `infisical/app-secrets` |

**Most common:** Use **one-to-one** mapping, which is simpler and lets your app read individual secrets via the AWS SDK.

---

## Step 3: Configure Sync Options

These settings control initial behavior and ongoing sync management.

### Initial Sync Behavior

What happens on the very first sync:

| Option | Use Case |
|--------|----------|
| **Overwrite Destination** | You're starting fresh. Any secrets currently in AWS that aren't in Infisical will be deleted. ✅ **Recommended for new projects.** |
| **Import (Prioritize Infisical)** | You have existing secrets in AWS. Import them into Infisical, but Infisical values win if there's a conflict. |
| **Import (Prioritize AWS)** | You have existing secrets in AWS. Import them into Infisical, but AWS values win if there's a conflict. Use this if you're migrating and want to preserve existing AWS values. |

### Key Schema (Strongly Recommended)

A template that transforms secret names to prevent accidental overwrites.

**Template:** `INFISICAL_{{secretKey}}`

**Example:** Your Infisical secret `DATABASE_URL` becomes `INFISICAL_DATABASE_URL` in AWS.

**Why:** Prevents Infisical from managing secrets it didn't create. If you have other secrets in AWS managed by other tools, this keeps them safe from accidental deletion.

**How Your App Uses It:** When reading from AWS, use the transformed name:
```python
import boto3

client = boto3.client('secretsmanager', region_name='us-east-1')
secret = client.get_secret_value(SecretId='INFISICAL_DATABASE_URL')
value = secret['SecretString']
```

Or with the AWS SDK in Node.js:
```javascript
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

const client = new SecretsManagerClient({ region: "us-east-1" });
const command = new GetSecretValueCommand({ SecretId: "INFISICAL_DATABASE_URL" });
const response = await client.send(command);
console.log(response.SecretString);
```

### Optional: KMS Encryption

If you want AWS to encrypt secrets with a KMS key:

1. Have your KMS key ID or alias ready (e.g., `arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012` or alias `alias/my-key`)
2. Ensure your AWS IAM user has `kms:Encrypt` and `kms:GenerateDataKey` permissions
3. Enter the key in the **KMS Key** field

### Optional: Tags

Add AWS tags to help organize and manage secrets:
- **Tags:** Key-value pairs that appear on all synced secrets (e.g., `Environment: prod`, `Owner: team-name`)
- **Sync Secret Metadata as Tags:** If enabled, Infisical-specific metadata becomes tags too

### Auto-Sync (Default: Enabled)

- **Enabled** ✅: Any change to secrets in Infisical automatically syncs to AWS within seconds
- **Disabled**: Syncs only happen when you manually trigger them. Use for tightly controlled environments.

### Disable Secret Deletion

- **Disabled** (default): If you delete a secret in Infisical, it's also deleted from AWS
- **Enabled**: Deleting secrets in Infisical won't delete them in AWS. Use if you manage some secrets outside Infisical

---

## Step 4: Review & Create

1. **Sync Name:** Give your sync a meaningful name (e.g., `Prod to AWS us-east-1`)
2. Review all settings
3. Click **Create Sync**

The first sync will run immediately. Check the sync logs to confirm all secrets were pushed to AWS.

---

## Verifying Your Setup

### In AWS Console

1. Go to **AWS Secrets Manager** → **us-east-1**
2. You should see secrets with names matching your key schema (e.g., `INFISICAL_DATABASE_URL`, `INFISICAL_API_KEY`)
3. Click on a secret to verify the value matches Infisical

### From Your Application

Test with your AWS SDK code:

**Python (boto3):**
```python
import boto3

client = boto3.client('secretsmanager', region_name='us-east-1')
response = client.get_secret_value(SecretId='INFISICAL_DATABASE_URL')
print(response['SecretString'])  # Should print your database URL
```

**Node.js (AWS SDK v3):**
```javascript
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

const client = new SecretsManagerClient({ region: "us-east-1" });
const command = new GetSecretValueCommand({ SecretId: "INFISICAL_DATABASE_URL" });
const response = await client.send(command);
console.log(JSON.parse(response.SecretString));
```

---

## Common Gotchas & Best Practices

### 1. **Mapping Behavior is AWS-Specific**
   - AWS Secrets Manager is unique in offering **one-to-one** and **many-to-one** mapping
   - Most other services use one-to-one mapping
   - Choose carefully — you can't change it after sync creation without recreating

### 2. **Network Access**
   - Infisical's servers need network access to reach AWS Secrets Manager
   - If you're behind a firewall, whitelist Infisical's IP ranges

### 3. **Infisical Is the Source of Truth**
   - Once sync is active, manual changes to secrets in AWS may get overwritten on the next sync
   - Always make changes in Infisical, not AWS

### 4. **Key Schema Prevents Conflicts**
   - Strongly recommend using `INFISICAL_{{secretKey}}` to namespace your secrets
   - Prevents accidental deletion of unrelated secrets in AWS

### 5. **Test Before Going to Production**
   - Create a sync to a dev or staging environment first
   - Verify that secrets sync correctly and your app can read them
   - Then configure the production sync

### 6. **Monitor Sync Status**
   - Check the sync logs in Infisical regularly for errors
   - AWS can rate-limit Secrets Manager API calls — if you see throttling, contact AWS Support

### 7. **Deletion Protection**
   - Enable **Disable Secret Deletion** if you have other services managing secrets in AWS
   - This prevents Infisical from accidentally deleting unrelated secrets

---

## Example: Complete Setup Walkthrough

Let's say you're syncing production secrets to AWS:

1. **App Connection Created:** `AWS Production`
   - Access Key: `AKIAIOSFODNN7EXAMPLE`
   - Secret: `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`

2. **Secret Sync Created:** `Prod to AWS us-east-1`
   - **Source:** Environment: `prod`, Path: `/`
   - **Destination:** Region: `us-east-1`, Mapping: `one-to-one`
   - **Sync Options:**
     - Initial Behavior: `Overwrite Destination`
     - Key Schema: `INFISICAL_{{secretKey}}`
     - Auto-Sync: Enabled
     - Disable Deletion: Enabled (optional, for safety)

3. **Infisical Secrets:**
   - `DATABASE_URL` → AWS: `INFISICAL_DATABASE_URL`
   - `API_KEY` → AWS: `INFISICAL_API_KEY`
   - `JWT_SECRET` → AWS: `INFISICAL_JWT_SECRET`

4. **Your App Reads Secrets:**
   ```python
   import boto3
   
   client = boto3.client('secretsmanager', region_name='us-east-1')
   
   db_url = client.get_secret_value(SecretId='INFISICAL_DATABASE_URL')['SecretString']
   api_key = client.get_secret_value(SecretId='INFISICAL_API_KEY')['SecretString']
   ```

---

## What's Next?

- **Monitor syncs:** Set up alerts in AWS CloudWatch to notify you of secret access
- **Rotate credentials:** Periodically rotate AWS IAM credentials used for the App Connection
- **Scale:** If you need syncs to multiple regions or environments, create additional syncs (one per environment/region combination)
- **Automate deployments:** Use Infisical's API to update secrets in CI/CD pipelines

You're all set! Infisical will now automatically keep your AWS Secrets Manager in sync with your source of truth.
