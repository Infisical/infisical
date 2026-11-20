# 04 Shadow GET /api/v2/folders

Spec: `specs/go-folders-list.md`. Blocked by: 02.

Add the route to `SHADOWED_ROUTES` in `backend/src/server/plugins/go-sidecar-shadowing.ts` with sensitive fields skipped in the comparer (list them explicitly). Ensure the ticket 01 cases can also run through shadow comparison (synthetic parity set).

Done when: comparer unit tests cover the new route and lint/type check pass.
