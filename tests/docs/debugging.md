# Debugging

Read this when a test fails, flakes, or fails only in CI.

## Where to look

1. **Container logs:** `<package>/.logs/<timestamp>/<container>.log`, always written.
2. **The fakenet log:** one line per outbound call, such as
   `GET api.github.com/user -> 200 scope=7116dd6caf34...`. It shows whether a call
   happened and under which credential.
3. **`GET /__fake/denied`** on fakenet's admin port: calls that reached no fake.
4. **`GET /__fake/events`** on fakenet's admin port: every fake event, mail included.
5. **`make status`:** running harness containers.

A refused outbound call means the host has no fake. Register its `Service` in
`cmd/fakenet/main.go`, or add the route to the fake that owns it.

## Flakes

```bash
make up && go test -p 4 ./suites/... ./harnesstest/... -count=3; make down
```

The flake gate runs both trees at once because the bugs it finds are cross-package. A
failure here is shared state leaking across tenants.

PKI packages (`suites/pki/**`, `suitesisolated/pki/**`) cap `-parallel` at 4 in their
`TestMain` (`pki.CapParallel`): above that, concurrent issuance and sync jobs exhaust the
instance's database pool, and issuance answers 500 with "Timeout acquiring a connection"
in the server log. A higher `-parallel` you pass is lowered to 4, and the test binary
prints the value it ran with.

## Scheduled jobs

`suitesisolated/pki/scheduled` runs scheduled jobs on demand instead of waiting for their
schedule:

```bash
go test ./suitesisolated/pki/scheduled/ -count=1
```

Its `runJob` helper calls `POST /api/v1/admin/cron-jobs/:jobName/trigger`. The route
answers only the instance admin, and only on an instance started with
`ALLOW_CRON_JOB_TRIGGER=true`, which the package's `TestMain` sets through
`harness.WithInfisicalEnv`. Jobs are registered only on a process that runs general
workers, so the instance must run both `api` and `general-workers` (the default; do not
narrow it with `WithRunModes`). Otherwise a valid job answers 404 "not registered on this
instance".

A 200 means the job's handler returned. Work the handler queued may still be running, so
wait for its effect rather than assuming it is done. A handler that runs past its timeout
may still be running. The route answers 504 only if the connection is still open then:
the server closes an idle connection after 100 seconds, before the default 5-minute
handler timeout, so a long run usually ends in a dropped connection instead.

The Go server must implement the same route, flag, instance-admin check, job names and
response before these tests can run against it.

## CI

`run-blackbox-tests.yml` runs on pull requests. It builds `backend/Dockerfile` with a
layer cache and passes it through `INFISICAL_TEST_IMAGE`, so the harness skips its own
build. To reproduce, build the image and set the variable locally.
