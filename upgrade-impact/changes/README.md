# Upgrade impact fragments

A fragment is a small YAML file that tells self-hosted operators what a change means for their
upgrade. The pull request that makes the change adds the fragment, so the author who has the context
writes it and it is reviewed with the code. Each release then collects the fragments added since the
last release that has upgrade impact data into `upgrade-impact/data/releases/<version>.yaml`, which feeds the Helm chart
upgrade notes, and its release pull request deletes them from this directory. What is here is what
has not been released yet.

## When a change needs one

Add a fragment when a self-hosted operator has to do or know something to upgrade safely:

- **`breaking`**: an API, CLI flag, default or behavior that existing setups rely on was removed or changed.
- **`config`**: an environment variable was removed, renamed, made required, or had its default changed.
- **`deployment`**: the Docker image, required Postgres or Redis version, ports, entrypoint or startup order changed.
- **`database`**: a migration that is long-running, runs outside a transaction, or cannot be rolled back.
- **`known-issue`**: something an operator should check before or after upgrading.

Everything else needs none: features, fixes, refactors, docs, and changes that only affect Infisical
Cloud. Ordinary additive migrations need none either, because the release lists them automatically.

## Format

Create `upgrade-impact/changes/<short-kebab-case-name>.yaml`, one file per change:

```yaml
category: config # breaking | config | deployment | database | known-issue
impactLevel: medium # low | medium | high
title: REDIS_URL is required at startup
description: Infisical no longer starts without REDIS_URL. Earlier versions fell back to an in-memory queue.
action: Set REDIS_URL to your Redis connection string before upgrading.
```

- `title`: what changed, in a few words.
- `description`: what is different for a running instance, written for an operator, not an implementer.
- `action`: the exact step to take, or "No action required" with what to expect.
- `impactLevel`: `high` when the upgrade fails or loses data without the action, `medium` when
  something stops working until the action is taken, `low` when it is only worth knowing.

Run `make validate-upgrade-impact` to check the file.

## Examples

These are illustrative, not real Infisical changes. Each one is a whole file.

A removed endpoint (`breaking`):

```yaml
category: breaking
impactLevel: medium
title: Legacy service token login endpoint removed
description: POST /api/v1/auth/service-token/login now returns 404. Scripts and CI jobs that still call it can no longer authenticate.
action: Before upgrading, move those clients to a machine identity with Universal Auth and call POST /api/v1/auth/universal-auth/login.
```

A changed default (`config`):

```yaml
category: config
impactLevel: high
title: Audit log retention defaults to 90 days
description: Instances that never set AUDIT_LOG_RETENTION_DAYS kept audit logs forever. They now delete logs older than 90 days.
action: To keep the old behavior, set AUDIT_LOG_RETENTION_DAYS=0 before upgrading.
```

A new runtime requirement (`deployment`):

```yaml
category: deployment
impactLevel: high
title: PostgreSQL 14 or newer is required
description: Startup migrations use syntax that PostgreSQL 13 rejects, so Infisical does not start against a 13 database.
action: Upgrade the database to PostgreSQL 14 or newer before upgrading Infisical.
```

A migration that needs planning (`database`):

```yaml
category: database
impactLevel: medium
title: Secret versions backfill runs at startup
description: The migration rewrites every row in secret_versions_v2. On tables above 10 million rows it can take over 30 minutes, and Infisical does not serve traffic until it finishes.
action: Upgrade during a maintenance window and raise your orchestrator's startup timeout so the container is not restarted mid-migration.
```

A known problem (`known-issue`):

```yaml
category: known-issue
impactLevel: low
title: SAML logins fail behind proxies that strip X-Forwarded-Proto
description: SAML callback URLs are now built from the forwarded protocol. A proxy that does not send X-Forwarded-Proto produces an http callback that the identity provider rejects.
action: Configure your proxy to send X-Forwarded-Proto, or set SITE_URL to the https address.
```

### Changes that need no fragment

- **A new optional environment variable** whose unset value keeps the old behavior. Nobody has to act.
- **A migration that adds a table, a nullable column or an index.** The release lists migrations by itself.
- **A removed endpoint that only the Infisical frontend called**, when the frontend ships in the same image.
- **A changed default that only applies on Infisical Cloud**, or behind a license flag that self-hosted instances cannot have.
- **A bug fix that makes Infisical reject input it should always have rejected**, unless working setups depended on the bug. If they did, it is `breaking`.
- **A new feature**, however large. Operators find those in the changelog.

### Writing the action

The action is the line an operator follows, so it has to name the thing to change and when.

| Too vague | Specific |
|---|---|
| Review your configuration before upgrading. | Set `REDIS_URL` to your Redis connection string before upgrading. |
| Update any automation that relies on this endpoint. | Change clients that call `POST /api/v1/x` to call `POST /api/v2/x`, which takes the same body. |
| Make sure migrations complete. | If startup fails during the migration, keep the previous version running and check the migration logs before retrying. |

When there is truly nothing to do, say so and say what to expect: "No action required. The first startup after upgrading takes a few minutes longer."

## Rules

- Never edit, rename or delete a fragment after its pull request merges. The release pull request
  deletes the fragments it collected. Until it merges, a released fragment is still here, and a
  moved one would be counted again while an edit would never ship. To correct a released note, edit
  that release's file under `upgrade-impact/data/releases/`. CI fails a pull request that edits or
  renames a fragment already on its base branch.
- Tick **Yes** under "Self-hosted upgrade impact" in the pull request description. CI fails when the
  box and the files disagree.
- On pull requests from this repository that touch backend, Docker or config paths, an automated
  review compares the changes with the fragments. It comments only when they disagree, with a
  fragment to add, change or remove, and it never blocks the pull request. Run it locally with
  `npm run review:pr -- --base origin/main` from `upgrade-impact/` (needs `OPENAI_API_KEY`).
