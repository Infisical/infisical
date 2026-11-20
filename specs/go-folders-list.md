# Migrate `GET /api/v2/folders` to Go

Vocabulary follows `GLOSSARY.md`. The rollout strategy follows `docs/adr/0001-shadow-then-forward-node-routes-to-go.md`.

## Problem Statement

The folders and secrets pages call the folder list on every load, from the dashboard, the CLI and agents. Node answers it today, and no client traffic is served by the Go sidecar yet. We want lower p95 latency and CPU on that page load, without any user or integration noticing a change. A regression is any change in status code or body, including error messages. The reason for moving to Go and the "read-heavy" label are inferred, not measured, so a Node baseline must come first.

## Solution

Move `GET /api/v2/folders` through the three stages in the ADR: shadowed, then forwarded per route and per org with Node kept as the fallback for one release, then (a separate decision) delete the Node route. Go reproduces Node's behaviour exactly, including quirks. Requests with an auth mode Go does not support stay on Node.

## User Stories

1. As a dashboard user, I want the folder list to load faster, so that the secrets page opens quickly.
2. As a CLI user, I want folder listing to return the same results as before, so that my scripts keep working.
3. As an integration author using an identity access token, I want the same response shape, so that my parsing does not break.
4. As a service token user, I want folder listing to keep working, so that my pipelines do not fail.
5. As an OAuth user, I want my requests to keep working, so that the migration does not lock me out.
6. As an API key user (deprecated), I want my requests to keep being answered, so that I am not broken before I migrate.
7. As a caller listing a path that does not exist, I want an empty list with status 200, so that behaviour matches today.
8. As a caller naming an unknown environment, I want a 404 with the same message, so that my error handling still matches.
9. As a caller using `recursive`, I want descendants sorted by name with the same `relativePath`, so that tree builders keep working.
10. As a caller using `lastSecretModified`, I want folders with no modification time dropped and older ones filtered exactly as before.
11. As a caller with an ObjectId project ID (24 characters), I want my requests accepted, so that legacy projects work.
12. As a member of a soft-deleted project or environment, I want the same visibility rules as Node, so that deleted data does not appear.
13. As a user in a sub-org, I want the same results as Node, so that org scoping does not change.
14. As a user hitting the rate limit, I want the same limit and response as today.
15. As an operator, I want to enable forwarding per route and per org, so that I can canary internal orgs first.
16. As an operator, I want a percentage control on top of the org allowlist, so that I can ramp 1%, 10%, 50%, 100%.
17. As an operator, I want to switch forwarding off instantly, so that a bad rollout is cheap to undo.
18. As an operator, I want shadow diffs on this route reported with sensitive fields skipped, so that I can prove parity safely.
19. As an operator, I want fallbacks to Node counted and logged, so that I can use them as a rollback signal.
20. As an operator, I want a Node baseline of p95 and CPU before any forwarding, so that I can show the improvement.
21. As a maintainer, I want a PR touching a forwarded route to fail unless the blackbox suite passes, so that Node and Go cannot drift.
22. As a maintainer, I want a test that fails when a `secret_folders` column exists in Node but is missing in Go, so that the schema cannot drift.
23. As a maintainer, I want behaviour bugs fixed in Node before the port, so that shadow diffs stay meaningful.
24. As a maintainer, I want the Node route kept for one release after forwarding, so that rollback needs no redeploy of old code.
25. As a security reviewer, I want Go to apply the same membership check as Node (no folder-specific permission), so that access does not widen or narrow.
26. As a reviewer, I want no audit or analytics event emitted unless Node emits one, so that behaviour matches.

## Implementation Decisions

- **Contract**: query parameters `projectId` (trimmed string, no UUID validation), `environment`, optional `lastSecretModified` (ISO datetime), `path` (leading slash added, trailing slash removed), `recursive` (boolean, default false). `search`, `orderBy`, `limit` and `offset` are not exposed. Response is `{ folders: [...] }`.
- **Authorization**: Node resolves project membership and performs no further permission check. Go must do the same and must not add a stricter check. Confirm how Go resolves membership, including the service-token path.
- **Auth modes**: Go supports JWT, identity access token and service token. The **auth-mode gate** lives in the forwarding plugin and inspects the credential before proxying. Anything unrecognised stays on Node. OAuth is ported later. `API_KEY` stays on Node permanently.
- **Behaviour to reproduce**:
  - Unknown environment returns 404 `Environment with slug '<slug>' not found`; a missing path returns 200 with an empty list.
  - Non-recursive results come from the exact SQL of Node's multi-env lookup. Recursive results come from the exact SQL of Node's deep lookup, exclude the parent, sort by name ascending, and add `relativePath`.
  - `lastSecretModified` keeps folders modified at or after the value and drops folders with no value when the filter is set.
  - Reuse the existing Go folder-tree `GetSubTree` only if tests show identical order and path format; otherwise write a dedicated query.
- **Response schema**: generated from the full `secret_folders` column list, plus `relativePath` when recursive.
- **Reads** use the replica, as Node does. Soft-delete filters on the project and the environment are applied independently.
- **Rate limit**: same read limit as Node, not double-counted when Node forwards. First verify Go has an equivalent preset.
- **Forwarding controls**: per route, per org allowlist, plus a percentage. Node retries the read itself on connection failure, timeout or 5xx, and counts each **fallback**. Mutations are never retried (none are involved here).
- **Shadowing**: add the route to the shadowed list and ramp the sample rate. Required exit: zero diffs across at least 100k shadowed requests over 7 days (numbers to be confirmed).
- **Forward stages**: internal orgs, then 1%, 10%, 50%, 100%. Roll back if the 5xx rate exceeds Node's baseline, p95 is worse, or fallbacks rise.
- **Process**: fix any discovered Node bug in Node first. Add a root `AGENTS.md` rule that a PR touching a forwarded route changes both implementations and keeps the blackbox suite green.
- **Backend changes** are reviewed against the backend code-quality guide.

## Testing Decisions

- **Single seam**: the blackbox suite, which calls real Infisical over HTTP and runs unchanged against Node and Go. A good test checks status and body only, not implementation details.
- **Cases to write first, against Node**: empty path (200, empty), unknown environment (404 and message), recursive ordering and `relativePath`, `lastSecretModified` boundary and null handling, soft-deleted project and environment, ObjectId project ID, sub-org, each supported auth mode, non-member access, and trailing-slash and path normalisation.
- **Schema drift test**: fails when a `secret_folders` column is not in the Go response.
- **Synthetic parity set**: the cases above also run through shadow comparison, because 10% sampling cannot prove rare cases.
- **Load test**: a seeded instance with a deep folder tree and ObjectId projects, Node against Go, before any forwarding.
- **Prior art**: existing blackbox tests for the secrets read routes, and the shadow comparer in the Node sidecar plugins.

## Out of Scope

- Any mutation route (the secret-tags query and mutation analysis was analysis only).
- Porting OAuth or `API_KEY` to Go.
- Deleting the Node route.
- Changing folder behaviour or fixing Node bugs as part of the port (those go in separate Node PRs first).
- Multi-region or database changes.

## Further Notes

- The reasons for migrating and the "read-heavy" claim are inferred. Confirm them with production p95 and traffic before committing to the rollout.
- Still to read before implementation: Node's multi-env and deep folder queries, and whether Go has a read rate-limit preset.
- Publishing: the issue tracker was not configured for this session and the repo rule is never to create GitHub issues, so the spec is kept as this file and not published or labelled `ready-for-agent`.
