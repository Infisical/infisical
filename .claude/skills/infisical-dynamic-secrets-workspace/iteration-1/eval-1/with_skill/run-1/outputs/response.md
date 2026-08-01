# Setting Up Temporary AWS IAM Credentials with Infisical Dynamic Secrets

Great question! Infisical Dynamic Secrets is an excellent fit for your use case. You want on-demand, temporary AWS credentials with fine-grained S3 permissions and automatic expiration after 1 hour. Here's the complete setup guide.

## Overview: What You're Getting

Infisical Dynamic Secrets will:
- Generate **unique temporary credentials** each time your EKS application requests them
- Automatically expire after **1 hour** (your configured TTL)
- Grant **only S3 read permissions** (least privilege)
- Provide **AWS Access Key, Secret Key, and a Session Token**
- Create a full audit trail of who accessed what and when

## Step 1: Choose Your Credential Type

For EKS, you have two good options:

### **Option A: Temporary Credentials via AssumeRole (Recommended)**
- Generates STS credentials (Access Key + Secret Key + Session Token)
- **Max duration: 1 hour** — perfect for your 1-hour TTL requirement
- No IAM user is created or deleted
- Cleanest for ephemeral workloads

### **Option B: Temporary Credentials via IRSA (If Infisical runs on EKS)**
- Uses IAM Roles for Service Accounts (IRSA)
- Still generates temporary STS credentials
- Works if Infisical itself is deployed on your EKS cluster
- Same 1-hour max duration

**Recommendation:** Use **Option A (AssumeRole)** unless Infisical is already running on your EKS cluster. It's simpler to set up and works from anywhere.

## Step 2: AWS Setup — Create an IAM Role

In your AWS account, create a new IAM role that Infisical will assume to generate credentials:

1. **Go to IAM → Roles → Create Role**
2. **Select trusted entity:**
   - Choose "Another AWS account"
   - Enter Infisical's Account ID:
     - **US:** `381492033652`
     - **EU:** `345594589636` (match your Infisical region)
3. **Optionally enable External ID:**
   - Check "Require external ID"
   - Use your Infisical Project ID as the external ID (more secure)
4. **Attach a permissions policy** — See below
5. **Copy the Role ARN** — you'll need this in Infisical

### IAM Permissions Policy

Since you only need S3 read permissions, attach a minimal policy. Create an inline policy with this JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sts:GetSessionToken",
        "sts:AssumeRole"
      ],
      "Resource": "*"
    }
  ]
}
```

This policy allows Infisical to generate temporary credentials via AssumeRole or GetSessionToken.

## Step 3: Create the IAM Role (for your application)

This is the role your application will **actually use**. Create another IAM role with S3 read-only permissions:

1. **Go to IAM → Roles → Create Role**
2. **Select trusted entity:** Choose "AWS Service" → "Security Token Service (STS)"
3. **Attach a permissions policy** — S3 read-only:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    }
  ]
}
```

**Replace `your-bucket-name`** with the actual S3 bucket your app needs to read from.

4. **Copy the Role ARN** — you'll reference this in Step 5

## Step 4: Update the Infisical Role Trust Relationship

Go back to the **first role** (the one Infisical assumes), and update its trust relationship to allow assuming the **second role** (the one with S3 permissions).

Edit the trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::381492033652:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "your-project-id"
        }
      }
    },
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "sts.amazonaws.com"
      },
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::YOUR_ACCOUNT:role/your-s3-read-role"
    }
  ]
}
```

Then add an inline policy to the Infisical role so it can assume the S3 role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::YOUR_ACCOUNT:role/your-s3-read-role"
    }
  ]
}
```

## Step 5: Configure Dynamic Secret in Infisical

1. **Open Infisical Web UI** → Select your project and environment (e.g., `dev`)
2. **Go to Secrets Overview** → Click **"Add Dynamic Secret"**
3. **Select provider:** `AWS IAM`
4. **Fill in the form:**
   - **Secret Name:** `s3-read-creds` (or any descriptive name)
   - **AWS Credential Type:** `Temporary Credentials`
   - **AWS Auth Method:** `Assume Role`
   - **AWS Role ARN:** Paste the ARN from Step 2
   - **AWS Region:** Your region (e.g., `us-east-1`)
   - **Default TTL:** `1h`
   - **Max TTL:** `1h` (AssumeRole max is 1 hour)
   - **Assume Role ARN:** The ARN of your S3 read-only role from Step 3
   - **Assume Role External ID:** (Optional, leave blank if you didn't set one)

5. **Click "Save"**

## Step 6: Generate a Lease in Infisical

1. **In the Secrets Overview,** find your dynamic secret `s3-read-creds`
2. **Click it** → Click **"New Lease"**
3. **Specify TTL:** `1h` (or any duration up to Max TTL)
4. **Click "Generate"**

Infisical will create temporary AWS credentials and display:
- `ACCESS_KEY` — AWS Access Key ID
- `SECRET_ACCESS_KEY` — AWS Secret Access Key
- `SESSION_TOKEN` — STS session token (required for temporary credentials)

## Step 7: Use Credentials in Your EKS Application

Your application can fetch these credentials three ways:

### **Option 1: Infisical Agent Template (Recommended)**

If you're using the Infisical Agent to inject secrets:

```go
{{ with dynamicSecret "my-project" "dev" "/" "s3-read-creds" "1h" }}
AWS_ACCESS_KEY_ID={{ .ACCESS_KEY }}
AWS_SECRET_ACCESS_KEY={{ .SECRET_ACCESS_KEY }}
AWS_SESSION_TOKEN={{ .SESSION_TOKEN }}
{{ end }}
```

The agent automatically renews leases before expiration.

### **Option 2: Infisical API**

Your application calls the Infisical API to create a lease:

```bash
curl -X POST https://api.infisical.com/api/v1/dynamic-secrets/leases \
  -H "Authorization: Bearer YOUR_MACHINE_IDENTITY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dynamicSecretName": "s3-read-creds",
    "projectId": "YOUR_PROJECT_ID",
    "environmentSlug": "dev",
    "secretPath": "/",
    "ttl": "1h"
  }'
```

### **Option 3: Infisical SDK**

Use the official SDK for your language to request dynamic secrets programmatically.

## Step 8: Configure EKS Pod Access

If your pod needs to access these credentials at startup:

1. **Store Infisical credentials** as an EKS secret or use IRSA to authenticate to Infisical
2. **Have your pod request a lease** from Infisical on startup (Option 2 or 3 above)
3. **Set AWS environment variables** with the returned credentials
4. **Your application** automatically uses AWS credentials via the SDK

**Example pod init script:**

```bash
#!/bin/bash
LEASE=$(curl -X POST https://api.infisical.com/api/v1/dynamic-secrets/leases \
  -H "Authorization: Bearer $INFISICAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dynamicSecretName": "s3-read-creds", "projectId": "'$PROJECT_ID'", "environmentSlug": "dev", "secretPath": "/", "ttl": "1h"}')

export AWS_ACCESS_KEY_ID=$(echo $LEASE | jq -r '.data.ACCESS_KEY')
export AWS_SECRET_ACCESS_KEY=$(echo $LEASE | jq -r '.data.SECRET_ACCESS_KEY')
export AWS_SESSION_TOKEN=$(echo $LEASE | jq -r '.data.SESSION_TOKEN')

# Run your application
exec "$@"
```

## Security Best Practices

1. **Short TTL (1 hour):** Excellent choice. Credentials expire quickly.
2. **Least privilege:** Your S3 policy only grants `GetObject` and `ListBucket` — perfect.
3. **Separate roles:** The Infisical role and application role are separate, limiting blast radius.
4. **External ID:** Use your Infisical Project ID as an external ID when creating the Infisical role — adds another layer of security.
5. **Audit trail:** Every lease generation is logged in Infisical. Audit "who" generated credentials and "when."
6. **No static credentials:** Your application never stores AWS access keys — each request gets fresh temporary credentials.

## Troubleshooting

**Lease generation fails with "Access Denied":**
- Verify the Infisical role ARN is correct
- Check that the Infisical role has permission to assume the S3 role
- Confirm the external ID (if configured) matches in both places

**Session token not returned:**
- Ensure you selected "Temporary Credentials" (not "IAM User")
- Check that Max TTL is at least 1 hour (AssumeRole max is 3600s)

**Credentials expire too quickly:**
- The maximum TTL for AssumeRole is **exactly 1 hour**. You cannot extend beyond this.
- If you need longer-lived credentials, consider using IAM User type (but this creates/deletes real users, less ideal for ephemeral workloads)

**Application can't assume the S3 role:**
- Verify the "Assume Role ARN" field points to the correct S3 role
- Ensure the S3 role's trust policy allows STS to assume it

## Summary

Your setup:
- **Credential Type:** Temporary Credentials (STS)
- **Auth Method:** Assume Role
- **TTL:** 1 hour (matches your requirement)
- **Permissions:** S3 read-only (GetObject, ListBucket)
- **Renewal:** Automatic via Infisical Agent or manual API requests
- **Expiration:** Automatic after 1 hour

This is a secure, auditable, and fully automated way to provide temporary cloud credentials to your EKS workload. Let me know if you have questions!
