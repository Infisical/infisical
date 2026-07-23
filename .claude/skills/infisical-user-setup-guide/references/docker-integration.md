# Docker Integration

How to get Infisical secrets into Docker containers. There are two main patterns: runtime injection (recommended) and build-time injection.

## Pattern 1: Runtime injection with `infisical run` (Recommended)

The cleanest approach — secrets are fetched fresh when the container starts. Nothing is baked into the image.

### Step 1: Install the CLI in your Dockerfile

```dockerfile
# For Debian/Ubuntu-based images
RUN apt-get update && apt-get install -y curl bash \
  && curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | bash \
  && apt-get install -y infisical

# For Alpine-based images
RUN apk add --no-cache curl bash \
  && curl -1sLf 'https://artifacts-cli.infisical.com/setup.alpine.sh' | bash \
  && apk add --no-cache infisical
```

### Step 2: Wrap your start command with `infisical run`

```dockerfile
CMD ["infisical", "run", "--projectId", "<project-id>", "--", "node", "server.js"]
```

### Step 3: Pass the auth token when running the container

```bash
# First, obtain an access token via machine identity
export INFISICAL_TOKEN=$(infisical login \
  --method=universal-auth \
  --client-id=<client-id> \
  --client-secret=<client-secret> \
  --plain --silent)

# Run the container with the token
docker run --env INFISICAL_TOKEN=$INFISICAL_TOKEN my-app:latest
```

**Important**: The user should generate and manage their own client ID and secret. Never generate these values on their behalf. Guide them to create a machine identity in the Infisical dashboard.

### Shell script approach (more flexible)

For more control, use an entrypoint script:

```bash
#!/bin/sh
# entrypoint.sh

# Authenticate and get access token
export INFISICAL_TOKEN=$(infisical login \
  --method=universal-auth \
  --client-id=$INFISICAL_CLIENT_ID \
  --client-secret=$INFISICAL_CLIENT_SECRET \
  --plain --silent)

# Run the app with secrets injected
exec infisical run \
  --token $INFISICAL_TOKEN \
  --projectId $INFISICAL_PROJECT_ID \
  --env $INFISICAL_ENV \
  -- "$@"
```

```dockerfile
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server.js"]
```

Then run with:

```bash
docker run \
  -e INFISICAL_CLIENT_ID=<client-id> \
  -e INFISICAL_CLIENT_SECRET=<client-secret> \
  -e INFISICAL_PROJECT_ID=<project-id> \
  -e INFISICAL_ENV=prod \
  my-app:latest
```

## Pattern 2: Export secrets as .env file

Useful with Docker Compose or when you need an env file:

```bash
# Export secrets to a file
infisical export --env=prod --format=dotenv > .env

# Use with docker run
docker run --env-file .env my-app:latest

# Use with docker compose
docker compose --env-file .env up
```

**Caveat**: This writes secrets to disk. Make sure `.env` is in `.gitignore` and `.dockerignore`.

## Pattern 3: Docker Compose with infisical run

Wrap the entire compose command:

```bash
infisical run -- docker compose up
```

This injects secrets as environment variables into the `docker compose` process, which then passes them to containers via `environment:` directives in your compose file.

## Auth method selection for Docker

| Running where? | Recommended auth |
|---------------|-----------------|
| Local Docker Desktop | Universal Auth (Client ID/Secret) |
| AWS ECS/Fargate | AWS Auth (uses task IAM role, zero-secret) |
| GCP Cloud Run | GCP Auth (uses service identity, zero-secret) |
| Azure Container Instances | Azure Auth (uses managed identity, zero-secret) |
| Kubernetes (Docker in K8s) | Kubernetes Auth (uses service account, zero-secret) |
| Generic cloud VM | Universal Auth |

See `machine-identity-auth.md` for details on setting up each auth method.

## Important notes

- **Never bake secrets into Docker images.** Don't use `ENV` or `ARG` for real secrets in Dockerfiles — they persist in image layers.
- **Service Tokens are deprecated.** If the user mentions `st.*` tokens, guide them to machine identities instead.
- **Pin the CLI version in production Dockerfiles** to avoid unexpected behavior from auto-updates.
