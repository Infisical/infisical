# Delegated OAuth tokens

**Token exchange trusts the org's OIDC SSO config, not per-client configuration**
(`oauth-token-exchange-fns.ts`), so the issuers that can vouch for a user are the ones that can already
log them in. The one per-application field is `tokenExchangeAudience`, and it does the security work:
without it, any token that issuer signed for anything in the estate is exchangeable. Enabling the grant,
changing the audience, and rotating the secret each need `OrgPermissionSsoActions.Edit` on top of the usual
`OauthClients` check (`checkSsoConfigPermission`), rotation included, since its response is a working
credential for acting as any of the org's users.

**Withdrawing an exchange application's authority revokes the tokens it already issued.** Deleting the
client, rotating its secret, and any update that narrows the exchange's trust (dropping the grant,
changing `tokenExchangeAudience`, switching `tokenExchangeIdpSatisfiesMfa` off) all call
`revokeSessionsByUserAgent`. `hasWithdrawnTokenExchangeTrust` and `hasClientAuthorityChanged` guard the
same fields, so a new field belongs in both. The test is whether it carries federation trust, not merely
whether it can be narrowed. `accessTokenTTL` is in neither: it only decides how long a new token lasts, so
revoking on a routine edit would surprise, and guarding it would fail in-flight exchanges. Widening
(turning the MFA declaration on) revokes nothing. Rotation revokes for exchange clients only, where the
secret alone mints tokens; in the redirect flow it has to be paired with a code or refresh token, so
blanket revocation would just sign everyone out. The session tag is per client, which is unambiguous
because `assertValidOauthClientGrantConfig` rejects the exchange grant alongside `authorization_code`, so
a service needing both registers twice.

That sweep only reaps sessions that already exist, so **the exchange rechecks the client after creating
its own session** (`findByIdForUpdate` + `hasClientAuthorityChanged`, re-running the sweep). The other
grants read an existing session rather than creating one, so they don't need it. The recheck has to be a
**locking** read on the primary, and both halves of that are load-bearing: each withdrawal path writes the
client and sweeps sessions inside one transaction, so a plain read still sees the pre-withdrawal row until
that transaction commits, and would clear a token whose session the sweep has already scanned past. A
replica read has the same hole for the length of the replication lag. Keeping the write and the sweep
atomic is what makes the lock the fix here; splitting them so the write commits first would reopen a
window where the sweep can fail on its own and leave the tokens live.

**Everything the exchange fetches from the IdP is cached for 10 minutes; nothing read from our own
database is**, so an admin editing the SSO config takes effect on the next request while the provider
never becomes a synchronous dependency of the middleware's own request path. The cache invariants
(rejections evicted, in-flight promise shared, expiry rebuilding the SSRF-pinned agent) are documented in
`oauth-token-exchange-fns.ts`.
