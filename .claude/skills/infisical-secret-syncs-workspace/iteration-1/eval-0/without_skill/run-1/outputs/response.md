# Setting Up AWS Secrets Manager Syncing in Infisical

This guide walks you through configuring Infisical to automatically sync your secrets to AWS Secrets Manager in the us-east-1 region.

## Overview

Infisical provides a **Secret Syncing** feature that allows you to push secrets from your Infisical project to external secret management systems, including AWS Secrets Manager. Once configured, changes to secrets in Infisical can be automatically synced to AWS SM, where your application can retrieve them using the AWS SDK.

## Prerequisites

Before you begin, ensure you have:

1. **An active Infisical organization and project** where your secrets are stored
2. **AWS Account** with permissions to create and manage secrets in Secrets Manager
3. **AWS Credentials** with appropriate permissions (we'll discuss the required IAM policy below)
4. **Admin or sufficient permissions** in your Infisical organization to configure secret syncing

## Step 1: Prepare AWS IAM Credentials

Infisical needs AWS credentials to authenticate and sync secrets to AWS Secrets Manager. You have two options:

### Option A: Create a Dedicated IAM User (Recommended)

1. Go to AWS IAM Console → **Users** → **Create user**
2. Give it a descriptive name (e.g., `infisical-secret-sync`)
3. Create an **Access Key** (store the Access Key ID and Secret Access Key securely)
4. Attach an inline policy with the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:CreateSecret",
        "secretsmanager:UpdateSecret",
        "secretsmanager:PutSecretValue",
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret",
        "secretsmanager:ListSecrets"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:*"
    }
  ]
}
```

Replace `ACCOUNT_ID` with your AWS account ID. This policy allows Infisical to create, read, and update secrets in us-east-1.

### Option B: Use an IAM Role with STS Assume Role

If you prefer not to store long-lived credentials, you can use AWS STS with an assume role. Infisical will assume the role and use temporary credentials. This requires additional setup in AWS but is more secure for production deployments.

## Step 2: Configure the Secret Sync in Infisical

### Access Secret Syncing

1. Log in to **Infisical**
2. Navigate to your **Project**
3. Go to **Project Settings** → **Secret Syncing** (or **Integrations**)
4. Look for **AWS Secrets Manager** and click **Add Integration** or **Connect**

### Configure AWS Connection

You'll see a form to configure the AWS connection. Fill in:

- **AWS Region**: `us-east-1`
- **AWS Access Key ID**: Paste the access key from Step 1
- **AWS Secret Access Key**: Paste the secret key from Step 1

Alternatively, if using assume role:
- **AWS Region**: `us-east-1`
- **Role ARN**: ARN of the role you created for Infisical to assume
- **External ID** (optional): If your role requires an external ID for assume role

Click **Test Connection** to verify credentials are correct.

## Step 3: Create a Secret Sync Destination

Once the AWS integration is connected, you need to specify what gets synced:

1. In the Secret Syncing section, click **Create New Sync** or **Add Destination**
2. Select **AWS Secrets Manager** as the destination type
3. Configure:
   - **Source Environment**: Select the Infisical environment containing your secrets (e.g., Production)
   - **Destination Secret Name**: Specify how secrets should be named in AWS SM. For example:
     - Use a path like `infisical/my-app/` as a prefix
     - Infisical will create secrets named `infisical/my-app/SECRET_NAME` in AWS SM
   - **Sync Behavior**: 
     - **Automatic**: Sync immediately whenever a secret changes in Infisical
     - **Manual**: Sync only when you explicitly trigger it

## Step 4: Map Secrets

Depending on your Infisical version, you may need to specify which secrets to sync:

1. **Sync all secrets**: Select this option to sync every secret in the environment to AWS SM
2. **Selective sync**: Choose specific secrets to sync (useful if you only want certain secrets in AWS SM)

Each secret in Infisical will create a corresponding secret in AWS Secrets Manager with:
- **Name**: The secret path you configured (e.g., `infisical/my-app/DB_PASSWORD`)
- **Value**: The encrypted secret value from Infisical
- **Type**: SecureString (for JSON) or String (for key-value pairs)

## Step 5: Configure Secret Format (If Needed)

Infisical allows you to control how secrets are formatted when synced:

- **Key-Value Pairs**: Individual environment variables are synced as separate AWS secrets
- **JSON Format**: All secrets are synced as a single JSON object in one AWS secret

Choose based on how your app reads them from AWS SM.

## Step 6: Test the Sync

1. After configuring, click **Sync Now** or **Test Sync** to trigger an initial sync
2. Check the **Sync Logs** in Infisical to verify success
3. Go to AWS Secrets Manager console in us-east-1 and verify your secrets appear there

You should see secrets like:
- `infisical/my-app/API_KEY`
- `infisical/my-app/DB_PASSWORD`
- etc.

## Step 7: Configure Your Application

Once secrets are synced to AWS Secrets Manager, your application can retrieve them:

### Using the AWS SDK (Node.js Example)

```javascript
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

const client = new SecretsManagerClient({ region: "us-east-1" });

async function getSecret(secretName) {
  const command = new GetSecretValueCommand({
    SecretId: secretName
  });
  
  const response = await client.send(command);
  return response.SecretString;
}

// Usage
const apiKey = await getSecret("infisical/my-app/API_KEY");
```

### Using AWS CLI for Testing

```bash
aws secretsmanager get-secret-value \
  --secret-id infisical/my-app/API_KEY \
  --region us-east-1
```

## Step 8: Monitor and Update

- **Automatic Syncing**: If you enabled automatic sync, any changes to secrets in Infisical will push to AWS SM
- **Audit Logs**: Check both Infisical and AWS CloudTrail for sync operations
- **Versioning**: AWS Secrets Manager automatically versions secrets, so you can rollback if needed

## Important Considerations

### Security Best Practices

1. **Rotate Credentials**: Periodically rotate the AWS IAM user's access keys
2. **Use Least Privilege**: The IAM policy above is minimal. Restrict resources further if possible (e.g., specific secret name patterns)
3. **Enable AWS Secrets Manager Encryption**: Ensure secrets are encrypted with AWS KMS (you can specify a KMS key in the sync config if Infisical supports it)
4. **Enable MFA Delete**: Consider enabling MFA Delete on your secrets for extra protection

### Naming Conventions

- Use consistent naming conventions for secrets in Infisical (e.g., `API_KEY`, `DB_PASSWORD`)
- AWS SM doesn't support special characters in names — Infisical will sanitize these
- Avoid secrets that are extremely large (AWS SM has limits on secret size)

### Sync Frequency and Timing

- If using automatic sync, be aware that syncing happens within seconds to minutes of a change
- For high-volume applications, consider using manual sync to batch updates
- Check Infisical's sync logs if secrets don't appear in AWS SM within expected time

### Handling Existing AWS Secrets

- If a secret already exists in AWS SM with the same name, Infisical will update it
- Secrets deleted from Infisical are **not automatically deleted** from AWS SM (for safety)
- You'll need to manually manage cleanup of old secrets in AWS SM

## Troubleshooting

### Connection Fails
- Verify AWS credentials are correct
- Check that the IAM user has the required permissions
- Ensure the us-east-1 region is specified correctly
- Verify the credentials haven't been rotated/revoked

### Secrets Don't Appear in AWS SM
- Check Infisical's sync logs for error messages
- Verify the destination naming scheme is correct
- Confirm the IAM policy allows `secretsmanager:CreateSecret` and `secretsmanager:PutSecretValue`
- Check AWS CloudTrail for any permission denials

### Secrets Are Out of Sync
- Manually trigger a sync in Infisical
- Check if automatic sync is enabled
- Review logs to see if any secrets failed to sync

## Next Steps

- **Rotation Policies**: Consider setting up secret rotation in AWS SM for sensitive credentials
- **Multi-Region**: If you need secrets in multiple AWS regions, you can configure additional syncs
- **Other Integrations**: Infisical supports syncing to other platforms (HashiCorp Vault, GitHub, etc.)
- **Infrastructure as Code**: Use Terraform/CloudFormation to manage secret sync configurations programmatically

## Summary

To sync secrets from Infisical to AWS Secrets Manager in us-east-1:

1. Create AWS IAM credentials with Secrets Manager permissions
2. Connect your AWS account to Infisical via the Secret Syncing interface
3. Create a sync destination pointing to AWS Secrets Manager in us-east-1
4. Configure secret naming and sync behavior
5. Test the sync and verify secrets appear in AWS SM
6. Update your application to read from AWS Secrets Manager using the AWS SDK

Your secrets are now automatically synced and available to your application through AWS SDK calls.
