# SSH Certificates with Infisical: Setup & Usage Guide

## Overview

Infisical's SSH certificate feature lets your team authenticate to production servers without managing long-lived SSH keys. Instead, Infisical acts as a Certificate Authority (CA), issuing short-lived signed certificates on demand. When a certificate expires, it's automatically invalidated—no manual revocation needed.

### Why This Matters for Your Team

- **No SSH key sprawl**: Team members don't store permanent SSH keys
- **Automatic expiration**: Certificates are valid for minutes to hours, not indefinitely
- **Audit trail**: Full visibility into who accessed which server and when
- **Simplified offboarding**: When team members leave, their old certificates automatically expire
- **Least privilege**: Pair with specific principal (username) restrictions

---

## How It Works

1. **Infisical generates a CA key pair** when you create the dynamic secret
2. **Your servers trust the CA** by installing its public key in `/etc/ssh/sshd_config`
3. **On-demand generation**: When a team member needs access, they request a lease from Infisical
4. **Ephemeral credentials**: Infisical generates a unique key pair, signs it with the CA, and returns both
5. **Automatic expiration**: The certificate is only valid for the lease TTL (e.g., 1 hour)

---

## Prerequisites

Before setting up, ensure:

- Your production servers are SSH-accessible and you have `root` or `sudo` access
- You have admin credentials for your Infisical instance
- Your team members have access to Infisical (through your authentication method: SSO, API key, etc.)

---

## Step 1: Create the SSH Dynamic Secret in Infisical

### In the Infisical Dashboard

1. Navigate to **Secrets Overview** → select your **environment** (e.g., Production)
2. Click **"Add Dynamic Secret"**
3. Select **"SSH Certificates"** as the provider
4. Fill in the configuration:

| Field | Value | Notes |
|-------|-------|-------|
| **Secret Name** | e.g., `prod-ssh-certs` | Descriptive name for your dynamic secret |
| **Default TTL** | `1h` | How long a certificate is valid by default (suggest 1–8 hours) |
| **Max TTL** | `8h` | Absolute maximum (team can't request longer than this) |
| **Allowed Principals** | `ubuntu,deploy,root` | Usernames certificates can authenticate as (comma-separated) |
| **Key Algorithm** | `ED25519` | Recommended for modern servers; alternatives: `RSA 2048/4096`, `ECDSA P-256/P-384` |

**TTL Recommendations:**
- **Development**: 8 hours (convenience while working)
- **Production**: 1–2 hours (tighter security window)
- **On-call**: 4 hours (balance convenience and security)

### Submit

Click **"Create Dynamic Secret"**. Infisical generates the CA key pair and shows a setup modal.

---

## Step 2: Configure Your Servers to Trust the CA

After creating the dynamic secret, Infisical displays a setup modal with the CA public key and two configuration options.

### Option A: Automated Setup (Recommended)

Run the provided one-liner on each target server:

```bash
curl -H "Authorization: Bearer <token>" \
  "https://<infisical-url>/api/v1/dynamic-secrets/ssh-ca-setup/<secret-id>" | sudo bash
```

This script will:
- Save the CA public key to `/etc/ssh/infisical_ca.pub`
- Add `TrustedUserCAKeys /etc/ssh/infisical_ca.pub` to `/etc/ssh/sshd_config`
- Restart the SSH daemon

### Option B: Manual Setup

If the automated script doesn't work for your environment:

1. **Copy the CA public key** from the setup modal
2. **SSH into each production server** and run:
   ```bash
   echo "<paste CA public key here>" | sudo tee /etc/ssh/infisical_ca.pub
   ```

3. **Edit `/etc/ssh/sshd_config`** and add:
   ```
   TrustedUserCAKeys /etc/ssh/infisical_ca.pub
   ```

4. **Restart SSH**:
   ```bash
   sudo systemctl restart sshd
   ```

5. **Verify** (from your local machine):
   ```bash
   ssh-keyscan <server-hostname>
   ```

---

## Step 3: Generate a Lease (Issue a Certificate)

Now your team can request certificates.

### In the Infisical Dashboard

1. Go to **Secrets Overview** → find your **SSH dynamic secret** (e.g., `prod-ssh-certs`)
2. Click **"New Lease"**
3. Specify:
   - **TTL** (within the Max TTL you set)
   - **Principal** (e.g., `ubuntu` or `deploy` — must be in Allowed Principals)
4. Click **"Generate"**

### Download the Certificate

Infisical returns two files:

- **`key.pem`** — The private key for this certificate
- **`cert.pub`** — The signed SSH certificate

---

## Step 4: Use the Certificate to SSH

On the team member's local machine:

```bash
# Set appropriate permissions
chmod 600 key.pem

# SSH using the certificate
ssh -i key.pem -o CertificateFile=cert.pub <principal>@<hostname>
```

**Example:**
```bash
ssh -i key.pem -o CertificateFile=cert.pub ubuntu@prod-server.example.com
```

### Automate with SSH Config

Add to `~/.ssh/config` for convenience:

```
Host prod-server.example.com
  User ubuntu
  IdentityFile ~/Downloads/key.pem
  CertificateFile ~/Downloads/cert.pub
  StrictHostKeyChecking accept-new
```

Then simply:
```bash
ssh prod-server.example.com
```

---

## Important Gotchas

### Certificates Cannot Be Renewed
The TTL is baked in at signing time. Once a certificate expires, it's no longer valid. **Your team must request a new lease** for a fresh certificate. Plan for this workflow in your team's process.

### Certificates Remain Valid Until Expiry
Even if a team member's lease is revoked in Infisical, the certificate remains valid until the TTL expires. Use **short TTLs** for high-security environments (1–2 hours for production).

### Revocation Doesn't Immediately Invalidate Certificates
If a team member needs to be removed urgently, revoking their lease in Infisical removes the record, but they can still use the certificate until it expires. For immediate revocation, manually remove the CA public key from target servers or regenerate the CA key (which invalidates all old certificates).

---

## Advanced: Programmatic Certificate Generation

If your team uses the Infisical Agent or CI/CD pipelines, you can request certificates programmatically.

### Via Infisical Agent Template

```bash
{{ with dynamicSecret "my-project" "prod" "/" "prod-ssh-certs" "1h" }}
CERT_PRIVATE_KEY={{ .PRIVATE_KEY }}
CERT_SIGNED_CERT={{ .SIGNED_CERTIFICATE }}
{{ end }}
```

The agent automatically renews certificates as needed.

### Via Infisical API

Use a machine identity access token to request leases:

```bash
curl -X POST https://<infisical-url>/api/v1/dynamic-secrets/<secret-id>/leases \
  -H "Authorization: Bearer <machine-token>" \
  -d '{
    "ttl": "1h",
    "principal": "ubuntu"
  }'
```

Returns the private key and signed certificate for immediate use.

---

## Security Best Practices

1. **Use Short TTLs for Production**
   - Development: 8 hours
   - Production: 1–2 hours
   - On-call emergencies: 4 hours max

2. **Restrict Allowed Principals**
   - Only include usernames that actually exist on your servers
   - Separate secrets for different roles if needed (e.g., `prod-ssh-ubuntu` vs `prod-ssh-root`)

3. **Audit Regularly**
   - Check Infisical's audit logs to see who requested certificates
   - Look for unusual access patterns

4. **Automate Certificate Cleanup**
   - Instruct team members to delete downloaded `key.pem` and `cert.pub` files after use
   - Or distribute via secure channels (CI/CD pipelines) and never store locally

5. **Monitor SSH Server Logs**
   - Watch for failed authentication attempts or unexpected principals
   - Consider forwarding SSH logs to a centralized system for alerting

6. **Plan for CA Rotation**
   - If the CA key is compromised, you must generate a new CA and reconfigure all servers
   - Document the procedure in advance

---

## Troubleshooting

### "SSH Key Permissions Denied"
Ensure `key.pem` has the correct permissions:
```bash
chmod 600 key.pem
```

### "SSH Connection Refused"
- Verify the server is reachable: `ssh-keyscan <hostname>`
- Confirm `/etc/ssh/sshd_config` includes `TrustedUserCAKeys /etc/ssh/infisical_ca.pub`
- Restart SSH: `sudo systemctl restart sshd`

### "Permission Denied (Public Key)"
- The principal you specified doesn't exist on the server
- The user account on the server doesn't allow SSH access
- Check `/var/log/auth.log` on the server for details

### Certificate Expired
Generate a new lease—this is normal and expected. Certificates are short-lived by design.

---

## Next Steps

1. **Set up your first server** using the automated or manual setup option
2. **Request a test certificate** from the dashboard
3. **Test SSH access** with the issued certificate
4. **Add remaining servers** to the trusted CA list
5. **Document the workflow** for your team (e.g., "Request SSH certs here, valid for 1 hour")
6. **Monitor and audit** certificate usage in Infisical's audit logs

---

## Additional Resources

- Infisical Documentation: SSH Certificates section
- OpenSSH Manual: `man ssh-keygen` for details on certificate formats
- Your organization's SSH access policy and security guidelines
