# Projects domain

The container every product's projects live in, below Organizations. Holds what License and billing need for now: the `identities` and `user_identities` counters and the workspace count it registers with License (`countWorkspaces`, also used by project create and restore), the billable-actor queries the billing portal breaks down, and the per-project-type identity counts that `secrets-manager/secrets`, `pam/pam` and `agent-vault/agent-vault` build their counters on. The project rule schema (`service/permission/project-permission.ts`) and the generic project roles (`project-roles.ts`) live here. It grows as projects move into domains.

- **Declared exception:** its counter queries read tables this domain does not own yet (`organizations`, `memberships`, `users`, `identities`, `groups`, `user_group_membership`, `identity_group_memberships`). When the owning
  domain exists, these reads move behind that domain's service.
- **No in-memory twin:** the counters are SQL whose whole job is the query, so they are tested against
  Postgres only (`*.integration.spec.ts`). The License domain tests its side with `FakeUsageCounter`.
- **Project permissions:** `getProjectPermission` resolves the actor's roles through `productAccessRegistry`: a
  product's registered default roles (or the generic ones) and its override for custom roles (or the customer's
  rules as written). A product with its own layers (Secrets folder grants) builds on `getProjectRules` and passes
  its composed rules to `ProjectPermission.build`, the only constructor, which fills `{{identity.*}}` placeholders
  and narrows a delegated OAuth token last. Never build a project ability any other way.
- **Product checks call the product's function** (`getSecretsPermission`, `getPamPermission`, `getKmsPermission`,
  ...); `getProjectPermission` is for checks every project type shares.
- **Resource permissions** (PAM folders and accounts, certificate applications, signers, Agent Vault bundles) go
  through `getProjectResourcePermission` with the product's `TResourceRoles`, so delegated tokens, non-members and
  project admins are treated the same everywhere.

