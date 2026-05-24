# Review: `backend-go/pkg/api` (Pass 2)

Re-review after the first round of fixes. The package has improved substantially — most of the P0/P1 items from pass 1 are resolved. Below is a status table of the prior findings followed by issues that are still open and a few new issues introduced by the refactor.

---

## Status of pass-1 findings

| # | Finding | Status |
|---|---------|--------|
| 1 | AND security claims non-deterministically lost | **Fixed** — `Security` is an ordered `[]SecurityRequirement`; `AuthResult{Schemes, Claims map[string]any}` accumulates per-scheme claims |
| 2 | `ErrSkipToNextAuth` inside AND falls through to next OR | **Documented, not fixed** — see Open #1 |
| 3 | 401 missing `WWW-Authenticate` header | **Fixed** — `buildWWWAuthenticate` populates the header on the default 401 path |
| 4 | `SecurityRegistry` not thread-safe | **Fixed** — `sync.RWMutex` added on all read/write paths |
| 5 | `additionalProperties(false)` not enforced | **Partially fixed** — documented as OpenAPI-only; `ParseRequestWithOptions(DisallowUnknownFields())` exists but is *opt-in and detached* from the schema declaration (see Open #2) |
| 6 | Nested field paths mangled in `ObjectSchema.Validate` | **Fixed** — `inner` is preserved and composed with the outer field name |
| 7 | Required `Int`/`Float`/`Bool` silently accept missing values | **Fixed** — `Validate()` now checks `ptr == nil` instead of `*ptr == 0` |
| 8 | Request body `required` hardcoded to `true` | **Partially fixed** — new helper `BuildOpenAPIRequestBody` computes `required` correctly, but the active spec path `OpenAPISpec.generateRequestBody` (openapi.go:384–398) still hardcodes `true` (see Open #3) |
| 9 | Discriminated `OneOf` skips validation | **Fixed** — `SetActiveVariant` + branch in `Validate()` |
| 10 | `Const` doesn't enforce its value | **Not fixed** — `ConstSchema.Validate()` still returns nil (see Open #4) |
| 11 | Object property iteration non-deterministic in OpenAPI | **Fixed** — `propertyOrder` is now used by `OpenAPI()` |
| 12 | No automatic validation for path/query/header/cookie params | **Partially fixed** — `ParseRequest` exists, but handlers still have to remember to call it *and* validate (see Open #5) |
| 13 | `defaultSecurity`/`defaultTags` don't propagate through `Mount` | **Fixed** — `Mount` copies defaults onto endpoints that lack them |
| 14 | `StringSchema.Pattern` panics on invalid regex | **Fixed** — `TryPattern` (returns error) and `PatternCompiled` (accepts pre-compiled) added |
| 15 | Email validation too permissive | **Fixed** — `EmailStrict()` requires a dot in the domain |
| 16 | `URI` accepts schemeless paths | **Fixed** — `URL()` requires scheme + host |
| 17 | Query array params missing `style`/`explode` | **Partially fixed** — handled in `BuildOpenAPIParameters` (request.go) but **not** in the live `OpenAPISpec.generateParameters` path (see Open #3) |
| 18 | Parameter `description`/`deprecated`/`example` not lifted | **Partially fixed** — same as #17: lifted in `BuildOpenAPIParameters`, not in `generateParameters` |
| 19 | `ExtractPathParams` doesn't strip chi regex constraints | **Fixed** — both `Endpoint.ExtractPathParams` and the new `ExtractPathParams` helper strip `:regex` |
| 20 | All responses labeled "Successful response" | **Fixed** — `ResponseDescriptions` + `defaultResponseDescription` |
| 21 | Global `Security` config not honored on endpoints | Unchanged (consistent with OpenAPI inheritance — acceptable) |
| 22 | `UnionDef.Parse` divergent fast/slow paths | **Fixed** — single parsing path |
| 23 | `NestedUnionDef.OpenAPI` inconsistent with parser on null payload | **Fixed** — `ParseWithType` now rejects null/empty payload |
| Low | `statusCodeToString` rune arithmetic | **Fixed** — uses `strconv.Itoa` |
| Low | `joinStrings` reimplementation | **Fixed** — uses `strings.Join` |

That's all P0/P1 from pass 1 closed or downgraded. Remaining items below.

---

## Still open

### Open #1 — `auth.go:603-605` — `ErrSkipToNextAuth` inside AND still fails the whole entry and falls through to the next OR option
The new code makes this explicit and documents the choice:
```go
if errors.Is(err, ErrSkipToNextAuth) {
    return nil, ErrSkipToNextAuth
}
```
This is now an intentional design ("scheme not present → AND requirement fails → try next OR"), and it's defensible. But there's a real edge case worth thinking about: in `NewSecurity("jwt").And("mfa")`, if the user supplies a valid JWT but no MFA header, the JWT validator passes and the MFA validator returns `ErrSkipToNextAuth`. The current logic propagates the skip and tries the next OR option — which means a request that successfully authenticated half of an AND requirement gets silently demoted into the next OR option (or unauthenticated). For step-up auth flows you almost certainly want a hard 401 with a hint to provide MFA, not a silent fallback.

Recommendation: distinguish "no credential presented at all" (skip, OR fallback ok) from "first AND leg passed, later AND leg has no credential" (hard fail with `WWW-Authenticate` advertising the missing scheme). The simplest fix is: once *any* validator in the AND group returns claims, treat a subsequent `ErrSkipToNextAuth` as a hard failure for that requirement.

### Open #3 — Two parallel OpenAPI generation paths; the live one still has the pass-1 bugs
The new helpers in `request.go` (`BuildOpenAPIParameters`, `BuildOpenAPIRequestBody`) correctly:
- compute `requestBody.required` from field-level `IsRequired()`,
- add `style: form, explode: true` to array query params,
- lift `description`/`deprecated`/`example` from the schema to the parameter object,
- merge body and parameter sources from a single schema.

But the actual spec generator — `OpenAPISpec.generateOperation` → `generateRequestBody`/`generateParameters` (openapi.go) — does **none** of these. Unless a caller bypasses `OpenAPISpec.AddEndpoints` and emits operations manually using the new helpers, every endpoint in the generated spec still suffers from pass-1's #8, #17, #18. The dead code in `openapi.go` is what gets shipped today.

Recommendation: rewrite `generateRequestBody`/`generateParameters` to delegate to the new helpers when the endpoint's request schema has typed sources (i.e. `req.Schema()` is set), and keep the legacy `PathParams/QueryParams/HeaderParams/CookieParams` maps as a fallback only. Right now we have two ways to express the same thing and they disagree.


### Open #5 — `ParseRequest` does not call `Validate()` after parsing
The new parser populates fields from path/query/header/cookie/body but never runs `req.Schema().Validate()`. Every handler still has to remember to call it. Given the framework's selling point is single-source-of-truth validation+OpenAPI, this is the wrong default. A `MustParse` or `ParseAndValidate` returning typed errors would close the gap and reduce footguns.

---

## New issues introduced by the refactor

### New #1 — `ParseRequest` has a parameter-source-confusion / mass-assignment hazard (`request.go:44–87`)
Order of operations:
1. Loop over path/query/header/cookie schemas, call `setFieldValue` which writes into the struct's bound pointer.
2. Call `json.NewDecoder(r.Body).Decode(req)` which writes into the **whole struct** based on its JSON tags.

If a struct field is bound to a path/query/header schema (e.g. `OrgID` with `From(SourcePath)`) but its struct tag isn't `json:"-"`, a request body containing that JSON key will overwrite the path-bound value *after* it was set from the URL. This is exactly the mass-assignment shape OWASP warns about.

The existing tests skirt this by convention (`OrgID string `json:"-"`` in `request_test.go:15`), but nothing in the framework enforces it. A schema bound to `*UserID` with `From(SourcePath)` and a struct field `UserID uuid.UUID `json:"user_id"`` is a silent vulnerability: clients can supply `{"user_id": "<victim>"}` in the body and override the URL parameter.

Recommendation, in priority order:
- Reverse the order: decode body **first**, then overwrite with path/query/header/cookie values (URL-supplied wins).
- Or: at registration time, panic if any non-`SourceBody` schema's struct field has a usable JSON tag (i.e. not `json:"-"` and not unexported).
- At minimum, document the `json:"-"` requirement loudly in the `From()` godoc.

This is the most security-relevant open issue.

### New #2 — `ParseRequest` skips body when `r.ContentLength == 0`
`request.go:83` — `r.ContentLength != 0` is the gate. Two problems:
- `ContentLength == -1` means "unknown" (HTTP/1.1 chunked, HTTP/2 without an explicit header). The condition is true, so body *is* parsed — fine for chunked.
- `ContentLength == 0` skips parsing. But a request can legitimately set `Content-Length: 0` and still expect downstream errors (e.g. POST with no body where the schema requires body fields). Today such a request silently passes parsing and only fails at `Validate()`.

This is benign as long as Validate() is called — but combined with Open #5 (no auto-validate), it produces silent success.

### New #3 — `setFieldValue` returns nil on empty value (`request.go:94-96`)
For required path params, chi rejects missing path parts via 404 (so this is fine for paths), but for required headers/cookies/query, `value == ""` is just treated as "not provided" and `setFieldValue` returns nil. Without a follow-up `Validate()`, the request gets to the handler with the field zero. Same root cause as Open #5; double-flagging because it interacts with required-headers in particular (e.g. `X-Org-ID` header missing → silent zero).

### New #4 — `r.URL.Query().Get(name)` parses the URL on every field (`request.go:54`)
Minor perf nit: `r.URL.Query()` is `O(n)` over the raw query string. Hoist it out of the loop and call `.Get(name)` on the cached `url.Values`. (`ParseRequestWithOptions` does call `r.URL.Query()` once per field too — same change.)

### New #5 — `ParseRequest` doesn't handle array-typed query params
The new code admits this in a comment: `// For array fields, we would need special handling // For now, take the first value` (request.go:361-363). `ParseQueryArray`/`ParseQueryArrayCSV` exist as helpers but aren't wired through `setFieldValue`, so `?tags=a&tags=b` against an `Array(String(...)).From(SourceQuery)` schema silently drops everything but the first value.

### New #6 — `errors.Is` should be used for `http.ErrNoCookie`
`request.go:71, 379` use `err == http.ErrNoCookie`. It works because `http.ErrNoCookie` is a sentinel, but `errors.Is(err, http.ErrNoCookie)` is the convention and survives `fmt.Errorf("...%w")` wrapping in middleware.

### New #7 — `setFieldValue` doesn't validate format hints
A `String(&id).UUID().From(SourcePath)` schema accepts any non-empty string from the URL — the UUID format check only happens in `Validate()`, not in the parser. That's actually the right layering, but combined with Open #5 it means the value reaches the handler unvalidated. Worth flagging that `setFieldValue` is a binder, not a parser — its only "validation" is that the type-coercion (e.g. `strconv.ParseInt`) succeeds.

### New #8 — `SplitSchemaBySource` loses `propertyOrder` (`request.go:202-227`)
When `BuildOpenAPIRequestBody` calls `SplitSchemaBySource`, the resulting `bodySchema` is built via `Object(bodyProps)` which captures *current map order* into `propertyOrder` — i.e. randomized. The new helpers undo the determinism fix from pass-1's #11 when used. Carry over the relevant subset of `schema.propertyOrder`.

### New #9 — `buildWWWAuthenticate` for apiKey schemes returns empty string (`auth.go:664-665`)
There's no IANA-registered challenge for `apiKey` schemes, so this is technically correct. But if a route only accepts an apiKey, the WWW-Authenticate header falls back to `"Bearer"` (the function's default at line 647), which is misleading: it tells the client to use Bearer when the server actually wants an API key in a specific header. Either omit the header for apiKey-only routes or include a custom challenge (e.g. `ApiKey realm="X-API-Key"`) — even though non-standard, it's more truthful.

### New #10 — `JsonNullable[T]` is a clean addition but the schema framework doesn't know about it
`nullable.go` introduces the absent/null/present tri-state Go is missing, with `Ptr() *T` to bridge to schemas. Nice. But there's no `Nullable[T]()` schema constructor that binds to `JsonNullable[T]` directly — every caller has to do `String(req.Name.Ptr())` boilerplate. Worth adding a small wrapper so the schema can read the tri-state directly (e.g. distinguish "set to null" from "absent" for PATCH semantics, which is the main reason `JsonNullable` exists).

---

## Updated must-fix list

1. **New #1** — `ParseRequest` mass-assignment risk. Reverse the bind order or panic on misuse. **P0** — actively exploitable if a handler forgets `json:"-"`.
2. **Open #3** — wire the new helpers into `OpenAPISpec.generateOperation`; right now the spec generator still emits the pass-1 bugs (`required: true` hardcoded, missing `style`/`explode`, etc.). **P1**.
3. **Open #5** — make `ParseRequest` (or a sibling) call `Schema().Validate()`. Without this the framework's central promise — single-source-of-truth validation — isn't met. **P1**.
4. **Open #1** — partial-AND skip semantics. **P2** (design choice, but flag in docs at minimum).
5. **Open #2** — link `AdditionalProperties(false)` to `DisallowUnknownFields()`. **P2**.

The remaining items are nice-to-haves. The framework is in materially better shape than pass 1 — the schema, auth, and validation cores are all correct now. The exposure has shifted to the new request-binding layer and to the inconsistency between the new helpers and the still-live spec generator.
