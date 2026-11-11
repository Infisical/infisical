# Code Signing domain

Holds the signer roles and the signer permission for now; it grows as code signing moves into domains.

- Every signer check calls `getSignerPermission`. It is built by Projects' `getProjectResourcePermission` from the
  actor's signer memberships, with a built-in project admin falling back to `projectAdminSignerFallbackPermissions`.
