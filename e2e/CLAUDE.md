# CLAUDE.md

Guidance for Claude Code sessions working in this directory. Covers both the operator-facing view (env vars, bootstrap, how to run) and the agent-facing context (architecture, gotchas, file layout).

## What this directory is

External Playwright suite targeting a deployed Infisical environment (gamma). Runs in CI between `gamma-deployment` and any prod-deploy job — defined as `gamma-playwright-e2e` in the `infrastructure` repo's `.github/workflows/infisical-deployment.yml`. A red run blocks all 11 prod/dedicated deploy jobs via `needs:`.

**Not** the same as `backend/e2e-test/`, which is in-process Vitest with a bootstrapped server. That one tests the backend in isolation; this one tests the deployed product as a black box.

## Scope discipline

This suite exists for **smoke-level** verification — "does the surface still work end-to-end against real infrastructure." If a test is best expressed as "given these inputs to a function, assert these outputs," it belongs in a unit or integration test, not here. The CI cost per test (minutes, not seconds) makes narrow coverage expensive.

Concrete rule: a test here should be *useful even if every integration test passed*. It's catching things integration tests can't — config drift, deploy regressions, end-to-end auth flows that depend on real IdPs.

## Architecture

- **Playwright** — TypeScript, Chromium project only. Single worker, `fullyParallel: false`. The single-worker constraint is load-bearing — see "Serial execution" below.
- **Two-token CI surface.** Only the two real secrets (`E2E_SCIM_TOKEN`, `E2E_IDP_ADMIN_TOKEN`) come from env vars — validated fail-fast in [`helpers/env.ts`](helpers/env.ts). Deploy-level identifiers (gamma URL, org slug, IdP URL, SAML config row id) are constants in [`helpers/constants.ts`](helpers/constants.ts). The deliberate tradeoff: re-seeding gamma's e2e org rotates the `saml_configs.id`, which then has to be updated in code instead of in a GH Actions secret.
- **Twingate-gated.** Gamma sits behind Twingate; the CI workflow installs the Twingate connector before tests run. Locally, you need to be on Twingate too. The Playwright Chromium inherits routes from the host network connector.
- **Mock IdP we control.** SAML SSO points at `preview-orchestrator.infisical.workers.dev/saml-idp/*` — Hono routes on the existing `preview-environments` Worker, using `samlify` for signing under `nodejs_compat`. No SaaS account, no vendor DOM. The test calls `POST /saml-idp/identity` with a per-run NameID, sets the returned session id as a cookie on the Worker domain, then navigates to gamma's SAML start URL; the browser carries the cookie through gamma's 302 to the IdP, which mints a signed assertion for that identity. Cert is committed at [`fixtures/idp-cert.pem`](fixtures/idp-cert.pem); private key is in CF Secrets only (`SAML_IDP_PRIVATE_KEY`). Worker code lives in the `preview-environments` repo, not here — that side of the system is owned separately.
- **Two SAML entry shapes, one spec file.** `tests/scim-saml-auth.spec.ts` covers both variants under one `describe`. SP-initiated navigates to gamma's `/api/v1/sso/redirect/saml2/organizations/:orgSlug` first; gamma 302s the browser to the Worker's `/saml-idp/sso` with an `AuthnRequest`. IdP-initiated starts at the Worker's `/saml-idp/initiate`, which mints an *unsolicited* signed `SAMLResponse` (no `InResponseTo` per SAML 2.0 §3.4.1.5) and auto-POSTs it directly to gamma's ACS at `/api/v1/sso/saml2/:samlConfigId`. The IdP-initiated test passes the gamma ACS URL through `POST /identity` (validated against the gamma SP origin allowlist), reachable via `gammaSamlAcsUrl()` in [`helpers/idp-client.ts`](helpers/idp-client.ts).

## Load-bearing identity coupling

This is the one detail that, if you get it wrong, makes the test silently fail in confusing ways:

```
SCIM userName  ==  SAML NameID emitted by the IdP  ==  UserAlias.externalId
```

The chain works because:
- SCIM provisioning creates `UserAlias.externalId = req.body.userName` (backend `scim-router.ts:266` → `scim-service.ts:499`).
- Org auth method is SAML, so the alias type is SAML (`scim-service.ts:428`).
- SAML login looks up by `userAliasDAL.findOne({ externalId: profile.nameID, orgId, aliasType: SAML })` (`saml-config-service.ts:535`).

With the in-house mock IdP, the test now **owns this value end-to-end**: it generates a per-run `EXTERNAL_ID` (`e2e-${runId}@infisical-e2e.test`) and passes the same string as the SCIM `userName`, the IdP `email` (which samlify uses as the SAML `NameID`), and implicitly as `UserAlias.externalId`. There's no SaaS-side configuration to drift. If `tests/scim-saml-auth.spec.ts` and `helpers/idp-client.ts` agree on the value, the chain holds.

The current test still ends at `/signup/sso?token=…` rather than `/login/select-organization` — gamma routes any `userAlias.isEmailVerified = false` user through `SIGNUP_REQUIRED` (`auth-login-service.ts:322`), and SCIM hardcodes that field to `false` (`scim-service.ts:506`). The signup token JWT contains the verified identity fields. Patching the SCIM service to mark aliases verified at provisioning time would flip the redirect back to the original `/login/select-organization`; that's a separate backend change.

## Serial execution is intentional

Tests run with a single worker. The old reason (single static IdP identity) is gone — the mock IdP can mint an assertion for any NameID the test asks for, so per-run unique externalIds already work.

What still binds us to single-worker is the **shared gamma org**: there's one `saml_configs` row, one set of `email_domains` rows, one `orgAuthMethod`. Concurrent tests writing to the same org's `user_aliases`/`memberships` rows risk subtle interleavings (e.g. the same email landing on a fallback `userDAL.findOne({ username })` from two flows at once). Unblocking parallelism would mean either per-test gamma orgs (heavier seed script) or accepting that risk for tests that don't touch shared org state.

If you do enable parallel workers, also ensure the IdP `/saml-idp/identity` flow's cookie scoping survives — the Worker sets `path=/saml-idp`, so multiple concurrent tests can each set their own session cookie value on the Worker origin without collision (Playwright contexts are already isolated per test).

## File layout

| Path | Purpose | Touch when... |
|---|---|---|
| `playwright.config.ts` | Runner config — baseURL, retries, reporter | Adding a project (e.g. Firefox), changing retry policy |
| `helpers/env.ts` | Fail-fast env loader for the two bearer-token secrets | Adding a new *secret* (also update `.env.example` and the CI workflow) — non-secret config goes in `constants.ts` instead |
| `helpers/constants.ts` | Hardcoded deploy-level identifiers (gamma URL, org slug, IdP URL, SAML config id) | Gamma's e2e org is re-bootstrapped and `saml_configs.id` rotates — update `SAML_CONFIG_ID`; the seed script logs the new value on the `[seed] E2E_SAML_CONFIG_ID = <uuid>` line |
| `helpers/scim.ts` | SCIM CRUD wrappers, reusable across tests | Any new SCIM operation a test needs (e.g. Groups) |
| `helpers/idp-client.ts` | Talks to the mock IdP — stashes a NameID (+ optional ACS URL for IdP-initiated), sets the Worker-domain session cookie, and starts either SP- or IdP-initiated flows | Adding a new SAML-flavored flow, or if the Worker IdP's API/cookie scheme changes |
| `tests/*.spec.ts` | One test per flow | Adding a new flow (see below) |
| `fixtures/idp-cert.pem` | Committed public cert for the mock IdP; gamma's SAML config row holds this same cert (KMS-encrypted) | Rotating the IdP keypair (see [`fixtures/README.md`](fixtures/README.md)) |
| `tsconfig.json` | TS config — no `baseUrl`/`paths` on purpose, relative imports only | Avoid unless you have a real reason |

## Adding a new test

1. **One *flow* per file**, not one test per file. A flow is a distinct end-to-end path being verified (e.g. "SCIM-provisioned user logs in via SAML", "SAML response rejection", "SCIM deactivation revokes SAML login"). Variants of the *same* flow that differ only in entry shape or input (SP-initiated vs IdP-initiated SAML; each strictness gate within a rejection suite) belong in the same file under one `test.describe`, as multiple `test()` blocks. Distinct flows get their own file.
2. Name the file after the flow (`scim-saml-auth.spec.ts`, `saml-rejection.spec.ts`, `scim-deactivation.spec.ts`). Per-variant naming goes inside the file as test titles.
3. Import from `../helpers/constants`, `../helpers/env`, `../helpers/scim`, `../helpers/idp-client`. Add a new helper module only if a fundamentally new flow needs shared setup (e.g. an OIDC helper if/when that's covered).
4. **Per-variant state goes in `beforeEach` / `afterEach`**, not `beforeAll` / `afterAll`. Each variant test should own its own SCIM user (fresh `externalId`) so a mid-test crash on one variant doesn't poison the next. See `saml-rejection.spec.ts` for the pattern. Use `beforeAll`/`afterAll` only when there's genuinely shared, idempotent state across the whole file.
5. **Always clean up.** `beforeEach` defensively deletes any state the test creates; `afterEach` deletes what the test produced. Tests crash mid-flow sometimes; the e2e org accumulates rows otherwise. Note: the SAML signup branch also creates a fresh user row on each run — currently leaks; revisit when SCIM's `isEmailVerified` default is patched.
6. **One assertion-block per test should be enough** to claim the variant works. Factor a shared `expect…()` helper inside the file when multiple tests assert the same outcome shape (e.g. `expectSignupSsoRedirectFor(page, email)` in `scim-saml-auth.spec.ts`) — that's preferable to copying ~10 lines of expect calls across tests. Don't expand a smoke test into a unit-test-style assertion sprawl — push fine-grained detail into integration tests.
7. **Don't share helpers across spec files.** Helpers live in `helpers/*` or as file-local consts/functions at the top of the spec. Cross-spec imports create CI debugging cliffs — avoid.
8. Run locally first (`npm test`) with `.env` populated. CI will replicate via GH Actions secrets.

## What you can break by accident

These external dependencies have to stay in sync — if you change the backend or the Worker, the test breaks silently. Worth grepping for after any change in these areas:

- **SCIM endpoint URL** (`backend/src/ee/routes/v1/scim-router.ts`, mounted at `/api/v1/scim`). `helpers/scim.ts` hardcodes `/api/v1/scim/Users` and `/api/v1/scim/Users/:id`. If the router prefix moves, update here.
- **SAML start/ACS URLs** (`backend/src/ee/routes/v1/saml-router.ts`). `helpers/idp-client.ts` hardcodes `/api/v1/sso/redirect/saml2/organizations/:orgSlug` (SP-initiated) and `/api/v1/sso/saml2/:samlConfigId` (IdP-initiated ACS, built from `SAML_CONFIG_ID` in `helpers/constants.ts`). If either path moves, both consumer sites need to follow.
- **Post-login redirect** (`saml-config-service.ts` → `auth-login-service.ts:322`). `tests/scim-saml-auth.spec.ts` asserts `/signup/sso?token=…`; if SCIM gets patched to mark aliases verified, the redirect flips to `/login/select-organization` and the assertion needs to follow.
- **NameID-to-externalId mapping** (`saml-config-service.ts:535`). Currently `profile.nameID`. If the matching attribute changes, the identity-coupling section above becomes stale.
- **`scimEnabled` / `orgAuthMethod` semantics** (`scim-service.ts:413, 419`). If new gating gets added (e.g. additional flags), the seed script in `backend/scripts/seed-gamma-fixtures.ts` needs to set them.
- **Verified email domain check** (`email-domain-fns.ts:11`). SCIM POST and SAML login both require the email domain to be on the org's `email_domains` allowlist with `status='verified'`. The seed script writes one for `infisical-e2e.test`; if the test ever uses a different domain, add a row.
- **Mock IdP cert ↔ gamma SAML config cert** must match. Seed script reads the committed cert from `e2e/fixtures/idp-cert.pem` and KMS-encrypts it into the `saml_configs` row; the Worker signs with the matching private key from `SAML_IDP_PRIVATE_KEY` (CF Secret). Rotating one requires rotating the other — see `fixtures/README.md`.
- **passport-saml strictness** (`saml-router.ts:51-117`). Under `authProvider = keycloak-saml` (what the seed script writes), no overrides apply — passport-saml requires both Response and Assertion signed, attribute `email`/`firstName`/`lastName` present, and audience matching `appCfg.SITE_URL`. `validateInResponseTo` defaults to `"never"` in `@node-saml/node-saml` 5.x, which is why the IdP-initiated path works at all; flipping it to `"ifPresent"` or `"always"` would break IdP-initiated first. The Worker's unsolicited template omits `InResponseTo` entirely (per SAML 2.0 §3.4.1.5) so the test stays valid if that default is ever tightened. Changing the seed's `authProvider` value would change the strictness profile.

## Common pitfalls

- **Diagnostics about `@playwright/test`** before `npm install` runs — expected. Resolve by `cd e2e && npm install`.
- **The seed script's bootstrap is one-pass now.** Direct DB writes don't trigger `updateSamlCfg`'s `scimEnabled=false` side effect, so a single run leaves a usable state. (The old SSOJet-era two-pass requirement is gone.) Re-run is still safe; it's idempotent.
- **CF Access bypass for `/saml-idp/*`** must be in place on the `preview-orchestrator` Worker, otherwise every request to the mock IdP 302s to the CF Access login page. The bypass is safe because the IdP routes have their own auth (`Authorization: Bearer SAML_IDP_ADMIN_TOKEN` on `/identity`, cookie + KV lookup on `/sso` and `/initiate`, intentionally public on `/metadata.xml`).
- **Worker changes ship via `wrangler deploy`**, not the gamma deploy. After editing Worker code (`/saml-idp/*` routes, IdP templates), deploy from the `preview-environments` repo before running the test or it'll hit the previous version. `tsc` passing here doesn't prove the Worker is up to date.
- **SCIM POST + SAML signup leak a user row per test run** because the SAML signup branch creates a fresh `users` row even though SCIM already created one. SCIM `DELETE /Users/:id` removes the membership but not the orphan user. Tractable but accumulates; revisit if it becomes noisy.
- **Don't add a `.npmrc` here for the 7-day minimum-release-age rule** — `e2e/` is a test harness, not a runtime artifact. The supply-chain concern that motivates the rule in `backend/`/`frontend/` doesn't apply.
- **CI uses `npm install`, not `npm ci`** — we don't commit a lockfile yet. If you commit `package-lock.json`, switch the workflow to `npm ci` for determinism. Both are fine; just keep them consistent.
- **Don't widen what the seed script creates** unless you've thought through the safety. It already refuses prod (host/dbname regex + `INFISICAL_ENV=prod` + interactive confirmation). Adding more powerful operations means re-evaluating the guard surface.

## Where context lives

- CI workflow: `infrastructure` repo, `.github/workflows/infisical-deployment.yml` (the `gamma-playwright-e2e` job)
- Seed script: [`../backend/scripts/seed-gamma-fixtures.ts`](../backend/scripts/seed-gamma-fixtures.ts)
- Backend SCIM service: `../backend/src/ee/services/scim/`
- Backend SAML service: `../backend/src/ee/services/saml-config/`
- Mock IdP Worker code: `preview-environments` repo, `src/saml-idp/` (separate repo — owned independently)
- IdP keypair provenance + rotation: [`fixtures/README.md`](fixtures/README.md)
- Root architectural notes: [`../CLAUDE.md`](../CLAUDE.md), [`../backend/CLAUDE.md`](../backend/CLAUDE.md)
