# Secret Scanning domain

Holds the Secret Scanning permission for now; it grows as Secret Scanning moves into domains.

- Secret Scanning projects use the generic project roles and register nothing. Every Secret Scanning check calls
  `getSecretScanningPermission`.
