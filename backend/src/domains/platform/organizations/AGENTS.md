# Organizations domain

What every request and every domain needs about orgs.

- **Org permission:** `orgPermissionService.getOrgPermission({ actor, orgId?, scope? })` returns an `OrgPermission`
  built from the actor's org roles and privileges (`OrgRoles`: built-in roles as defined in
  `models/org-permission-set.ts`, a custom role or privilege as its own rules). It refuses another org, a
  non-member and the wrong org level with the legacy messages. A delegated OAuth token keeps only what its scopes
  allow and holds no roles (`hasRole` is false). `getOrgPermissionByRoles` and `getGrantPermissions` build
  permissions from roles and from another member's grants, for privilege boundaries.
- **Actor context:** `actorContextService.forRequest({ principal, orgId })` builds `req.permission` once per
  request (the org with its root's SSO policy, read through `OrganizationStore.findActorOrg`) and returns any SSO
  refusal for the auth plugin to turn into a 401; `forPrincipal` and `system` build one for queues, crons and
  consumers. An unscoped request's `org` throws when read.
- **SSO is a session property, checked once per request, never in a permission service.**
  `ssoSessionService.findSsoSessionRefusal({ principal, org })` applies the root org's `SsoPolicy` and looks the
  bypass up (the user's root org roles) only when the policy refuses. Flows that act on another org than the
  request's call it for that org.
- **Billing reads:** root-org lookup (`findRootOrgId`, `resolveRootOrgId`), the org's name and slug
  (`findOrganization`), and the billable actor count (`countBillableOrgActors`) with its billing portal breakdown.
  Identity create calls `within(tx).lockAndCountBillableOrgActors` with the scope from
  `licenseService.getSeatCountScope`; see "Sharing a transaction" in `../../AGENTS.md`.
- **Declared exception:** it reads tables no domain owns yet (`organizations`, `projects`, `memberships`, `users`,
  `identities`, `user_group_membership`, `identity_group_membership`). Those move behind the owning domain's service
  once it exists.
- Tests: model and service tests run on Access Control's in-memory grant store and `testing/` helpers; the counters
  and `findActorOrg` are pure SQL, tested on Postgres (`*.integration-test.ts`). License uses
  `FakeOrganizationsService`.
