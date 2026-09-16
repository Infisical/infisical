# The module pins go 1.27, which GOTOOLCHAIN=auto fetches. A bare `gofmt` on PATH is
# whatever Go is installed system-wide and will reject generic methods, so always use
# the toolchain's own.
GOFMT := $(shell go env GOROOT)/bin/gofmt

.PHONY: fmt lint test test-unit test-docker down status generate-client

fmt:
	$(GOFMT) -w .

lint:
	@out="$$($(GOFMT) -l .)"; \
	if [ -n "$$out" ]; then echo "gofmt needed:"; echo "$$out"; exit 1; fi
	go vet ./...
	go tool staticcheck ./harness/... ./infra/... ./internal/...

# Unit tests only: no Docker, no containers, runs in under a second.
test-unit:
	go test ./infra/... ./internal/... -count=1

test: lint test-unit

# Container tests. Needs Docker. `inf down` if a run is interrupted.
test-docker:
	INFRA_DOCKER_TESTS=1 go test ./infra/... -count=1

down:
	go run ./cmd/inf down

status:
	go run ./cmd/inf status

# Generate the API client from a running Infisical. Bring one up first (`make up-dev`
# from the repo root); it must have OPENAPI_FULL_SPEC set, which docker-compose.dev.yml
# does, or half the routes are missing from the spec and no test can reach them.
#
# oapi-codegen reads the URL directly, so there is no spec snapshot to keep in sync.
INFISICAL_OPENAPI_URL ?= http://localhost:8080

generate-client:
	go tool oapi-codegen -config clients/api/oapi-codegen.yaml $(INFISICAL_OPENAPI_URL)/api/docs/json
