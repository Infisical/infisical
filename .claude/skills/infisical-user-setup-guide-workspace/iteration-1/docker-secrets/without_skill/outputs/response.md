# Injecting Infisical Secrets into Docker Containers at Runtime (AWS ECS)

## Overview

To inject secrets from Infisical into Docker containers without baking them into the image, you need a runtime secret injection approach. Here are the best practices for AWS ECS deployments:

## Recommended Approaches

### 1. **Infisical CLI with Entry Point Script (Best for ECS)**

This approach uses the Infisical CLI to fetch secrets at container startup and inject them as environment variables.

**Steps:**

1. **Create an entry point script** that runs before your application:
   ```bash
   #!/bin/bash
   set -e

   # Authenticate with Infisical
   export INFISICAL_TOKEN="${INFISICAL_TOKEN}"

   # Fetch secrets and export them
   eval "$(infisical export --path /path/to/secrets --format=env)"

   # Start your application
   exec "$@"
   ```

2. **Dockerfile configuration:**
   ```dockerfile
   FROM node:18-alpine

   # Install Infisical CLI
   RUN npm install -g infisical

   WORKDIR /app
   COPY . .
   RUN npm install

   # Copy entry point script
   COPY entrypoint.sh /entrypoint.sh
   RUN chmod +x /entrypoint.sh

   ENTRYPOINT ["/entrypoint.sh"]
   CMD ["npm", "start"]
   ```

3. **ECS Task Definition** (provide token via AWS Secrets Manager or environment variable):
   - Store `INFISICAL_TOKEN` in AWS Secrets Manager
   - Reference it in the ECS task definition
   - Infisical CLI fetches secrets at runtime and injects them as env vars

### 2. **AWS Secrets Manager Integration (Hybrid Approach)**

For environments where you want AWS-native secrets management:

1. **Create a bootstrap script** that:
   - Fetches secrets from Infisical using an API key stored in AWS Secrets Manager
   - Stores them in AWS Secrets Manager for persistence
   - Container pulls from AWS Secrets Manager

2. **ECS Task Definition**:
   - Reference secrets via `secrets` or `environment` fields
   - AWS automatically injects them at runtime

3. **Benefits**:
   - Leverage ECS native secrets management
   - Audit trail through AWS
   - No CLI overhead at container startup

### 3. **Infisical SDK (Programmatic Approach)**

If your application is written in Node.js, Python, Go, or another supported language:

1. **Use the Infisical SDK** directly in your application:
   ```javascript
   // Node.js example
   import { InfisicalClient } from "@infisical/sdk";

   const client = new InfisicalClient({
     auth: {
       universalAuth: {
         clientId: process.env.INFISICAL_CLIENT_ID,
         clientSecret: process.env.INFISICAL_CLIENT_SECRET,
       },
     },
   });

   const secrets = await client.listSecrets({
     projectId: process.env.INFISICAL_PROJECT_ID,
     environment: "production",
   });
   ```

2. **Benefits**:
   - Secrets stay in memory only
   - No file-based secrets
   - Granular permission control

3. **ECS Task Definition**:
   - Pass credentials (Client ID, Client Secret) via AWS Secrets Manager
   - Application loads secrets on startup

### 4. **Environment Variable Substitution with Infisical Sync**

For CI/CD-driven deployments:

1. **Use Infisical Sync** in your deployment pipeline to fetch secrets
2. **Inject into environment** before launching ECS tasks
3. **Works well with**:
   - GitHub Actions → AWS ECS deployment
   - GitLab CI → AWS ECS deployment
   - Terraform/CloudFormation with dynamic environment variables

## Security Best Practices

### Do NOT:
- Bake secrets into Docker images (defeats the purpose)
- Store secrets in environment files committed to Git
- Use plaintext environment variables in Dockerfile
- Log secret values during container startup

### Do:
- **Use AWS Secrets Manager** for credential storage (supports automatic rotation)
- **Restrict IAM permissions** so only ECS task role can access Infisical credentials
- **Use short-lived tokens** when possible
- **Audit all secret access** via CloudTrail
- **Rotate credentials regularly** (especially if using static client ID/secret)
- **Minimize secret exposure time** — fetch at startup, not continuously
- **Use tmpfs** for temporary secret files to avoid disk persistence

## Implementation Checklist for ECS

1. **Store Infisical credentials in AWS Secrets Manager**
   - API key, Client ID/Secret, or service token

2. **Choose your injection method**:
   - CLI-based entry point (simplest)
   - SDK in application code (most secure)
   - Hybrid with AWS Secrets Manager (best compliance)

3. **Create ECS Task Definition**:
   - Add `executionRoleArn` with permissions to read AWS Secrets Manager
   - Reference Infisical credentials in `secrets` or `environment`
   - Set correct `containerPort` and networking

4. **Configure logging safely**:
   - Use CloudWatch Logs
   - Never log secret values
   - Use structured logging for audit trails

5. **Test in staging first**:
   - Verify secrets are injected correctly
   - Check no secrets appear in logs or container output
   - Validate application startup behavior

## Quick Comparison

| Method | Complexity | Security | Runtime Cost | Best For |
|--------|-----------|----------|--------------|----------|
| CLI Entry Point | Low | Good | 1-2 sec overhead | Simple apps, quick setup |
| AWS Secrets Manager Hybrid | Medium | Excellent | Minimal | Enterprises, compliance |
| SDK Integration | Medium | Excellent | Minimal | Cloud-native apps |
| Sync in CI/CD | Low-Medium | Good | One-time | Immutable deployments |

## Recommended Solution for AWS ECS

**Start with the Infisical CLI entry point script** because it:
- Requires minimal code changes
- Works with any application language
- Integrates naturally with container startup
- Secrets stay in environment, not persisted on disk

Then upgrade to **SDK integration** if you need:
- On-demand secret rotation
- Granular per-request access control
- Reduced startup latency

## Additional Resources

- Infisical documentation: https://infisical.com/docs
- AWS ECS best practices for secrets management
- Your application's support for environment variables and secret injection
