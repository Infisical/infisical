# Delegated OAuth tokens

Two grants issue them: the authorization code flow (consented `scopes`) and the RFC 8693 token exchange
(`delegation: "full"`, no scopes).

**Opting a route in.** `verify-auth.ts` rejects `AuthMode.OAUTH` on any route that doesn't list it; most
product `AuthMode.JWT` routes do. Two things have to hold before adding it. The route must not be an
administration route (below). And the handler must actually **check** a CASL ability, because that check
is where the granted scopes get intersected in: building an ability and throwing it away
(`getOrgPermission` used as a membership gate), or reading `hasRole(...)` off its return value, narrows
nothing; `hasRole` is the easy one to miss because it reads like authorization. Rough proxy: nothing
passing `requireOrg: false` accepts `AuthMode.OAUTH`.

**Administration is read-only for a delegated token.** A delegated token can look at anything the
authorizing user can, but it changes nothing under **Administration**: no create, update, or delete, at
either level. The frontend nav is the boundary, and it is worth opening (`OrgNav.tsx`,
`OrgSubmenuView.tsx`, `SecretManagerNav.tsx`, `submenus.tsx`) when a new route's side is unclear. The
surfaces it covers:

- **org access control** — members, groups, identities (including memberships, templates, and all
  thirteen `identity-*-auth-router.ts`), org roles, invites, external group-to-role mapping
- **usage & billing** — `ee/v1/license-router.ts`, `ee/v1/license-v2-router.ts`
- **audit logs** — the org and project log reads plus audit log streams
- **org settings** — org update and incident contacts, SSO and provisioning (SAML, OIDC, LDAP, SCIM,
  GitHub org sync, email domains), networking (gateways, gateway pools, relays), encryption (external
  KMS, KMIP, KMIP servers, HSM connectors), project templates, sub-orgs, workflow integrations
  (Slack, Microsoft Teams), and the org-wide EnvKey/Vault migrations on the settings tab
- **project access control** — memberships for users, groups and identities, project roles, additional
  privileges, folder grants, project keys, service tokens, and the per-resource equivalents under PAM,
  cert manager, code signing and PKI applications
- **project settings** — project update and delete, environments, tags, approval policies, webhooks,
  trusted IPs, secret validation rules, project KMS, blind index, audit log retention, E2EE upgrade,
  and the secret scanning `configs` routes

In practice that means `GET` keeps `AuthMode.OAUTH` and `POST` / `PATCH` / `PUT` / `DELETE` lose it. The
method is the test because `CODE_QUALITY.md` already requires `GET` to be safe, so it needs no per-route
judgment. Two adjustments to that rule, both small enough to enumerate:

- **A `POST` that only reads keeps it.** Five endpoints are `POST` solely because a lookup needs a request
  body: `POST /v1/identities/search`, `POST /v2/identities/search`, `POST /v2/identities/search/count`,
  and the two `memberships/details` routes. All five check a CASL read ability.
- **A read that hands back credential material loses it**, because the point of closing administration is
  that a third-party application should not end up holding the org's secrets. Five routes:
  `GET /v1/sso/oidc/config` (`clientSecret`), `GET /v1/ldap/config` (`bindPass`),
  `GET /v1/workspace/:projectId/kms/backup` (the project's KMS backup blob), and Slack
  `GET /install` / `GET /reinstall`, which gate on `OrgPermissionActions.Create` and exist only to start
  an install. Everything else reads through a sanitized schema — `sanitizedClientSecretSchema` returns a
  prefix, `sanitizedExternalSchemaForGetById` drops provider credentials, `ScimTokensSchema` carries no
  token. Check the response schema, not the route name, before opening a new administration read.

Three things are first-party outright, because they sit outside an org and the nav boundary doesn't
reach them:
- account self-management (user, password, MFA, sessions, login, signup, notifications, announcements)
- super-admin routes (`v1/admin-router.ts`, `ee/v1/rate-limit-router.ts`), where `verifySuperAdmin` reads
  `user.superAdmin` rather than an ability
- `POST /v2/organizations`, and the org reads that return more than the token's org: `GET /v1/organization`,
  `GET /v1/organization/accessible-with-sub-orgs`, `GET /v1/organization/:organizationId`. All pass
  `requireOrg: false`, so nothing narrows them

Everything else that used to be listed here individually — OAuth client CRUD, assume-privilege, deleting
an org or sub-org, minting SCIM tokens, KMIP client certificates or gateway / relay / KMIP-server
enrollment tokens, registering identity auth methods — is an administration write, and closed by the rule
above rather than by its own exception. Two of those reasons still generalize, so keep them in mind when a
**product** route does the same thing:

- **A route that leaves behind something able to authenticate later can't accept a delegated token.**
  Revocation reaches only the sessions tagged with `getOauthClientSessionUserAgent`, so a credential or an
  auth method bound to a key the caller holds survives deleting the application and rotating its secret,
  and authenticates as a principal no OAuth scope intersects. Whether the route hands secret material back
  is beside the point, so start any new route that writes a trust anchor (bound issuer, signing key, CA,
  cloud principal) first-party.
- **Nor can a route that reissues the caller's session.** `DELETE /v2/organizations/:organizationId`
  returns a fresh pair from `loginService.generateUserTokens`, which takes no delegation parameter, so a
  delegated caller would exit with a first-party session.

**Delegation markers.** A token carries `scopes` or `delegation: "full"`, never both
(`oauth-client-types.ts`). `permission-service` intersects the user's CASL rules with `scopes`
(`applyOauthScopeToOrgRules` / `applyOauthScopeToProjectRules`). `inject-identity.ts` sets
`RequestContextKey.OauthScopes` for every scope-narrowed token (even `[]`, which denies everything) and
leaves it unset only for full delegation. Matching full delegation **positively** is what makes a dropped
claim fail closed instead of promoting the token.

**The token endpoint's error contract is RFC 6749 §5.2, not the house envelope**, because generic OAuth
libraries branch on the `error` code. `OauthTokenError` (`oauth-token-error.ts`) carries the code and
derives the status from it (400; 401 for `invalid_client`, 500 for `server_error`), and the shared error
handler renders `{ error, error_description }`. When extending it:
- The handler's `try`/`catch` is the endpoint's only exit, and every `return` inside it is **awaited**: a
  bare `return promise` would resolve outside the `catch` and escape in the house envelope.
- `toOauthTokenError` defaults by **error class**, never message text: `UnauthorizedError` and
  `ForbiddenRequestError` take the rejected-grant code for that grant (`invalid_grant` on the redirect and
  refresh grants, `invalid_request` on token exchange, per RFC 8693 §2.2.2), `BadRequestError` takes
  `invalid_request`, and anything else becomes `server_error`, whose response carries no detail and whose
  original is logged. Both refusal classes are listed because the exchange rejects an unusable subject in
  two vocabularies: `exchangeSubjectToken`'s own membership checks raise `UnauthorizedError`, while
  `getOrgPermission` raises `ForbiddenRequestError` for the same kind of refusal. A new way to refuse a
  subject belongs in one of those two classes, or it lands in `server_error` as an unexplained 500.
- Throw `OauthTokenError` directly where that default is wrong: client authentication
  (`invalid_client`), a grant the client doesn't hold (`unauthorized_client`), a redirect-URI or PKCE
  mismatch (`invalid_grant`), the unsupported `scope` (`invalid_scope`) and `audience`/`resource`
  (`invalid_target`) parameters, and org misconfiguration or IdP outages (`server_error`).
- The route sets `attachValidation` so a schema failure reaches the handler; an unrecognized `grant_type`
  earns `unsupported_grant_type`.
- `toErrorDescription` sanitizes and bounds `error_description` at the render boundary, so no throw site
  has to remember RFC 6749's printable-ASCII restriction.
- Messages shared with a management route (the OIDC-config checks) take an error factory rather than
  throwing, since the two callers owe the same explanation in different envelopes.

**Token exchange trusts the org's OIDC SSO config, not per-client configuration**
(`oauth-token-exchange-fns.ts`), so the issuers that can vouch for a user are the ones that can already
log them in. The one per-application field is `tokenExchangeAudience`, and it does the security work:
without it, any token that issuer signed for anything in the estate is exchangeable. Enabling the grant,
changing the audience, and rotating the secret each need `OrgPermissionSsoActions.Edit` on top of the usual
`OauthClients` check (`checkSsoConfigPermission`), rotation included, since its response is a working
credential for acting as any of the org's users.

`getOrgPermission` is **not** a membership check: the org-scope query in `permission-dal.ts` never reads
`Membership.isActive` or `Membership.status`. Every other user token came from a browser login, where
`selectOrganization` rejects an inactive membership; the exchange has no login in front of it, so
`exchangeSubjectToken` checks membership state itself. Any future non-interactive way of minting a user
token needs the same check.

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
