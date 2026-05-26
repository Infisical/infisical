# e2e/fixtures

Long-lived test artifacts consumed by the e2e suite and the gamma bootstrap.

## `idp-cert.pem`

X.509 certificate of the SAML mock IdP hosted in `preview-environments` at
`https://preview-orchestrator.infisical.workers.dev/saml-idp/*`. The matching
private key lives only in Cloudflare Worker Secrets (`SAML_IDP_PRIVATE_KEY`)
and is **never** committed.

`backend/scripts/seed-gamma-fixtures.ts` reads this file and writes the cert
into gamma's `saml_configs` row for the e2e org so gamma can verify the
signed responses the Worker emits.

### Provenance

Generated once with:

```sh
openssl req -new -newkey rsa:2048 -nodes -keyout idp-key.pem -x509 -sha256 -days 3650 \
  -subj "/CN=infisical-e2e-mock-idp/O=Infisical e2e/OU=Test Only" \
  -out idp-cert.pem
```

10-year validity is deliberate — this cert is test-only and used only between
the mock IdP and gamma's e2e org. There is no rotation tooling; if the cert
ever does need to rotate, generate a new pair, push the new private key as
`SAML_IDP_PRIVATE_KEY`, replace this file, and re-run the seed script (it's
idempotent on the SAML config row's `cert` column).

### Threat model

The matching private key would let an attacker mint SAML assertions for the
e2e org only. That org is feature-gated to SCIM-provisioned users (no
self-signup against it) and exists exclusively for `tests/scim-saml-auth.spec.ts`.
Worst case is impersonation of the test user inside an org with no real data.
Keep the private key in CF Secrets and out of git regardless.
