# Setting Up Dynamic PostgreSQL Credentials with Infisical

## Overview

You're implementing a security best practice: replacing shared static database passwords with ephemeral, developer-specific credentials that automatically expire. With Infisical Dynamic Secrets for PostgreSQL, each developer gets a unique username/password pair valid only for a short time (e.g., 1 hour), and the Infisical Gateway handles secure communication to your private VPC database.

---

## Architecture Overview

Here's how it works:

1. **Developer requests credentials** → Uses Infisical dashboard or API
2. **Infisical generates short-lived user** → Creates unique PostgreSQL role with TTL
3. **Credentials returned** → `DB_USERNAME` and `DB_PASSWORD` ready to use
4. **Lease expires** → PostgreSQL user is automatically dropped; credentials become invalid
5. **Optional renew** → Developer can extend the lease (up to the Max TTL you set)

For your **private VPC database**, the **Infisical Gateway** is essential. It runs inside your network, maintains an encrypted outbound connection to Infisical Cloud's relay server, and routes all credential management traffic through that secure tunnel.

---

## Prerequisites

Before you can set up dynamic secrets, ensure:

### 1. PostgreSQL Admin User
Create a dedicated PostgreSQL user that Infisical will use to create/drop temporary users. This user needs:
- `CREATE ROLE` privilege
- `GRANT` and `REVOKE` privileges
- `ALTER ROLE` (if you want to set custom attributes)

**Example setup** (run as PostgreSQL `postgres` superuser):
```sql
-- Create an admin user for Infisical
CREATE USER infisical_admin WITH PASSWORD 'strong-random-password-here';

-- Grant role creation privileges
ALTER USER infisical_admin CREATEDB;
ALTER USER infisical_admin CREATEROLE;

-- Alternatively, grant directly to the infisical_admin role
GRANT CONNECT ON DATABASE your_database TO infisical_admin;
```

Store this password securely — you'll enter it in Infisical's configuration next.

### 2. Network Access (Critical for Private VPC)
Your PostgreSQL must be reachable from either:
- **Infisical Gateway** (deployed in your VPC or private network)
- **Or** a publicly accessible endpoint (not recommended for production databases)

**You should use the Gateway.** This is an Enterprise feature in Infisical Cloud. If you're on the Pro plan, contact Infisical sales to enable it, or self-host Infisical Enterprise.

### 3. PostgreSQL SSL/TLS (Recommended)
If your RDS instance requires SSL certificates (common on AWS):
- Download the RDS CA certificate
- You'll paste it into the Infisical UI during configuration

---

## Step 1: Deploy the Infisical Gateway (Private VPC)

Since your database is in a private VPC, you must deploy an Infisical Gateway.

### Where to Deploy
- **EC2 instance** in the same VPC as your database
- **ECS task** with network access to the database
- **Kubernetes pod** if you run K8s
- Any location with:
  - Network connectivity to your PostgreSQL (security group rules)
  - Outbound HTTPS/SSH access to Infisical Cloud relay server

### Deployment Steps

1. **In Infisical Cloud:**
   - Navigate to **Project Settings** → **Gateways** (or **Infrastructure** → **Gateways** depending on UI version)
   - Click **Create Gateway**
   - Name it (e.g., `prod-vpc-gateway`, `dev-postgres-gateway`)
   - Copy the generated token

2. **Deploy Gateway Service:**

   Option A: **Docker**
   ```bash
   docker run -d \
     --name infisical-gateway \
     -e INFISICAL_GATEWAY_TOKEN="<your-gateway-token>" \
     -p 8200:8200 \
     infisical/gateway:latest
   ```

   Option B: **systemd (EC2)**
   ```bash
   # Install via package manager or download binary
   # Then create /etc/systemd/system/infisical-gateway.service
   [Unit]
   Description=Infisical Gateway
   After=network.target

   [Service]
   Type=simple
   User=infisical
   ExecStart=/usr/local/bin/infisical-gateway --token <your-gateway-token>
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

   Option C: **ECS Task Definition**
   - Container image: `infisical/gateway:latest`
   - Environment variable: `INFISICAL_GATEWAY_TOKEN=<your-token>`
   - Expose port 8200

3. **Verify Gateway is Running:**
   ```bash
   curl http://localhost:8200/health
   # Should return: {"status":"ok"}
   ```

4. **Note the Gateway ID** — You'll select this when creating the dynamic secret in Infisical.

---

## Step 2: Create the Dynamic Secret in Infisical

### Navigate to Dynamic Secrets UI
1. Open **Infisical Cloud** → Your project
2. Select **Secrets** → **Secrets Overview**
3. Choose your environment (e.g., `production`, `development`)
4. Click **Add Dynamic Secret** (or similar button)
5. Select **PostgreSQL** as the provider

### Configuration Fields

Fill in the following:

| Field | Value | Example |
|-------|-------|---------|
| **Secret Name** | Unique identifier for this dynamic secret | `postgres-dev-creds` |
| **Default TTL** | How long credentials last by default | `1h` (1 hour) |
| **Max TTL** | Maximum duration a lease can be renewed to | `24h` (1 day) |
| **Host** | Your RDS hostname or private IP | `prod-postgres.c9akciq32.us-east-1.rds.amazonaws.com` |
| **Port** | PostgreSQL port | `5432` |
| **Username** | The admin user you created | `infisical_admin` |
| **Password** | Admin user password (stored encrypted) | `strong-random-password-here` |
| **Database Name** | Target database for operations | `your_app_db` |
| **CA (SSL)** | AWS RDS CA certificate (if required) | *Paste PEM content* |
| **Gateway** | Select your deployed gateway | `prod-vpc-gateway` |

### SSL Certificate (AWS RDS)
If using AWS RDS, it requires SSL by default. Follow these steps:

1. Download the RDS CA certificate:
   ```bash
   # For most AWS regions
   wget https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
   
   # Or region-specific (e.g., us-east-1)
   wget https://truststore.pki.rds.amazonaws.com/us-east-1/us-east-1-bundle.pem
   ```

2. Open the `.pem` file in a text editor

3. In the Infisical UI, paste the **entire certificate content** into the **CA (SSL)** field

### Custom Creation Statement (Optional but Recommended)

By default, Infisical grants broad access. **Customize it to follow least privilege:**

**For read-only access to specific tables:**
```sql
CREATE ROLE "{{username}}" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';
GRANT CONNECT ON DATABASE your_app_db TO "{{username}}";
GRANT USAGE ON SCHEMA public TO "{{username}}";
GRANT SELECT ON TABLE public.users, public.orders, public.products TO "{{username}}";
```

**For full write access to specific schema:**
```sql
CREATE ROLE "{{username}}" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';
GRANT CONNECT ON DATABASE your_app_db TO "{{username}}";
GRANT USAGE ON SCHEMA public TO "{{username}}";
GRANT CREATE ON SCHEMA public TO "{{username}}";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "{{username}}";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "{{username}}";
```

**For application-specific permissions:**
```sql
CREATE ROLE "{{username}}" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';
GRANT CONNECT ON DATABASE your_app_db TO "{{username}}";
GRANT USAGE ON SCHEMA migrations TO "{{username}}";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE migrations.pending_jobs TO "{{username}}";
```

**Template variables available:**
- `{{username}}` — Generated username (e.g., `inf_user_a7b2c9d1`)
- `{{password}}` — Generated strong password
- `{{expiration}}` — PostgreSQL timestamp when credential expires (e.g., `2026-04-14 15:30:00`)

### Revocation Statement (Optional)

Default revocation simply drops the role. If you need custom cleanup:

```sql
DROP ROLE IF EXISTS "{{username}}";
```

Or if you prefer to disable instead of drop:
```sql
ALTER ROLE "{{username}}" NOLOGIN;
REVOKE ALL ON DATABASE your_app_db FROM "{{username}}";
```

---

## Step 3: Generate and Use Credentials

### Generate a Lease

1. In **Infisical**, find your dynamic secret in the dashboard
2. Click the **+ New Lease** button (or similar)
3. Optionally override the TTL (e.g., request `30m` instead of default `1h`)
4. Click **Generate**

The system returns:
```
DB_USERNAME: inf_user_a7b2c9d1
DB_PASSWORD: generated-secure-password-xyz
```

### Use in Your Application

**Direct database connection:**
```python
import psycopg2

username = "inf_user_a7b2c9d1"
password = "generated-secure-password-xyz"
host = "prod-postgres.c9akciq32.us-east-1.rds.amazonaws.com"
port = 5432
database = "your_app_db"

conn = psycopg2.connect(
    host=host,
    port=port,
    user=username,
    password=password,
    database=database,
    sslmode="require"  # AWS RDS requires SSL
)
```

**Via environment variables:**
```bash
export DB_USER="inf_user_a7b2c9d1"
export DB_PASS="generated-secure-password-xyz"
export DB_HOST="prod-postgres.c9akciq32.us-east-1.rds.amazonaws.com"
export DB_PORT=5432
export DB_NAME="your_app_db"
```

**Via Infisical Agent** (automatic renewal):
```
Infisical Agent Templates (in your secret `.env` template):

DB_HOST=prod-postgres.c9akciq32.us-east-1.rds.amazonaws.com
DB_PORT=5432
DB_NAME=your_app_db

{{ with dynamicSecret "your-project" "production" "/" "postgres-dev-creds" "1h" }}
DB_USER={{ .DB_USERNAME }}
DB_PASS={{ .DB_PASSWORD }}
{{ end }}
```

The Agent automatically renews the lease before expiration.

---

## Step 4: Lease Management

### Renew a Lease
If a developer needs to extend their session:
1. Click the **active lease** in the dashboard
2. Click **Renew**
3. New expiration time is set (cannot exceed Max TTL)

### Revoke a Lease
To immediately invalidate credentials:
1. Click the **active lease**
2. Click **Revoke**
3. PostgreSQL role is dropped; credentials become invalid immediately

### Auto-Expiration
When the TTL expires, the role is automatically dropped by Infisical. If you want to verify:
```sql
-- Check if role exists
SELECT * FROM pg_roles WHERE rolname = 'inf_user_a7b2c9d1';
-- Should return no rows if lease expired
```

---

## Best Practices & Security Recommendations

### 1. Short TTLs for Maximum Security
- **Developers working in IDE:** `30m` - `1h`
- **Automated jobs/services:** `1h` - `2h`
- **CI/CD pipelines:** `15m` - `30m` (credentials used only during build/deploy)

Shorter TTLs mean less exposure if credentials are accidentally leaked.

### 2. Least Privilege SQL Statements
Always scope permissions to what's needed:
- Read-only? `GRANT SELECT`
- Specific tables? List them, don't use `ALL`
- Specific schema? Reference it explicitly
- Never grant superuser or role creation privileges to app users

### 3. Monitor Lease Audit Logs
Infisical logs every lease creation, renewal, and revocation:
- Navigate to **Project Settings** → **Audit Logs**
- Filter by dynamic secret or resource
- Track who accessed credentials and when

### 4. Gateway Security
- **Network placement:** Deploy gateway in the same VPC as your database
- **Firewall rules:** Gateway only needs outbound HTTPS/SSH to Infisical relay
- **No inbound access needed:** Gateway initiates the tunnel
- **Secrets in transit:** All communication is encrypted end-to-end

### 5. Database User Naming
PostgreSQL limits usernames to 63 characters. Infisical generates predictable prefixes like `inf_user_` or `infisical_`. If you need custom naming:
- Use the **Username Template** field in the dynamic secret config
- Example: `{{.random}}` for random suffix, or `app_{{.timestamp}}` for time-based

### 6. SSL/TLS Enforcement
For AWS RDS in VPC:
```python
# Always use sslmode=require for production
sslmode="require"  # Fail if SSL negotiation fails
# or
sslmode="verify-ca"  # Verify CA certificate
sslmode="verify-full"  # Verify CA and hostname
```

### 7. Backup Admin Credentials
Even though Infisical manages dynamic credentials, keep the **admin user password** (`infisical_admin`) secure:
- Store in AWS Secrets Manager or similar vault
- Rotate it periodically
- Use it only for emergency database access if Infisical is unavailable

---

## Troubleshooting

### Issue: "Gateway connection refused"
**Cause:** Gateway not running or not reachable  
**Fix:**
```bash
# Check gateway is running
docker ps | grep infisical-gateway

# Verify it can reach your database
docker exec infisical-gateway nc -zv <postgres-host> 5432
```

### Issue: "Permission denied: infisical_admin"
**Cause:** Admin user lacks `CREATEROLE` privilege  
**Fix:**
```sql
ALTER USER infisical_admin CREATEROLE;
```

### Issue: "Invalid SSL certificate"
**Cause:** Wrong or expired CA certificate uploaded  
**Fix:**
- Re-download the RDS CA bundle
- Paste the entire `.pem` file content (including `-----BEGIN CERTIFICATE-----` headers)

### Issue: "Lease expires immediately" or "TTL mismatch"
**Cause:** PostgreSQL time not synced with Infisical server  
**Fix:**
- Ensure both systems have correct NTP time
- Check PostgreSQL server timezone vs. your local timezone

### Issue: "Credentials work for 30 min, then fail"
**Cause:** TTL expired naturally  
**Fix:**
- Renew the lease before 30 minutes elapses, or
- Increase Default TTL in the dynamic secret config (up to Max TTL)

---

## What's Next?

1. **For multiple databases:** Create a separate dynamic secret per database (production, staging, replica, etc.)

2. **For teams:** Set up **access policies** in Infisical so developers in specific teams can generate leases for certain environments only

3. **For automation:** Use the **Infisical API** to request leases programmatically from your deployment pipeline

4. **For monitoring:** Set up alerts if lease generation fails (possible sign of credential compromise or gateway issue)

---

## Summary Checklist

- [ ] PostgreSQL admin user created with `CREATEROLE` privilege
- [ ] Infisical Gateway deployed in your VPC and verified running
- [ ] AWS RDS SSL certificate downloaded (if applicable)
- [ ] Dynamic secret created in Infisical with gateway selected
- [ ] Custom creation statement defined (read-only vs. write access, specific tables)
- [ ] Default TTL set to short duration (e.g., 1h or 30m)
- [ ] Max TTL configured appropriately for your use case
- [ ] First test lease generated and verified connecting to database
- [ ] Audit logging enabled and checked
- [ ] Documentation shared with developers on how to request credentials

You're all set! Your developers can now request short-lived PostgreSQL credentials without sharing a static password.
