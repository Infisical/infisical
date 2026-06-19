# Setting Up Infisical Secret Syncing to GitHub Actions

## Overview

Infisical provides first-class integration with GitHub to automatically sync secrets from your Infisical workspace to GitHub Actions secrets. This guide covers the setup process while preserving your existing GitHub secrets.

## Prerequisites

- An Infisical workspace with secrets configured
- A GitHub repository with existing secrets you want to keep
- Repository administrator permissions
- An Infisical service token or personal API token with sufficient permissions

## Architecture & How It Works

Infisical's GitHub integration syncs secrets in one direction: **Infisical → GitHub**. Here's how it works:

1. **Native GitHub Integration**: Infisical connects to GitHub via OAuth or personal access token authentication
2. **Selective Syncing**: You configure which Infisical secrets sync to which GitHub repository
3. **Sync Management**: The integration continuously keeps GitHub secrets in sync with Infisical, though you configure which secrets to include
4. **Secret Naming**: Secrets maintain their names during sync (customizable if needed)

## Step-by-Step Setup

### 1. Prepare Your Infisical Workspace

First, organize your secrets in Infisical:

- Navigate to your Infisical workspace and select the environment you want to sync (e.g., `production`, `staging`)
- Identify which secrets should be synced to GitHub Actions
- Consider using labels or folders to organize secrets that belong to specific projects

### 2. Create an Integration in Infisical

In your Infisical workspace:

1. Go to **Project Settings** → **Integrations** (or similar, depending on your version)
2. Look for the **GitHub** integration option
3. Click **Create Integration**
4. Select **GitHub Actions** as the target platform

### 3. Authenticate with GitHub

Infisical will prompt you to authenticate:

**Option A: OAuth (Recommended)**
- Click "Authorize with GitHub"
- You'll be redirected to GitHub to approve the Infisical application
- Grant permissions for repository secrets management
- Return to Infisical to complete the connection

**Option B: Personal Access Token**
- Generate a GitHub Personal Access Token with these scopes:
  - `repo` (full control of private repositories)
  - `admin:repo_hook` (for webhook management, if applicable)
- Paste the token into Infisical's integration setup
- This approach gives you more control and is easier to audit

### 4. Configure Which Secrets to Sync

After authentication:

1. **Select Your Repository**: Choose the GitHub repository where you want secrets synced
2. **Choose Secrets**: Select which Infisical secrets to include in the sync
   - You can sync specific secrets by name
   - Or sync all secrets from a particular environment
3. **Name Mapping** (optional): Infisical typically preserves secret names, but some integrations allow renaming
4. **Sync Trigger**: Configure whether this happens:
   - Automatically on every Infisical secret change
   - On demand via webhook or API
   - On a scheduled interval

### 5. Preserve Existing GitHub Secrets

**Critical**: Infisical's GitHub integration typically **only manages secrets it creates**. Here's how to protect existing secrets:

1. **Before syncing**: Document your existing GitHub secrets
   - Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
   - Take screenshots or export a list of all current secrets
2. **Sync Only New Secrets**: When configuring the Infisical integration, only include secrets that are either:
   - New secrets created in Infisical specifically for this sync
   - Non-conflicting names with your existing GitHub secrets
3. **Verify No Overwrites**: Confirm with Infisical's documentation or support that the sync will not delete/overwrite unmanaged secrets
   - Most modern versions are safe — they only touch secrets they manage
4. **Test in a Safe Environment**: First, test the integration on a test repository before syncing to production

### 6. Verify the Sync

Once configured:

1. Create or update a secret in Infisical
2. Wait for the sync to trigger (or trigger manually if required)
3. Go to your GitHub repo's **Settings** → **Secrets and variables** → **Actions**
4. Verify the secret appears in GitHub with the correct value
5. Check that your pre-existing secrets are still present and unchanged

## Best Practices

### Security

- **Use service tokens**: If integrating Infisical with CI/CD systems, use a dedicated Infisical service token rather than a personal API token
- **Limit secret scope**: Only sync secrets that GitHub Actions actually needs
- **Audit regularly**: Periodically review which secrets are being synced
- **Rotate tokens**: GitHub Personal Access Tokens used for authentication should be rotated periodically

### Maintenance

- **Naming conventions**: Use consistent naming across Infisical and GitHub to keep things organized
  - Example: `DB_PASSWORD`, `API_KEY_PRODUCTION`, `SLACK_TOKEN`
- **Environment separation**: Keep separate Infisical environments for dev/staging/production, and sync each to the appropriate GitHub branch/environment
- **Documentation**: Document which Infisical secrets map to which GitHub secrets in your team's wiki or README

### GitHub Actions Usage

Once synced, use the secrets in your GitHub Actions workflows:

```yaml
name: Deploy

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run deploy script
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          API_KEY: ${{ secrets.API_KEY }}
        run: |
          npm run deploy
```

GitHub Actions automatically injects synced secrets as environment variables without logging them.

## Troubleshooting

### Secrets Not Appearing in GitHub

1. **Check sync configuration**: Verify the integration is enabled and the correct secrets are selected
2. **Verify authentication**: Confirm the GitHub Personal Access Token or OAuth connection is still valid
3. **Check permissions**: Ensure your GitHub account has admin rights on the repository
4. **Review logs**: Check Infisical's integration logs (usually in **Project Settings** → **Integrations** → view integration details)
5. **Manual trigger**: If async syncing is configured, manually trigger a sync to test

### Conflict with Existing Secrets

- If a secret with the same name exists in both Infisical and GitHub:
  - Most integrations will **update the GitHub secret** with the Infisical value
  - Some integrations may fail or skip the sync
  - Check Infisical's documentation for conflict resolution behavior
  - To be safe, use unique naming schemes if you're keeping secrets separate

### GitHub Personal Access Token Expired

- Regenerate a new token with the same scopes
- Update the token in your Infisical integration settings
- Re-test the sync

### Integration Disconnected

- If Infisical loses connection to GitHub:
  - Secrets stop syncing until reconnected
  - Existing GitHub secrets are **not deleted** — they persist
  - Re-authenticate by updating the integration settings
  - Resume syncing

## Advanced Setup: Multiple Environments

For a production workflow with multiple environments:

```
Infisical Workspace:
├── development
│   ├── DB_HOST: dev.example.com
│   ├── API_KEY: dev-key-123
│   └── (other dev secrets)
├── staging
│   ├── DB_HOST: staging.example.com
│   ├── API_KEY: staging-key-456
│   └── (other staging secrets)
└── production
    ├── DB_HOST: prod.example.com
    ├── API_KEY: prod-key-789
    └── (other prod secrets)

GitHub Integrations:
├── my-repo (develop branch) → syncs from Infisical/development
├── my-repo (staging branch) → syncs from Infisical/staging
└── my-repo (main branch) → syncs from Infisical/production
```

Configure separate Infisical integrations for each environment to maintain environment isolation.

## Rollback & Disaster Recovery

If something goes wrong:

1. **Secrets are preserved in Infisical**: Your Infisical secrets are the source of truth — nothing is deleted when you disconnect
2. **GitHub secrets persist**: Disconnecting the integration does not delete secrets already synced to GitHub
3. **Manual recovery**: If needed, you can manually re-add secrets to GitHub from Infisical using the UI or GitHub CLI
4. **Audit trail**: Infisical maintains audit logs of which secrets were synced and when

## Conclusion

Setting up Infisical-to-GitHub secret syncing is straightforward and safe for your existing secrets. The key is to:

1. Authenticate Infisical with GitHub
2. Configure which secrets to sync
3. Verify that existing GitHub secrets are preserved
4. Test in a non-production environment first

Once running, you'll have a centralized secret management system where changes in Infisical automatically propagate to your CI/CD pipeline in GitHub Actions.
