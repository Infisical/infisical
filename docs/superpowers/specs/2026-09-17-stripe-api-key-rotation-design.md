# Stripe API key secret rotation (ENG-5685)

Design for rotating Stripe secret API keys on top of the Stripe app connection landed in
`551d660262`. Ticket: [ENG-5685](https://linear.app/infisical/issue/ENG-5685). Draft PR:
[#8194](https://github.com/Infisical/infisical/pull/8194).

## The constraint that shapes everything

Stripe does not let any API key create another API key. The only principal that can is an installed
Stripe App holding `api_key_write`, which is why the connection exists at all.

Infisical authenticates with its own Stripe secret key (`INF_APP_CONNECTION_STRIPE_SECRET_KEY`) and
names the customer's account with the `Stripe-Context` header. The OAuth exchange's access and
refresh tokens are deliberately not stored, so the connection persists only the customer's
`accountId`. Rotation reads that `accountId` off the connection and otherwise uses instance
configuration. There is no per-connection token to refresh and no expiry to track.

One consequence: nothing proactively notices that a customer uninstalled the app. It surfaces as a
403 at rotation time. That is the accepted cost of storing no tokens, and the error handling below
accounts for it.

## What we measured

Everything in this section was measured against a gated Stripe sandbox
(`acct_1UG1HNCkOyYCRDAl`, test mode) on 2026-09-17, not inferred from the PoC's comments. The PoC at
[stripe-secret-rotation-poc](https://github.com/Infisical/stripe-secret-rotation-poc) asserts some of
these in source comments, but it records no output and its claims about the empty permission list
turned out to be wrong.

| Question | Answer |
| --- | --- |
| Does `rotate` leave a grace period? | No. It mints a new key object with a new id, the old id 404s, and the old token dies at once. |
| Does `expire` take effect immediately? | No. The key kept authenticating for ~9s, then returned 401. |
| Does `permissions: []` revoke a key? | No. It returns 200 and silently changes nothing. Stored permissions were unchanged 60s later and the key still worked. |
| Does narrowing to a non-empty list work? | Yes, and it bites within ~1s. |
| Can we narrow to a permission the key never held? | Yes. All four candidates tried were accepted and dropped every real capability to 403 within 1.5s. |
| Is `status` updatable? | No. `'status: Unknown field, did you mean name, note?'` |
| Is `ip_allowlist` updatable? | No. Readable on the key object, but `'ip_allowlist: Unknown field.'` on update. |
| Which fields does update accept? | `name`, `note`, `permissions`, `connect_permissions`. |
| What does the list endpoint return? | `data`, `next_page_url`, `previous_page_url`. |
| Does retrieve carry the permission lists? | Yes, both `permissions` and `connect_permissions` as arrays. |
| What does create return in test mode? | The secret in plaintext at `secret_key.token`. |
| Can the FIPS image decrypt Stripe's JWE? | Yes. Under `--force-fips` with `crypto.getFips() === 1`, OAEP-SHA1, OAEP-SHA256 and A256GCM all round-trip. |
| Can `permissions` and `connect_permissions` be narrowed in one request? | Yes, on a Connect-platform sandbox. Both stored as sent. Untested against an account that is not a Connect platform. |
| Do list items carry the permission arrays? | Yes, both, so the form's prefill needs no per-key retrieve. |
| Does the list endpoint return secrets? | Yes. Every item carries `secret_key.token` in full plaintext, alongside `secret_token_redacted`. |
| What is the maximum page size? | 100. `limit=200` returns 400 `'limit: The maximum page limit is 100'`. |
| What prefix do minted keys carry? | `rk_`, a restricted key, not `sk_`. |

The FIPS result settles whether *we* can decrypt what Stripe sends: even if Stripe returns
`alg: RSA-OAEP` (OAEP with SHA-1) rather than OAEP-256, the OpenSSL 3 FIPS provider permits it for
key transport, so there is no lead time on Stripe. It does not settle what Stripe actually sends,
which is a separate and still-open risk. See "Open risks".

The ~9s expire delay is a single sample from one sandbox, so we treat the expire window as unknown
rather than as 9 seconds.

## The list endpoint returns live secrets

Every item `GET /v2/iam/api_keys` returns carries `secret_key.token` in full plaintext, for every key
in the account, not just the ones we manage. A redacted form sits beside it in
`secret_token_redacted`.

This makes `listApiKeys` a handling problem rather than a plumbing one. Three rules follow, and none
of them are optional:

- `listApiKeys` maps each item to a narrow shape (`{ id, name, permissions, connectPermissions,
  status }`) and never returns the Stripe object. The mapping happens in the service, not the router,
  so no caller can reach the raw object.
- The route's response schema is an explicit allowlist, never a passthrough or a `.partial()` of a
  Stripe shape. A passthrough schema here ships every secret key in the customer's Stripe account to
  the browser.
- Nothing logs the raw response body. The shared error extractor already reads only
  `error.response.data.error.message`, which is safe, but a `logger.debug(response.data)` added later
  would not be.

The test for `listApiKeys` asserts the absence of `secret_key` in its output, so that a future
refactor that widens the mapping fails the suite rather than leaking quietly.

## Rotation is create-then-retire, not `rotate`

Stripe's `rotate` endpoint is disqualified. It kills the old token instantly and mints a new id, so
every consumer of the secret breaks at the moment of rotation. Rotation has to create a new key and
retire an old one separately.

That maps cleanly onto the framework's existing two-slot model. `rotateGeneratedCredentials` keeps
two generations of credentials and hands the factory the *inactive* one to revoke, which is the key
from two rotations ago, not the live one. So the handover window is a full rotation interval and it
does not depend on expire being prompt. This is the reason the design survives treating the expire
window as unknown.

## Where the code goes

```
backend/src/services/app-connection/stripe/
  stripe-connection-public-client.ts   new: shared auth, headers, error shaping, pagination
  stripe-connection-service.ts         new: listApiKeys, backing the form's prefill
  stripe-connection-fns.ts             refactored onto the public client

backend/src/ee/services/secret-rotation-v2/stripe-api-key/
  stripe-api-key-rotation-constants.ts
  stripe-api-key-rotation-schemas.ts
  stripe-api-key-rotation-types.ts
  stripe-api-key-rotation-fns.ts
  stripe-api-key-rotation-fns.test.ts
  stripe-api-key-jwe.ts                parse and decrypt, no HTTP
  stripe-api-key-jwe.test.ts
  index.ts
```

The public client is a targeted fix rather than a drive-by refactor. `getStripeSecretKey`, the
`STRIPE_PREVIEW_API_VERSION` constant and the error-message extraction are private inside
`stripe-connection-fns.ts` today, and rotation needs all three. Following the
`supabase-connection-public-client.ts` precedent keeps one definition of what a Stripe request looks
like, so the connection check and the rotation cannot drift on the preview version header.

JWE parsing lives in its own file with no HTTP in it, so the crypto is testable against fixtures
without mocking a request.

Wiring points mirror the app-connection ones in `551d660262`, but "the compiler will find them" is
only half true, so they are enumerated here.

The compiler catches these, because adding the enum member breaks them:

- `secret-rotation-v2-maps.ts`, both the name map and the connection map
- `secret-rotation-v2-fns.ts`, the list-options map
- `secret-rotation-v2-service.ts`, `SECRET_ROTATION_FACTORY_MAP`
- `secret-rotation-v2-routers/index.ts`, the router map
- `frontend/src/helpers/secretRotationsV2.ts`, the name/image map, the connection map, and
  `IS_ROTATION_DUAL_CREDENTIALS`, which is `true` here because Stripe is create-then-retire
- the four frontend registries: Parameters, Review, SecretsMapping and ViewGeneratedCredentials

The compiler does not catch these, and missing one breaks the feature silently:

- `secret-rotation-v2-union-schema.ts`, an array member in a discriminated union
- `secret-rotation-v2-router.ts`, the list-item schema union
- `secret-rotation-v2-types.ts`, five separate union members
- `backend/src/lib/api-docs/constants.ts`, the `SecretRotations.PARAMETERS` and `SECRETS_MAPPING`
  describe strings
- `frontend/src/components/secret-rotations-v2/forms/schemas/index.ts`, the union
- a new `stripe-api-key-rotation-router.ts`

New, and specific to the `listApiKeys` route:

- the endpoint in `stripe-connection-router.ts`, which today only calls
  `registerAppConnectionEndpoints`. `supabase-connection-router.ts` is the template, with
  `readLimit`, an `operationId`, a named response key and `verifyAuth([AuthMode.JWT, AuthMode.OAUTH])`
- `stripe: stripeConnectionService(connectAppConnectionById)` in `app-connection-service.ts`, beside
  `supabase:` at line 1415. This is a plain object literal, so omitting it compiles and then 500s at
  runtime
- `frontend/src/hooks/api/appConnections/stripe/queries.tsx`, plus its types and query-key wiring

The frontend image entry needs `Stripe.svg`. The integrations image directory carries an svg, so the
`.png` in neighbouring entries is not a template to copy.

## What the user configures

Permissions are ordinary rotation parameters, following the Cloudflare API token and dbt service
token precedent:

- `permissions: string[]`, minimum one entry.
- `connectPermissions: string[]`, optional.
- Secrets mapping has one entry, `apiKey`, defaulting to `STRIPE_SECRET_KEY`.
- Generated credentials are `{ keyId, apiKey }`.

There are two established patterns in this repo for where a rotated credential's permissions come
from. Most providers name a container that already owns them (`serviceAccountId` for the Datadog application key,
`projectId` for OpenAI, `projectRef` for Supabase, `objectId` for Azure). Cloudflare and dbt declare
them explicitly as parameters, because permissions attach to the credential itself and there is no
container in between. Stripe is the second case: a key's permissions live on the key, and there is no
service account or project object. So Cloudflare is the analogue and explicit parameters are the
precedent.

The 158 permission names live in one backend constant, validated with `z.nativeEnum`, and the
frontend picker imports that same list. An earlier draft validated shape only and kept the list on
the frontend, on the argument that Stripe would validate the names for us when `issueCredentials`
mints the first key. That argument does not survive contact with `PATCH`: updating an existing
rotation's permissions mints nothing, so a bad name would sit there until the next scheduled
rotation, which is precisely the 3am failure the argument claimed to avoid.

A backend enum also follows dbt, which is the closest precedent and validates membership with
`z.nativeEnum(DbtPermissionsSet)` over 27 names. Cloudflare's `permissionGroupIds` are free-form only
because they are opaque Cloudflare-generated IDs rather than a fixed vocabulary. Stripe's names are a
fixed vocabulary, so dbt is the model. `CODE_QUALITY.md` asks for the same thing twice over, once for
enums appearing in the generated docs and once for bounding every string.

Alongside the enum, the array carries `.max(200)`, comfortably above the 158 that exist, so a caller
cannot post an unbounded list.

The cost is that a permission Stripe adds later is rejected until we update the constant. That is a
one-line change, it fails loudly at request time rather than silently at rotation time, and it is the
trade the guide asks for.

Permissions have no wildcard and there is no unrestricted key type, so "full access" means listing
all 158. The PoC enumerated them by probing each one, which implies there is no endpoint that lists
them, so the constant has to be maintained by hand.

## Retiring a key

One helper, `$retireKey(keyId)`, owns retirement and both callers go through it: the retirement
inside a rotation, and delete-with-revoke. For v1 it does one thing.

`POST /v2/iam/api_keys/{id}/expire`, treating 404 as already gone. A failure here is fatal, because
this is the retirement.

### Why there is no permission narrowing in v1

Narrowing a key's permissions is the only lever Stripe gives us with immediate effect, and we
measured it working: about a second to drop every capability to 403, including when narrowing to a
permission the key never held. An earlier draft of this design used it, setting retired keys to
`apple_pay_domain_read` before expiring them.

It is deliberately not in v1. Expire lands within minutes, rotations run on a weekly or monthly
cadence, and the key being retired stopped being the live secret a full interval earlier. Against
that, the delay expire leaves is insignificant, and narrowing costs an extra call, an extra failure
mode, a hardcoded permission name needing explanation wherever a customer might see it, and a
fallback path for accounts that are not Connect platforms.

The measured facts are kept in this document so adding it back is a decision, not a re-investigation.
It goes inside `$retireKey` and nothing else in the factory needs to know.

## Lifecycle

`issueCredentials`: mint key #1 from the parameters and commit. Nothing else is touched. If the
commit throws, expire the key we just minted and rethrow, for the same reason `rotateCredentials`
does. This is not theoretical: the create callback takes an advisory lock and re-runs
`$throwOnConflictingSecrets` inside the transaction
(`secret-rotation-v2-service.ts:653`), so a racing create legitimately throws after the key exists in
Stripe.

`rotateCredentials(credentialsToRevoke, callback, activeCredentials)`:

1. Mint a new key from `secretRotation.parameters.permissions` with a freshly generated RSA keypair.
2. Retire `credentialsToRevoke`, the key from two rotations ago, through `$retireKey`.
3. Commit through the callback.
4. If the commit throws, expire the key we just minted and rethrow, so a failed database write does
   not leave a live Stripe key nobody is tracking.

Step 2 before step 3 is deliberate, and follows the Azure ordering rather than the Supabase one. It
keeps Postgres and Stripe consistent: nothing is committed until the retirement has happened, so the
stored credentials always describe keys that exist in the state we think they do. The Supabase
ordering commits first, so each of BullMQ's five attempts would mint and commit another key.

It does not make orphans impossible. When retirement fails for a reason that also breaks the cleanup
expire (a Stripe outage, a network partition mid-sequence), each attempt mints a key it then cannot
clean up. What bounds the damage is that the most likely cause of a retirement 403, a revoked app
install, fails the create first, so nothing is minted at all.

## Minting a key

`POST /v2/iam/api_keys` with `type: "secret_key"`, a generated `name`, the two permission lists from
parameters, and a `public_key` Stripe encrypts the result to. Publishable keys are out of scope,
since they are not secrets.

The minted key's mode follows the mode of the instance's `INF_APP_CONNECTION_STRIPE_SECRET_KEY`. An
instance configured with a test key mints test keys, and there is no per-rotation choice. That is a
property of the connection design rather than something rotation can fix, so it belongs in the docs.

### The RSA keypair is ephemeral

Generate a fresh RSA-2048 keypair inside the create call, use it for that one request, and let it
fall out of scope when the function returns. Use the asynchronous `generateKeyPair`, not
`generateKeyPairSync`: this runs in a process that is also serving API traffic, and Node is
single-threaded, so tens of milliseconds of synchronous keygen is exactly the stall `CODE_QUALITY.md`
warns about. The private key is never written anywhere, never
KMS-wrapped, and never reused.

This settles the open question in the handoff about where the private key lives and how long it
lives. There is no per-rotation, per-connection or instance-wide keypair to decide about, because the
key exists for the duration of one HTTP request. The cost is one RSA-2048 keygen per rotation,
off the event loop, against a call that already crosses the internet.

### Two response shapes, both real

Test and sandbox accounts return the secret in plaintext at `secret_key.token`. Live accounts return
`secret_key.encrypted_secret.ciphertext`, a compact JWE. We handle both and throw a clear error if
neither is present. This is not defensive padding: the sandbox we develop against takes the first
branch and production takes the second, so shipping only one means the feature is untested in exactly
the mode that matters.

### JWE handling

A JWE is the encrypted counterpart of a JWT. Where a JWS is signed and its payload is readable by
anyone, a JWE's payload is unreadable without the key, and the compact form has five dot-separated
segments rather than three: `header.encryptedKey.iv.ciphertext.tag`. It is a hybrid scheme because
RSA cannot encrypt much data directly, so Stripe encrypts the secret with a random AES-256-GCM
content key and encrypts that content key with our RSA public key. That is why the header carries two
algorithm fields, `alg` for how the content key was wrapped and `enc` for how the payload was
encrypted.

`stripe-api-key-jwe.ts` does the following, with no HTTP in it:

- Split on `.` and require exactly five segments.
- Parse the protected header, accepting `alg` of `RSA-OAEP` (OAEP with SHA-1) or `RSA-OAEP-256`
  (SHA-256), and rejecting anything else by name. The PoC does
  `alg === "RSA-OAEP" ? "sha1" : "sha256"`, which silently treats an unrecognised algorithm as
  SHA-256 and surfaces it as an opaque padding failure.
- Require `enc` of `A256GCM`.
- Unwrap the content key with `privateDecrypt`, then AES-256-GCM with the auth tag and the ASCII
  bytes of the protected header segment as AAD.

The GCM tag already guarantees integrity, so there is no prefix check on the decrypted token.
Asserting it starts with `sk_` would only add a rule to maintain when Stripe introduces a prefix we
have not seen.

### Idempotency, and what it does not buy us

Every POST carries a fresh `Idempotency-Key`. It covers transport-level retries inside a single call,
not BullMQ's five attempts, since each attempt is a fresh rotation that should mint a fresh key
anyway.

The residual failure is a create that times out after Stripe committed it. We never learn the id, so
we cannot expire it, and the customer is left with a key we do not track. We mitigate by naming keys
`infisical-rotation-<rotationId>-<timestamp>`, so a stray is identifiable in the Stripe dashboard as
ours and traceable to a rotation. Reconciling by listing keys and matching the name prefix before
every mint would add a paginated list call and a whole class of "is this stray mine" judgement to
every rotation, which is not worth it for a window that only opens on a timed-out request.

## Error handling

We reuse the connection's existing phrasing, which names the account, the status and Stripe's own
message, and asserts nothing about why:

```
Infisical cannot manage API keys on Stripe account 'acct_x'. Stripe returned 403: <stripe's message>.
```

A revoked app install surfaces here as a 403. We do not assert that as the cause, because we have not
checked it, but the 403 case is narrow enough to offer the remedy conditionally: if the app was
removed from this Stripe account, reinstall it and reconnect. The rotation docs page carries the
same remedy at more length.

What happens when a step fails:

- Create fails: rotation fails, nothing changed, BullMQ retries. Clean.
- Retirement fails: abort before committing, expire the key we just minted, and throw the retirement
  error. If that cleanup also fails, the message names the stranded key id so a human can remove it,
  following the Azure precedent.
- Expire returns 404: the key is already gone, treat as success.
- Commit throws after a successful retirement: expire the new key and rethrow. If that expire also
  fails, the message names the stranded key, the same as the retirement path.
- The transaction commits but the promise rejects, for instance a dropped connection on the response.
  Step 4 would then expire the key that is now the live secret in the database. Low probability, high
  blast radius, and nothing in the factory can distinguish it from a genuine commit failure. We
  accept it and note it here rather than pretending the cleanup is free.
- A permission name Stripe does not recognise: rejected by our own enum at request time, on create
  and on update alike.

Stripe 429s ride on BullMQ's existing exponential backoff. There is no Stripe equivalent of the
concurrent-request quirk that forced Azure to grow its own retry loop, so we do not build one.

Nothing we write claims a key is dead. On delete-with-revoke we say Infisical expired the key in
Stripe, which is exactly what we did.

## Tests

`stripe-api-key-jwe.test.ts`, fixtures built in-test from a local keypair: both algorithms
round-trip, wrong segment count rejected, unknown `alg` and `enc` rejected by name, a tampered tag
fails. Plus the FIPS assertion, which is what stops a toolchain bump from breaking live-mode
decryption silently. The suite already runs under `--force-fips` in the FIPS toolchain image, so this
costs nothing to keep honest.

`stripe-api-key-rotation-fns.test.ts`, mocking `request` the way the Azure suite does: the plaintext
and JWE response paths, retirement happening before the commit, commit failure expiring the new key
on both `issueCredentials` and `rotateCredentials`, cleanup failure naming the stranded key, 404 on
expire tolerated, permissions taken from parameters, and `checkActiveCredentials` treating 403 as
alive and 401 as dead.

`listApiKeys` gets two tests. One for pagination, since reading page one and calling it a list is a
bug under CODE_QUALITY, and one asserting that no `secret_key` field survives the mapping, so that a
future refactor which widens the shape fails the suite rather than leaking every Stripe key in the
customer's account.

There is no e2e test, because it needs the gated sandbox. Manual verification steps against it go in
the PR instead, mirroring its existing verification section.

## Frontend

File-per-provider, following the Cloudflare API token rotation:

- `hooks/api/secretRotationsV2/types/stripe-api-key-rotation.ts`, plus the enum and index entries.
- `forms/schemas/stripe-api-key-rotation-schema.ts`.
- `StripeApiKeyRotationParametersFields.tsx`.
- `StripeApiKeyRotationReviewFields.tsx`, `StripeApiKeyRotationSecretsMappingFields.tsx`,
  `ViewStripeApiKeyRotationGeneratedCredentials.tsx`, and the three registry files that switch on
  rotation type.

The parameters field is the only non-mechanical piece. It holds the permission multi-select and a
"copy from an existing key" prefill backed by a `useStripeConnectionListApiKeys` query against the
new route. The prefill matters because re-deriving a working permission set by hand from 158 entries
risks minting a key that is missing something the caller needs, and that failure lands in production
right after the secret is swapped.

No new shared component is needed. The v3 `Combobox` has a `multiple` chips-based variant, search via
`getOptionKeywords`, and select-all with a count, switched on with the `isSelectAll` prop.
`ComboboxSelectAll` itself is internal and is not exported, so consumers pass the prop rather than
composing the subcomponent. The
[component lifecycle ledger](../../../frontend/src/components/COMPONENT_LIFECYCLE.md) also names
`Combobox` as the replacement for the deprecated `FilterableSelect`, so using it moves with the
migration rather than against it.

Two of its behaviours matter at this list size. Select-all covers only the currently visible result
set, by design, so with a search term active it selects the matches rather than all 158. That is the
right behaviour but it means the UI must not label it in a way that implies otherwise. And the
multiple variant renders one chip per selection, so a full-access rotation renders 158 chips. We keep
the default wrapping layout rather than `singleLine`, which would put 158 chips in a horizontal
scroller, and we accept the height the wrapping list takes.

## Docs

Per the `docs-style` skill, with `make lint-docs-branch` after:

- `docs/documentation/platform/secret-rotation/stripe-api-key.mdx`.
- `docs/integrations/app-connections/stripe.mdx`, still outstanding from the connection PR.
- Eight API reference pages under `docs/api-reference/endpoints/secret-rotations/stripe-api-key/`,
  matching the Cloudflare set, plus `docs.json` and `RotationsBrowser.jsx`.

The rotation page has to state four things plainly, because each is a support ticket otherwise:

- The minted key's mode follows the instance's Stripe key, so a test-mode instance mints test keys.
- Infisical never touches keys it did not create, so the user's original key stays live until they
  expire it themselves, once their applications have picked up the rotated secret.
- Expiry timing is Stripe's, so we describe what we did rather than claiming the key is dead.
- Retirement expires the key, and Stripe decides when that takes effect, so a retired key may keep
  answering briefly.

The connection page has to note that the rotated value is an `rk_` restricted key rather than an
`sk_` secret key, since anything asserting on the prefix will break.

## Out of scope

- Publishable keys. They are not secrets.
- Mapping `keyId` to a secret. It is tracked in the generated credentials but not exposed to
  consumers, unlike Cloudflare and Datadog which map both. Nothing consumes a Stripe key id.
- A user-supplied key `name`, which Cloudflare, dbt, Datadog and OpenAI all take. We generate
  `infisical-rotation-<rotationId>-<timestamp>` instead, because a predictable name is what makes a
  stray key identifiable as ours in the Stripe dashboard.
- Choosing live or test mode per rotation. It follows the instance's Stripe key.
- Re-reading permissions from Stripe on each rotation. Parameters are the source of truth, so
  broadening a key's permissions means editing the rotation.
- Proactive detection of a revoked app install. It surfaces as a 403 at rotation time, which is the
  accepted cost of storing no tokens.
- The shared dev redirect URI question and publishing the app from a clean non-Connect account. Both
  are on the PR's pre-merge checklist and are connection concerns, not rotation ones.

## Open risks

### Live mode is entirely unverified

Everything we measured came from a test-mode sandbox, which returns the secret in plaintext. The live
path is asserted, not observed: that create accepts a `public_key` field, that the response carries
`secret_key.encrypted_secret.ciphertext`, that `alg` is `RSA-OAEP` or `RSA-OAEP-256`, and that `enc`
is `A256GCM`. Our design rejects any other `alg` or `enc` by name, so if Stripe sends something else,
rotation fails in production and nowhere before it. The unit tests cannot catch this by construction,
because they build their fixtures from a local keypair and therefore only prove we can decrypt what
we ourselves encrypted.

This is the top risk on the feature, and the FIPS measurement does not touch it. FIPS answered
whether we can decrypt OAEP-SHA1, not what Stripe actually sends. Verifying it needs a live-mode
account with the Managed API Keys API gated on, which is a Daniel question and has lead time, so it
should start now rather than at the end.

### Stripe's silent 200 on an empty permission list

Returning 200 for `permissions: []` while silently ignoring it looks like a bug, and we are raising
it with them. It does not affect v1, which does not narrow. If they fix it, adding an immediate
revocation step to `$retireKey` becomes a two-line change with no hardcoded permission name to
explain, which is the version of narrowing worth having.
