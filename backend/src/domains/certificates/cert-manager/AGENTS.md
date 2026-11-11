# Certificate Manager domain

Holds only usage counting for now: the `internal_cas`, `active_certs` and `wildcard_certs` counters, the certificate quota reads used by issuance (`countActiveCertificateQuota`, `isCertificateQuotaKeyActive`), and the PKI breakdowns. It grows as Certificate Manager moves into domains.

- **Declared exception:** its queries read tables this domain does not own yet (`certificate_authorities`, `internal_certificate_authorities`, `certificates`, `pki_signers`, `projects`, `organizations`). When the owning
  domain exists, these reads move behind that domain's service.
- **No in-memory twin:** the counters are SQL whose whole job is the query, so they are tested against
  Postgres only (`*.integration.spec.ts`). The License domain tests its side with `FakeUsageCounter`.
- Every application check calls `getApplicationPermission`, built by Projects' `getProjectResourcePermission`; a built-in project admin falls back to `projectAdminApplicationFallbackPermissions`.
