# Organizations and projects domain

For now just what License and billing need: root-org lookup, workspace count (`countWorkspaces`), billable actor
count (`countBillableOrgActors`) and its billing portal breakdown, and the per-project-type identity counts that
the secrets, pam and agent-vault counters build on.

- **Limit checks join the caller's transaction:** project create/restore call
  `within(tx).lockAndCountWorkspaces`, and identity create calls `within(tx).lockAndCountBillableOrgActors`
  with the scope from `licenseService.getSeatCountScope`. Plain reads go to the replica; these lock and count on the
  caller's transaction. See "Sharing a transaction" in `../../AGENTS.md`.

- **Declared exception:** it reads tables no domain owns yet (`organizations`, `projects`, `memberships`, `users`,
  `identities`, `groups`, `user_group_membership`, `identity_group_membership`). Those move behind the owning
  domain's service once it exists.
- **No in-memory twin:** the counters are pure SQL, so they're only tested against Postgres
  (`*.integration-test.ts`). Imports no other domain; License uses `FakeOrganizationsProjectsService` in its tests.
