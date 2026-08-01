# Dynamic Secrets: Cloud IAM

## AWS IAM

### Overview
Generate on-demand AWS IAM credentials — either full IAM Users with access keys, or temporary STS credentials. Three authentication methods available.

### Credential Types

**IAM User** — Creates a real IAM user with long-lived access keys. User is deleted when the lease expires.

**Temporary Credentials** — Generates short-lived STS credentials (access key + secret key + session token) via AssumeRole or GetSessionToken. No IAM user is created.

### Authentication Methods

#### 1. Assume Role (Recommended for Cloud)
Infisical assumes an IAM role in your AWS account to create credentials.

**Cloud Setup:**
1. Create an IAM Role in your AWS account
2. Trusted Entity: **Another AWS Account**
3. Infisical Account ID: `381492033652` (US) or `345594589636` (EU)
4. Recommended: Enable "Require external ID" with your Infisical Project ID
5. Attach the required permissions policy (see below)
6. Copy the Role ARN

**Config fields:** AWS Role ARN, AWS Region

#### 2. IRSA (EKS)
For Infisical running on EKS — uses IAM Roles for Service Accounts.

**Prerequisite:** Set `KUBERNETES_AUTO_FETCH_SERVICE_ACCOUNT_TOKEN=true` on the Infisical instance.

**Setup:**
1. Create IAM OIDC provider for your EKS cluster
2. Create IAM Role trusting the OIDC provider with audience `sts.amazonaws.com`
3. Annotate the Infisical service account with the role ARN

**Config fields:** Same as Assume Role

#### 3. Access Key (Self-hosted / non-AWS)
Direct IAM access key authentication.

**Config fields:** AWS Access Key, AWS Secret Key, AWS Region

### IAM User Credential Config
| Field | Required | Description |
|-------|----------|-------------|
| AWS IAM Path | No | IAM path prefix for created users |
| Permission Boundary | No | IAM policy ARN to use as permission boundary |
| AWS IAM Groups | No | Comma-separated group names to add user to |
| AWS Policy ARNs | No | Comma-separated policy ARNs to attach |
| AWS IAM Policy Document | No | Inline JSON policy document |
| Tags | No | Key-value tags for the IAM user |

### Required IAM Permissions

**For IAM User credential type:**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "iam:AttachUserPolicy", "iam:CreateAccessKey", "iam:CreateUser",
      "iam:DeleteAccessKey", "iam:DeleteUser", "iam:DeleteUserPolicy",
      "iam:DetachUserPolicy", "iam:GetUser", "iam:ListAccessKeys",
      "iam:ListAttachedUserPolicies", "iam:ListGroupsForUser",
      "iam:ListUserPolicies", "iam:PutUserPolicy",
      "iam:AddUserToGroup", "iam:RemoveUserFromGroup", "iam:TagUser"
    ],
    "Resource": ["*"]
  }]
}
```

**For Temporary Credentials:**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["sts:GetSessionToken", "sts:AssumeRole"],
    "Resource": ["*"]
  }]
}
```

### AWS STS Duration Limits
| Method | Max Duration |
|--------|-------------|
| AssumeRole (temporary credentials) | **1 hour** (3600s) |
| Access Key / IRSA (GetSessionToken) | **12 hours** (43200s) |

Infisical auto-adjusts TTL if it exceeds these limits.

### Lease Returns (IAM User)
- `ACCESS_KEY` — AWS Access Key ID
- `SECRET_ACCESS_KEY` — AWS Secret Access Key
- `USERNAME` — IAM username

### Lease Returns (Temporary Credentials)
- `ACCESS_KEY` — AWS Access Key ID
- `SECRET_ACCESS_KEY` — AWS Secret Access Key
- `SESSION_TOKEN` — STS session token

---

## GCP IAM

### Overview
Generate on-demand GCP service account access tokens via service account impersonation.

### Prerequisites
- Enable **IAM API** and **IAM Credentials API** in your GCP project
- Create a GCP Service Account with the roles you want tokens to inherit
- Grant **Service Account Token Creator** role to Infisical's service account on your service account

**Infisical Cloud service accounts:**
- US: `infisical-us@infisical-us.iam.gserviceaccount.com`
- EU: `infisical-eu@infisical-eu.iam.gserviceaccount.com`

**Self-hosted:** Create a dedicated service account, download JSON key, set `INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL` env var.

### Configuration
| Field | Required | Description |
|-------|----------|-------------|
| Secret Name | Yes | Name for this dynamic secret |
| Default TTL | Yes | Default lease duration |
| Max TTL | Yes | Maximum lease duration |
| Service Account Email | Yes | Email of the GCP service account to impersonate |

### Lease Returns
- Access token (OAuth2 bearer token)

### Gotchas
- **GCP tokens CANNOT be revoked.** Revoking a lease in Infisical removes the record, but the token remains valid until its TTL expires. Use short TTLs.
- The generated token inherits all roles assigned to the impersonated service account
- Two separate GCP APIs must be enabled (IAM API + IAM Credentials API)
