# 01 Blackbox parity tests for GET /api/v2/folders (against Node)

Spec: `specs/go-folders-list.md`. Blocked by: none.

Write the blackbox suite cases first, passing against Node, in `tests/suites/secretmanager/folders/`. Status and body only.

Cases: empty path (200, empty), unknown environment (404 + exact message), recursive ordering and `relativePath`, `lastSecretModified` boundary and null handling, soft-deleted project and environment, ObjectId project ID, sub-org, each supported auth mode (JWT, identity access token, service token), non-member access, trailing-slash and path normalisation.

Follow existing fixtures in `tests/fixture/secretmanager/`. Fix no Node bugs here; report any discovered in the ticket notes.

Done when: suite passes against Node via the documented `tests/` command.
