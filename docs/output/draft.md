# Rotate secrets

This guide covers how to rotate a secret in Infisical — update its value so that applications use a new credential — using the UI, CLI, or API.

Infisical supports two forms of rotation:

- **Manual rotation**: You update a secret's value directly. Infisical creates a new version automatically.
- **Automated rotation**: Infisical rotates credentials on a schedule through provider integrations (e.g., PostgreSQL, AWS IAM, Auth0). [LINK NEEDED: automated secret rotation overview](/documentation/platform/secret-rotation/overview — this page was removed and may need to be recreated or redirected).

This guide focuses on manual rotation. It also explains how versioning works during rotation, how to verify the new value is active, and how downstream applications pick up the change.

## Prerequisites

Before rotating a secret, ensure you have:

- An Infisical account with **write access** to the target project and environment.
- For the CLI method: the [Infisical CLI](/cli/overview) installed and authenticated (`infisical login`).
- For the API method: a valid authentication token — either a user JWT or a [machine identity](/documentation/platform/identities/machine-identities) access token.

## How secret versioning works during rotation

Every time you change a secret's value, Infisical creates a new immutable version. Versions are numbered sequentially starting at 1. The latest version is always the active value that applications receive.

Previous versions remain accessible for auditing and rollback. To roll back to an earlier version, copy that version's value and update the secret. This creates a new version with the old value rather than reverting in place.

[Screenshot: Secret sidebar showing version history with multiple versions listed and the latest version highlighted at the top]

Version history connects to [Point-in-Time Recovery](/documentation/platform/pit-recovery), which allows restoring an entire environment's secrets to a previous state.

<Note>
  Projects have a configurable version retention limit. Infisical automatically prunes the oldest versions beyond this limit.
</Note>

## Rotate a secret through the Infisical UI

1. Navigate to your project in the Infisical dashboard.
2. Select the environment that contains the secret (e.g., **Production**).
3. Locate the secret you want to rotate in the secrets list.
4. Click on the secret to open the secret sidebar.

[Screenshot: Secret Manager dashboard with a secret row selected, showing the secret sidebar opening on the right side of the screen]

5. Clear the **Value** field and enter the new secret value.
6. Click **Save**.

Infisical creates a new version automatically. The version history in the sidebar updates to show the new version at the top.

[Screenshot: Secret sidebar after saving, showing the new version number at the top of the version history list]

## Rotate a secret using the CLI

Use the `infisical secrets set` command to update a secret's value. This creates a new version.

```bash
infisical secrets set <KEY>=<NEW_VALUE> --env=<environment>
```

### Examples

Rotate a database password in production:

```bash
infisical secrets set DB_PASSWORD=new-secure-password-123 --env=prod
```

Rotate multiple secrets at once:

```bash
infisical secrets set API_KEY=new-api-key DB_PASSWORD=new-db-password --env=prod
```

Set a secret value from a file (e.g., rotating a certificate):

```bash
infisical secrets set CERTIFICATE=@/path/to/new-cert.pem --env=prod
```

Rotate a secret in a specific folder path:

```bash
infisical secrets set DB_PASSWORD=new-password --env=prod --path=/services/api
```

### Key flags

| Flag | Default | Description |
|------|---------|-------------|
| `--env` | `dev` | Target environment |
| `--path` | `/` | Secret folder path |
| `--type` | `shared` | Secret type (`shared` or `personal`) |
| `--projectId` | From `.infisical.json` | Project ID (required with machine identity auth) |

See the [CLI secrets command reference](/cli/commands/secrets) for all available flags.

## Rotate a secret using the API

Send a `PATCH` request to update the secret's value. This creates a new version.

```bash
curl --request PATCH \
  --url https://app.infisical.com/api/v4/secrets/DB_PASSWORD \
  --header 'Authorization: Bearer <your-access-token>' \
  --header 'Content-Type: application/json' \
  --data '{
    "projectId": "<your-project-id>",
    "environment": "prod",
    "secretValue": "new-secure-password-123",
    "secretPath": "/"
  }'
```

The response includes the updated secret object with the new version number.

### Retrieve a specific version

To retrieve a specific version of a secret, include the `version` query parameter:

```bash
curl --request GET \
  --url 'https://app.infisical.com/api/v4/secrets/DB_PASSWORD?projectId=<your-project-id>&environment=prod&version=3' \
  --header 'Authorization: Bearer <your-access-token>'
```

Omit the `version` parameter to retrieve the latest version.

### List version history

To list all versions of a secret, use the version history endpoint:

```bash
curl --request GET \
  --url 'https://app.infisical.com/api/v1/dashboard/secret-versions/<secret-id>?offset=0&limit=10' \
  --header 'Authorization: Bearer <your-jwt-token>'
```

<Important>
  The version history endpoint requires JWT authentication. Machine identity tokens are not supported for this endpoint.
</Important>

See the [API secrets reference](/api-reference/endpoints/secrets/read) for full endpoint documentation.

## Verify the new secret version is active

After rotating a secret, confirm the update succeeded:

- **UI**: Open the secret sidebar. The latest version appears at the top of the version history. Confirm the version number incremented and the value matches what you set.
- **CLI**: Run `infisical secrets get <KEY> --env=<environment>` and confirm the returned value matches the new value.
- **API**: Send a `GET /api/v4/secrets/{secretName}` request without a `version` parameter. The response contains the latest (active) version.

## How applications retrieve the updated secret

After rotation, applications receive the new value based on their retrieval method. The table below summarizes how each method detects and fetches updated secrets.

| Retrieval method | Update mechanism | Default frequency | Action required |
|-----------------|------------------|-------------------|-----------------|
| [**SDKs**](/sdks/overview) (Node.js, Python, Go, Java, .NET) | Re-fetch on next call | Cache TTL (~60s for Python) | Wait for cache expiry or re-initialize the client |
| [**Infisical Agent**](/integrations/platforms/infisical-agent) | Polling | Every 5 minutes (configurable) | No action; optionally configure a command to run on change |
| [**Kubernetes Operator**](/integrations/platforms/kubernetes/overview) | Event-driven watch | Near real-time | No action; operator auto-updates Kubernetes Secrets |
| **Kubernetes CSI Provider** | Polling | Every 2 minutes (if enabled) | Enable `enableSecretRotation=true` in CSI driver config |
| [**Secret Syncs**](/integrations/secret-syncs/overview) | Push-based | Automatic | No action; secrets sync to external services automatically |
| **CLI (`infisical run`)** | Per process start | One-time | Restart the application process |
| **Docker (`infisical export`)** | Per container start | One-time | Restart the container |

For applications using `infisical run` or Docker environment injection, restart the process or container after rotation to pick up the new value.

For SDK-based applications, the new value is available after the cache TTL expires. To force an immediate refresh, re-initialize the SDK client.

## Best practices for rotating secrets safely

- **Rotate in non-production first.** Test the rotation in a development or staging environment before applying it to production.
- **Use automated rotation where available.** Dual-phase automated rotation maintains two valid credential sets simultaneously, eliminating downtime during the transition.
- **Coordinate single-phase rotations.** For providers that invalidate old credentials immediately (Auth0, LDAP), schedule rotation during a maintenance window or coordinate with application restarts.
- **Use machine identities for automation.** When rotating secrets through the API in CI/CD pipelines or scripts, use [machine identity](/documentation/platform/identities/machine-identities) tokens instead of user JWTs.
- **Monitor after rotation.** Check application health and logs after rotating a secret. Verify that downstream services successfully authenticate with the new credential.
- **Set reminders for manual rotations.** Use Infisical's secret reminder feature to get notified when a secret is due for rotation.
- **Retain version history.** Keep version history enabled for audit trails. Use [Point-in-Time Recovery](/documentation/platform/pit-recovery) for emergency rollback of an entire environment.

## Common mistakes and troubleshooting

**Application still uses the old value**
Check the retrieval method's refresh interval. SDK caches expire after ~60 seconds by default. The Infisical Agent polls every 5 minutes. For `infisical run` or Docker-based injection, restart the process or container.

**Rotation applied to the wrong environment**
Verify the `--env` flag (CLI) or `environment` field (API) matches the target environment. Infisical environments are independent — rotating a secret in `dev` does not affect `prod`.

**Permission denied error**
Confirm your account or machine identity has write permissions for the target secret path and environment. Check the project's role assignments.

**Automated rotation fails**
Verify the app connection is active and has the correct permissions. Check that Infisical has network access to the target system (database, cloud provider, LDAP server). Review the rotation status in the Infisical dashboard for error details.

**Single-phase rotation causes application downtime**
Single-phase rotation invalidates old credentials immediately. Switch to a dual-phase rotation provider if available, or disable auto-rotation and coordinate the rotation with an application restart.

**Secret not visible after rotation**
Confirm the secret path (`--path` or `secretPath`) matches where the secret is stored. Secrets in nested folders are not visible at the root path.

## Related resources

- [Secret versioning](/documentation/platform/secret-versioning)
- [Point-in-Time Recovery](/documentation/platform/pit-recovery)
- [CLI secrets commands](/cli/commands/secrets)
- [API secrets reference](/api-reference/endpoints/secrets/read)
- [Machine identities](/documentation/platform/identities/machine-identities)
- [Infisical Agent](/integrations/platforms/infisical-agent)
- [Kubernetes Operator](/integrations/platforms/kubernetes/overview)
- [SDK documentation](/sdks/overview)
- [Secret syncs](/integrations/secret-syncs/overview)

## Flags

- [ASSUMED: The exact UI steps for editing a secret value are inferred from the secret versioning documentation and project drawer references. The click-by-click flow may differ in the current UI.]
- [UNKNOWN: Whether webhook or event notifications exist that fire when a secret is rotated.]
- [UNKNOWN: Exact CASL permission names required for secret write access.]

## Link Flags

- [LINK NEEDED: automated secret rotation overview] — The page at `/documentation/platform/secret-rotation/overview` was deleted on the current branch. A replacement page for automated rotation setup instructions needs to be created or a redirect provided.
- All other internal links validated against the docs directory and confirmed to exist.
