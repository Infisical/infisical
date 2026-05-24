# Test review

## Summary
The tests cover the common paths well, but there are three patterns to address:

1. **High duplication** in the primitive-schema, security-scheme, and middleware tests — many groups of 5–11 tests follow identical shapes that would compress to a single table-driven test.
2. **The new `request.go` and `nullable.go` (pass-2 additions) are dramatically undertested** — only 2 tests exist for `request.go`; most public functions (cookie/header parsing, options, helpers, array-query helpers) have zero coverage.
3. **Several pass-2 fixes have no guarding test** — `buildWWWAuthenticate`, `Mount` default propagation, chi regex stripping, `ResponseDescriptions`, registry concurrency. The code is fixed but a regression would not be caught.

There's also one test file (`request_test.go:78`) where the schema is built and discarded — `_ = schema` — so the test verifies nothing about the schema it claims to test.

---

## Tests to merge / simplify

### 1. Primitive schema validation (`schema_test.go`)
The 10+ tests of the shape `TestStringSchema_<rule>` (MinLength, MaxLength, Length, Pattern, Enum, FormatEmail, FormatUUID, FormatURI, FormatDateTime, FormatDate) all follow:
```go
val := "<bad>"
schema := String(&val).<rule>(...)
errs := schema.Validate()
require.Len(t, errs, 1)
assert.Equal(t, "<code>", errs[0].Code)
val = "<good>"
errs = schema.Validate()
assert.Empty(t, errs)
```
This is one table-driven test. Same for `IntSchema_{Min,Max,Range,ExclusiveMin,ExclusiveMax,MultipleOf,Enum}` and `FloatSchema_{Min,Max,Range,ExclusiveMinMax}`. Roughly 25 functions → 3 table tests.

### 2. OpenAPI modifier tests (`schema_composite_test.go:494–578`)
`TestObjectSchema_Modifiers`, `TestArraySchema_Modifiers`, `TestMapSchema_Modifiers`, `TestOneOfSchema_Modifiers`, `TestAnyOfSchema_Modifiers`, `TestAllOfSchema_Modifiers` all chain the same `.Nullable().ReadOnly().WriteOnly().Deprecated().Example(...)` and assert the same five keys. Fold into one parameterised test driven by `[]struct{ name; build func() Schema }`.

### 3. Per-schema OpenAPI shape tests (`schema_test.go`)
`Test<X>Schema_OpenAPI` × 9 each: build with modifiers, call `.OpenAPI()`, check keys. Could be a table of `(schemaBuilder, expectedKeys map[string]any)`. Cuts ~250 lines.

### 4. Per-type `IsPresent` tests (`ispresent_test.go`)
Every test follows: nil ptr → false, zero value → conditional, non-zero → true. A single table over the schema constructors with the same three subtests covers all 9 primitive types in one function.

### 5. Security-scheme constructors (`auth_test.go:16–135`)
11 sequential `TestHTTPBearer`, `TestAPIKeyHeader`, `TestOAuth2Implicit`, etc. — each builds, asserts type/scheme/in/name. Table with `(name, build, expect)` collapses to ~30 lines.

### 6. Middleware test boilerplate (`auth_test.go:483–795`)
12 middleware tests repeat: build registry, register N validators, build middleware, fire `httptest.NewRequest`, assert status. Extract a helper like:
```go
func runMiddleware(t *testing.T, validators map[string]Validator, security []Security, handler http.HandlerFunc) *httptest.ResponseRecorder { ... }
```
Each test then collapses to 5–10 lines. The duplication is currently ~25 lines per test.

### 7. Router method tests (`router_test.go:16–92`)
`TestRouter_{Get,Post,Put,Patch,Delete}` × 5 — identical shape, register one route and assert the registered method. Table-driven.

### 8. OpenAPI parameter source tests (`openapi_test.go:248–404`)
`TestOpenAPISpec_Generate_{Path,Query,Header,Cookie}Parameters` — same structure, only `in` value and source map differ. Single table.

### 9. ParseUnionField tests (`union_helpers_test.go:13–73`)
6 tests (`_ValidDog`, `_ValidCat`, `_Null`, `_Empty`, `_UnknownType`, `_InvalidJSON`) — classic table candidate over `(name, raw, wantErr, assertAnimal)`.

### 10. Drop the "rebuild schema after modifying values" pattern
`TestObjectSchema_Validate` (schema_composite_test.go:30–34) and `TestAllOfSchema_Validate` (line 427–434) both **rebuild** the schema after assigning values, because the original captured a nil pointer. This is awkward. Either:
- Start with non-nil pointers and assign to `*ptr` (so the same schema instance is reused), or
- Wrap the build in a helper `buildSchema(name, age)` and call it twice.

The current form misleads readers into thinking that mutating the bound value mid-test is exercised.

---

## Coverage gaps — pass-2 fixes with no guarding test

These are the highest-priority gaps because they cover **code changes that don't have regression protection**:

| Pass-2 fix | Current test coverage |
|---|---|
| `buildWWWAuthenticate` populates `WWW-Authenticate` on default 401 | **None** — `TestMiddleware_FailedAuth_DefaultHandler` only checks `rec.Code == 401`, never `rec.Header().Get("WWW-Authenticate")`. |
| `SecurityRegistry` mutex (concurrent register/read) | **None** — no `t.Parallel` + goroutine test. |
| `Mount` propagates `defaultSecurity`/`defaultTags` | **None** — `TestRouter_Mount` doesn't set defaults on the parent, so the propagation branch is untested. |
| `ExtractPathParams` strips chi regex (`{id:[0-9]+}`) | **None** — no test passes a regex-constrained pattern. |
| `ResponseDescriptions` + `defaultResponseDescription` | **None** — `TestOpenAPISpec_Generate_MultipleResponses` only checks status codes exist, never the description string. `WithResponseDescriptions` option is uncovered. |
| `OneOf().SetActiveVariant().Validate()` — discriminated branch | **Covered** in `TestOneOfSchema_DiscriminatedValidation` — good. |
| Nested object error paths composed with `.` (pass-1 #6 fix) | **Covered** in `TestObjectSchema_NestedFieldPaths` — good. |
| Required Int/Float/Bool — nil-ptr-vs-zero | **Covered** for each — good. |

Add five small tests for the rows above and the pass-2 work is properly guarded.

---

## Coverage gaps — `request.go` (the new layer)

Only 2 tests exist (`TestParseRequest_PathAndQuery`, `TestParseRequest_UUIDPath`). Missing:

1. **Mass-assignment hazard (Review's New #1)** — there is **no test** showing what happens when a request body contains a JSON key that matches a `From(SourcePath)` field's JSON tag. This is exactly the test that would catch the bug. Add:
   ```go
   // POST /orgs/legitimate-org/secrets  body={"orgId":"attacker-org","name":"x"}
   // Assert req.OrgID == "legitimate-org" (path wins) OR document and assert body wins
   ```
2. `ParseRequest` with `r.ContentLength == 0` — body parsing should be skipped, validation of body fields should still flag required.
3. `ParseRequest` with chunked transfer encoding (`ContentLength == -1`) — body should still parse.
4. Cookie parameter parsing — not tested at all. Missing cookie should be tolerated; present cookie should populate.
5. Header parameter parsing — not tested at all.
6. Required header/cookie missing — should error at validation time, not parse time.
7. `setFieldValue` error paths — non-numeric for `Int` query, invalid UUID for path, malformed time. None exercised.
8. `ParseRequestWithOptions(DisallowUnknownFields())` — option exists but no test asserts that unknown body fields are rejected.
9. `ParseQueryArray` / `ParseQueryArrayCSV` — both defined, no tests.
10. `SplitSchemaBySource`, `BuildOpenAPIParameters`, `BuildOpenAPIRequestBody` — none of the new OpenAPI helpers have tests. Given these helpers are the "right" code (Open #3 in REVIEW.md) but aren't yet wired into `OpenAPISpec`, leaving them untested compounds the divergence risk.
11. `request_test.go:78` — `_ = schema` discards a built schema; either remove or actually validate against `chi.URLParam`.

---

## Coverage gaps — other

- `OneOfSchemas` with `ValidateFn` override — defined but no test asserts the override path bypasses the default oneOf logic.
- `ArraySchema.Validate()` and `MapSchema.Validate()` without `ValidateFn` → returns nil — no test pins this behaviour (subtle: it means array/map item validation is a no-op by default).
- `AnyOf()` and `AllOf()` with **zero schemas** — required behaviour unclear (current code returns "at least one option" for AnyOf, no errors for AllOf). No tests guard either.
- `Const` validation is asserted **empty** (`TestConstSchema_Validate`) — this test currently *passes* but it locks in the still-open "Const doesn't enforce" bug from REVIEW.md. If/when the fix lands, this test will silently keep passing for the wrong reason. Either add a `// TODO: enforce` comment or invert: assert that mismatched const values *should* fail and skip until fixed.
- `Endpoint` with `Method: HEAD` / `OPTIONS` / custom — `router.Handle()` has fallbacks for these but no test exercises them.
- `Router.With(...).Route(prefix, ...)` — middleware + route group composition is untested.
- `defaultResponseDescription` for boundary codes (199, 300, 599, 600) — no test.
- `statusCodeToString` for non-standard codes — no test.

---

## Brittleness / smells

- `integration_test.go:135` — `require.GreaterOrEqual(t, len(errs), 2)`. Loose bound. The shape "should have errors for email, street, zipCode" is asserted with `||` (line 141). If a regression makes one of them silently disappear, the test still passes. Replace with an exact count and explicit per-field assertions.
- `oneof_anyof_test.go:220–225` — left-in stream-of-consciousness comment block (`// Actually, let me think about this...`). Clean up.
- `union_test.go:84-91` and `union_helpers_test.go:59-66` — `assert.Contains(err.Error(), "unknown type value")` is fragile (matches the source string verbatim). Prefer wrapping union parse errors with sentinel `errors.New("...")` values that tests can `errors.Is` against. Same goes for `"missing discriminator"` and `"missing payload"`.
- `oneof_anyof_test.go:14` — `var intPtr *int` then `Int(intPtr)` is a clever encoding of "nil-pointer means not-present", but it reads as a typo. A one-line comment helps, or split.

---

## Recommended sequence

If you want one ordered pass:

1. **Add the five "pass-2 fix regression" tests** (the table above) — highest leverage; they prevent the most-recent improvements from regressing.
2. **Add a single mass-assignment test for `ParseRequest`** — even before the fix lands, the test pins down the current (vulnerable) behaviour and forces a conversation when someone changes the order.
3. **Fold the primitive schema validation + OpenAPI tests into table-driven** — biggest line-count win (`schema_test.go` could lose 300+ lines without losing a case).
4. **Cover the rest of `request.go`** — cookie/header parsing, options, array helpers, OpenAPI helpers.
5. Clean up the brittle error-string assertions by introducing sentinel errors in `union.go` (`var ErrUnknownVariant = errors.New(...)`) — small refactor, cleaner tests.
6. **Then** merge the security-scheme constructors and middleware boilerplate.

Items 1 and 2 are correctness wins. 3–6 are maintenance wins.
