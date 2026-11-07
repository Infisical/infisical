# Organizations and projects domain

Holds only usage counting for now: the `identities` and `user_identities` counters, the billable-actor queries the billing portal breaks down, and the per-project-type identity counts that `secrets-manager/secrets`, `pam/pam` and `agent-vault/agent-vault` build their counters on. It grows as Organizations and projects moves into domains.

- **Declared exception:** its queries read tables this domain does not own yet (`organizations`, `projects`, `memberships`, `users`, `identities`, `groups`, `user_group_membership`, `identity_group_memberships`). When the owning
  domain exists, these reads move behind that domain's service.
- **No in-memory twin:** the counters are SQL whose whole job is the query, so they are tested against
  Postgres only (`*.integration.spec.ts`). The License domain tests its side with `FakeUsageCounter`.
