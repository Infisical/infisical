# 03 Forwarding controls in the Node sidecar plugin

Spec: `specs/go-folders-list.md`. Blocked by: none.

Extend `backend/src/server/plugins/go-sidecar-forwarding.ts`:

- Per-route enablement plus per-org allowlist plus percentage (deterministic per org), with an instant off switch (env/config).
- Auth-mode gate: inspect the credential before proxying; only JWT, identity access token and service token go to Go; everything else (OAuth, `API_KEY`, unknown) stays on Node.
- Fallback: on connection error, timeout or 5xx for reads, Node answers itself; count and log each fallback. Never retry mutations.
- Do not double-count the rate limit when forwarding.
- Do not add `GET /api/v2/folders` to the forwarded list by default (disabled until rollout).

Unit-test the gate, percentage and fallback logic. Review against `backend/CODE_QUALITY.md`. Run lint and type check for backend.
