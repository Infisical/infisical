# KMS domain

Holds the KMS project roles and permission for now. More moves in as KMS (CMEK, KMIP) moves into domains.

- **Roles:** KMS projects get the generic project roles plus `cryptographic-operator` (`kmsProjectRoles`), which
  `domains.ts` passes to Projects in `projectRoles`. The operator role grants nothing in another project type.
- **Every KMS project check** calls `kmsPermissionService.getKmsPermission`, which refuses a project of another
  type. Checks every project type shares go to Projects' `getProjectPermission` without a type.
