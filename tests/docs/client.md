# The generated client

Read this when a test needs an endpoint the client does not have.

Every call goes through `clients/api`. A route the client cannot reach is missing an
`operationId`; fix the router, not the test.

`clients/api` is a Go module of its own, required from `tests/go.mod` through a `replace`
to the folder, so `./...` leaves it out; `make lint` and `make test-unit` name it
explicitly. A new import in it goes in `clients/api/go.mod` (`go mod tidy` there), at the
version `tests/go.mod` already uses.

## How the client is built

| File | What it is |
|---|---|
| `oapi-codegen.yaml` | The operations to generate, and the generator's options |
| `overlay.yaml` | Fixes applied to the spec before generation (see below) |
| `templates/client-with-responses.tmpl` | Per operation: the response type and the methods that return it |
| `templates/client.tmpl` | Emits nothing; replaces oapi-codegen's raw client |
| `runtime.go` | Hand-written. The client type, request assembly, sending, decoding, the shared `Response` |
| `api.gen.go` | Generated. Never edit it by hand |

The templates emit only what differs between operations: the path, its parameters and its
bodies. Anything every operation does the same way belongs in `runtime.go`, with a test in
`runtime_test.go`, rather than in a template, where it would be repeated for every
operation.

Every response type embeds `Response`, which carries `Body`, `HTTPResponse`,
`StatusCode()` and the error bodies all routes share: `JSON400`, `JSON401`, `JSON403`,
`JSON404` and `JSON500` as `*ApiError`, and `JSON422` as `*ApiValidationError`, whose
`message` is a list of issues rather than a string. `overlay.yaml` points every route's
error responses at those two schemas, so they are generated once rather than per
operation. If you add a status there, add the field to `Response`;
`TestResponseCoversOverlayStatuses` fails until the two agree.

If the spec uses something `runtime.go` cannot send or decode (a cookie parameter, a
`text/plain` body), the template emits a call to the undefined
`clientTemplateCannotGenerate("...")`. Generation still succeeds, and the build error
names what is missing. Support it in `runtime.go` and the template together.

## Adding an endpoint

1. Add the `operationId` to `include-operation-ids` in `clients/api/oapi-codegen.yaml`.
2. Regenerate against a non-production instance:

```bash
INFISICAL_OPENAPI_URL=http://localhost:8080 make generate-client
```

The full spec is served only when `NODE_ENV` is not `production` and
`OPENAPI_FULL_SPEC=true`. The harness container runs in production mode, so generating
against it silently drops operations. Use the dev stack, or a throwaway container from
the harness image with `NODE_ENV=development`.

Every listed operation is generated whether or not a test calls it, so
`TestLayout_EveryGeneratedOperationIsUsed` (in `harness/`) fails on an id no test uses.
Remove an id when you remove its last caller.

Enum constants always carry their type's name (`api.UpdateManySecretsV4JSONBodyModeUpsert`,
not `api.Upsert`). Without `always-prefix-enum-values` the generator prefixes a constant
only when another collides with it, so adding an operation could rename constants it
never touched.

## Streaming responses

A call normally reads the whole body before returning. For an endpoint that answers with a
stream, such as server-sent events, pass a context from `api.WithUnreadBody`: the call
returns once the headers arrive, and `res.HTTPResponse.Body` is left open for you to read
and close.

## Unions

- **Union request bodies.** oapi-codegen declares the body as a defined type, which does
  not inherit `MarshalJSON`, so it serialises as `{}`. Build the union, `json.Marshal` it,
  and post with `...WithBodyWithResponse`. A union field inside an ordinary struct is
  fine.
- **Union responses.** A response that can take more than one shape is generated as a
  union with one `As…N()` method per branch. Those methods only `json.Unmarshal`, so
  every one of them succeeds whichever branch the server sent, and the wrong one hands
  back zero values instead of an error. After unwrapping, require a field that only the
  expected branch carries before trusting the result.

## When the generated code does not compile

Some valid specs trip oapi-codegen bugs. The project permission schema is one: each rule's
`action` is "one action or a list of actions", and v2.8.0 names the list type and its item
type the same, so `createProjectRole` generates duplicate declarations.

Patch the spec before generation in `clients/api/overlay.yaml`
([OpenAPI Overlay](https://spec.openapis.org/overlay/v1.0.0.html)), not the backend:
the spec is correct, and every Node API consumer reads it.

- Narrow the action to the schema that fails. The existing one replaces only the
  `createProjectRole` body's permission items with a plain object, and the suite sends
  rules as JSON (`fixture.Permission` in `fixture/role.go`).
- Overlays are strict: an action whose target matches nothing fails generation, so a
  renamed route shows up instead of silently undoing the patch.
- Remove the action once an oapi-codegen release fixes the bug.

## Redirects and unauthenticated routes

Clients follow redirects by default. When the redirect is the outcome, such as an SSO
start or a SAML ACS answer, opt in to receiving it:

```go
browser := tn.Anonymous(t, infisical.NoRedirects()) // no token, tenant's rate-limit bucket
res, _ := browser.RedirectSamlByOrgSlugWithResponse(ctx, tn.OrgSlug, nil)
res.HTTPResponse.Header.Get("Location")
res.HTTPResponse.Cookies()
```

`tn.Client(t, token, infisical.NoRedirects())` does the same for a principal. Send a
cookie back with a per-call request editor rather than a cookie jar.
