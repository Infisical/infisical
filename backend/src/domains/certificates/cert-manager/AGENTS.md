# Certificate Manager domain

Holds usage counting (the `internal_cas`, `active_certs` and `wildcard_certs` counters, the quota reads issuance uses
(`countActiveCertificateQuota`, `isCertificateQuotaKeyActive`) and the PKI breakdowns) and the certificate application
roles and permission.

- **Declared exception:** it reads tables no domain owns yet (`certificate_authorities`,
  `internal_certificate_authorities`, `certificates`, `pki_signers`, `projects`, `organizations`). Those move
  behind the owning domain's service once it exists.
- **No in-memory twin:** the counters are pure SQL, so they're only tested against Postgres
  (`*.integration-test.ts`). License tests its side with `FakeUsageCounter`.
- **Every application check** calls `applicationPermissionService.getApplicationPermission`. Projects builds it
  (`getResourcePermission`) from the actor's application memberships, with `ApplicationRoles` saying what each role
  grants. A custom application role is refused (`RuleViolationError`) and any other unknown slug is
  `ApplicationRoleInvalid`. A built-in project admin gets `projectAdminApplicationFallbackPermissions` on an
  application it holds no role on, and on top of the roles it holds; anyone else with no role is refused.
- Signers are Code Signing's (`../code-signing/AGENTS.md`), even though they live in Certificate Manager projects.
