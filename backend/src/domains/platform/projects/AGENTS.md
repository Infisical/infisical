# Projects domain

For now what License and the product meters need about projects: the workspace count (`countWorkspaces`) and the
per-project-type user and identity counts the secrets, pam and agent-vault meters bill (`countProjectIdentities`,
`countProjectIdentitiesByKind`, `getProjectIdentityBreakdown`).

- **Workspace limits join the caller's transaction:** project create and restore call
  `within(tx).lockAndCountWorkspaces`. Plain reads go to the replica; this locks and counts on the caller's
  transaction. See "Sharing a transaction" in `../../AGENTS.md`.
- **Declared exception:** it reads tables no domain owns yet (`organizations`, `projects`, `memberships`, `users`,
  `identities`, `user_group_membership`, `identity_group_membership`). Those move behind the owning domain's service
  once it exists.
- **No in-memory twin:** the counters are pure SQL, so they're only tested against Postgres
  (`*.integration-test.ts`). Imports only Organizations' module (for `TIdentityOwnership`); License uses
  `FakeProjectsService` in its tests.
