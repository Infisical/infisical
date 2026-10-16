# The generated client

Read this when a test needs an endpoint the client does not have.

Every call goes through `clients/api`. A route the client cannot reach is missing an
`operationId`; fix the router, not the test.

## Adding an endpoint

1. Add the `operationId` to `include-operation-ids` in `clients/api/oapi-codegen.yaml`.
2. Regenerate against a non-production instance:

```bash
INFISICAL_OPENAPI_URL=http://localhost:8080 make generate-client
```

A server running from source serves the full spec, every route and every field. A built
image, the harness container included, serves only the public spec, so generating against
it silently drops operations. Use the dev stack.

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
