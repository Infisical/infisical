# 02 Go implementation of GET /api/v2/folders

Spec: `specs/go-folders-list.md`. Blocked by: 01.

Implement the endpoint in `backend-go` (handler under `server/api/secretmanager/`, logic in `services/secretmanager/secretfolder/`), following `backend-go/AGENTS.md`.

- Contract, behaviour, and response schema per the spec's Implementation Decisions (exact SQL of Node's multi-env and deep lookups; replica reads; independent soft-delete filters; reuse `GetSubTree` only if output is identical).
- Authorization: project membership only, no extra permission; confirm the service-token path.
- Same read rate-limit preset as Node; verify Go has one, add if missing.
- Add the schema drift test: fails when a `secret_folders` column is missing from the Go response.

Done when: ticket 01's suite passes unchanged against Go, `make lint` and `make test` in `backend-go` pass.
