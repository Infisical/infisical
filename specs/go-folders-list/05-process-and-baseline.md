# 05 Process rule and Node baseline load test

Spec: `specs/go-folders-list.md`. Blocked by: none.

- Add a root `AGENTS.md` rule: a PR touching a forwarded route changes both Node and Go and keeps the blackbox suite green (see `docs/adr/0001-*`). One short imperative with the reason.
- Add a load-test script (outside product code, e.g. `tests/loadtest/folders-list/`) that seeds a deep folder tree and ObjectId projects and measures p95 and CPU for Node vs Go against `GET /api/v2/folders`. Include a README with the run command.

Done when: rule is added and the script runs (or is documented to run) against Node.
