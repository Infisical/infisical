# Local SSO Development (OIDC, SAML, SCIM, LDAP)

This guide is for **contributors** who want to test Infisical's SSO flows against an
identity provider running locally in Docker. It covers the dev containers that ship
with `docker-compose.dev.yml`, their default credentials, what to enter in Infisical,
and how everything is pre-seeded so you can log in within a couple of minutes.

For the **end-user / production** setup of each provider, see the product docs instead:
[`docs/documentation/platform/sso`](docs/documentation/platform/sso) and
[`docs/documentation/platform/ldap`](docs/documentation/platform/ldap).

## Quick reference

| Provider | Bring up | Seed | Provider URL | Seeded users (password `password123!`) |
| --- | --- | --- | --- | --- |
| Keycloak (OIDC) | `make up-dev-oidc` | realm auto-imports on boot; configure Infisical with `make seed-dev-oidc` | http://localhost:8088 (admin / admin) | john@oidc.com, alice@oidc.com, admin@oidc.com |
| OpenLDAP (LDAP) | `make up-dev-ldap` | `make seed-dev-ldap` | http://localhost:6433 (phpLDAPadmin) | john@ldap.com, alice@ldap.com, admin@ldap.com |
| Authentik (SAML + SCIM) | `make up-dev-saml` | `make seed-dev-saml` | http://localhost:9100 (akadmin / password123!) | john@saml.com (SCIM), alice@saml.com (SCIM), admin@saml.com |

All compose profiles also start the default stack (Postgres, Redis, backend, frontend,
nginx), so Infisical is available at **http://localhost:8080**.

## Prerequisites (do this once)

1. **Base stack works.** You can already run `make up-dev` and reach Infisical at
   http://localhost:8080. Create a instance admin account.

2. **`AUTH_SECRET` and `SITE_URL` are set.** `.env.example` already ships a sample
   `AUTH_SECRET`. For SSO you must also make sure `SITE_URL` matches the URL you open
   Infisical at, because the OIDC callback is built as `{SITE_URL}/api/v1/sso/oidc/callback`.
   For the standard dev stack set:

   ```bash
   SITE_URL=http://localhost:8080
   ```


3. **Unlock the EE features** (next section). Without this every SSO config request returns
   `Upgrade plan to ...`.

## Unlocking SSO (EE feature gating)

OIDC, SAML, LDAP, SCIM, and groups are paid features. On a plain local instance there is no
license, so `getDefaultOnPremFeatures()` in
[`backend/src/ee/services/license/license-fns.ts`](backend/src/ee/services/license/license-fns.ts)
returns `oidcSSO: false` and `ldap: false`, and the config endpoints reject everything.
Pick one of:

- **Internal devs (recommended):** set a real or offline `LICENSE_KEY` in `backend/.env`
  (ask the team for a dev license). This mirrors a real enterprise instance.
- **OSS / no license:** temporarily flip the flags in `getDefaultOnPremFeatures()` to `true`
  for the features you are testing:

  ```ts
  oidcSSO: true,
  samlSSO: true,
  ldap: true,
  scim: true,
  groups: true,
  ```

  This is a **local-only change, do not commit it.**

Restart the backend after either change so the license service re-reads the plan.

> In case you lock yourself out after enforcing SSO, an org admin can always recover via the
> admin login portal at http://localhost:8080/login/admin.

---

## OIDC via Keycloak

```bash
make up-dev-oidc
```

Keycloak boots with the pre-seeded **`infisical`** realm imported from
[`docker/keycloak/realm-infisical.json`](docker/keycloak/realm-infisical.json): one OIDC
client and two users. The container has no volume, so the realm is re-imported fresh on
every start. To reload edits to the realm file, recreate it with `docker compose -f docker-compose.dev.yml --profile oidc up -d --force-recreate keycloak keycloak-config`.

A one-shot `keycloak-config` sidecar runs alongside it and sets the built-in `master` realm to
`sslRequired=none`, so the admin console works over plain HTTP. Without this, Keycloak returns
**"HTTPS required"** on Docker Desktop (the container sees a non-local client IP for the
`master` realm, whose default is `external`). The `infisical` realm already ships with
`sslRequired: none` in its realm file, so the login flow is unaffected either way.

### Default values

| Setting | Value |
| --- | --- |
| Admin console | http://localhost:8088 |
| Admin user / password | `admin` / `admin` |
| Realm | `infisical` |
| Client ID | `infisical-dev` |
| Client secret | `infisical-dev-client-secret` |
| JWT signature algorithm | `RS256` |
| Redirect URI (registered) | `http://localhost:8080/api/v1/sso/oidc/callback` |
| Seeded users | `john@oidc.com`, `alice@oidc.com`, `admin@oidc.com` (password `password123!`) |

### Discovery URL (how the networking works)

Keycloak is configured so the **issuer** and the **browser-facing** endpoints (authorization,
logout) are always `http://localhost:8088`, while the **backchannel** calls the backend makes
(discovery, token, JWKS) use whatever URL it connected with. That split, set via
`KC_HOSTNAME=http://localhost:8088` + `KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true` in
`docker-compose.dev.yml`, lets the backend and the browser share one issuer with **no `/etc/hosts`
edit**:

- **Backend in Docker (the default for `make up-dev-oidc`):** the backend fetches discovery over
  the internal compose network, and the browser is redirected to `localhost:8088`. Discovery URL:

  ```
  http://keycloak:8080/realms/infisical/.well-known/openid-configuration
  ```

### Configure in Infisical

The fast path is to let the seed script do it. With the stack up, run:

```bash
make seed-dev-oidc
```

This bootstraps everything the Infisical side needs: an `admin@oidc.com` admin (password
`password123!`), a **verified** `oidc.com` email domain (required for every SSO login), and
an **active** OIDC config pointing at the discovery URL above (client `infisical-dev`). With no
arguments it bootstraps a dedicated `oidc` org (slug `oidc`), creating it if missing; pass
`ORG_ID=<uuid>` to configure an existing org instead. SSO is still EE-gated, so make sure you have
unlocked the EE features first.

Then test the login two ways:

- **SSO:** open a fresh browser session at http://localhost:8080, choose **Continue with SSO**, and
  authenticate as any seeded Keycloak user (`john@oidc.com`, `alice@oidc.com`, or
  `admin@oidc.com`), all `password123!`. Signing in as `admin@oidc.com` links to the seeded
  Infisical admin. You can also start the flow directly at
  `http://localhost:8080/api/v1/sso/oidc/login?orgSlug=oidc`.
- **Password:** sign in as the seeded admin `admin@oidc.com` / `password123!` to manage the
  `oidc` org directly.

<details>
<summary>Or configure it by hand in the UI</summary>

1. Log in to http://localhost:8080 as the seeded admin and open the organization's
   **Single Sign-On (SSO)** settings.
2. Connect **OIDC**, choose configuration type **Discovery URL**, and fill in:
   - **Discovery Document URL:** the URL from the section above.
   - **JWT Signature Algorithm:** `RS256`.
   - **Client ID:** `infisical-dev`.
   - **Client Secret:** `infisical-dev-client-secret`.
   - Leave **Allowed Email Domains** empty to accept any seeded user while testing.
3. Verify the org's `oidc.com` domain under the org domain settings, otherwise the login is
   rejected. `make seed-dev-oidc` does this for you.
4. Save, then enable OIDC.
</details>

---

## LDAP via OpenLDAP

```bash
make up-dev-ldap
make seed-dev-ldap   # adds OUs, users, and a group
```

`make seed-dev-ldap` does two things: it applies
[`docker/openldap/bootstrap.ldif`](docker/openldap/bootstrap.ldif) (OUs, users, group) to OpenLDAP
with `ldapadd -c`, and it configures the Infisical side, bootstrapping a dedicated `ldap` org with
an `admin@ldap.com` admin (password `password123!`), a verified `ldap.com` domain, and an
**active** LDAP config pointing at OpenLDAP. With no arguments it targets/creates the `ldap` org;
pass `ORG_ID=<uuid>` to configure an existing org instead. SSO is EE-gated, so unlock the EE
features first.

> `ldapadd` only adds entries, it does not update existing ones. If you change a seeded user's
> password in `bootstrap.ldif` after the directory was already seeded, recreate the OpenLDAP volume
> to pick it up: `docker compose -f docker-compose.dev.yml rm -fsv openldap`, then re-run
> `make seed-dev-ldap`.

Browse the directory at http://localhost:6433 (phpLDAPadmin) with login
`cn=admin,dc=ldap,dc=com` / `admin`.

### Sign in

Sign in via LDAP into the `ldap` org as any seeded directory user, all `password123!`, by uid or
email:

- `admin@ldap.com` (uid `admin`), which is also the seeded Infisical admin, so it links to that account
- `john` or `john@ldap.com` (John Doe)
- `alice` or `alice@ldap.com` (Alice Smith)

The seed's search filter matches uid or mail, so either form works.

### Default values

| Field | Value (backend in Docker) | Value (backend on host) |
| --- | --- | --- |
| LDAP URL | `ldap://openldap:389` | `ldap://localhost:389` |
| Bind DN | `cn=admin,dc=ldap,dc=com` | same |
| Bind password | `admin` | same |
| User search base | `ou=people,dc=ldap,dc=com` | same |
| User search filter | `(\|(uid={{username}})(mail={{username}}))` | same |
| Unique user attribute | `uid` | same |
| Group search base | `ou=groups,dc=ldap,dc=com` | same |
| CA certificate | leave empty (`ldap://` has no TLS) | same |
| Seeded users | `john`, `alice`, `admin` (password `password123!`) | same |
| Seeded group | `infisical-users` | same |

Unlike OIDC, LDAP has no browser redirect, so there is no issuer/hostname problem: the backend
binds to the server directly. Just point `LDAP URL` at wherever the backend can reach OpenLDAP.

<details>
<summary>Or configure it by hand in the UI</summary>

1. In the org **Single Sign-On (SSO)** settings, connect **LDAP** and enter the values above.
2. Use **Test Connection** to confirm the bind works before saving.
3. Verify the org's `ldap.com` domain, otherwise the login is rejected (`make seed-dev-ldap`
   does this for you).
4. Enable LDAP, then log in as `john` / `password123!`.
5. (Optional) Map `cn=infisical-users` to an Infisical group under the LDAP config's group
   mappings to test group sync.
</details>

---

## SAML + SCIM via Authentik

[Authentik](https://goauthentik.io) is a full identity provider with **real** SAML SSO and
**outbound SCIM provisioning**, so unlike a mock IdP you can exercise the whole flow end to end:
SCIM provisions users into Infisical, and SAML logs them in. Both share one `saml` org, because the
two are coupled. The SAML `NameID` must equal the SCIM `userName` (both the user's email), and
Infisical only accepts SCIM provisioning once an SSO config exists for the org.

```bash
make up-dev-saml     # default stack + Authentik (server, worker, its own Postgres; ~40s to ready)
make seed-dev-saml   # wires both sides and provisions the test users
```

`make seed-dev-saml` does the whole bridge in one shot:

- **Infisical side:** bootstraps a dedicated `saml` org (slug `saml`) with SCIM enabled, an
  `admin@saml.com` admin (password `password123!`), a **verified** `saml.com` domain, an **active**
  SAML config, and a SCIM token.
- **Authentik side (via its API):** creates the `john@saml.com` / `alice@saml.com` test users in an
  `infisical-saml` group, a **SAML provider** (ACS pointed at Infisical, `NameID` = email), and a
  **SCIM provider** pointed at Infisical's SCIM endpoint, bound together by one `Infisical`
  application.
- **The two secrets that have to cross over** are handled for you: the seed reads Authentik's SAML
  signing certificate into the Infisical SAML config, and writes the Infisical SCIM token into
  Authentik's SCIM provider. It then provisions john/alice via SCIM, each getting a SAML alias keyed
  on their email, so SAML login matches the SCIM-provisioned account.

SSO is EE-gated, so unlock the EE features first. The Authentik admin console is at
**http://localhost:9100** (`akadmin` / `password123!`).

### Sign in (SAML)

Open a fresh browser session at http://localhost:8080, choose **Continue with SSO**, enter the org
slug `saml`, and authenticate at Authentik as a seeded user, all `password123!`:

- `john@saml.com` (John Doe)
- `alice@saml.com` (Alice Smith)

You can also start the flow directly at
`http://localhost:8080/api/v1/sso/redirect/saml2/organizations/saml`. Sign in as the password admin
`admin@saml.com` / `password123!` to manage the `saml` org directly.

### SCIM provisioning

`make seed-dev-saml` provisions john/alice (as users) and the `infisical-saml` group with those
members into the `saml` org. It touches each test user and the group in Authentik to fire a
per-object SCIM sync, then **polls Infisical and retries** (up to 8 rounds) until they all land, so
an async miss self-heals instead of being fire-and-forget; it logs `SCIM provisioning confirmed` on
success. To add more users, create them in Authentik and add them to `infisical-saml`.
Scoping to these objects also keeps Authentik's built-in groups out of Infisical.

The seed also **recreates** the Authentik SCIM provider on every run. Authentik stores a per-object
"connection" (the remote SCIM id of each provisioned user/group); after an Infisical DB reset those
point at rows that no longer exist, so Authentik would PUT to dead ids and silently provision
nothing. Recreating clears them so objects POST fresh into the current org.

### Default values

| Setting | Value |
| --- | --- |
| Authentik admin | http://localhost:9100 (`akadmin` / `password123!`) |
| Authentik API token (used by the seed) | `authentik-dev-bootstrap-token` |
| Org | `saml` |
| SAML entry point (browser) | `http://localhost:9100/application/saml/infisical/sso/binding/redirect/` |
| SAML ACS (Infisical) | `http://localhost:8080/api/v1/sso/saml2/<configId>` |
| NameID / SCIM userName / alias | the user's email |
| Assertion audience | `http://localhost:8080` (= `SITE_URL`, the Infisical SP `issuer`) |
| SCIM endpoint (Authentik → Infisical) | `http://backend:4000/api/v1/scim` |
| Seeded users | `john@saml.com`, `alice@saml.com` (SCIM), `admin@saml.com` (password admin) |
| Seeded group | `infisical-saml` (provisioned with members john/alice) |

### How the networking works

Like OIDC, SAML has a browser redirect, so URLs split by audience: the browser is sent to Authentik
at **`localhost:9100`** (the SAML entry point and ACS use host-reachable URLs), while the seed and
Authentik's SCIM sync talk over the compose network (`authentik-server:9000`, `backend:4000`). The
seed uses internal addresses for its own API calls and host addresses for anything the browser
touches. Authentik runs on port `9100` because `9000` is taken by ClickHouse in the dev stack.

---

## Testing without the UI (curl)

Grab a JWT by logging in to http://localhost:8080 and copying the `Authorization: Bearer ...`
header from any API request in your browser's network tab. Then:

```bash
JWT="<paste token>"
ORG_ID="180870b7-f464-4740-8ffe-9d11c9245ea7"
```

**Create the OIDC config:**

```bash
curl -X POST http://localhost:8080/api/v1/sso/oidc/config \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{
    "organizationId": "'"$ORG_ID"'",
    "configurationType": "discoveryURL",
    "discoveryURL": "http://keycloak:8080/realms/infisical/.well-known/openid-configuration",
    "clientId": "infisical-dev",
    "clientSecret": "infisical-dev-client-secret",
    "jwtSignatureAlgorithm": "RS256",
    "isActive": true
  }'
```

**Create the LDAP config:**

```bash
curl -X POST http://localhost:8080/api/v1/sso/ldap/config \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{
    "organizationId": "'"$ORG_ID"'",
    "isActive": true,
    "url": "ldap://openldap:389",
    "bindDN": "cn=admin,dc=ldap,dc=com",
    "bindPass": "admin",
    "searchBase": "ou=people,dc=ldap,dc=com",
    "searchFilter": "(uid={{username}})",
    "uniqueUserAttribute": "uid",
    "groupSearchBase": "ou=groups,dc=ldap,dc=com"
  }'
```

**Test an LDAP bind** (the `ldapauth` strategy reads `username`/`password` from the body):

```bash
curl -X POST http://localhost:8080/api/v1/ldap/login \
  -H "Content-Type: application/json" \
  -d '{ "organizationSlug": "ldap", "username": "john", "password": "password123!" }'
```

A `200` with a `nextUrl` means the bind succeeded.

**Start an SP-initiated SAML login** (expect a `302` to Authentik carrying a `SAMLRequest`):

```bash
curl -sI "http://localhost:8080/api/v1/sso/redirect/saml2/organizations/saml" | grep -i location
```

---

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `Upgrade plan to create ... configuration` | EE features not unlocked. See [Unlocking SSO](#unlocking-sso-ee-feature-gating), then restart the backend. |
| OIDC fails with an issuer / `iss` mismatch | The issuer is pinned to `http://localhost:8088` via Keycloak's `KC_HOSTNAME`, so the seeded config shouldn't hit this. If you overrode the discovery URL, keep the backend reaching Keycloak over the compose network (`keycloak:8080`) and leave `KC_HOSTNAME` pointing at the host the browser uses (`localhost:8088`). |
| Redirected to a broken page after Keycloak login | `SITE_URL` does not match the app URL. Set `SITE_URL=http://localhost:8080`. |
| Backend cannot reach the discovery URL | Inside Docker `localhost:8088` is the backend itself. Use the internal compose address `http://keycloak:8080/...` for OIDC discovery (or `ldap://openldap:389` for LDAP). |
| Keycloak admin console (`localhost:8088`) shows "HTTPS required" | The built-in `master` realm defaults to `sslRequired=external`, which Docker Desktop's non-local client IP trips over plain HTTP. The one-shot `keycloak-config` sidecar flips it to `NONE` on every `up`; refresh once it logs `master realm sslRequired=NONE`. (The `infisical` realm is already `none`, so the login flow is unaffected.) |
| Keycloak realm/users missing after a restart | The container is ephemeral; recreate it with `docker compose -f docker-compose.dev.yml --profile oidc up -d --force-recreate keycloak keycloak-config`, or `make down` then `make up-dev-oidc`. |
| LDAP users missing | Run `make seed-dev-ldap` after the container is up (OpenLDAP starts empty). |
| Login rejected: email domain not in the org's accepted domains | The org has no verified domain matching the user's email. `make seed-dev-oidc` verifies `oidc.com` (the `oidc` org), `make seed-dev-ldap` verifies `ldap.com` (the `ldap` org), and `make seed-dev-saml` verifies `saml.com` (the `saml` org); pass `ORG_ID=<org>` to verify a domain for another org. See [Email Domain Verification](docs/documentation/platform/email-domain). |
| SCIM users not appearing in the `saml` org | Re-run `make seed-dev-saml`; it recreates the Authentik SCIM provider so stale per-user connections (e.g. after an Infisical DB reset) don't dead-end on PUTs to ids that no longer exist. Provisioning also needs an active SSO config + verified domain + SCIM enabled, all set by the seed (`Neither SAML or OIDC SSO is configured` means the SAML config is missing). Provisioned users land with `invited` status; the seed polls and retries until it logs `SCIM provisioning confirmed` (if it logs `incomplete`, re-run). |
| SAML login fails with `assertion audience mismatch` | Authentik's SAML provider audience must equal `SITE_URL` (`http://localhost:8080`); the seed sets this. If you changed `SITE_URL`, re-run `make seed-dev-saml` so Authentik's audience and the SAML config agree. |
| Authentik unreachable or `Token invalid/expired` during the seed | Authentik takes ~40s after `make up-dev-saml` to finish bootstrapping (the worker applies blueprints and creates the API token). Wait for http://localhost:9100 to load, then re-run `make seed-dev-saml`. |
| Locked out after enforcing SSO | Recover via http://localhost:8080/login/admin. |
