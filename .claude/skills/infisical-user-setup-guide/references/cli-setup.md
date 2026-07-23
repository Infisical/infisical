# CLI Setup for Local Development

The Infisical CLI is the fastest way to get secrets into a local development workflow. It injects secrets as environment variables into any process — no code changes needed.

## Installation

Guide the user based on their OS:

| Platform | Command |
|----------|---------|
| macOS | `brew install infisical/get-cli/infisical` |
| Debian/Ubuntu | `curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' \| sudo bash && sudo apt-get install -y infisical` |
| RedHat/CentOS/Amazon | `curl -1sLf 'https://artifacts-cli.infisical.com/setup.rpm.sh' \| sudo bash && sudo yum install -y infisical` |
| Alpine | `curl -1sLf 'https://artifacts-cli.infisical.com/setup.alpine.sh' \| sudo bash && sudo apk add --no-cache infisical` |
| Arch Linux | `yay -S infisical-bin` |
| Windows (Scoop) | `scoop install infisical` |
| Windows (Winget) | `winget install infisical` |
| npm (any platform) | `npm install -g @infisical/cli` |

For production or CI, recommend pinning to a specific version for consistency.

## Login

```bash
# Browser-based login (default — opens browser)
infisical login

# Interactive terminal login (useful in containers, WSL2, Codespaces)
infisical login --interactive

# Machine identity login (for automated environments)
infisical login --method=universal-auth \
  --client-id=<client-id> \
  --client-secret=<client-secret>
```

The CLI stores tokens in the system keyring. Users can switch between accounts with `infisical user`.

### Self-hosted or EU Cloud

By default the CLI connects to `https://app.infisical.com`. To use a different instance:

```bash
# Option 1: Environment variable (recommended)
export INFISICAL_API_URL="https://your-instance.com"

# Option 2: Flag on every command
infisical login --domain="https://your-instance.com"

# Option 3: Interactive login prompts for region
infisical login
```

## Initialize a project

```bash
cd /path/to/your/project
infisical init
```

This creates `.infisical.json` — a non-sensitive file that links the directory to an Infisical project. Safe to commit to git.

```json
{
  "workspaceId": "63ee5410a45f7a1ed39ba118",
  "defaultEnvironment": "dev",
  "gitBranchToEnvironmentMapping": {
    "main": "prod",
    "staging": "staging",
    "develop": "dev"
  }
}
```

The `gitBranchToEnvironmentMapping` is optional but convenient — it auto-selects the environment based on the current git branch.

## Run your app with secrets

```bash
# Basic — injects all secrets from the project as env vars
infisical run -- npm run dev

# Specify environment
infisical run --env=staging -- npm run dev

# Specify a folder path within the project
infisical run --path=/apps/backend -- npm run dev

# Watch mode — auto-restarts when secrets change
infisical run --watch -- npm run dev

# Multiple chained commands
infisical run --command="npm run build && npm run start"
```

This works with any framework or language — the secrets appear as standard environment variables in the child process.

## Manage secrets from the CLI

```bash
# List all secrets
infisical secrets

# Get specific secrets
infisical secrets get API_KEY DATABASE_URL

# Set secrets
infisical secrets set API_KEY=sk-1234 DATABASE_URL=postgres://...

# Set from a file
infisical secrets set CERT=@/path/to/cert.pem

# Bulk import from .env
infisical secrets set --file=./.env

# Delete secrets
infisical secrets delete API_KEY

# Generate example .env from current secrets (redacted values)
infisical secrets generate-example-env > .example-env
```

## Export secrets to files

```bash
# .env format (default)
infisical export > .env

# Shell-ready (with export keyword)
infisical export --format=dotenv-export > .env

# JSON
infisical export --format=json > secrets.json

# YAML
infisical export --format=yaml > secrets.yaml
```

## Useful flags (apply to most commands)

| Flag | Purpose |
|------|---------|
| `--env` | Environment slug (default: `dev`) |
| `--path` | Folder path within the project (default: `/`) |
| `--projectId` | Override project from `.infisical.json` |
| `--expand` | Expand `${VAR}` references (default: true) |
| `--include-imports` | Include imported secrets (default: true) |
| `--tags` | Filter by comma-separated tags |
| `--token` | Machine identity token (alternative to `INFISICAL_TOKEN` env var) |

## Secret scanning

The CLI can scan for leaked secrets in git history:

```bash
# Scan git history
infisical scan

# Scan only staged changes (pre-commit)
infisical scan git-changes --staged

# Install as git pre-commit hook
infisical scan install --pre-commit-hook
```

## Offline support

The CLI caches previously fetched secrets. If the Infisical server is unreachable, `infisical run` falls back to the cache automatically.

## Terminal security tip

Prevent secrets from appearing in shell history:

```bash
# Add to ~/.bashrc or ~/.zshrc
export HISTIGNORE="*infisical secrets set*:$HISTIGNORE"
```
