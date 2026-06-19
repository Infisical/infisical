# Infisical Agent: Rendering Static & Dynamic PostgreSQL Credentials

## Overview

The Infisical Agent supports templating that can inject both static secrets and dynamic PostgreSQL credentials into configuration files. Dynamic credentials include built-in auto-renewal logic that refreshes them before expiration, eliminating manual credential management.

---

## Template Structure

### Basic Template Format

Infisical templates use a simple `.env` or YAML format with placeholders for secrets. The agent interpolates values at deployment time.

```bash
# Example: .env.template
DB_HOST={{ secrets.db_host }}
DB_PORT={{ secrets.db_port }}
DB_USER={{ secrets.db_user }}
DB_PASSWORD={{ secrets.db_password }}
API_KEY={{ secrets.api_key }}
```

---

## Rendering Static Secrets

For static secrets stored in Infisical:

```bash
# .env.template
# Static secrets
API_KEY={{ secrets.api_key }}
DATABASE_URL={{ secrets.database_url }}
AUTH_TOKEN={{ secrets.auth_token }}
LOG_LEVEL={{ secrets.log_level }}
```

**Key points:**
- Use double-brace syntax: `{{ secrets.SECRET_NAME }}`
- Secret names are case-sensitive
- The agent fetches secrets from your Infisical workspace at deployment

---

## Rendering Dynamic PostgreSQL Credentials

### Template with Dynamic Credentials

For dynamic credentials, use a dedicated section that tells Infisical to manage credential rotation:

```bash
# .env.template
# ===== STATIC SECRETS =====
API_KEY={{ secrets.api_key }}
ENVIRONMENT={{ secrets.environment }}

# ===== DYNAMIC POSTGRESQL CREDENTIALS =====
# These credentials are auto-renewed before expiration
DB_HOST={{ dynamic.postgres.host }}
DB_PORT={{ dynamic.postgres.port }}
DB_NAME={{ dynamic.postgres.database }}
DB_USER={{ dynamic.postgres.username }}
DB_PASSWORD={{ dynamic.postgres.password }}

# Metadata for renewal tracking (optional but recommended)
DB_CREDENTIAL_TTL={{ dynamic.postgres.ttl }}
DB_CREDENTIAL_EXPIRES_AT={{ dynamic.postgres.expires_at }}
```

### Advanced Config Example

For a more realistic production setup:

```yaml
# config.yml.template
server:
  port: 3000
  environment: {{ secrets.environment }}

database:
  host: {{ dynamic.postgres.host }}
  port: {{ dynamic.postgres.port }}
  database: {{ dynamic.postgres.database }}
  username: {{ dynamic.postgres.username }}
  password: {{ dynamic.postgres.password }}
  ssl: true
  pool:
    min: 2
    max: 10
  
  # Renewal tracking
  credential:
    ttl: {{ dynamic.postgres.ttl }}
    expires_at: {{ dynamic.postgres.expires_at }}

api:
  key: {{ secrets.api_key }}
  secret: {{ secrets.api_secret }}
  timeout: 30

logging:
  level: {{ secrets.log_level }}
  service: {{ secrets.service_name }}
```

---

## Auto-Renewal Mechanism

### How It Works

1. **Initial Fetch**: When the agent deploys, it retrieves:
   - All static secrets from your Infisical vault
   - Dynamic PostgreSQL credentials from the configured database

2. **TTL Tracking**: Dynamic credentials include a `ttl` (time-to-live) and `expires_at` timestamp

3. **Renewal Trigger**: The agent monitors credential expiration and automatically renews:
   - **Default**: Renews when 75% of TTL has elapsed (customizable)
   - **New credentials** are generated and the config file is updated
   - **Old credentials** remain valid during the grace period (if configured)

4. **Graceful Updates**: 
   - Applications can reload config without downtime
   - Database connection pools adapt to new credentials
   - No manual intervention required

### TTL and Renewal Configuration

In your Infisical workspace, configure the dynamic credential lease:

```json
{
  "type": "postgres",
  "name": "prod-db-creds",
  "host": "db.example.com",
  "port": 5432,
  "database": "myapp_db",
  "ttl": 3600,
  "renewal_threshold": 0.75,
  "max_ttl": 86400
}
```

**Parameters:**
- `ttl`: Credential lifetime in seconds (e.g., 3600 = 1 hour)
- `renewal_threshold`: Renew when this % of TTL remains (0.75 = 75%)
- `max_ttl`: Maximum possible credential lifetime before forced refresh

---

## Complete Working Example

### Scenario: Production PostgreSQL Config

```bash
# .env.template
# Application
NODE_ENV={{ secrets.node_env }}
LOG_LEVEL={{ secrets.log_level }}
APP_VERSION={{ secrets.app_version }}

# API Authentication (static)
API_KEY={{ secrets.api_key }}
JWT_SECRET={{ secrets.jwt_secret }}

# PostgreSQL (dynamic, auto-renewing)
DB_HOST={{ dynamic.postgres.host }}
DB_PORT={{ dynamic.postgres.port }}
DB_NAME={{ dynamic.postgres.database }}
DB_USER={{ dynamic.postgres.username }}
DB_PASSWORD={{ dynamic.postgres.password }}

# Connection pooling (adjust based on credential availability)
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_POOL_IDLE_TIMEOUT=30000

# Credential lifecycle (for app awareness)
DB_CRED_TTL={{ dynamic.postgres.ttl }}
DB_CRED_EXPIRES={{ dynamic.postgres.expires_at }}

# Optional: Renewal grace period (seconds before expiry to warn)
DB_RENEWAL_WARNING_SECS=300
```

### Application Integration

**Node.js Example** — using the config file:

```javascript
// config.js
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: parseInt(process.env.DB_POOL_MAX),
});

// Monitor credential expiration
const credExpires = new Date(process.env.DB_CRED_EXPIRES);
const timeUntilExpiry = credExpires.getTime() - Date.now();

if (timeUntilExpiry < 60000) {
  console.warn('DB credentials expiring soon, reload config');
}

export default pool;
```

---

## Best Practices

### 1. Separation of Concerns
```bash
# Good: Separate static and dynamic secrets
API_KEY={{ secrets.api_key }}           # Static
DB_USER={{ dynamic.postgres.username }} # Dynamic
```

### 2. Include Metadata for Observability
```bash
# Track credential state
DB_CRED_TTL={{ dynamic.postgres.ttl }}
DB_CRED_EXPIRES_AT={{ dynamic.postgres.expires_at }}
DB_CRED_ISSUED_AT={{ dynamic.postgres.issued_at }}
```

### 3. Set Appropriate TTLs
- **Short-lived** (1 hour): Maximum security, more renewals
- **Medium** (4-8 hours): Balanced approach
- **Long-lived** (24 hours): Fewer renewals, less secure

### 4. Application Reload Strategy
- **Reload on signal**: Watch config file for changes, reload on SIGHUP
- **Graceful shutdown**: Close old DB connections before accepting new ones
- **Blue-green**: Deploy new instances with fresh credentials

### 5. Monitoring & Alerting
```bash
# Log renewal events
export DB_RENEWAL_LOG_LEVEL=debug

# Alert if renewals fail
export CRITICAL_ALERTS=true
```

---

## Troubleshooting

### Issue: Credentials Not Rendering

**Check:**
1. Secret name exists in Infisical workspace (case-sensitive)
2. Template uses correct placeholder syntax: `{{ secrets.name }}` or `{{ dynamic.postgres.name }}`
3. Agent has permission to read secrets

### Issue: Dynamic Credentials Not Renewing

**Check:**
1. PostgreSQL database is accessible from agent
2. `ttl` is set (not null or 0)
3. Agent is running continuously (not just one-off deploy)
4. Check agent logs: `renewal_threshold` may be set too high

### Issue: Connection Failures After Renewal

**Check:**
1. Old connections terminated before new credentials expire
2. Connection pool has `idleTimeoutMillis` set appropriately
3. App reloads config file when it changes
4. Database user permissions are correct for dynamic credential user

---

## Advanced: Custom Renewal Logic

If you need more control, implement credential reloading:

```javascript
// monitor-credentials.js
import fs from 'fs';
import dotenv from 'dotenv';

function reloadCredentials() {
  const config = dotenv.parse(fs.readFileSync('.env', 'utf8'));
  const credExpires = new Date(config.DB_CRED_EXPIRES_AT);
  const timeLeft = credExpires.getTime() - Date.now();
  
  // Renew if less than 5 minutes left
  if (timeLeft < 300000) {
    console.log('Credential renewal in progress...');
    // Signal Infisical agent to refresh
    process.kill(process.pid, 'SIGHUP');
  }
}

setInterval(reloadCredentials, 30000); // Check every 30 seconds
```

---

## Summary

To enable auto-renewing dynamic PostgreSQL credentials in Infisical:

1. **Define the template** with both static (`{{ secrets.* }}`) and dynamic (`{{ dynamic.postgres.* }}`) placeholders
2. **Configure the dynamic credential** in Infisical (TTL, host, database, renewal threshold)
3. **Deploy with the agent** — it automatically manages lifecycle and renewal
4. **Monitor expiration** using the `ttl` and `expires_at` metadata
5. **Reload config** when credentials renew (file watch or signal-based)

The agent handles all renewal logic automatically, eliminating manual credential rotation while keeping your database connections secure.
