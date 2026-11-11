# KMS domain

Holds the KMS project roles and permission for now; it grows as KMS (CMEK, KMIP) moves into domains.

- KMS projects use the generic project roles plus `cryptographic-operator`, registered with
  `productAccessRegistry.registerDefaultRoles`. The operator role means nothing in another project type.
- Every KMS project check calls `getKmsPermission`.
