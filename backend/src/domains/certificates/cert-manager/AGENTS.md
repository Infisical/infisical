# Certificate Manager domain

For now just usage counting: the `internal_cas`, `active_certs` and `wildcard_certs` counters, the quota reads
issuance uses (`countActiveCertificateQuota`, `isCertificateQuotaKeyActive`) and the PKI breakdowns.

- **Declared exception:** it reads tables no domain owns yet (`certificate_authorities`,
  `internal_certificate_authorities`, `certificates`, `pki_signers`, `projects`, `organizations`). Those move
  behind the owning domain's service once it exists.
- **No in-memory twin:** the counters are pure SQL, so they're only tested against Postgres
  (`*.integration.spec.ts`). License tests its side with `FakeUsageCounter`.
