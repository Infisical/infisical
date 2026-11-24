# Certificate soft delete

Read before changing certificate deletion, the expiry cleanup job, renewal, or certificate syncs.

Deleting a certificate goes through `softDeleteCertificates` (`certificate-fns.ts`), which both the delete
endpoint and the expiry cleanup job (`certificate-cleanup-queue.ts`) call: it stamps `deletedAt`,
`deletedByActorType` and `deletedByActorId` on the row and, in the same transaction, removes its
`certificate_bodies`, `certificate_secrets` and PKI collection items and clears the private key copy on
`certificate_requests.encryptedPrivateKey`. The row itself stays, so the inventory, audit trail and renewal
chain keep pointing at something. Nothing hard deletes certificates any more, so deleted rows accumulate.
Things that rely on that:

- **`certificate_syncs` rows are kept.** Linux, Windows and Azure (free-text naming) find what they delivered
  only through those rows (`syncMetadata.files`, `externalIdentifier`), so the delete queues the auto-sync
  syncs holding the certificate, the run sees a tracked certificate that is no longer active and removes it
  from the destination, and the provider untracks the row. A sync with Auto-Sync or "Remove certificates from
  destination" off keeps the row and the copy until a later run that removes it. The sync's certificate list
  (`findWithDetails`) hides deleted certificates.
- **Every background or enumeration query filters `whereNull("deletedAt")`**: expiry alerts, auto-renewal,
  syncs, discovery, HSM connector usage and stats. Reads the API serves skip deleted certificates by default
  too: `GET /certificates/:id` returns 404 unless the caller passes `includeDeleted`, and list or search
  returns them only for a `deleted` status filter or `includeDeleted` (the **All Certificates** view;
  **Default** hides them), so clients written before soft delete keep seeing what they saw when the row was
  hard deleted. The one background job that still reads deleted rows is the DigiCert revocation sync: it
  records an upstream revocation on a deleted certificate (without alerts) so the quota stops counting it.
- **The licence quota still counts a deleted certificate Infisical issued until it expires or is revoked**,
  because deleting neither revokes it nor requires it to be expired, so excluding it would let an org free
  its cap while the certificate stays trusted. Deleted imported and discovered certificates stop counting.
- **CRL and OCSP keep deleted certificates.** Deletion is not revocation, so a revoked certificate stays on
  the CRL after it is deleted, and revoking a deleted certificate is still allowed.
- **A deleted certificate is never renewed or changed.** `assertCertificateNotDeleted` guards the renewal
  entry points and the first attempt of the issuance job, and EST re-enroll and SCEP renewal refuse a deleted
  client certificate. A renewal the CA already accepted before the delete (an ACM renewal still polling, a
  DigiCert or GoDaddy order) still completes and links to the deleted original, because the CA has issued
  that certificate and discarding it would lose it.
- **A sync can still write a link for a certificate deleted mid-run.** `certificate_syncs` inserts are not
  filtered on `deletedAt`, so a provider that uploads and then records the link leaves a tracking row, and the
  sync the delete queued removes that copy from the destination through it.
- **Cleanup skips certificates a code signing signer uses**, the same rule the delete endpoint enforces.
- **Deleted certificates are not restored, but they can be imported again as a new row.** A re-import can land
  in another Application, profile or organization, or without a profile, and the deleted row stays as the record
  of what was deleted, so it is never revived in place. Serial numbers are
  unique only among non-deleted rows (`certificates_serialnumber_live_unique`), so one serial can have several
  rows. Look one certificate up by serial or fingerprint with `findOneLiveFirst` (active row first, then the most
  recently deleted), scoped to the caller's org on user-facing routes (`findBySerialNumberInOrg`,
  `findByThumbprintInOrg`), never a `findOne` that several rows can match; thumbprint revocation (`$findCertificateToRevoke`) takes the one non-deleted
  match and refuses several deleted ones. Treat a serial as revoked on a CA when any of its rows on that CA is (OCSP, SCEP, CRL). Match serials with `getSerialNumberSpellings`, since older rows store a leading zero byte the parsed certificate drops.
  Import, delete, the expired-certificate cleanup and `$completeRevocation` serialize on `lockSerialNumber` (cleanup
  takes a batch's locks in sorted order before writing): import refuses a serial with a revoked row in the caller's
  org (not only on the profile's CA, since import does not check which CA issued the certificate), and revoking any row revokes every row of the certificate on that CA, plus copies in the org with no CA (`findSameCertificateRecords`: same serial spellings and fingerprint, rows without one count on the CA; one `same-certificate` audit
  event each). If the target is deleted and a live copy appeared after the checks ran, the locked check refuses
  on an internal CA so the retry resolves to the copy; an external CA has already revoked it by then, so the
  copy is revoked with the others. Because of that cascade, importing a deleted row again onto its CA needs
  revoke permission on the deleted row (skipped only for a row in the same Application and profile, whose
  rules the new row inherits; a row with no Application is always checked, since project roles can be
  conditional on its name or metadata), and when a revocation approval policy covers it the new row must land
  where the same policy matches (`importCert`), or the import would let someone revoke it under another
  Application's rules. A revocation that starts from a deleted row is resolved to its
  non-deleted copy on its CA first (`$resolveActiveRecord`), so the copy's permissions and approval policy apply;
  Intune's platform revocation resolves the same copy but runs no permission or approval check.
- **A deleted certificate keeps its HSM key reference** (`keySource`, connector, key label and id), so the
  record stays true for audits. Deleting the connector detaches deleted rows (`hsmConnectorId` set to null),
  which is why the key source CHECK requires a connector only while `deletedAt` is null.
