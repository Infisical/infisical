# Runtime Secret Injection for AWS ECS with Infisical

You're on the right track — runtime injection is exactly what you need. Here's the best way to do this for AWS ECS:

## Recommended: AWS Auth (Zero-Secret Approach)

Since you're deploying to AWS ECS, the **AWS Auth** method is ideal. It uses your ECS task's IAM role for authentication, so you don't store any credentials in the container.

### How it works:
- Your ECS task runs with an IAM role
- When the container starts, the Infisical CLI signs an `sts:GetCallerIdentity` request using that role
- Infisical verifies the signature and issues a short-lived access token
- Secrets are injected as environment variables into your application
- No credentials baked into the image, no secrets passed at runtime

### Setup steps:

#### 1. Create a machine identity in Infisical
- Go to **Organization Settings > Access Control > Machine Identities**
- Click **Create Identity**
- Name it (e.g., `prod-ecs-app`)
- Assign an org or project role with access to the secrets you need

#### 2. Configure AWS Auth on the machine identity
- On your machine identity, add **AWS Auth**
- Configure:
  - **Allowed Principal ARNs**: Add your ECS task role ARN (e.g., `arn:aws:iam::123456789012:role/my-ecs-task-role`)
  - **Allowed Account IDs**: Your AWS account ID
- Save and note your **Machine Identity ID**

#### 3. Update your Dockerfile
```dockerfile
# Install the CLI
RUN apt-get update && apt-get install -y curl bash \
  && curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | bash \
  && apt-get install -y infisical

# Your app
COPY . /app
WORKDIR /app

# Use infisical run to inject secrets at runtime
CMD ["infisical", "run", \
     "--projectId", "your-project-id", \
     "--identityId", "your-machine-identity-id", \
     "--", \
     "node", "server.js"]
```

#### 4. Deploy to ECS
- Ensure your ECS task role has permissions to assume the Infisical machine identity role (if cross-account) or that the ARN matches
- Push the image to ECR
- Update your ECS task definition — no new environment variables needed
- Deploy

When the container starts, `infisical run` automatically authenticates using your ECS task role and injects all secrets from your project.

---

## Alternative: Universal Auth (For Local/Testing)

If you need credentials (e.g., for local testing or a different auth scenario), use Universal Auth:

#### 1. Create a machine identity with Universal Auth
- Go to **Organization Settings > Access Control > Machine Identities**
- Create an identity and select **Universal Auth**
- Create a **Client Secret** and note both the **Client ID** and **Client Secret**

#### 2. Update your Dockerfile
```dockerfile
RUN apt-get update && apt-get install -y curl bash \
  && curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | bash \
  && apt-get install -y infisical

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server.js"]
```

#### 3. Create an entrypoint script
```bash
#!/bin/sh
# entrypoint.sh

# Authenticate and get an access token
export INFISICAL_TOKEN=$(infisical login \
  --method=universal-auth \
  --client-id=$INFISICAL_CLIENT_ID \
  --client-secret=$INFISICAL_CLIENT_SECRET \
  --plain --silent)

# Inject secrets and run your app
exec infisical run \
  --token $INFISICAL_TOKEN \
  --projectId $INFISICAL_PROJECT_ID \
  --env $INFISICAL_ENV \
  -- "$@"
```

#### 4. Deploy to ECS
Pass credentials as ECS task environment variables (stored in Secrets Manager or Parameter Store):
```bash
docker run \
  -e INFISICAL_CLIENT_ID=<your-client-id> \
  -e INFISICAL_CLIENT_SECRET=<your-client-secret> \
  -e INFISICAL_PROJECT_ID=<project-id> \
  -e INFISICAL_ENV=prod \
  my-app:latest
```

---

## Key Points

- **Never bake secrets into the image.** Don't use `ENV` or `ARG` for real secrets in Dockerfiles.
- **AWS Auth is preferable.** It's zero-secret — no credentials to store, manage, or rotate.
- **Pin the CLI version in production** to avoid unexpected behavior from auto-updates.
- **Client secrets and IDs** should be generated and stored by you in AWS Secrets Manager or Parameter Store, not by Infisical.

---

## Next steps

1. **For AWS Auth**: Set up your machine identity with AWS Auth and note the Machine Identity ID
2. **For Universal Auth**: Create a machine identity with Universal Auth and generate a Client Secret
3. Update your Dockerfile with `infisical run` and your project/identity IDs
4. Test locally or in a staging environment before deploying to production
