# Folders list load test

Measures p95 latency and CPU of `GET /api/v2/folders`, Node against Go. Run it against Node first to
record the baseline before any forwarding (see `specs/go-folders-list.md`). It is not part of the
blackbox suite and needs a running Infisical.

It seeds a deep folder tree (`DEPTH` levels, `BREADTH` folders per level) into each project, then
drives `CONCURRENCY` workers for `DURATION_S` seconds per target and prints a table.

```bash
TOKEN=<jwt or identity access token> \
PROJECT_IDS=<id1>,<id2> \
TARGETS="node=http://localhost:8080" \
CONTAINERS="node=infisical-backend" \
node tests/loadtest/folders-list/loadtest.mjs
```

To compare, add the Go sidecar: `TARGETS="node=http://localhost:8080,go=http://localhost:8081"` and
`CONTAINERS="node=<name>,go=<name>"`. CPU is a mid-run `docker stats` sample and is `n/a` without
`CONTAINERS`.

| Variable | Default | Meaning |
|---|---|---|
| `TOKEN` | required | Bearer token with access to the projects |
| `PROJECT_IDS` | required | Comma-separated project IDs. Include ObjectId projects (24 characters); the API cannot create them, so supply existing legacy ones |
| `ENVIRONMENT` | `dev` | Environment slug |
| `DEPTH`, `BREADTH` | `8`, `3` | Shape of the seeded tree |
| `SEED` | `true` | Set `false` to skip seeding on repeat runs |
| `RECURSIVE` | `true` | Passes `recursive` on the list call |
