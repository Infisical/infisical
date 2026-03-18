# Doc Plan

## Document Set Overview
This plan produces a single how-to guide. The request targets platform engineers who need actionable steps for rotating secrets. The content is task-oriented (not tutorial or reference), so a how-to guide is the correct Diataxis classification. All rotation methods (UI, CLI, API) are covered in separate sections within the same document since they accomplish the same task through different interfaces.

---

## Document 1: Rotate secrets

**Diataxis Type:** How-To
**File Path:** /docs/documentation/platform/secret-rotation/rotate-secrets.mdx
**Audience:** Platform engineers and administrators who manage secrets in Infisical
**Purpose:** After reading, the reader can safely rotate a secret in Infisical using their preferred method (UI, CLI, or API), verify the rotation succeeded, and ensure downstream applications receive the updated value.

### Outline

1. **Introduction**
   - One-sentence goal statement: what this guide covers.
   - Brief note distinguishing manual rotation (updating a secret value) from automated provider-based rotation (scheduled credential cycling).

2. **Prerequisites**
   - Infisical account with write access to the target project and environment.
   - For CLI: Infisical CLI installed and authenticated.
   - For API: Valid authentication token (JWT or machine identity access token).
   - For automated rotation: Pre-configured app connection with Secret Rotation permissions.

3. **How secret versioning works during rotation**
   - Every value change creates a new immutable version.
   - Versions are numbered sequentially.
   - The latest version is always the active value served to applications.
   - Previous versions remain accessible for audit and rollback.
   - Rollback is currently manual: copy old version value, update the secret (creates new version).
   - [Screenshot: Secret sidebar showing version history with multiple versions listed, highlighting the latest version at the top]

4. **Rotate a secret through the Infisical UI**
   - Step-by-step: navigate to project → find secret → open sidebar → edit value → save.
   - [Screenshot: Secret Manager dashboard with a secret selected and the value field highlighted for editing]
   - [Screenshot: Secret sidebar after saving, showing the new version at the top of the version history]

5. **Rotate a secret using the CLI**
   - Command: `infisical secrets set KEY=NEW_VALUE --env=<env>`
   - Example: rotating a database password.
   - Example: rotating a secret from a file (`KEY=@/path/to/file`).
   - Verify with `infisical secrets get KEY --env=<env>`.

6. **Rotate a secret using the API**
   - Endpoint: `PATCH /api/v4/secrets/{secretName}` with `secretValue` in the body.
   - Example curl command with authentication header.
   - Verify with `GET /api/v4/secrets/{secretName}` and optional `version` parameter.
   - List version history: `GET /api/v1/dashboard/secret-versions/{secretId}`.

7. **Verify the new secret version is active**
   - UI: Open the secret sidebar and confirm the latest version.
   - CLI: `infisical secrets get <name>` and confirm the value.
   - API: `GET /api/v4/secrets/{secretName}` without a version parameter returns the latest.
   - Check version history via the sidebar or the versions API endpoint.

8. **How applications retrieve the updated secret**
   - Table summarizing retrieval methods, update frequency, and behavior.
   - SDKs: re-fetch or wait for cache TTL expiry (~60s default).
   - Infisical Agent: polls every 5 minutes (configurable); can trigger a command on change.
   - Kubernetes Operator: event-driven, near real-time updates.
   - Kubernetes CSI: polling-based, requires `enableSecretRotation=true`.
   - CLI (`infisical run`): restart the process to pick up new values.
   - Secret Syncs: automatic push to external services.

9. **Best practices for rotating secrets safely**
   - Rotate in non-production environments first.
   - Use automated rotation (dual-phase) where available for zero-downtime.
   - Coordinate rotation with application deployment windows for single-phase rotations.
   - Use machine identities instead of user tokens for automated rotation workflows.
   - Monitor secret sync status and application health after rotation.
   - Set up secret reminders for secrets that need periodic manual rotation.
   - Keep version history for audit; use Point-in-Time Recovery for emergency rollback.

10. **Common mistakes and troubleshooting**
    - Application still using old value: check retrieval method's refresh interval or restart process.
    - Wrong environment: confirm `--env` flag or `environment` parameter matches the target.
    - Permission denied: verify role has write access to the secret path and environment.
    - Automated rotation fails: check app connection status and network connectivity to the provider.
    - Single-phase rotation causes downtime: consider switching to dual-phase rotation or disabling auto-rotation and coordinating manually.
    - Secret not appearing after rotation: check secret path and folder; confirm the secret name matches.

11. **Related resources**
    - Simple markdown bullet list linking to: secret versioning docs, Point-in-Time Recovery, CLI commands reference, API secrets reference, Infisical Agent, Kubernetes Operator, SDK documentation, automated rotation overview, app connections.

### Prerequisites
- Infisical account with project access
- Write permissions in the target environment
- CLI installed (for CLI method)
- Authentication token (for API method)

### Linking
- Links to: Secret versioning docs, PIT Recovery, CLI secrets command reference, API secrets reference, Infisical Agent docs, Kubernetes Operator docs, SDK docs, App connections docs, Automated rotation overview (if it exists)
- Linked from: Secret versioning page, secrets management overview, CLI documentation

---

## Linking Map

| Source Document | Links To | Link Context |
|-----------------|----------|--------------|
| Rotate secrets | Secret versioning docs | Section 3, when explaining version behavior |
| Rotate secrets | PIT Recovery docs | Section 3, when mentioning rollback |
| Rotate secrets | CLI secrets commands | Section 5, for full flag reference |
| Rotate secrets | API secrets reference | Section 6, for full endpoint details |
| Rotate secrets | Infisical Agent docs | Section 8, retrieval method details |
| Rotate secrets | Kubernetes Operator docs | Section 8, retrieval method details |
| Rotate secrets | SDK documentation | Section 8, retrieval method details |
| Rotate secrets | Secret syncs overview | Section 8, retrieval method details |
| Rotate secrets | App connections docs | Prerequisites, for automated rotation setup |

## Flagged Items
- [ASSUMED: The exact UI flow for editing a secret value is inferred. Exact steps may differ in the current UI.]
- [UNKNOWN: Whether webhook/event notifications exist for rotation events.]
- [UNKNOWN: Exact CASL permission names required for secret write access.]
- All [ASSUMED], [UNKNOWN] flags from the Research Brief are carried forward.
