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

## CI

`run-blackbox-tests.yml` runs on pull requests. It builds `backend/Dockerfile` with a
layer cache and passes it through `INFISICAL_TEST_IMAGE`, so the harness skips its own
build. To reproduce, build the image and set the variable locally.
