# Setting Up Temporary AWS IAM Credentials with Infisical Dynamic Secrets

## Overview

Infisical's dynamic secrets feature allows you to generate temporary AWS IAM credentials on-demand with automatic expiration and rotation. This is ideal for EKS workloads that need short-lived, scoped permissions for S3 access.

## Architecture

When using Infisical dynamic secrets for AWS:

1. **Infisical Server** connects to your AWS account using a long-lived IAM user or role
2. **Dynamic Secret Engine** generates temporary credentials on-demand using AWS STS (Security Token Service)
3. **Expiration & Rotation** automatically handles credential lifecycle (1-hour TTL in your case)
4. **EKS Pod** retrieves credentials from Infisical, either via:
   - API calls at startup/renewal
   - Agent sidecar that maintains credential freshness
   - Secrets operator that syncs to Kubernetes secrets

## Setup Steps

### 1. Create AWS IAM User for Infisical

First, create a dedicated IAM user that Infisical will use to assume roles and generate credentials:

```bash
# Create Infisical service user
aws iam create-user --user-name infisical-dynamic-secrets

# Attach policy allowing STS AssumeRole
aws iam put-user-policy --user-name infisical-dynamic-secrets \
  --policy-name InfisicalSTSPolicy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": "sts:AssumeRole",
        "Resource": "arn:aws:iam::YOUR_ACCOUNT_ID:role/infisical-s3-reader"
      }
    ]
  }'

# Create access key for this user
aws iam create-access-key --user-name infisical-dynamic-secrets
```

Save the `AccessKeyId` and `SecretAccessKey` — you'll need these in Infisical.

### 2. Create Target IAM Role for S3 Access

Create the role that Infisical will assume on behalf of your application:

```bash
# Create role with trust relationship
aws iam create-role --role-name infisical-s3-reader \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {
          "AWS": "arn:aws:iam::YOUR_ACCOUNT_ID:user/infisical-dynamic-secrets"
        },
        "Action": "sts:AssumeRole",
        "Condition": {}
      }
    ]
  }'

# Attach S3 read-only policy
aws iam put-role-policy --role-name infisical-s3-reader \
  --policy-name S3ReadPolicy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "s3:GetObject",
          "s3:ListBucket"
        ],
        "Resource": [
          "arn:aws:s3:::your-bucket/*",
          "arn:aws:s3:::your-bucket"
        ]
      }
    ]
  }'
```

### 3. Configure Dynamic Secret in Infisical

In the Infisical dashboard:

1. Navigate to **Secrets** → **Dynamic Secrets**
2. Click **Add Dynamic Secret**
3. Select **AWS** as the provider
4. Configure:
   - **Name**: `aws-s3-credentials`
   - **AWS Access Key ID**: From step 1
   - **AWS Secret Access Key**: From step 1
   - **AWS Region**: Your region (e.g., `us-east-1`)
   - **Max TTL**: `3600` (1 hour in seconds)
   - **Default TTL**: `3600` (or shorter if you prefer, e.g., 1800 for 30 min)
   - **Role ARN**: `arn:aws:iam::YOUR_ACCOUNT_ID:role/infisical-s3-reader`
   - **Role Session Name**: `infisical-{{.Username}}` or `infisical-app-{{.Timestamp}}`

5. Save the dynamic secret

### 4. Access in Your EKS Application

#### Option A: Direct API Calls

Your application can fetch credentials on demand:

```bash
# Using curl
curl -X GET https://your-infisical-instance/api/v1/dynamic-secrets/aws-s3-credentials/lease \
  -H "Authorization: Bearer YOUR_MACHINE_TOKEN"

# Response includes:
# {
#   "access_key": "ASIAX...",
#   "secret_key": "...",
#   "session_token": "...",
#   "expires_at": "2026-04-14T16:00:00Z"
# }
```

#### Option B: Environment Variables (Application-Level)

Inject the token and have your app fetch on startup:

```dockerfile
FROM node:20-alpine
ENV INFISICAL_TOKEN=${INFISICAL_TOKEN}
ENV INFISICAL_ENDPOINT=https://your-infisical-instance

RUN npm install dotenv-infisical
COPY app.js .
CMD ["node", "app.js"]
```

Your app logic:
```javascript
const axios = require('axios');

async function getAWSCredentials() {
  const response = await axios.get(
    `${process.env.INFISICAL_ENDPOINT}/api/v1/dynamic-secrets/aws-s3-credentials/lease`,
    {
      headers: { Authorization: `Bearer ${process.env.INFISICAL_TOKEN}` }
    }
  );
  
  process.env.AWS_ACCESS_KEY_ID = response.data.access_key;
  process.env.AWS_SECRET_ACCESS_KEY = response.data.secret_key;
  process.env.AWS_SESSION_TOKEN = response.data.session_token;
}

await getAWSCredentials();
// Now use AWS SDK with these credentials
```

#### Option C: Kubernetes Secret Operator (Recommended for EKS)

Deploy Infisical's Kubernetes operator to automatically sync dynamic secrets as k8s Secrets:

```yaml
apiVersion: v1
kind: SecretProviderClass
metadata:
  name: infisical-aws-credentials
spec:
  provider: infisical
  parameters:
    token: ${INFISICAL_TOKEN}
    secretPath: /aws-s3-credentials
    infisicalHost: https://your-infisical-instance

---
apiVersion: v1
kind: Pod
metadata:
  name: my-app
spec:
  serviceAccountName: my-app
  containers:
  - name: app
    image: my-app:latest
    volumeMounts:
    - name: infisical-secrets
      mountPath: /mnt/secrets
  volumes:
  - name: infisical-secrets
    csi:
      driver: secrets-store.csi.k8s.io
      readOnly: true
      volumeAttributes:
        secretProviderClass: infisical-aws-credentials
```

The operator refreshes credentials before expiration, ensuring your pod always has valid credentials.

### 5. Kubernetes Role & Service Account Setup

For your EKS pod to securely authenticate with Infisical:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-app
  namespace: default

---
apiVersion: v1
kind: Secret
metadata:
  name: infisical-token
  namespace: default
type: Opaque
stringData:
  token: "YOUR_INFISICAL_MACHINE_TOKEN"

---
apiVersion: v1
kind: Pod
metadata:
  name: my-app
spec:
  serviceAccountName: my-app
  containers:
  - name: app
    image: my-app:latest
    env:
    - name: INFISICAL_TOKEN
      valueFrom:
        secretKeyRef:
          name: infisical-token
          key: token
    - name: INFISICAL_ENDPOINT
      value: https://your-infisical-instance
```

## Security Best Practices

1. **Machine Token Scope**: Create a machine token in Infisical with minimal permissions:
   - Only allow access to `aws-s3-credentials` secret
   - Restrict to your project/environment
   - Set an expiration date

2. **IAM Least Privilege**: The S3 role should only have permissions your app actually needs:
   - Specific bucket(s) and prefix(es) if possible
   - Avoid wildcard S3 actions

3. **Audit Logging**:
   - Enable Infisical audit logs to track credential access
   - Monitor CloudTrail for AWS API calls using temporary credentials
   - Set CloudWatch alarms for unusual credential usage

4. **Network Security**:
   - Run Infisical server on a private VPC
   - Use VPC endpoints for EKS to Infisical communication if possible
   - Enforce TLS/HTTPS for all credential transmission

5. **Credential Rotation**:
   - The 1-hour TTL automatically handles rotation
   - Your application must gracefully handle credential refresh
   - Consider implementing exponential backoff for credential fetch retries

## Troubleshooting

### Credentials Expire Too Quickly
- Check the **Max TTL** and **Default TTL** settings in Infisical
- AWS STS-issued credentials have a minimum 15-minute TTL; your 1-hour setting is reasonable
- Verify the role session name doesn't exceed 64 characters (AWS limit)

### Pod Can't Fetch Credentials
- Verify the machine token is correct and not expired
- Check Infisical server is reachable from EKS pod (`kubectl exec -it <pod> -- curl <infisical-url>`)
- Inspect pod logs for API errors or network issues
- Confirm IAM role has `sts:AssumeRole` permission

### AWS API Calls Fail with "Invalid Token"
- Ensure `AWS_SESSION_TOKEN` environment variable is set (required for temporary credentials)
- Check credential expiration time hasn't passed
- Verify the assumed role has the S3 permissions you need

## Alternative: Cross-Account Access

If your EKS cluster is in a different AWS account than your S3 bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::INFISICAL_ACCOUNT:user/infisical-dynamic-secrets"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "unique-external-id-for-security"
        }
      }
    }
  ]
}
```

Add the `ExternalId` to your Infisical dynamic secret configuration for additional security.

## Cost Considerations

- **Infisical**: Minimal overhead; dynamic secret generation is lightweight
- **AWS**: No additional cost for temporary credentials beyond normal STS usage
- **EKS**: Network egress to Infisical counts towards cluster bandwidth

For high-frequency credential refreshes, cache credentials in your application (respecting TTL) rather than fetching every request.

## Summary

Using Infisical dynamic secrets for AWS credentials on EKS provides:
- ✓ Automatic credential rotation with 1-hour expiration
- ✓ Scoped, least-privilege S3 access
- ✓ Centralized secret management and audit trails
- ✓ No hardcoded credentials in your codebase or configs
- ✓ Fine-grained access control via Infisical's RBAC

This setup eliminates the need to manage long-lived IAM user keys and ensures your EKS workloads always have valid, expired credentials that can't be abused if leaked.
