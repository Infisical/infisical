# CI/CD Integration

How to get Infisical secrets into CI/CD pipelines. The recommended approach depends on the platform.

## GitHub Actions (OIDC — recommended)

Zero-secret integration using GitHub's built-in OIDC tokens. No stored secrets needed in GitHub.

### Step 1: Create a machine identity with OIDC auth

In the Infisical dashboard:
1. Go to Organization Settings > Access Control > Machine Identities
2. Create an identity and assign a role
3. Add OIDC Auth with these settings:
   - **OIDC Discovery URL**: `https://token.actions.githubusercontent.com`
   - **Issuer**: `https://token.actions.githubusercontent.com`
   - **Subject**: `repo:<owner>/<repo>:<context>` (e.g., `repo:acme/api:ref:refs/heads/main`)
   - **Audiences**: Your GitHub org URL (e.g., `https://github.com/acme`)
4. Add the identity to your project with appropriate permissions

### Step 2: Configure the workflow

```yaml
name: Deploy

permissions:
  id-token: write   # Required for OIDC
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Fetch secrets from Infisical
        uses: Infisical/secrets-action@v1.0.9
        with:
          method: "oidc"
          identity-id: "<your-identity-id>"
          project-slug: "your-project"
          env-slug: "prod"

      - name: Use secrets
        run: |
          echo "Secrets are now available as env vars"
          # e.g., $DATABASE_URL, $API_KEY
```

**Key parameters for the action:**
- `method`: `"oidc"` for OIDC auth
- `identity-id`: The machine identity ID (public, safe to commit)
- `project-slug`: Your Infisical project slug
- `env-slug`: Environment (dev, staging, prod)

### Troubleshooting GitHub Actions OIDC

- Ensure `id-token: write` permission is set
- Subject must exactly match the repo and context (branch, tag, or environment)
- Audience must match the GitHub org URL
- Project and environment slugs must match what's configured in Infisical

## GitLab CI

### Option 1: CLI with machine identity token

```yaml
image: ubuntu

stages:
  - build

build:
  stage: build
  script:
    - apt update && apt install -y curl bash
    - curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | bash
    - apt-get install -y infisical
    - export INFISICAL_TOKEN=$(infisical login --method=universal-auth
        --client-id=$INFISICAL_CLIENT_ID
        --client-secret=$INFISICAL_CLIENT_SECRET
        --plain --silent)
    - infisical run --projectId=$INFISICAL_PROJECT_ID --env=prod -- npm run build
```

Store `INFISICAL_CLIENT_ID` and `INFISICAL_CLIENT_SECRET` as GitLab CI/CD variables (Settings > CI/CD > Variables).

### Option 2: OIDC auth (if GitLab supports it for your setup)

GitLab CI can issue OIDC tokens via `CI_JOB_JWT` or `id_tokens`. Configure similarly to GitHub Actions — create a machine identity with OIDC auth, set the issuer to your GitLab instance, and use the JWT to authenticate.

## Other CI/CD platforms

For any CI platform, the pattern is:

1. **Create a machine identity** with an appropriate auth method
2. **Install the CLI** in the pipeline
3. **Authenticate**: `infisical login --method=universal-auth --client-id=... --client-secret=... --plain --silent`
4. **Inject secrets**: `infisical run -- <your-build-command>`

If the CI platform supports OIDC (e.g., CircleCI, Bitbucket), prefer OIDC Auth for zero-secret integration. Otherwise, use Universal Auth with Client ID/Secret stored as CI variables.

## Secret syncs (alternative approach)

Instead of fetching secrets at build time, Infisical can sync secrets directly into your CI/CD platform's native secret store (e.g., GitLab CI/CD Variables). This is a one-way push configured in the Infisical dashboard. Useful if you don't want to install the CLI in your pipeline, but less flexible than runtime injection.

## Security best practices for CI/CD

- **Prefer OIDC over stored credentials** when possible — no secrets to rotate or leak
- **Scope machine identities tightly** — give each pipeline its own identity with minimum permissions
- **Use environment-specific identities** — don't let a staging pipeline access production secrets
- **Pin CLI version** in CI to avoid surprises from upstream updates
