# Code Signing domain

Holds the signer roles and the signer permission for now. More moves in as code signing moves into domains.

- **Every signer check** calls `signerPermissionService.getSignerPermission`. Projects builds it
  (`getResourcePermission`) from the actor's signer memberships, checked as a Certificate Manager project, with
  `SignerRoles` saying what each role grants.
- **Roles:** `admin`, `operator` and `auditor`. A custom signer role is refused (`RuleViolationError`) and any other
  slug is `SignerRoleInvalid`, so a bad membership row fails the check instead of granting nothing.
- **Project admins** (the built-in admin role only) get `projectAdminSignerFallbackPermissions` (read and manage
  members) on a signer they hold no role on, and on top of the roles they hold. Anyone else with no signer role is
  refused.
