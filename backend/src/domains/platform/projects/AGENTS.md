# Projects domain

The container every product's projects live in, below Organizations. Holds what License and billing need for now: the `identities` and `user_identities` counters and the workspace count it registers with License (`countWorkspaces`, also used by project create and restore), the billable-actor queries the billing portal breaks down, and the per-project-type identity counts that `secrets-manager/secrets`, `pam/pam` and `agent-vault/agent-vault` build their counters on. The project rule schema (`service/permission/project-permission.ts`) and the generic project roles (`project-roles.ts`) live here. It grows as projects move into domains.

- **Declared exception:** its counter queries read tables this domain does not own yet (`organizations`, `memberships`, `users`, `identities`, `groups`, `user_group_membership`, `identity_group_memberships`). When the owning
  domain exists, these reads move behind that domain's service.
- **No in-memory twin:** the counters are SQL whose whole job is the query, so they are tested against
  Postgres only (`*.integration.spec.ts`). The License domain tests its side with `FakeUsageCounter`.
