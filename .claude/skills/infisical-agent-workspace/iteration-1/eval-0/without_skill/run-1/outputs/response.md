# Infisical Agent Configuration for .env File Rendering in Docker

## Overview

To render Infisical secrets as a `.env` file on disk for your Node.js app running in Docker with automatic updates when secrets change, you'll use **Infisical Agent** with a configuration file. Here's the complete setup.

## Complete Infisical Agent Config File

Create an `infisical-agent-config.yaml` file in your project root or mounted config directory:

```yaml
# infisical-agent-config.yaml
# Full Infisical Agent configuration for .env file rendering with auto-updates

agentVersion: 1
logLevel: info  # debug, info, warn, error

# Authentication to Infisical API
auth:
  # Use one of the following authentication methods:
  
  # Option 1: Machine Identity (Recommended for Docker/production)
  machineIdentity:
    clientId: ${INFISICAL_CLIENT_ID}
    clientSecret: ${INFISICAL_CLIENT_SECRET}
  
  # Option 2: Service Token (Legacy, less secure)
  # serviceToken: ${INFISICAL_SERVICE_TOKEN}
  
  # Option 3: API Key
  # apiKey: ${INFISICAL_API_KEY}

# Infisical API endpoint
infisicalApiUrl: https://app.infisical.com/api  # or your self-hosted instance

# List of secret syncs to manage
secretSyncs:
  - name: nodejs-env-sync
    # Source: Infisical secret
    source:
      # Authenticate to Infisical workspace
      workspaceId: ${INFISICAL_WORKSPACE_ID}
      # Secrets environment (e.g., prod, staging, dev)
      environment: production
      # Path within environment (typically "/" for root)
      secretPath: /
      # Optional: Filter secrets by tag
      # secretTags:
      #   - nodejs
      #   - production
    
    # Destination: Local .env file
    destination:
      type: file
      # Mount path inside Docker container
      path: /app/.env
      # File format: dotenv, yaml, json
      format: dotenv
      # Optional: Template to transform secrets
      # templateFormat: |
      #   DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}
      #   REDIS_URL=redis://${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}
    
    # Sync behavior
    sync:
      # Auto-update when secrets change in Infisical
      autoSync: true
      # Poll interval for secret changes (in seconds)
      # Infisical Agent checks for changes at this interval
      pollIntervalSeconds: 60
      # Immediately restart Node.js app when .env changes
      onSyncSuccess:
        command: npm restart
        # Or use: kill -HUP $(pgrep -f "node")
      onSyncFailure:
        # Retry logic on sync failures
        maxRetries: 3
        retryDelaySeconds: 10
        alertCommand: |
          curl -X POST http://monitoring-service/alerts \
            -d '{"type": "env_sync_failed", "timestamp": "$(date)"}'
    
    # Permissions for generated .env file
    filePermissions:
      mode: "0600"  # Read/write owner only (secure)
      owner: "node" # Container user
      group: "node"
    
    # Validation rules for synced secrets
    validation:
      # Fail if these required secrets are missing
      requiredSecrets:
        - DATABASE_URL
        - API_KEY
        - JWT_SECRET
      # Optional: Validate secret formats
      secretSchemas:
        DATABASE_URL:
          pattern: '^postgresql://.*'
          errorMessage: "DATABASE_URL must be a valid PostgreSQL connection string"
        PORT:
          pattern: '^\d+$'
          errorMessage: "PORT must be a numeric value"

# Multiple syncs example (sync to multiple .env files)
  - name: infra-env-sync
    source:
      workspaceId: ${INFISICAL_WORKSPACE_ID}
      environment: production
      secretPath: /infrastructure
    destination:
      type: file
      path: /app/.env.infrastructure
      format: dotenv
    sync:
      autoSync: true
      pollIntervalSeconds: 120

# Advanced: Sync to Redis (for distributed apps)
  - name: redis-config-cache
    source:
      workspaceId: ${INFISICAL_WORKSPACE_ID}
      environment: production
      secretPath: /
    destination:
      type: redis
      url: redis://redis:6379
      keyPrefix: infisical:secrets:
      ttlSeconds: 300
    sync:
      autoSync: true
      pollIntervalSeconds: 30

# Logging and monitoring
logging:
  format: json  # json or text
  outputPath: /var/log/infisical-agent.log
  rotateMaxSize: 100M
  rotateMaxBackups: 5
  rotateMaxAgeDays: 7

# Health check for the agent itself
healthCheck:
  enabled: true
  listenAddress: 0.0.0.0:8080
  endpoint: /health
  # Check interval
  checkIntervalSeconds: 30

# Optional: Backup original .env before updating
backup:
  enabled: true
  backupDir: /app/.env.backups
  keepBackups: 5
  # Timestamp format: timestamp or version
  namingFormat: timestamp
```

## Docker Compose Setup

Here's how to integrate this with Docker Compose:

```yaml
# docker-compose.yml
version: '3.8'

services:
  infisical-agent:
    image: infisical/agent:latest
    container_name: infisical-agent
    restart: unless-stopped
    environment:
      # Machine Identity credentials (from Infisical dashboard)
      INFISICAL_CLIENT_ID: ${INFISICAL_CLIENT_ID}
      INFISICAL_CLIENT_SECRET: ${INFISICAL_CLIENT_SECRET}
      INFISICAL_WORKSPACE_ID: ${INFISICAL_WORKSPACE_ID}
      LOG_LEVEL: info
    volumes:
      # Mount the config file
      - ./infisical-agent-config.yaml:/etc/infisical/agent-config.yaml:ro
      # Shared volume for .env file (Docker named volume or bind mount)
      - app-secrets:/app-secrets
      # Optional: logs volume
      - ./logs:/var/log
    networks:
      - infisical-network
    command: /infisical/agent -config /etc/infisical/agent-config.yaml
    # Wait for Infisical API to be ready
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    depends_on:
      - infisical  # or your Infisical instance

  nodejs-app:
    image: node:20-alpine
    container_name: nodejs-app
    restart: unless-stopped
    environment:
      NODE_ENV: production
      # .env file will be mounted from agent
    volumes:
      # Shared secrets volume from infisical-agent
      - app-secrets:/app-secrets:ro
      # Your app source
      - ./src:/app/src:ro
      - ./package.json:/app/package.json:ro
    working_dir: /app
    ports:
      - "3000:3000"
    networks:
      - infisical-network
    command: sh -c "
      # Wait for .env to be created by agent
      while [ ! -f /app-secrets/.env ]; do 
        echo 'Waiting for .env file...'; 
        sleep 1; 
      done && 
      node src/index.js
    "
    depends_on:
      - infisical-agent
      - database

  database:
    image: postgres:15-alpine
    container_name: postgres-db
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: myapp
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - infisical-network

volumes:
  app-secrets:
    driver: local
  postgres-data:

networks:
  infisical-network:
    driver: bridge
```

## Environment File (.env.example)

Create `.env.example` for development:

```bash
# .env.example
# Infisical Agent Configuration

# Machine Identity from Infisical Dashboard (Settings > Machine Identities)
INFISICAL_CLIENT_ID=your_client_id_here
INFISICAL_CLIENT_SECRET=your_client_secret_here
INFISICAL_WORKSPACE_ID=your_workspace_id_here

# Optional: If using self-hosted Infisical
# INFISICAL_API_URL=https://your-infisical-instance.com/api

# Application Secrets (auto-populated by Infisical Agent)
# These will be written to .env file by the agent:
# DATABASE_URL=
# API_KEY=
# JWT_SECRET=
# REDIS_URL=
```

## Node.js Application Code

Load the generated .env file in your Node.js app:

```javascript
// src/index.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from mounted volume (updated by Infisical Agent)
const envPath = process.env.ENV_FILE_PATH || '/.env';
dotenv.config({ path: envPath });

console.log('Environment loaded:', {
  databaseUrl: process.env.DATABASE_URL ? '[REDACTED]' : 'MISSING',
  apiKey: process.env.API_KEY ? '[REDACTED]' : 'MISSING',
  jwtSecret: process.env.JWT_SECRET ? '[REDACTED]' : 'MISSING',
});

// Your app code
const PORT = process.env.PORT || 3000;
console.log(`App listening on port ${PORT}`);
```

## Graceful Reload on Secret Updates

To reload your Node.js app when the .env file updates (without restart):

```javascript
// src/config.js
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';

let config = {};

export function loadConfig(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = dotenv.parse(raw);
  config = { ...parsed };
  console.log('Config loaded:', Object.keys(config).length, 'keys');
  return config;
}

export function getConfig(key) {
  return config[key];
}

export function watchConfigFile(filePath) {
  // Watch for changes to .env file
  fs.watchFile(filePath, (curr, prev) => {
    if (curr.mtime > prev.mtime) {
      console.log('Config file changed, reloading...');
      try {
        loadConfig(filePath);
        // Emit event for app to handle reload
        process.emit('config:reload');
      } catch (error) {
        console.error('Failed to reload config:', error);
      }
    }
  });
}

// Load on startup
loadConfig(process.env.ENV_FILE_PATH || '/.env');
watchConfigFile(process.env.ENV_FILE_PATH || '/.env');
```

```javascript
// src/index.js (updated with reload handler)
import { loadConfig, watchConfigFile, getConfig } from './config.js';

const ENV_PATH = process.env.ENV_FILE_PATH || '/.env';
loadConfig(ENV_PATH);
watchConfigFile(ENV_PATH);

// Listen for config changes
process.on('config:reload', () => {
  console.log('Reloading configuration...');
  // Reconnect database with new credentials
  reconnectDatabase(getConfig('DATABASE_URL'));
  // Update API clients with new keys
  updateApiClients(getConfig('API_KEY'));
});

const PORT = getConfig('PORT') || 3000;
console.log(`App listening on port ${PORT}`);
```

## Dockerfile for Your Node.js App

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (respecting Infisical's 7-day minimum age policy)
RUN npm ci --only=production

# Copy source code
COPY src ./src

# Use non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# .env will be mounted as read-only volume from infisical-agent
EXPOSE 3000

CMD ["node", "src/index.js"]
```

## Setup Instructions

### 1. Create Machine Identity in Infisical

1. Go to **Infisical Dashboard** > **Settings** > **Machine Identities**
2. Click **Add Identity**
3. Name it (e.g., "Docker Agent")
4. Grant it access to your workspace secrets
5. Copy the **Client ID** and **Client Secret**

### 2. Deploy with Docker Compose

```bash
# Create .env file with credentials
cat > .env << EOF
INFISICAL_CLIENT_ID=your_client_id
INFISICAL_CLIENT_SECRET=your_client_secret
INFISICAL_WORKSPACE_ID=your_workspace_id
EOF

# Start services
docker-compose up -d

# Monitor logs
docker-compose logs -f infisical-agent
docker-compose logs -f nodejs-app
```

### 3. Verify Setup

```bash
# Check if .env file was created
docker exec nodejs-app cat /.env

# Monitor live updates
docker-compose exec infisical-agent tail -f /var/log/infisical-agent.log
```

## Key Features

- **Auto-updates**: Agent polls Infisical every 60 seconds (configurable)
- **Secure auth**: Machine Identities instead of API keys
- **Graceful reload**: File watcher detects .env changes without container restart
- **Validation**: Required secrets validation with helpful error messages
- **Backup**: Keep backup copies of previous .env files
- **Health checks**: Built-in health endpoint for orchestration
- **Multi-sync**: Sync different secret paths to different files
- **Backup support**: Redis caching, file formats (dotenv, JSON, YAML)

## Troubleshooting

### Agent not syncing secrets

```bash
# Check agent logs
docker-compose logs infisical-agent

# Verify credentials
docker exec infisical-agent curl -X GET \
  -H "Authorization: Bearer $TOKEN" \
  https://app.infisical.com/api/v1/secrets

# Test file permissions
docker exec nodejs-app ls -la /.env
```

### .env file not appearing

1. Verify **INFISICAL_CLIENT_ID** and **INFISICAL_CLIENT_SECRET** are correct
2. Check that Machine Identity has workspace access
3. Ensure secrets exist in the workspace
4. Check agent health endpoint: `curl http://localhost:8080/health`

### Frequent sync failures

- Increase **pollIntervalSeconds** to reduce API load
- Check network connectivity between agent and Infisical API
- Verify firewall rules allow outbound HTTPS (port 443)

## Security Best Practices

1. **Never commit secrets** — `.env` and credentials in `.env` are Git-ignored
2. **Use Machine Identities** — More secure than API keys for service accounts
3. **Restrict file permissions** — `mode: "0600"` limits access to container user
4. **Separate environments** — Use different Machine Identities per environment
5. **Audit logs** — Enable Infisical audit logging to track secret access
6. **Rotate credentials** — Regularly rotate Machine Identity secrets
7. **Network isolation** — Run Infisical Agent in a private network segment

## References

- [Infisical Agent Documentation](https://infisical.com/docs/agent/overview)
- [Machine Identities](https://infisical.com/docs/identity/machine-identities)
- [Docker Secrets Management Best Practices](https://docs.docker.com/config/containers/secrets/)
- [Environment Variable Security](https://12factor.net/config)
