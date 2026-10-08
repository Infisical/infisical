# Certificate revocation: CRL and OCSP

Internal CAs publish revocation two ways, both unauthenticated public endpoints under
`/api/v1/cert-manager`. CRL is `ee/services/certificate-authority-crl`; OCSP
([RFC 6960](https://www.rfc-editor.org/rfc/rfc6960)) is `ee/services/certificate-authority-ocsp`, opt-in
per CA via `internal_certificate_authorities.isOcspEnabled` and gated on the `pkiOcsp` plan flag.

The responder answers a status question for one certificate, so the things that bite are freshness and
what an anonymous caller can cost us.

- **Serials have two forms and the database knows one.** `certificates.serialNumber` is 40 lowercase hex
  as issued, and `createSerialNumber` clears the top bit, so ~1 in 8 begins with `0`. A CertID carries a
  DER INTEGER that may also carry a sign byte. `parseOcspRequest` keeps `rawSerialNumber` and the
  zero-stripped `serialNumber`, and `$resolveStatuses` queries both. Querying one silently answers
  `unknown` for every certificate whose serial starts with a zero byte, revoked ones included.
- **Every read on the revocation path goes to a primary, in Redis and in Postgres.** `keyStore.getItem`
  and `ormify().find` both default to a replica, and so does `findByIdWithAssociatedCa`. Under lag any of
  them re-caches a pre-revocation `good` for the full validity window, or answers for a CA whose OCSP was
  just switched off. Use `getItemPrimary` and pass a `primaryNode()` as the `tx`.
- **Invalidation is a Postgres counter, not a Redis write.** `internal_certificate_authorities.ocspGeneration`
  is bumped in the *same transaction* as the certificate status write in `revokeCert`, which is the only
  place a certificate becomes revoked. Each cached entry records the generation it was signed under and a
  read rejects a mismatch, so nothing has to delete a key and a Redis outage cannot leave a revoked
  certificate reading `good`. The responder already reads the CA row from the primary every request, so
  comparing it is free. A new path that revokes a certificate must bump it too. Deleting a certificate does
  not, and neither does the expiry cleanup: deletion is not revocation, so a cached `good` for a certificate
  nobody revoked is still true, and bumping would flush every live certificate's cached response on that CA
  for nothing. Only single-certID responses are cached; multi-certID requests are answered but never cached.
  Do not reintroduce a best-effort invalidation call after the commit: that is exactly the shape that failed
  review, because a failure there is unrecoverable and silent.
- **Concurrent misses coalesce into one signing.** `inFlightResponses` keys on the cache key plus the
  generation. The generation is what stops a request arriving after a revoke from joining a flight
  that began before it. Nonced requests are exempt for free, because their cache key is `null`.
- **A nonce is an OCTET STRING, and an extnValue that is not one is rejected.** The response always
  re-encodes the nonce wrapped, so accepting a raw inner value would sign an echo that can never match what
  the client sent. `parseOcspRequest` returns `null`, which the service answers as `malformedRequest`.
- **Never take the hash OID out of a CertID without checking `OCSP_HASH_NAME_BY_OID` first.** An OID is an
  unbounded dotted-decimal string and it keys the per-CA issuer-hash memo, so an unvalidated one is
  unbounded attacker-controlled heap.
- **Signing is capped three ways and sheds with `tryLater`**: globally (4), per CA (2), and in aggregate
  across every CA (`OCSP_SIGNING_MAX_TOTAL_IN_FLIGHT`, checked before a per-CA limiter is created or
  entered). The global cap matches libuv's default threadpool of 4, where `crypto.subtle.sign` runs, so
  OCSP never needs more than the pool that password hashing, KMS decrypts and DNS lookups share. The
  per-CA tier stops one tenant's traffic shedding everyone else's, but on its own it multiplies how many
  requests are parked at once, because a caller choosing to spray across many valid CA ids gets a fresh
  queue per id. The aggregate cap is what bounds that, and it is deliberately far above any single CA's
  own limit so the fairness the per-CA tier buys is preserved. Both are per process, so the rate limiter is the outer
  bound, and it is only registered under `isProductionMode && isCloud`.
- **Do not log per request on this path.** The endpoint is unauthenticated and the rate limiter is only
  registered under `isProductionMode && isCloud`, so on self-hosted an anonymous caller sets the log
  volume. Malformed and unauthorized results are counted by `ocsp.result` and logged nowhere; the
  saturation warning is interval-guarded because shedding is by definition high volume.
- **Protocol shape, not REST.** HTTP 200 with the error in the DER body, and a wildcard GET path carrying
  url-encoded base64. Required by RFC 6960 appendix A.1. Both routes also carry an `errorHandler`, because
  a body over `bodyLimit` or a missing `Content-Type` never reaches the handler and would otherwise return
  a JSON 500 an OCSP client cannot parse.
- **The responder never consults the plan.** Entitlement gates enabling OCSP, never answering, per
  `CODE_QUALITY.md`. Note the managed CRL URL beside it *does* re-check at issuance; that asymmetry is
  deliberate on the OCSP side and should not be "fixed" by copying the CRL pattern.
- **The response metric keeps those two states on separate dimensions.** `ocsp.status` is the envelope
  and `ocsp.cert_status` is the per-certificate answer, which only exists inside a `successful` envelope
  and is `none` otherwise. Flattening them onto one label made `unknown` and `unauthorized` look like
  siblings when they come from different enumerations. Both names, plus `ocsp.cache`, have to be in
  `INFISICAL_CORE_METER_ATTRIBUTES`: an attribute missing from that allowlist is dropped by the SDK View
  with no error, so `ocsp-metric-attributes.test.ts` pins them.
- **The two "I can't answer" states are different, and RFC 6960 picks between them.** `unauthorized`
  (2.3, unsigned) is "not capable of responding authoritatively": no such CA, no active CA certificate,
  issuer hashes that belong to someone else, and OCSP switched off for that CA. `unknown` (2.2, signed,
  inside a successful response) is "I serve this issuer but have no record of this certificate", which is
  a serial this CA never issued. Do not answer a disabled CA with `unknown`: we hold a record for those
  certificates, so it is a false assertion signed with the CA key, and it would make the off switch still
  cost a signature per request. `unknown` responses carry a short validity window, since their serial is
  caller-chosen.

**`signTbs` must DER-encode ECDSA itself.** WebCrypto returns raw `r||s`; X.509 and OCSP need the DER
`ECDSA-Sig-Value` SEQUENCE. The certificate, CSR and CRL generators convert internally, so nothing above
them ever had to. Without it every ECDSA CA's OCSP responses fail verification in openssl, Go and Windows,
and nothing on our side errors. `TCaSigner` (`services/certificate-authority/ca-signer.ts`) gained
`signTbs` for this and abstracts over software, HSM and PQC CAs. PQC needs no special case beyond taking
the signature OID from `pqcNameToOid`.
