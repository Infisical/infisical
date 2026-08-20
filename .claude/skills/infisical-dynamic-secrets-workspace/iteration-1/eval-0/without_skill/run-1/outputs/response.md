# Setting Up Dynamic PostgreSQL Credentials with Infisical

## Overview

Dynamic credentials eliminate the need for developers to share static database passwords. Infisical can generate short-lived PostgreSQL users on-demand, automatically rotating credentials and revoking access after expiration. This guide walks you through setting up dynamic PostgreSQL credentials for a Postgres instance in an AWS private VPC.

## Prerequisites

Before starting, ensure you have:

- **Infisical instance** running (self-hosted or cloud)
- **PostgreSQL instance** in AWS private VPC with network connectivity to your Infisical instance
- **Admin/superuser credentials** for PostgreSQL (to create dynamic user roles)
- **VPC/Security group configuration** that allows Infisical to reach the Postgres port (default 5432)
- **Appropriate IAM permissions** (if using temporary AWS credentials for Infisical to authenticate)

## Architecture Overview

```
Developer Request
    ↓
Infisical Dashboard / CLI / API
    ↓
Infisical Backend Service
    ↓
PostgreSQL (in AWS VPC)
    ↓
Creates temporary user with TTL
    ↓
Returns credentials to developer
    ↓
Auto-revoke at expiration
```

## Step 1: Set Up Network Connectivity

Since your PostgreSQL instance is in a private VPC, Infisical needs network access.

### Option A: Infisical in Same VPC (Recommended)
- Deploy Infisical backend in the same VPC or a peered VPC
- Configure security group to allow outbound connections on port 5432 to the Postgres security group

### Option B: Infisical in Different Network
- Use AWS RDS Proxy or similar to expose Postgres on a public endpoint (with IP whitelisting)
- Or establish a private connection (VPN, bastion host, or VPC peering)
- Ensure the Infisical server can reach the Postgres instance

### Option C: Using AWS Secrets Manager Integration
- Store your PostgreSQL admin credentials in AWS Secrets Manager
- Configure Infisical to retrieve them (if your Infisical deployment supports AWS SDK integration)

## Step 2: Prepare PostgreSQL for Dynamic Credentials

Your PostgreSQL instance needs to support role/user creation. Connect as a superuser and prepare:

```sql
-- 1. Create a role template for dynamic users (optional but recommended)
CREATE ROLE dynamic_user_template LOGIN NOINHERIT;

-- 2. Grant appropriate permissions to the template role
GRANT CONNECT ON DATABASE your_app_db TO dynamic_user_template;
GRANT USAGE ON SCHEMA public TO dynamic_user_template;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dynamic_user_template;

-- 3. Set default privileges so future tables are accessible
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dynamic_user_template;

-- 4. Create a dedicated admin role for Infisical to use
CREATE ROLE infisical_admin LOGIN SUPERUSER PASSWORD 'your_secure_admin_password';
```

**Security Notes:**
- The `infisical_admin` role should have minimal permissions needed to create/revoke users
- Consider using `CREATEUSER` and `CREATEROLE` without SUPERUSER if possible
- Store the `infisical_admin` password securely (in Infisical itself or a secrets vault)

## Step 3: Configure Infisical Dynamic Secrets (Backend Setup)

Infisical exposes dynamic secrets functionality through its API and backend. The exact configuration depends on your Infisical version, but here's the general flow:

### In Your Infisical Project:

1. **Navigate to Secrets** → **Dynamic Secrets** tab (or equivalent in your version)

2. **Add a New Dynamic Secret Source:**
   - **Type:** PostgreSQL
   - **Name:** `postgres-dynamic` (or your preferred name)
   - **Engine:** `postgres`

3. **Configure Connection Details:**
   - **Host:** Your RDS endpoint (private VPC endpoint or resolved hostname)
   - **Port:** 5432 (or your custom port)
   - **Username:** `infisical_admin` (the role you created above)
   - **Password:** The secure password for `infisical_admin`
   - **Database:** `your_app_db` (target database)

4. **Save and Test Connection:**
   - Infisical should validate connectivity
   - If this fails, verify VPC/network access

## Step 4: Define Dynamic User Roles and TTL

After connecting the PostgreSQL source, define what roles Infisical will create:

### Create a Dynamic Secret Configuration:

1. **Role Name Template:** `dev_user_{rand}` 
   - Infisical can generate unique names with random suffixes to avoid conflicts
   
2. **Username Generation:**
   - Pattern: `infisical_dev_{{ timestamp }}` or `devuser_{{ random_string }}`
   - Keep it under 63 characters (PostgreSQL username limit)

3. **Default Role/Permissions:**
   - Specify the template role permissions (e.g., `dynamic_user_template`)
   - Or explicitly grant: `CONNECT, USAGE ON SCHEMA, SELECT, INSERT, UPDATE, DELETE`

4. **TTL (Time To Live):**
   - Set to `1h` (1 hour) for development
   - Consider `15m` (15 minutes) for higher security
   - Maximum is typically `24h`

5. **Rotation:**
   - Enable automatic revocation when TTL expires
   - Infisical will `DROP ROLE IF EXISTS` the user after expiration

## Step 5: Request Dynamic Credentials as a Developer

Once configured, developers can request credentials in multiple ways:

### Via Infisical Dashboard:
1. Open your Infisical project
2. Go to **Secrets** → **Dynamic Secrets**
3. Click **Generate** on the PostgreSQL source
4. Receive temporary username and password
5. Use them to connect: `psql -h your-rds-endpoint -U infisical_dev_xxx -d your_app_db`

### Via Infisical CLI:
```bash
# Requires Infisical CLI installed and authenticated
infisical secrets get --dynamic-secret postgres-dynamic
```

### Via API:
```bash
curl -X POST https://your-infisical-instance/api/v1/dynamic-secrets/postgres-dynamic/generate \
  -H "Authorization: Bearer $INFISICAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"projectId": "your-project-id"}'
```

## Step 6: Configure Application Connection Pooling

For applications connecting via Infisical:

1. **Update connection strings** to use the dynamic credentials
2. **Set up connection pooling** (e.g., PgBouncer) to manage the transient nature of short-lived credentials
3. **Handle credential expiration** gracefully (reconnect on auth failure)

Example for a Node.js app using `node-postgres`:
```javascript
// Fetch dynamic credentials from Infisical
const { username, password } = await infisicalClient.getDynamicSecret('postgres-dynamic');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: 5432,
  database: 'your_app_db',
  user: username,
  password: password,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  max: 20,
});

// Handle reconnection on credential expiration
pool.on('error', async (err) => {
  if (err.code === 'EAUTH' || err.message.includes('password')) {
    console.log('Credential expired, requesting new ones...');
    // Fetch fresh credentials and recreate pool
  }
});
```

## Step 7: Monitor and Audit

### In Infisical:
1. Check **Audit Logs** for all dynamic credential requests
2. Monitor **Active Sessions** / **Generated Credentials**
3. Verify credential expiration and cleanup

### In PostgreSQL:
```sql
-- View active temporary users
SELECT rolname, rolcreatedb, rolcreaterole 
FROM pg_roles 
WHERE rolname LIKE 'infisical_dev_%';

-- View role creation history (if enabled with pgAudit)
SELECT * FROM pgaudit.log WHERE object LIKE 'infisical_dev_%';

-- Clean up any orphaned roles (manual fallback)
DROP ROLE IF EXISTS infisical_dev_old_user;
```

## Step 8: Troubleshooting

### Connection Refused
- Verify Infisical server can reach PostgreSQL on port 5432
- Check security group inbound rules on RDS security group
- Confirm VPC routing and peering (if applicable)

### Authentication Failed
- Verify `infisical_admin` credentials are correct
- Ensure the role exists: `SELECT * FROM pg_roles WHERE rolname = 'infisical_admin';`
- Check that `infisical_admin` has `CREATEROLE` permission

### TTL Not Expiring
- Verify Infisical job scheduler (BullMQ) is running
- Check backend logs for task execution errors
- Manually test role deletion: `DROP ROLE infisical_dev_test;`

### Credentials Not Generating
- Confirm dynamic secrets are enabled in Infisical project settings
- Check that the PostgreSQL connection is "Active" and tested
- Verify user has permission to generate secrets in the project

## Best Practices

1. **Principle of Least Privilege:**
   - Grant dynamic users only what they need (e.g., read-only for staging, read-write for dev)
   - Use separate template roles for different environments

2. **Short Expiration:**
   - Keep TTL short (15-60 minutes) for development
   - Longer TTL (2-4 hours) for CI/CD pipelines
   - Never exceed 24 hours

3. **Audit Everything:**
   - Enable Infisical audit logging
   - Monitor PostgreSQL for suspicious connections
   - Alert on failed credential requests

4. **Rotate Admin Credentials:**
   - Change the `infisical_admin` password periodically
   - Store it in Infisical itself, not in code

5. **Network Isolation:**
   - Ensure PostgreSQL security groups allow only Infisical and required applications
   - Use VPC endpoints where possible to avoid traversing the internet

6. **Fallback Credentials:**
   - Keep a static read-only user for emergency access
   - Document the procedure for using it

## Next Steps

- Set up alerts/notifications when credentials are generated or expire
- Integrate with your CI/CD pipeline to inject dynamic credentials at runtime
- Document the credential request process for your team
- Schedule regular security reviews of the dynamic secrets configuration

## Additional Resources

- Infisical Documentation: Dynamic Secrets guide
- PostgreSQL Role Management: [PostgreSQL Docs](https://www.postgresql.org/docs/current/user-manag.html)
- AWS RDS Security: VPC security groups and network access control lists

---

**Questions or issues?** Check Infisical's community forum or documentation site for version-specific details, as implementation may vary between releases.
