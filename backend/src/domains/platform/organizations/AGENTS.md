# Organizations domain

For now what License, billing and the products need about orgs: root-org lookup (`findRootOrgId`,
`resolveRootOrgId`), the org's name and slug (`findOrganization`), and the billable actor count
(`countBillableOrgActors`) with its billing portal breakdown.

- **Seat limits join the caller's transaction:** identity create calls
  `within(tx).lockAndCountBillableOrgActors` with the scope from `licenseService.getSeatCountScope`. Plain reads go to
  the replica; this locks and counts on the caller's transaction. See "Sharing a transaction" in `../../AGENTS.md`.
- **Declared exception:** it reads tables no domain owns yet (`organizations`, `projects`, `memberships`, `users`,
  `identities`, `user_group_membership`, `identity_group_membership`). Those move behind the owning domain's service
  once it exists.
- **No in-memory twin:** the counters are pure SQL, so they're only tested against Postgres
  (`*.integration-test.ts`). Imports no other domain; License uses `FakeOrganizationsService` in its tests.
