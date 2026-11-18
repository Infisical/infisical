# Projects domain

What a project permission is, and what License and the product meters need about projects.

- **Project permission:** `projectPermissionService.getProjectPermission({ actor, projectId, type? })` for checks
  every project type shares and for products whose roles are all they need (Cert Manager, Secret Scanning, KMS);
  `getProjectAccess` / `findProjectAccess` give a product the `ProjectAccess` to add its own rules to (Secrets).
  It refuses another org's project (403), a project of another type (400) and a non-member (403
  `ProjectMembershipNotFound`) with the legacy messages, and applies an assumed privilege only inside its project.
- **What roles mean is the product's.** A product whose project roles differ from the generic admin, member, viewer
  and no-access implements `TProjectRoles` and `domains.ts` passes it in `projectRoles` (PAM and Agent Vault:
  admin or member for anything else; KMS: generic plus `cryptographic-operator`). A type with none gets
  `StandardProjectRoles.generic`. Two for one type are refused at boot.
- **Resource permissions:** `projectResourcePermissionService.getResourcePermission({ ..., roles })` for a
  product's resources (PAM folders and accounts, certificate applications, signers), with the product's
  `TResourceRoles`: roles held on the resources together, the project-admin rules on top for a built-in project
  admin, nothing for a delegated OAuth token, and the legacy refusal for anyone else.
- **Caching:** the project row in `ProjectCache` (fingerprint: its deletion state) and the actor's grants in Access
  Control's cache, both read per request through `ActorContextMemo`.
- **Billing reads:** the workspace count (`countWorkspaces`, with `within(tx).lockAndCountWorkspaces` for project
  create and restore) and the per-project-type user and identity counts the product meters bill. `findProject`
  reads a project for a caller that need not be a member.
- **Declared exception:** it reads tables no domain owns yet (`organizations`, `projects`, `memberships`, `users`,
  `identities`, `user_group_membership`, `identity_group_membership`). Those move behind the owning domain's service
  once it exists.
- Tests: model and service tests on in-memory stores; `testing/projects-module.ts` builds the module on Postgres.
  The parity spec (`services/project-permission/permission-parity.integration-test.ts`) compares the domains
  against the legacy engine and goes away with it.
