# Access Control domain

Who holds what: memberships at the org, project and resource scopes with their role assignments, custom roles,
additional privileges (folder grants included), groups and their members, and identity attributes. It knows what
no role means: every scope owner (Organizations, Projects, each product) decides that, and builds its permission
from what Access Control returns.

- **Read side only, for now.** One read-only `GrantStore` reads `memberships`, `membership_roles`, `roles`,
  `additional_privileges`, `groups`, `user_group_membership`, `identity_group_membership` and `identity_metadata`,
  so a check costs the round trips it always has. The legacy membership, role, privilege and group services still
  write those tables; they move here, with a store per entity, in the membership write phase. New code reads them
  only through `actorGrantsService`, `roleService` and `groupService`.
- **`ActorGrants` is what an actor holds at one scope**, groups expanded. `active(now)` gives the `Grant`s in force
  (expired temporary roles and privileges dropped on every read, whatever a cache holds); `distinctActiveGrants`
  is what a privilege boundary compares against (each role once by slug, no-access left out, then privileges).
  A `Grant` is a built-in slug or a custom role or privilege with its own rules; `isBuiltIn("admin")` is never
  true for a custom role, whatever it is called.
- **Rule order is the precedence.** CASL lets the last matching rule decide. `RuleSet.merge` holds roles together
  with cannot rules last (a deny from one role is not undone by another's allow); `then` puts a later layer after
  (it decides where it matches). Product-specific orderings (Secrets' folder grants, a project admin's resource
  rules) live in the product, built from these two.
- **`Permission` is the check.** `can` / `assert({ action, subject, fields })`; `assert` throws
  `PermissionDeniedError` with the denial the 403 body and the permission-denied audit log report. `assertBounds`
  refuses a change to another actor's roles or privileges under either privilege system, with
  `PermissionDeniedError` named `PermissionBoundaryError` (`boundsViolations` returns the missing permissions
  instead);
  `toAbility()` is for legacy code that still reads a CASL ability.
- **Caching:** `getCachedProjectGrants` serves an actor's project grants from `ActorGrantsCache` (Redis, marker 10s,
  data 10 min) while their fingerprint (memberships at the org, project and its resources, role assignments, custom
  roles, project privileges, attributes) is unchanged, so a membership or role change needs no invalidation call.
  Org and resource grants are read on every call.
- **Depends on no domain** and does no permission checks: callers authorize first.
- Tests: `testing/build-access-control.ts` builds the services on `InMemoryGrantStore`, seeded through
  `testing/grant-fixture.ts`; the grant store contract (`testing/grant-store-contract.ts`) runs in memory and on
  Postgres. Other domains' tests use `FakeActorGrantsService` or `testing/access-control-services.ts` (Postgres).
