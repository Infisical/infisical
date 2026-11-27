# PAM domain

Holds the `pam_identities` usage counter and the PAM roles and permission for now. More moves in later.

- Counts through Projects (`projectsService.countProjectIdentities`), which owns the
  membership queries, so this domain reads no tables.
- **Project roles** (`PamProjectRoles`, which `domains.ts` passes to Projects in `projectRoles`): the built-in
  `admin` is the product admin with the full project admin rules; every other slug, a custom role included, is a
  member with directory reads only. What a member may do comes from folder and account roles, never project roles.
- **Every folder and account check** calls `pamPermissionService.getPamPermission`. Projects builds it
  (`getResourcePermission`) from the actor's roles on the folder and then the account, counted together, so a folder
  role reaches every account in the folder. Roles are `admin`, `operator`, `connector` and `auditor`
  (`PamFolderRoles`, `PamAccountRoles`); any other slug, `custom` included, is `PamRoleInvalid`.
- **The product admin gets nothing** on a folder or account it holds no role on (`projectAdminRules()` is empty), but
  is not refused: `isProjectAdmin` on the result is how callers tell. Anyone else with no role is refused, naming
  the last resource checked.
