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

The full spec is served only when `NODE_ENV` is not `production` and
`OPENAPI_FULL_SPEC=true`. The harness container runs in production mode, so generating
against it silently drops operations. Use the dev stack, or a throwaway container from
the harness image with `NODE_ENV=development`.

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
