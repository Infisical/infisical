# Infisical Agent as ECS Sidecar with Task Roles

## Overview

Deploying the Infisical Agent as a sidecar container in AWS ECS with task roles is an excellent approach for secure secret injection without managing credentials. This guide covers the complete configuration.

## Architecture

The Infisical Agent runs as a sidecar in your ECS task and injects secrets into your main application containers via a shared volume or Unix socket. By using ECS task roles (IAM roles attached to the task), you avoid storing credentials in environment variables or task definitions.

## Prerequisites

1. **ECS Task Role** with permissions to access Infisical (API endpoints or AWS Secrets Manager if using a hybrid approach)
2. **Infisical instance** running and accessible from your ECS tasks (typically in the same VPC)
3. **Machine Identity** (Service Account or Bot) in Infisical for the agent to authenticate

## Configuration Steps

### 1. Set Up Machine Identity in Infisical

Create a Machine Identity that the Agent will use to authenticate to Infisical:

- **Option A: Service Account** (recommended for ECS)
  - Go to your Infisical workspace → Settings → Machine Identities
  - Create a new Machine Identity with type "Service Account"
  - Generate client credentials (Client ID and Client Secret)
  - Assign appropriate scopes (e.g., read secrets from specific projects/environments)

- **Option B: Bot Identity**
  - Similar process, use Bot type for application-level authentication
  - Assign minimal required permissions

### 2. Configure ECS Task Role

Create or update your ECS task role with a policy allowing the Infisical Agent to authenticate using service account credentials. The agent will need:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:infisical/*"
    }
  ]
}
```

**Note:** If using a direct Infisical API approach, the task role may not directly authenticate with Infisical. Instead, store the Client ID/Secret in:
- **AWS Secrets Manager** (recommended) — store machine identity credentials as a secret
- **AWS Systems Manager Parameter Store** — store credentials securely
- **Environment variables** — less secure, only as fallback

### 3. Store Machine Identity Credentials

**Recommended: AWS Secrets Manager**

Store the Infisical machine identity credentials in Secrets Manager:

```bash
aws secretsmanager create-secret \
  --name infisical/agent-credentials \
  --secret-string '{"clientId":"YOUR_CLIENT_ID","clientSecret":"YOUR_CLIENT_SECRET"}'
```

Update task role policy to allow reading this secret:

```json
{
  "Effect": "Allow",
  "Action": [
    "secretsmanager:GetSecretValue"
  ],
  "Resource": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:infisical/agent-credentials-*"
}
```

### 4. ECS Task Definition

Define your task with the Infisical Agent as a sidecar. Here's an example:

```json
{
  "family": "my-app-with-infisical",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::ACCOUNT:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "infisical-agent",
      "image": "infisical/infisical-agent:latest",
      "essential": false,
      "portMappings": [
        {
          "containerPort": 8080,
          "hostPort": 8080,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "INFISICAL_API_URL",
          "value": "https://your-infisical-instance.com"
        },
        {
          "name": "INFISICAL_AGENT_MODE",
          "value": "kubernetes"
        }
      ],
      "secrets": [
        {
          "name": "INFISICAL_CLIENT_ID",
          "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:infisical/agent-credentials:clientId::"
        },
        {
          "name": "INFISICAL_CLIENT_SECRET",
          "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:infisical/agent-credentials:clientSecret::"
        }
      ],
      "mountPoints": [
        {
          "sourceVolume": "infisical-socket",
          "containerPath": "/var/run/infisical"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/infisical-agent",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    },
    {
      "name": "my-app",
      "image": "my-registry/my-app:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 3000,
          "hostPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "INFISICAL_AGENT_ENDPOINT",
          "value": "unix:///var/run/infisical/agent.sock"
        },
        {
          "name": "INFISICAL_PROJECT_ID",
          "value": "your-project-id"
        }
      ],
      "mountPoints": [
        {
          "sourceVolume": "infisical-socket",
          "containerPath": "/var/run/infisical"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/my-app",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ],
  "volumes": [
    {
      "name": "infisical-socket",
      "efsVolumeConfiguration": {
        "filesystemId": "fs-12345678",
        "transitEncryption": "ENABLED"
      }
    }
  ]
}
```

**Key considerations:**

- **Shared Volume**: The `infisical-socket` volume allows both containers to communicate. Use EFS or tmpfs depending on your needs.
- **Secrets Injection**: Machine identity credentials come from AWS Secrets Manager, not environment variables in the task definition.
- **Agent Endpoint**: Your main application uses `INFISICAL_AGENT_ENDPOINT` to connect to the agent's socket.
- **Essential Flag**: Set `essential: false` for the sidecar so task doesn't fail if agent restarts.

### 5. Application Configuration

In your application, configure the Infisical SDK to use the agent:

**Node.js Example:**

```javascript
const { InfisicalClient } = require('@infisical/sdk');

const client = new InfisicalClient({
  agentEndpoint: process.env.INFISICAL_AGENT_ENDPOINT || 'unix:///var/run/infisical/agent.sock',
  projectId: process.env.INFISICAL_PROJECT_ID
});

// Fetch secret
const secret = await client.getSecret({
  path: '/db',
  key: 'DATABASE_URL'
});

console.log(secret.value);
```

**Go Example:**

```go
package main

import (
	"fmt"
	"os"
	
	infisical "github.com/infisical/go-sdk"
)

func main() {
	client := infisical.NewClient(
		infisical.WithAgentEndpoint(os.Getenv("INFISICAL_AGENT_ENDPOINT")),
	)
	
	secret, err := client.GetSecret(
		"DATABASE_URL",
		"/db",
		os.Getenv("INFISICAL_PROJECT_ID"),
	)
	if err != nil {
		panic(err)
	}
	
	fmt.Println(secret.Value)
}
```

### 6. IAM Task Role Permissions

Ensure your ECS task role has the correct permissions. The execution role (different from task role) needs to fetch secrets from Secrets Manager:

**Execution Role Policy:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:infisical/agent-credentials-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:REGION:ACCOUNT:log-group:/ecs/*"
    }
  ]
}
```

**Task Role Policy:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeNetworkInterfaces"
      ],
      "Resource": "*"
    }
  ]
}
```

The task role primarily grants permissions your application needs (e.g., accessing other AWS services). In this setup, it's minimal since credentials come through the agent.

## Alternative: Using tmpfs Instead of EFS

If you prefer temporary socket storage instead of EFS:

```json
{
  "name": "infisical-socket",
  "host": {}
}
```

And add to agent container:

```json
{
  "mountPoints": [
    {
      "sourceVolume": "infisical-socket",
      "containerPath": "/var/run/infisical"
    }
  ]
}
```

**Trade-off**: tmpfs is simpler but doesn't persist across task replacements. EFS is more robust for production.

## Security Best Practices

1. **Least Privilege Scope**: When creating the Infisical Machine Identity, restrict it to only the projects and environments your application needs.

2. **Credential Rotation**: Rotate machine identity credentials regularly. Update the Secrets Manager secret and redeploy tasks.

3. **Network Isolation**: Ensure your ECS tasks can reach your Infisical instance (same VPC, VPC endpoints, or private link).

4. **Audit Logging**: Enable CloudWatch logs for both sidecar and main application. Monitor for authentication failures.

5. **Secret Caching**: The Infisical Agent caches secrets locally. Configure cache TTL appropriately in agent configuration.

6. **TLS/mTLS**: If your Infisical instance is over the internet, use TLS. For internal communication, ensure secure VPC setup.

## Troubleshooting

### Agent Fails to Start

- Check CloudWatch logs for the agent container
- Verify Secrets Manager secret name and ARN are correct
- Ensure execution role has permission to fetch the secret

### Application Can't Connect to Agent

- Verify shared volume is mounted correctly in both containers
- Check socket path matches `INFISICAL_AGENT_ENDPOINT`
- Ensure agent container is running before application starts

### Authentication Failures

- Confirm machine identity credentials in Secrets Manager are correct
- Verify INFISICAL_API_URL is accessible from ECS task
- Check machine identity has appropriate scopes in Infisical

### Slow Secret Retrieval

- Configure agent caching to reduce API calls
- Consider pre-fetching secrets at application startup
- Monitor network latency between ECS and Infisical instance

## Summary

This setup provides:

- **No credential management**: Task role handles AWS authentication
- **Secure secret injection**: Credentials stored in Secrets Manager
- **Scalability**: Sidecar pattern works across many ECS tasks
- **Flexibility**: Works with any application language via agent endpoint

The key is separating concerns: ECS manages container orchestration and authentication, Infisical manages secrets, and the agent acts as a secure bridge between them.
