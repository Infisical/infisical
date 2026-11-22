# OCSP responder (and its CRL sibling)

Internal CAs publish revocation through two unauthenticated endpoints under `/api/v1/cert-manager`: CRL
(`ee/services/certificate-authority-crl`) and OCSP, RFC 6960 (this module, opt-in per CA via
`isOcspEnabled`, gated on the `pkiOcsp` plan flag). What bites here is freshness and what an anonymous
caller can cost us.

## Correctness

- **Serials have two forms.** `certificates.serialNumber` is 40 lowercase hex, about 1 in 8 starting with
  `0`; a CertID INTEGER may drop or add a sign byte. `parseOcspRequest` keeps `rawSerialNumber` and the
  zero-stripped `serialNumber`, and `$resolveStatuses` must query both, or revoked certs read `unknown`.
- **Every read on the revocation path goes to a primary**, Redis and Postgres (`getItemPrimary`, pass a
  `primaryNode()` as `tx`). A replica read re-caches a pre-revocation `good`.
- **Invalidation is the `ocspGeneration` counter on the CA row**, bumped in the same transaction as the
  status write in `revokeCert`. Any new revocation path must bump it. Deleting or expiring a certificate
  must not. Never add a best-effort cache delete after commit instead: a failure there is unrecoverable
  and silent.
- **Concurrent misses coalesce** in `inFlightResponses`, keyed on cache key plus generation. Only
  single-CertID, nonce-less responses are cached.
- **A nonce extnValue that is not an OCTET STRING is rejected** (`malformedRequest`).
- **`unauthorized` vs `unknown`:** `unauthorized` (unsigned) when we cannot answer for the issuer at all,
  including OCSP switched off; `unknown` (signed) only for a serial this CA never issued. Never answer a
  disabled CA with `unknown`.
- **`signTbs` must DER-encode ECDSA itself** (WebCrypto returns raw `r||s`). `TCaSigner.signTbs` covers
  software, HSM and PQC CAs.

## Cost bounds (anonymous endpoint)

- Validate the hash OID against `OCSP_HASH_NAME_BY_OID` before using it as a memo key.
- Signing sheds with `tryLater` at three caps: global (4, matching libuv's threadpool), per CA (2), and
  aggregate `OCSP_SIGNING_MAX_TOTAL_IN_FLIGHT` checked before a per-CA limiter is created. The rate limiter
  is only registered on cloud production.
- **No per-request logging.** Results are counted by `ocsp.result`; the saturation warning is
  interval-guarded.

## Protocol and metrics

- HTTP 200 with the error in the DER body, GET path with url-encoded base64 (RFC 6960 A.1). Both routes
  carry an `errorHandler` so body-limit and content-type failures do not return JSON.
- The responder never consults the plan; entitlement gates enabling only. The CRL URL re-checking at
  issuance is a deliberate asymmetry, do not copy it here.
- `ocsp.status` (envelope) and `ocsp.cert_status` (per cert) are separate attributes. Both, plus
  `ocsp.cache`, must be in `INFISICAL_CORE_METER_ATTRIBUTES`; `ocsp-metric-attributes.test.ts` pins them.
