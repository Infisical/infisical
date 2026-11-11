# Access Control domain

A base domain: memberships at org, project and resource scope (`memberships`, `membership_roles`), custom roles
(`roles`), privileges and folder grants (`additional_privileges`), groups and their members (`groups`,
`user_group_membership`, `identity_group_membership`) and attributes (`identity_metadata`). It also holds the
building blocks every scope owner builds its permission function on. It depends on no other domain; its only
dependency is the event emitter.

- **No permission checks here, and no roles.** Access Control returns grants as plain data (`fetchGrants` gives
  `ActorGrants`) and never decides what a role means. The scope owner resolves roles: Organizations for org roles,
  Projects (through `productAccessRegistry`) for project roles, each product for its resource roles. Callers
  authorize before they call a write.
- **Never read or write these tables from outside**: go through `accessControlDomain`. Never call License; callers
  check entitlements and emit meters.
- **Caching:** `withCache` caches a value an owner builds from one actor's grants in one project, revalidated
  against `grantsFingerprint` plus the owner's `extraFingerprint` (project deletion state, folder version). Cached
  values are JSON, so pass `revive` for dates. A temporary grant is filtered by time on every read, never cached as
  active.
- **Rule composition:** CASL lets the last matching rule decide, so the order an owner combines rule sets in is
  part of the answer. Compose with the helpers in `ce/service/rule-composition.ts`, never by concatenating arrays:

  | Helper | Order | Used by |
  | --- | --- | --- |
  | `mergeRoles({ layers })` | union, `cannot` rules last | Projects, Organizations |
  | `overrideAt({ base, overrides })` | base, then overrides last, so they win where their conditions match | Secrets folder grants |
  | `scopedGrants({ deny, allow, conditions })` | a deny block then an allow block under the same conditions | Secrets, one per folder grant |
  | `closestWins({ layers })` | farthest first, closest last | PAM account over folder |
  | `withFallback({ primary, fallback, when })` | primary, else the fallback when the condition holds | Cert Manager and Code Signing project-admin fallback |

- **Permission objects:** owners return a `Permission` subclass (`can`, `assert`, `rules`, `pack`). `assert` throws
  CASL's `ForbiddenError`, which the error handler turns into the 403 body and the permission-denied audit hook reads.
- Removal events (`ce/service/access-control-events.ts`) keep the type strings the `org-access-reconcile` consumer
  subscribes to; emit them in the transaction that deletes the rows.
