# SSH Certificates in Infisical: Setup and Usage Guide

## Overview

Infisical's SSH certificate feature enables your team to issue short-lived SSH certificates instead of managing long-lived SSH keys. This approach significantly improves security by:

- **Reducing exposure window**: Certificates expire after a configurable period (typically minutes to hours)
- **Centralized key management**: The private CA key is stored securely in Infisical
- **Audit trail**: All certificate issuance is logged and auditable
- **Eliminating key rotation burden**: No need to manually rotate SSH keys across servers
- **Fine-grained control**: Certificate validity can be restricted by time, user principals, and commands

This is commonly used for:
- Production server access
- CI/CD pipelines
- Temporary contractor access
- Team SSH access without individual key management

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Infisical Server                      │
│  ┌─────────────────────────────────────────────────┐   │
│  │  SSH CA (Certificate Authority)                 │   │
│  │  - Private Key (secured)                        │   │
│  │  - Public Key (distributed to servers)          │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
         ↓ Issues                          ↓ Configures
    ┌────────────────┐              ┌─────────────────┐
    │  Team Member   │              │ Production      │
    │  Gets SSH Cert │              │ Servers         │
    │  (short-lived) │              │ Trust CA Key    │
    └────────────────┘              └─────────────────┘
```

### The Flow

1. **Team member requests certificate** → via CLI, API, or UI
2. **Infisical validates** → authentication, authorization, certificate parameters
3. **Infisical signs** → creates short-lived certificate using the private CA key
4. **Certificate issued** → delivered to team member with configurable TTL
5. **Team member authenticates** → uses certificate to SSH into production servers
6. **Servers verify** → check certificate is signed by trusted CA (public key configured once)

### Key Benefits Over Raw Keys

| Aspect | SSH Keys | SSH Certificates |
|--------|----------|------------------|
| **Lifetime** | Indefinite | Minutes to hours (configurable) |
| **Revocation** | Must manually rotate | Automatic after TTL expires |
| **Audit** | May be sparse | Every issuance logged |
| **Rotation burden** | High (distribute new keys) | None (issuance is key generation) |
| **Access control** | Binary (key works or doesn't) | Rich (principals, command restrictions, validity window) |

## Setup Steps

### 1. Create the SSH CA in Infisical

#### Via Infisical Dashboard

1. Navigate to **Settings** → **SSH CA** (or **Security** → **Secrets Engines** depending on your Infisical version)
2. Click **Generate CA** or **Create new CA**
3. Infisical generates:
   - Private key (stored encrypted in Infisical's database)
   - Public key (you'll need to distribute this)
4. Give the CA a descriptive name (e.g., `prod-ssh-ca`)
5. Configure default settings:
   - **TTL**: How long certificates are valid (e.g., `30m`, `24h`)
   - **Max TTL**: Maximum validity period a team member can request
   - **Key type**: RSA 4096 or ED25519 (ED25519 is recommended for modern setups)
   - **User principals**: Which SSH users can be authenticated (e.g., `ubuntu`, `ec2-user`, `appuser`)
   - **Critical options**: Restrictions like `force-command` (lock to specific commands)

#### Via API

```bash
curl -X POST https://your-infisical.com/api/v1/ssh-ca \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "prod-ssh-ca",
    "ttl": "30m",
    "maxTtl": "24h",
    "keyType": "ed25519",
    "userPrincipals": ["ubuntu", "appuser"]
  }'
```

### 2. Configure Your Servers to Trust the CA

For each production server:

#### Add CA Public Key to SSH Config

1. **Retrieve the public key** from Infisical (displayed in CA settings or via API)
2. **Add to each server** at `/etc/ssh/trusted-user-ca-keys.pub`:
   ```bash
   ssh-keygen -t ed25519 -C "prod-ssh-ca" -N "" -f /tmp/ca_key
   # Copy public key from Infisical to:
   sudo tee /etc/ssh/trusted-user-ca-keys.pub <<< "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5... prod-ssh-ca"
   ```
3. **Update SSH daemon config** (`/etc/ssh/sshd_config`):
   ```
   # Enable certificate authentication
   TrustedUserCAKeys /etc/ssh/trusted-user-ca-keys.pub
   
   # Optional: Restrict certificate usage
   # AuthorizedPrincipalsCommand /etc/ssh/authorized-principals.sh
   # AuthorizedPrincipalsFile /etc/ssh/authorized-principals.d/%u
   ```
4. **Reload SSH**:
   ```bash
   sudo systemctl reload sshd
   ```

### 3. Configure Certificate Permissions in Infisical

Define who can request SSH certificates:

#### Set Role-Based Access Control

1. Go to **Project Settings** → **Roles & Permissions**
2. Create a role (e.g., `ssh-certificate-requester`) with permission:
   - **Action**: `read-secret`, `create-secret` (for SSH CA)
   - **Resource**: SSH CA resource
3. Assign the role to team members or groups

#### Set Organization-Level Controls (Optional)

- **Require MFA** for SSH certificate issuance
- **Restrict principals** by user/group
- **Enable audit logging** for compliance

### 4. Issue Your First Certificate

#### Via Infisical UI

1. Navigate to **Secrets** → **SSH CA** section
2. Click **Request Certificate**
3. Fill in:
   - **Principal**: Username on target server (e.g., `ubuntu`)
   - **Public Key**: Your SSH public key (from `~/.ssh/id_ed25519.pub`)
   - **TTL**: How long the cert is valid (e.g., `30m`)
   - **Optional Hostname**: Restrict cert to specific server (e.g., `prod-1.example.com`)
4. Click **Generate**
5. Copy the issued certificate to your local machine

#### Via CLI

If your organization uses Infisical CLI:

```bash
infisical secrets ssh-cert request \
  --ca "prod-ssh-ca" \
  --principal "ubuntu" \
  --public-key "$(cat ~/.ssh/id_ed25519.pub)" \
  --ttl "30m" \
  --hostname "prod-1.example.com"
```

#### Via API

```bash
curl -X POST https://your-infisical.com/api/v1/ssh-ca/cert \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "caId": "ca-uuid-here",
    "principal": "ubuntu",
    "publicKey": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5...",
    "ttl": "30m",
    "hostname": "prod-1.example.com"
  }' | jq -r '.certificate' > ~/.ssh/prod-cert.pub
```

### 5. Configure Your SSH Client

Store the certificate locally and configure SSH to use it:

#### Create SSH Config Entry

Add to `~/.ssh/config`:

```
Host prod-1
  HostName prod-1.example.com
  User ubuntu
  IdentityFile ~/.ssh/id_ed25519
  CertificateFile ~/.ssh/prod-cert.pub
  StrictHostKeyChecking accept-new
```

#### Test SSH Access

```bash
ssh prod-1
# Or directly:
ssh -i ~/.ssh/id_ed25519 -i ~/.ssh/prod-cert.pub ubuntu@prod-1.example.com
```

If successful, you'll be authenticated via certificate. If the certificate expires, you'll get an authentication error and need to request a new one from Infisical.

## Advanced Configuration

### Restrict Certificates by Hostname

Prevent a certificate from being used on unintended servers:

```bash
# When requesting, specify hostname
--hostname "prod-1.example.com"
```

The certificate becomes valid only for that specific host.

### Restrict Certificates to Specific Commands

Use SSH critical options to force command execution:

```bash
# In Infisical CA config:
"criticalOptions": {
  "force-command": "/usr/local/bin/deployment-script.sh"
}
```

Now certificates can only run that specific command, even if a key is compromised.

### Restrict by Key ID

Use SSH key IDs to further restrict certificate scope:

```bash
# When issuing:
--key-id "deploy-prod"
```

Logged in audit trail for full traceability.

### Integration with CI/CD

For automated deployments:

1. **Service Account**: Create a service account in Infisical
2. **Issue Long-TTL Cert**: Request a certificate with longer TTL (if policies allow)
3. **Store in CI/CD Secrets**: Save certificate in GitHub Actions, GitLab CI, etc.
4. **Refresh Before Use**: Request a new cert before each deployment

Example GitHub Actions workflow:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Get SSH Certificate
        run: |
          infisical secrets ssh-cert request \
            --ca prod-ssh-ca \
            --principal ubuntu \
            --public-key "${{ secrets.DEPLOY_PUBLIC_KEY }}" \
            --ttl 15m > ~/.ssh/cert.pub
      
      - name: Deploy to Production
        run: |
          ssh -i ~/.ssh/deploy_key -i ~/.ssh/cert.pub \
            ubuntu@prod-1.example.com \
            'bash /home/ubuntu/deploy.sh'
```

## Troubleshooting

### Certificate Rejected by Server

**Problem**: `Permission denied (publickey)`

**Solutions**:
1. Verify public key of CA is in `/etc/ssh/trusted-user-ca-keys.pub`
2. Check SSH daemon has reloaded (`sudo systemctl reload sshd`)
3. Verify certificate principal matches actual server user
4. Check certificate hasn't expired (`ssh-keygen -L -f ~/.ssh/prod-cert.pub`)

### Certificate Expired

**Solution**: Request a new certificate from Infisical. Implement automation to refresh before expiry in CI/CD.

### Access Denied Despite Valid Certificate

**Possible causes**:
1. User principal not in CA's allowed list
2. Hostname restriction doesn't match target server
3. Certificate TTL already exceeded
4. User doesn't have permission to request certificates in Infisical

## Security Best Practices

1. **Use ED25519 keys**: Smaller, faster, more secure than RSA
2. **Short TTLs**: Use minutes (5-30m) for interactive access, hours for CI/CD
3. **Hostname binding**: Restrict certificates to specific servers
4. **Require MFA**: Enforce MFA for certificate requests in Infisical
5. **Audit logging**: Enable and monitor audit logs for all certificate issuance
6. **Regular CA rotation**: Rotate the CA key periodically (e.g., annually)
7. **Separate CAs**: Use different CAs for different environments (dev, staging, prod)
8. **Principle of least privilege**: Allow only necessary principals and commands
9. **Monitor certificate issuance**: Alert on unusual patterns (e.g., after-hours requests)
10. **Secure CA private key**: Never export the CA private key; it should remain in Infisical

## Comparison with Alternatives

### vs. HashiCorp Vault SSH CA

- **Infisical**: Simpler UI, integrated secret management, easier for teams starting SSH certs
- **Vault**: More mature, enterprise features, more complex setup

### vs. Traditional SSH Key Management

- **SSH Certificates**: Short-lived, auditable, no rotation burden
- **Keys**: Indefinite lifetime, manual rotation, harder to track access

### vs. Teleport (Zero Trust)

- **Infisical SSH Certs**: Certificate-based, traditional SSH architecture
- **Teleport**: Proxy-based zero trust, recording all sessions, more invasive

## Next Steps

1. **Generate SSH CA** in Infisical (Settings → SSH CA)
2. **Export public key** and deploy to production servers
3. **Configure one server** to accept certificates for testing
4. **Request your first cert** via the UI
5. **SSH to test server** using the certificate
6. **Automate in CI/CD** once comfortable
7. **Set up audit monitoring** for compliance
8. **Plan CA rotation** schedule

## Resources

- Infisical documentation: Look for "SSH Certificates" or "Dynamic Secrets"
- OpenSSH manual: `man ssh-keyscan`, `man sshd_config`, `man ssh`
- SSH CA best practices: Review OpenSSH release notes for certificate features
