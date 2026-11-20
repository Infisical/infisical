# Upgrade impact fragments

A fragment is a small YAML file that tells self-hosted operators what a change means for their
upgrade. The pull request that makes the change adds the fragment, so the author who has the context
writes it and it is reviewed with the code. Each release then collects the fragments added since the
previous release into `upgrade-impact/data/releases/<version>.yaml`, which feeds the Helm chart
upgrade notes.

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

## Rules

- Never edit, rename or delete a fragment after its pull request merges. A release owns the
  fragments added in its range, so a moved file would be counted again and an edit would never ship.
  To correct a released note, edit that release's file under `upgrade-impact/data/releases/`.
- Tick **Yes** under "Self-hosted upgrade impact" in the pull request description. CI fails when the
  box and the files disagree.
