# Deploying Infisical Agent as an ECS Sidecar with AWS IAM Authentication

You're in the right place! The Infisical Agent with AWS IAM authentication is the cleanest way to inject secrets into ECS without managing credentials. The agent will use your ECS task role directly, so there's no need to store or rotate client credentials.

## Architecture Overview

Your setup will look like this:

1. **Infisical Agent sidecar** — Runs in the same ECS task as your application
2. **ECS task role** — Provides AWS IAM credentials to the agent automatically
3. **Shared volume** — Both containers mount a shared volume to exchange secrets
4. **Agent renders secrets** — Writes a `.env` file that your app can read
5. **Application** — Reads secrets from the mounted volume

## Step 1: Create a Machine Identity in Infisical

You need to create a Machine Identity in Infisical that's authorized to use AWS IAM authentication.

**In Infisical UI:**
1. Go to **Settings → Machine Identities** (or Organization → Machine Identities)
2. Click **Create Machine Identity**
3. Give it a name: `ecs-app-identity`
4. Select **Auth Method: AWS IAM**
5. Fill in your AWS account ID and role name (the ECS task role)
6. Note the **Machine Identity ID** — you'll need this in your config

**Key fields:**
- **AWS Account ID**: The AWS account where your ECS task runs
- **AWS IAM Role Name**: The IAM role your ECS task assumes (e.g., `ecsTaskExecutionRole` or custom role)

Grant the Machine Identity access to your project and environments in the access control section.

## Step 2: Prepare Your Agent Configuration File

Create an `agent-config.yaml` file. Since you want one-time secret rendering (not continuous polling), use `exit-after-auth: true`.

```yaml
infisical:
  address: "https://app.infisical.com"    # Or your self-hosted Infisical URL
  exit-after-auth: true                    # Render once and exit

auth:
  type: "aws-iam"
  config:
    identity-id: "<your-machine-identity-id>"    # Paste the ID from Step 1

sinks:
  - type: "file"
    config:
      path: "/infisical/secrets/access-token"

templates:
  - template-content: |
      {{- with listSecretsByProjectSlug "my-project" "prod" "/" }}
      {{- range . }}
      {{ .Key }}={{ .Value }}
      {{- end }}
      {{- end }}
    destination-path: /infisical/secrets/.env
```

**Key options to customize:**

| Setting | Your Value | Notes |
|---------|-----------|-------|
| `address` | `https://app.infisical.com` | Or your self-hosted Infisical instance |
| `identity-id` | Your Machine Identity ID | From Step 1 |
| `my-project` | Your project slug | Find in Infisical UI → Project Settings |
| `prod` | Your environment | `dev`, `staging`, `prod`, etc. |
| `destination-path` | `/infisical/secrets/.env` | Path inside container to write secrets |

## Step 3: Update Your ECS Task Definition

Here's a complete task definition with both the agent and your application:

```json
{
  "family": "my-app",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "infisical-agent",
      "image": "infisical/cli:latest",
      "command": [
        "agent",
        "--config",
        "/etc/infisical/agent-config.yaml"
      ],
      "essential": false,
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/my-app",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "agent"
        }
      },
      "mountPoints": [
        {
          "sourceVolume": "agent-config",
          "containerPath": "/etc/infisical"
        },
        {
          "sourceVolume": "secrets",
          "containerPath": "/infisical/secrets"
        }
      ]
    },
    {
      "name": "app",
      "image": "myapp:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 3000,
          "hostPort": 3000,
          "protocol": "tcp"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/my-app",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "app"
        }
      },
      "mountPoints": [
        {
          "sourceVolume": "secrets",
          "containerPath": "/app/secrets",
          "readOnly": true
        }
      ],
      "dependsOn": [
        {
          "containerName": "infisical-agent",
          "condition": "COMPLETE"
        }
      ],
      "environment": [
        {
          "name": "SECRETS_PATH",
          "value": "/app/secrets/.env"
        }
      ]
    }
  ],
  "volumes": [
    {
      "name": "secrets",
      "emptyDir": {}
    },
    {
      "name": "agent-config",
      "configFileType": "text",
      "configFileValue": "# Inline agent config YAML here"
    }
  ]
}
```

**Important task definition fields:**

| Field | Purpose |
|-------|---------|
| `taskRoleArn` | The **ECS task role** — provides AWS IAM credentials to the agent. Must match the role configured in your Machine Identity. |
| `executionRoleArn` | The task execution role — allows ECS to pull images and write logs. |
| `infisical-agent.essential: false` | Agent isn't essential; if it fails, app still starts (but without secrets). |
| `app.dependsOn` | App waits for agent to complete (`COMPLETE` condition). |
| `volumes.secrets` | Shared ephemeral volume. Agent writes `.env` here, app reads from here. |

## Step 4: Provide the Agent Config to ECS

You have two options:

### Option A: Use ECS Secrets/ConfigMap (Recommended)
1. Store `agent-config.yaml` in **AWS Secrets Manager** or **Parameter Store**
2. Reference it in the task definition's `configFileValue` or use volume mounts with `secretsManagerSecrets`
3. This keeps the config out of your task definition JSON

### Option B: Embed in Task Definition (Simple but less flexible)
Replace the `configFileValue` placeholder in the task definition above with your actual YAML content.

## Step 5: Configure Your Application

Your application should read the `.env` file from `/app/secrets/.env`:

**Node.js example:**
```javascript
require('dotenv').config({ path: '/app/secrets/.env' });
console.log(process.env.DATABASE_URL);  // From Infisical
```

**Python example:**
```python
from dotenv import load_dotenv
load_dotenv('/app/secrets/.env')
import os
print(os.getenv('DATABASE_URL'))
```

**Bash example:**
```bash
source /app/secrets/.env
echo $DATABASE_URL
```

## IAM Permissions Required

Your **ECS task role** needs permission to call the Infisical API (over HTTPS). No specific AWS permissions are needed — the agent uses IMDS (EC2 Instance Metadata Service) to get temporary credentials from your task role, then uses those to authenticate to Infisical.

If you want to be extra restrictive, you can leave the role as-is (no special permissions). The agent only needs outbound HTTPS to Infisical.

## Step 6: Deploy

1. Register your task definition in ECS
2. Update your ECS service to use the new task definition
3. ECS will pull the Infisical CLI image, run the agent, wait for it to complete, then start your app

## Troubleshooting

### Agent exits with "identity not found"
- Verify the Machine Identity ID is correct
- Check that the Machine Identity is active in Infisical
- Verify the Machine Identity has access to your project

### Agent times out or can't authenticate
- Check the ECS task role ARN matches the role in your Machine Identity
- Verify the role is in the same AWS account as Infisical
- Check Security Groups allow outbound HTTPS (port 443)
- Review agent logs in CloudWatch

### App can't find `.env` file
- Verify the shared volume is mounted to both containers
- Check `destination-path` in agent config matches the path your app expects
- Verify `app.dependsOn` specifies the agent as a dependency

### Application sees stale secrets
- `exit-after-auth: true` means agent runs once at startup. If you need live updates, change to `exit-after-auth: false` and add a `polling-interval` (e.g., `5m`)
- If you enable polling, also add an `execute.command` to restart your app when secrets change

## Optional: Continuous Secret Updates

If you want the agent to monitor for secret changes and auto-update your app:

```yaml
infisical:
  address: "https://app.infisical.com"
  # Remove exit-after-auth or set to false

templates:
  - template-content: |
      {{- with listSecretsByProjectSlug "my-project" "prod" "/" }}
      {{- range . }}
      {{ .Key }}={{ .Value }}
      {{- end }}
      {{- end }}
    destination-path: /infisical/secrets/.env
    config:
      polling-interval: "5m"
      execute:
        command: "kill -HUP 1"    # Signal app to reload
        timeout: 10
```

This keeps the agent running, re-renders the `.env` file every 5 minutes, and signals your app to reload if secrets change.

## Recap: Key Takeaways

✅ **Use `aws-iam` auth** — No credential files needed, task role handles everything  
✅ **Set `exit-after-auth: true`** — Agent renders secrets once and exits  
✅ **Share a volume** — Agent writes to `/infisical/secrets`, app reads from `/app/secrets`  
✅ **Set `dependsOn`** — App waits for agent to finish  
✅ **Set `essential: false`** on agent — App can still start if agent fails (with cached secrets)  
✅ **Use `listSecretsByProjectSlug`** — Easier to read than project IDs  

You're all set! Let me know if you hit any snags or need to adapt this for dynamic secrets (like database credentials).
