# Organizations and projects domain

For now just what License and billing need: root-org lookup, workspace count (`countWorkspaces`, also used by
project create/restore), billable actor count (`countBillableOrgActors`) and its billing portal breakdown, and the
per-project-type identity counts that the secrets, pam and agent-vault counters build on.

- **Declared exception:** it reads tables no domain owns yet (`organizations`, `projects`, `memberships`, `users`,
  `identities`, `groups`, `user_group_membership`, `identity_group_memberships`). Those move behind the owning
  domain's service once it exists.
- **No in-memory twin:** the counters are pure SQL, so they're only tested against Postgres
  (`*.integration.spec.ts`). Imports no other domain; License uses `FakeOrganizationsProjectsService` in its tests.
