# Injecting Infisical Secrets into Docker Containers at Runtime

## Overview

Using Infisical's CLI with `infisical run` allows you to inject secrets from Infisical into your Docker container's runtime environment without storing credentials in your image or compose files. This approach is ideal for self-hosted deployments and keeps secrets decoupled from your infrastructure code.

## Architecture

The workflow:

1. Infisical CLI (`infisical` binary) is installed in your Docker image or available in the host
2. At container startup, the entrypoint script calls `infisical run`
3. `infisical run` authenticates with Infisical, fetches secrets, and executes your application with those secrets in the environment
4. Your application reads secrets from environment variables

## Prerequisites

- Infisical instance running (self-hosted or Cloud)
- A service token or machine identity credentials for authentication
- Docker and Docker Compose installed locally
- Basic knowledge of Docker and shell scripting

## Option 1: CLI Installed in Docker Image (Recommended for Containers)

### Dockerfile Example

```dockerfile
FROM node:18-alpine

# Install curl for downloading Infisical CLI
RUN apk add --no-cache curl bash

# Download and install Infisical CLI
RUN curl -1sLf 'https://dl.infisical.com/infisical-cli-latest.apk' | apk add --allow-untrusted -

# Set working directory
WORKDIR /app

# Copy your application code
COPY . .

# Install dependencies
RUN npm install

# Create entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Use entrypoint script
ENTRYPOINT ["/app/entrypoint.sh"]

# Default command (can be overridden)
CMD ["node", "server.js"]
```

### entrypoint.sh Script

```bash
#!/bin/bash

# Exit on any error
set -e

# Set Infisical environment variables
# Option A: Using service token (recommended for containers)
export INFISICAL_TOKEN="${INFISICAL_TOKEN:-}"

# Option B: Using machine identity (for more secure setups)
export INFISICAL_MACHINE_IDENTITY_SECRET="${INFISICAL_MACHINE_IDENTITY_SECRET:-}"

# Check that we have authentication configured
if [ -z "$INFISICAL_TOKEN" ] && [ -z "$INFISICAL_MACHINE_IDENTITY_SECRET" ]; then
    echo "Error: Neither INFISICAL_TOKEN nor INFISICAL_MACHINE_IDENTITY_SECRET is set"
    exit 1
fi

# Set the Infisical host (for self-hosted)
export INFISICAL_API_HOST="${INFISICAL_API_HOST:-https://app.infisical.com}"

# Set the project ID and environment to pull secrets from
export INFISICAL_PROJECT_ID="${INFISICAL_PROJECT_ID:-}"
export INFISICAL_ENVIRONMENT_SLUG="${INFISICAL_ENVIRONMENT_SLUG:-dev}"

# Check for project ID
if [ -z "$INFISICAL_PROJECT_ID" ]; then
    echo "Error: INFISICAL_PROJECT_ID not set"
    exit 1
fi

# Optional: Enable debug logging
# export INFISICAL_DEBUG=true

# Use infisical run to inject secrets and execute the command
exec infisical run -- "$@"
```

### Docker Compose Example

```yaml
version: '3.8'

services:
  my-app:
    build: .
    environment:
      # Infisical CLI authentication
      INFISICAL_TOKEN: ${INFISICAL_TOKEN}
      # OR for machine identity:
      # INFISICAL_MACHINE_IDENTITY_SECRET: ${INFISICAL_MACHINE_IDENTITY_SECRET}

      # Infisical configuration
      INFISICAL_API_HOST: https://infisical.example.com
      INFISICAL_PROJECT_ID: ${INFISICAL_PROJECT_ID}
      INFISICAL_ENVIRONMENT_SLUG: dev

      # Your application config (non-secrets)
      NODE_ENV: production
      LOG_LEVEL: info

    # Resource limits (best practice)
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M

    networks:
      - app-network

    restart: unless-stopped

networks:
  app-network:
    driver: bridge
```

### Launching with Docker Compose

```bash
# Set environment variables before launching
export INFISICAL_TOKEN="your-service-token-here"
export INFISICAL_PROJECT_ID="your-project-id"
export INFISICAL_API_HOST="https://your-infisical-instance.com"

# Launch the container
docker-compose up -d my-app

# View logs to verify secrets are loaded
docker-compose logs -f my-app
```

## Option 2: Machine Identity Authentication (More Secure)

For production environments, use Infisical's Machine Identity instead of service tokens:

### Updated entrypoint.sh for Machine Identity

```bash
#!/bin/bash
set -e

# Machine identity uses client credentials for authentication
export INFISICAL_MACHINE_IDENTITY_CLIENT_ID="${INFISICAL_MACHINE_IDENTITY_CLIENT_ID:-}"
export INFISICAL_MACHINE_IDENTITY_CLIENT_SECRET="${INFISICAL_MACHINE_IDENTITY_CLIENT_SECRET:-}"

# Alternative: Use machine identity secret (single token approach)
export INFISICAL_MACHINE_IDENTITY_SECRET="${INFISICAL_MACHINE_IDENTITY_SECRET:-}"

if [ -z "$INFISICAL_MACHINE_IDENTITY_CLIENT_ID" ] && [ -z "$INFISICAL_MACHINE_IDENTITY_SECRET" ]; then
    echo "Error: Machine identity credentials not configured"
    exit 1
fi

export INFISICAL_API_HOST="${INFISICAL_API_HOST:-https://app.infisical.com}"
export INFISICAL_PROJECT_ID="${INFISICAL_PROJECT_ID:-}"
export INFISICAL_ENVIRONMENT_SLUG="${INFISICAL_ENVIRONMENT_SLUG:-dev}"

if [ -z "$INFISICAL_PROJECT_ID" ]; then
    echo "Error: INFISICAL_PROJECT_ID not set"
    exit 1
fi

exec infisical run -- "$@"
```

### Docker Compose with Machine Identity

```yaml
services:
  my-app:
    build: .
    environment:
      # Machine identity credentials (store securely!)
      INFISICAL_MACHINE_IDENTITY_CLIENT_ID: ${INFISICAL_MACHINE_IDENTITY_CLIENT_ID}
      INFISICAL_MACHINE_IDENTITY_CLIENT_SECRET: ${INFISICAL_MACHINE_IDENTITY_CLIENT_SECRET}

      # Infisical configuration
      INFISICAL_API_HOST: https://infisical.example.com
      INFISICAL_PROJECT_ID: ${INFISICAL_PROJECT_ID}
      INFISICAL_ENVIRONMENT_SLUG: prod
```

## Option 3: Using Secrets Files (Docker Secrets)

For extra security, use Docker's secrets feature instead of environment variables:

### Dockerfile with Secrets Support

```dockerfile
FROM node:18-alpine

RUN apk add --no-cache curl bash

RUN curl -1sLf 'https://dl.infisical.com/infisical-cli-latest.apk' | apk add --allow-untrusted -

WORKDIR /app

COPY . .
RUN npm install

COPY entrypoint-secrets.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server.js"]
```

### entrypoint-secrets.sh

```bash
#!/bin/bash
set -e

# Read secrets from Docker secrets files (available in /run/secrets/)
if [ -f /run/secrets/infisical_token ]; then
    export INFISICAL_TOKEN=$(cat /run/secrets/infisical_token)
fi

if [ -f /run/secrets/infisical_project_id ]; then
    export INFISICAL_PROJECT_ID=$(cat /run/secrets/infisical_project_id)
fi

export INFISICAL_API_HOST="${INFISICAL_API_HOST:-https://app.infisical.com}"
export INFISICAL_ENVIRONMENT_SLUG="${INFISICAL_ENVIRONMENT_SLUG:-dev}"

if [ -z "$INFISICAL_PROJECT_ID" ]; then
    echo "Error: INFISICAL_PROJECT_ID not set"
    exit 1
fi

if [ -z "$INFISICAL_TOKEN" ]; then
    echo "Error: INFISICAL_TOKEN not set"
    exit 1
fi

exec infisical run -- "$@"
```

### Docker Compose with Secrets

```yaml
version: '3.8'

services:
  my-app:
    build: .
    environment:
      INFISICAL_API_HOST: https://infisical.example.com
      INFISICAL_ENVIRONMENT_SLUG: dev

    secrets:
      - infisical_token
      - infisical_project_id

    networks:
      - app-network

secrets:
  infisical_token:
    external: true
  infisical_project_id:
    external: true

networks:
  app-network:
```

Create secrets before running compose:

```bash
echo "your-service-token" | docker secret create infisical_token -
echo "your-project-id" | docker secret create infisical_project_id -

docker-compose up -d my-app
```

## Option 4: Direct Host CLI Execution (For Development)

If you have Infisical CLI installed on your host machine:

### docker-compose.dev.yml

```yaml
version: '3.8'

services:
  my-app:
    build: .
    environment:
      # Non-secret configuration
      NODE_ENV: development
      LOG_LEVEL: debug

    # Mount the host's Infisical config
    volumes:
      - ~/.infisical:/root/.infisical

    networks:
      - app-network

networks:
  app-network:
```

Then run with `infisical run` on the host:

```bash
cd /path/to/project
infisical run -- docker-compose -f docker-compose.dev.yml up my-app
```

## Authentication Methods Explained

### Service Token
- Simple, single-string token
- Best for simple deployments and CI/CD
- Lower security than machine identity
- Create in Infisical: Project → Settings → Service Tokens

```bash
export INFISICAL_TOKEN="st_abc123def456..."
```

### Machine Identity (Client ID + Secret)
- More complex but more secure
- Supports fine-grained permissions
- Better for production
- Create in Infisical: Project → Settings → Machine Identities

```bash
export INFISICAL_MACHINE_IDENTITY_CLIENT_ID="your-client-id"
export INFISICAL_MACHINE_IDENTITY_CLIENT_SECRET="your-client-secret"
```

### Machine Identity Secret
- Simpler than client ID + secret
- Middle ground in security/simplicity
- Create in Infisical: Project → Settings → Machine Identities

```bash
export INFISICAL_MACHINE_IDENTITY_SECRET="mis_abc123..."
```

## Environment Variables

Key environment variables for `infisical run`:

| Variable | Purpose | Example |
|----------|---------|---------|
| `INFISICAL_TOKEN` | Service token for authentication | `st_abc123...` |
| `INFISICAL_MACHINE_IDENTITY_CLIENT_ID` | Machine identity client ID | `machine-id` |
| `INFISICAL_MACHINE_IDENTITY_CLIENT_SECRET` | Machine identity client secret | `secret` |
| `INFISICAL_API_HOST` | Infisical API endpoint | `https://infisical.company.com` |
| `INFISICAL_PROJECT_ID` | Project ID to fetch secrets from | `proj_abc123` |
| `INFISICAL_ENVIRONMENT_SLUG` | Environment within project | `dev`, `prod` |
| `INFISICAL_WORKSPACE_SLUG` | Workspace slug (if needed) | `my-workspace` |

## Troubleshooting

### "infisical: command not found"

The CLI is not installed in your image. Check your Dockerfile's `RUN` command for downloading the CLI.

```bash
# For Alpine Linux
RUN curl -1sLf 'https://dl.infisical.com/infisical-cli-latest.apk' | apk add --allow-untrusted -

# For Debian/Ubuntu
RUN apt-get update && apt-get install -y infisical
```

### "Error: INFISICAL_TOKEN not set"

Ensure the token is passed via environment variables in docker-compose.yml or set when launching:

```bash
docker-compose -e INFISICAL_TOKEN="your-token" up
```

### Secrets not appearing in container

1. Verify the Infisical project ID and environment slug are correct
2. Check that the service token has access to the specified project
3. Enable debug logging:
   ```bash
   export INFISICAL_DEBUG=true
   docker-compose up -d
   docker-compose logs -f
   ```

### "Connection refused" to Infisical API

- For self-hosted: Ensure `INFISICAL_API_HOST` points to your Infisical instance
- Verify network connectivity from container to Infisical (check firewall, DNS)
- For docker-compose, add service dependency:
  ```yaml
  depends_on:
    - infisical-service
  ```

### SSL Certificate Errors

For self-hosted with self-signed certificates:

```bash
# Option 1: Disable SSL verification (dev only!)
export INFISICAL_TLS_SKIP_VERIFY=true

# Option 2: Mount CA certificate
COPY ca.crt /etc/ssl/certs/custom-ca.crt
```

## Best Practices

1. **Use Machine Identity in Production** — More secure than service tokens with better audit trails
2. **Never Hardcode Credentials** — Always pass via environment variables or secrets
3. **Use Docker Secrets for Sensitive Data** — Better than environment variables for sensitive credentials
4. **Rotate Credentials Regularly** — Set up rotation policies in Infisical
5. **Enable Debug Logging Only When Needed** — Set `INFISICAL_DEBUG=true` for troubleshooting, disable in production
6. **Test Locally First** — Use docker-compose locally with real/staging credentials before deploying
7. **Monitor Secret Access** — Check Infisical audit logs for any suspicious secret access
8. **Use Network Policies** — Restrict container egress to only the Infisical API endpoint
9. **Version Control** — Keep docker-compose.yml under version control, but use .env files for sensitive values (and .gitignore them)

## Example: Complete Python Application

### Dockerfile

```dockerfile
FROM python:3.11-slim

RUN apt-get update && apt-get install -y curl
RUN curl -1sLf 'https://dl.infisical.com/infisical-cli-latest.deb' | dpkg -i -

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

COPY entrypoint.sh /app/
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["python", "app.py"]
```

### entrypoint.sh

```bash
#!/bin/bash
set -e

export INFISICAL_TOKEN="${INFISICAL_TOKEN:-}"
export INFISICAL_API_HOST="${INFISICAL_API_HOST:-https://app.infisical.com}"
export INFISICAL_PROJECT_ID="${INFISICAL_PROJECT_ID:-}"
export INFISICAL_ENVIRONMENT_SLUG="${INFISICAL_ENVIRONMENT_SLUG:-dev}"

if [ -z "$INFISICAL_TOKEN" ] || [ -z "$INFISICAL_PROJECT_ID" ]; then
    echo "Missing required Infisical configuration"
    exit 1
fi

exec infisical run -- "$@"
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    environment:
      INFISICAL_TOKEN: ${INFISICAL_TOKEN}
      INFISICAL_API_HOST: https://infisical.company.com
      INFISICAL_PROJECT_ID: ${INFISICAL_PROJECT_ID}
      INFISICAL_ENVIRONMENT_SLUG: prod
    networks:
      - default
    restart: unless-stopped
```

### .env (NOT committed to git)

```bash
INFISICAL_TOKEN=st_abc123def456ghi789...
INFISICAL_PROJECT_ID=proj_xyz789abc123...
```

### Launch

```bash
docker-compose up -d app
docker-compose logs -f app
```

Your Python application will receive all Infisical secrets as environment variables automatically.

## See Also

- Infisical Documentation: https://infisical.com/docs
- Infisical CLI Reference: https://infisical.com/docs/cli/overview
- Docker Secrets: https://docs.docker.com/engine/swarm/secrets/
- Self-Hosted Infisical: https://infisical.com/docs/self-hosting/overview
