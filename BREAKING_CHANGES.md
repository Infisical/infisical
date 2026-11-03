# Breaking changes

A change is breaking when a self-hosted deployment, API client, or integration that works on one release fails or behaves differently on the next without the operator doing something first. Self-hosted operators upgrade on their own schedule, often skip several versions, run automation against our API, and run old and new pods side by side during a rolling deploy. Every breaking change we ship lands on them, and [upgrade.infisical.com](https://upgrade.infisical.com/) is where they find out what to do.

Most breaking changes we have shipped were not obvious ones like deleting a route. They came from tightening validation, changing a default, or moving data, where the author saw a fix and the operator saw an outage. The categories below come from real releases (see `upgrade-impact/data/releases/`).

## When your change matches a category

1. Make it backward compatible if you can. Each category lists the usual way to do that.
2. If the break is deliberate, tick `Breaking` in the PR template and add a `## Breaking change` section to the PR description covering:
    - what stops working, and for whom
    - what the operator has to do before or after upgrading
    - whether old and new versions can run side by side during the rollout

The upgrade impact generator reads PR descriptions, so this section becomes the upgrade notes for the release.

## Categories

### Endpoint removed, moved, or method changed

Removing a route, renaming its path, or switching its HTTP method returns 404 to every client still calling it.

- [#8547](https://github.com/Infisical/infisical/pull/8547) moved Agent Vault member revoke from `POST .../members/revoke` to `DELETE .../members`, and replaced the per-actor `PATCH .../members/{actorType}/{actorId}` with a bulk `PATCH .../members`.
- [#6085](https://github.com/Infisical/infisical/pull/6085) removed the upgrade-path API and page.

Compatible alternative: add the new route and keep the old one working, then remove the old one in a later release once it is marked deprecated.

### Response or request shape changed

Dropping a response field, renaming it, changing its type, or ignoring a request field that used to do something breaks clients that read or send it. Our own CLI, SDKs, Terraform provider, and Kubernetes operator are clients too.

- [#8373](https://github.com/Infisical/infisical/pull/8373) keyed Agent Vault member responses by actor and dropped the membership `id`.
- [#8550](https://github.com/Infisical/infisical/pull/8550) dropped `isSecret` and `value` from Agent Vault variable responses, and now ignores `isSecret` on requests.

Compatible alternative: add the new field next to the old one. Adding an optional field is safe.

### Stricter validation or verification

Rejecting input or a setup that used to be accepted breaks deployments that relied on it, even when the old behavior was a bug.

- Identity auth started enforcing TLS verification for OIDC, JWT JWKS, and Kubernetes endpoints (v0.159.24). Endpoints using self-signed or internal CA certificates stopped working.
- TLS certificate auth started enforcing `clientAuth` usage, CA name constraints, and path length limits (v0.162.24). Existing chains that violated them failed login.
- [#8509](https://github.com/Infisical/infisical/pull/8509) started rejecting LDAP auth template URLs on private IPs.

Compatible alternative: keep the old behavior behind a setting with the stricter one as the default for new resources, or document the exact operator action (eg "add the issuing CA to the auth method") in the PR.

### Defaults or processing order changed

Changing what a value defaults to, or the order in which defaults and checks apply, changes the outcome for existing resources without any error.

- [#7696](https://github.com/Infisical/infisical/pull/7696) applied certificate profile defaults before policy validation in ACME and SCEP, so CSRs that used to be rejected now pass.

Compatible alternative: apply the new default only to resources created after the change.

### Permissions tightened

Requiring a different or narrower permission for an existing action returns 403 to roles that used to succeed, including built-in roles.

- [#8509](https://github.com/Infisical/infisical/pull/8509) made org identity credential operations check only the specific identity action, so the built-in Member role on the legacy privilege system started getting 403. Editing an auth template started requiring edit-auth on every linked identity.

Compatible alternative: grant the new permission to the roles that held the old one in a migration, or keep accepting the old permission for a release.

### Feature disabled or removed

Turning off creation or use of a feature breaks automation that still depends on it, even when existing resources keep working.

- [#7501](https://github.com/Infisical/infisical/pull/7501) made `POST /integration` always return 400, ending native integration creation in favor of Secret Syncs.

Compatible alternative: there is rarely one. Call it out with the migration path.

### Column or table dropped

Dropping a column or table breaks scripts and integrations that query it directly, and breaks old pods that still read it during a rolling deploy.

- [#7792](https://github.com/Infisical/infisical/pull/7792) dropped `trustSamlEmails` and `trustOidcEmails` from the super admin table.
- [#8550](https://github.com/Infisical/infisical/pull/8550) dropped the Agent Vault `isSecret` column on startup.

Compatible alternative: stop reading the column in one release and drop it in a later one, so old pods never see it missing.

### Old and new versions cannot run side by side

A migration or storage change that old pods, CLIs, or agents cannot handle breaks the window where both versions run (a rolling deploy, or a CLI upgraded later than the server).

- [#8497](https://github.com/Infisical/infisical/pull/8497) moved Agent Vault session logs from Postgres to S3 and Redis. Old pods returned 500s for session lists after the migration, and older CLI builds were refused for chunk uploads.

Compatible alternative: write to both locations for a release, or have the new version accept the old client protocol until clients catch up.

### Environment variable renamed, removed, or reinterpreted

Renaming or removing an env var in `backend/src/lib/config/env.ts`, or changing what its value means, breaks deployments configured with the old name or value.

Compatible alternative: read the old name as a fallback for the new one.

### Audit log event field renamed, retyped, or removed

These bodies go to customer SIEMs unchanged, so changing a field silently breaks rules built on it. See the audit log section of [`backend/CODE_QUALITY.md`](backend/CODE_QUALITY.md).

Compatible alternative: add a new field and leave the old one.
