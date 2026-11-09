# Node to Go Migration

How Infisical moves API routes from the Node backend to the Go backend without changing what clients see.

## Language

**Migrated route**:
A route that the Go backend answers in production, with the Node route kept as a fallback for one release.
_Avoid_: Ported route, rewritten route, converted route

**Shadowed route**:
A route that Node answers while a sample of the same requests is also sent to Go and the two responses are compared.
_Avoid_: Mirrored route, dark-launched route

**Forwarded route**:
A route whose requests Node hands to Go, which answers the client.
_Avoid_: Proxied route, redirected route

**Parity**:
Node and Go return the same status code and the same body for the same request, including exact error messages. Ignored fields are listed explicitly in the shadow comparer.
_Avoid_: Compatibility, equivalence

**Regression**:
Any observable difference from Node that breaks parity, including a changed error message.
_Avoid_: Bug, difference

**Go sidecar**:
The Go backend process that runs next to Node and shares its database and Redis.
_Avoid_: Go service, Go server

**Auth-mode gate**:
The check in Node's forwarding plugin that sends a request to Go only when its auth mode is one Go supports, and leaves every other request on Node.
_Avoid_: Auth filter, auth router

**Fallback**:
Node answering a forwarded read itself after Go fails with a connection error, timeout or 5xx. Mutations never fall back.
_Avoid_: Failover, retry

**Blackbox suite**:
The Go tests in `tests/` that call a real Infisical over HTTP and run unchanged against Node or Go.
_Avoid_: E2E tests, integration tests
