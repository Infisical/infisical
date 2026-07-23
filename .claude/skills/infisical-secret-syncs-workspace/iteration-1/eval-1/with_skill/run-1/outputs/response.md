# Setting Up Infisical Secret Syncs to GitHub Actions

You're taking exactly the right approach by thinking about protecting your existing GitHub secrets during migration. Here's how to set this up properly while preserving your current secrets.

## The Challenge

GitHub repository secrets have a key limitation: **GitHub doesn't support importing secrets back into Infisical**. This means you can't directly read your existing GitHub secrets to merge them with Infisical. However, we can work around this with careful planning.

## Recommended Migration Strategy

### Step 1: Inventory Your Existing Secrets

Before creating any sync, document all your existing GitHub secrets (organization, repository, and environment level). You'll need these in Infisical before syncing.

**Why this matters:** When you create a sync with "Overwrite Destination" as the initial behavior (the only option GitHub supports), Infisical becomes the source of truth. Any secrets not in Infisical at sync time risk being overwritten or deleted.

### Step 2: Set Up Your GitHub App Connection

Create an **App Connection** to authenticate Infisical with GitHub:

1. Go to **Project Settings → App Connections** (or navigate through your organization settings)
2. Create a new GitHub App connection by authenticating with your GitHub account
3. Grant Infisical permissions to manage repository secrets at your desired scope (organization, repository, or environment)

This connection is one-time setup and can be reused across multiple syncs.

### Step 3: Add Your Existing Secrets to Infisical

Before creating any sync, manually add all your existing GitHub secrets into Infisical in the appropriate environment and folder path. This ensures they won't be lost during the initial sync.

**Key point:** Since GitHub doesn't allow importing, you need to populate Infisical proactively. Consider this a data migration step:
- List all existing GitHub secrets
- Add them to Infisical in the same environment where you'll sync from
- Verify they match exactly

### Step 4: Create the Secret Sync

Navigate to **Project → Integrations → Secret Syncs** and add a new sync:

#### Source Configuration
- **Environment:** Select the Infisical environment containing your secrets (e.g., `prod`, `staging`)
- **Secret Path:** Choose the folder path to sync from (e.g., `/` for all secrets, or `/github` for a subset)

#### Destination Configuration

Choose your GitHub scope:

**For Organization Secrets:**
- GitHub Connection: Select your App Connection
- Scope: `organization`
- Organization Name: Your GitHub org name
- Visibility: `all-repositories`, `private-repositories` (requires GitHub Pro/Team), or `selected-repositories`
- Selected Repositories: If you chose `selected-repositories`, specify which repos get access

**For Repository Secrets:**
- GitHub Connection: Select your App Connection
- Scope: `repository`
- Repository: Specify as `owner/repo` (e.g., `myorg/my-repo`)

**For Environment Secrets (Recommended for CI/CD):**
- GitHub Connection: Select your App Connection
- Scope: `environment`
- Repository: `owner/repo`
- Environment: The GitHub environment name (e.g., `production`, `staging`, `development`)

#### Sync Options

- **Initial Sync Behavior:** Select `overwrite-destination` (this is the only option GitHub supports)
- **Key Schema:** Highly recommended — use something like `INFISICAL_{{secretKey}}` to prefix your synced secrets. This clearly marks which secrets are managed by Infisical and prevents accidental overwrites of manually-managed secrets.
  - Example: Infisical key `DATABASE_URL` becomes `INFISICAL_DATABASE_URL` in GitHub
  - **Benefit:** You can keep manual secrets in GitHub alongside Infisical-managed ones
- **Auto-Sync Enabled:** Leave on (default) so changes in Infisical automatically propagate to GitHub
- **Disable Secret Deletion:** Consider enabling this if you have secrets in GitHub that you're not syncing from Infisical yet. This prevents Infisical from deleting them.

### Step 5: Test and Verify

After creating the sync:

1. Verify the initial sync completed successfully in the sync logs
2. Check GitHub to confirm your secrets are present with the correct key names
3. Modify a secret in Infisical and watch it update in GitHub (if auto-sync is enabled)
4. Test your CI/CD workflow with the new secrets

## Best Practices for Your Scenario

### 1. Use Key Schemas to Coexist
Since you already have GitHub secrets and don't want to lose them, a key schema is essential:
- Mark Infisical-managed secrets with a consistent prefix (e.g., `INFISICAL_`)
- Keep your existing secrets as-is in GitHub
- Both coexist without conflict

### 2. Choose the Right Scope
- **Organization secrets** — for shared secrets across many repos
- **Repository secrets** — for repo-specific CI/CD secrets
- **Environment secrets** — recommended for GitHub Actions CI/CD (allows different secrets for production vs. staging deployments)

Environment secrets are ideal if your workflows are structured around GitHub environments (e.g., `production`, `staging`, `development`).

### 3. Handle Manual Secrets
If you have secrets in GitHub that you'll never add to Infisical:
- Enable **Disable Secret Deletion** on the sync
- This prevents Infisical from deleting manually-managed secrets
- You'll need to manage those outside Infisical

### 4: Plan Your Migration
- Start with one sync (e.g., to `production` environment) as a pilot
- Verify it works with your GitHub Actions workflows
- Then expand to other environments or scopes
- This reduces risk and lets you iterate

## Common Gotchas for GitHub Syncs

| Issue | Solution |
|-------|----------|
| "Initial sync deleted my secrets!" | Pre-populate Infisical with all existing secrets before syncing |
| Secrets don't appear in GitHub Actions | Verify the environment exists in GitHub and the repo has access. Check sync logs for errors. |
| Can't import secrets to Infisical | GitHub blocks reading secrets via API. You must manually add them to Infisical or use a data migration tool. |
| Environment secrets require a repo secret too | Not always — but if your workflows reference both, keep them in sync manually or use a consistent schema. |
| Synced secrets show as `***` in GitHub UI | Expected behavior — GitHub hides secret values in the UI for security. The workflow can still access them. |

## Putting It All Together: Step-by-Step Checklist

- [ ] Document all existing GitHub secrets (org, repo, environment level)
- [ ] Create an App Connection to GitHub in Infisical (one-time)
- [ ] Add all existing GitHub secrets to Infisical in the target environment/path
- [ ] Create a Secret Sync with:
  - Source: Your Infisical environment + path
  - Destination: GitHub scope (org/repo/environment) + your App Connection
  - Initial Sync Behavior: `overwrite-destination`
  - Key Schema: `INFISICAL_{{secretKey}}` (or similar prefix)
  - Auto-Sync: Enabled
  - Disable Secret Deletion: Consider enabling if you have non-Infisical secrets
- [ ] Verify sync completed successfully
- [ ] Check GitHub secrets are present with correct names
- [ ] Test your CI/CD workflow
- [ ] Monitor the sync logs for any issues

Once the first sync is working, you can create additional syncs for other repositories or GitHub environments as needed.

## Next Steps

If you have questions about:
- Setting up the GitHub App Connection
- Organizing your secrets in Infisical (folder structure, environment names)
- Using Infisical's Secret Imports feature to consolidate secrets from multiple paths
- Handling sensitive values during migration

Feel free to ask, and we can walk through those setup details. Good luck with your migration!
