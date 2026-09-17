# The module pins go 1.27, which GOTOOLCHAIN=auto fetches. A bare `gofmt` on PATH is
# whatever Go is installed system-wide and will reject generic methods, so always use
# the toolchain's own.
GOFMT := $(shell go env GOROOT)/bin/gofmt

# Where `generate-client` reads the spec from. The instance must have
# OPENAPI_FULL_SPEC set, which docker-compose.dev.yml does; without it half the routes
# are missing and no test can reach them.
INFISICAL_OPENAPI_URL ?= http://localhost:8080

.PHONY: fmt lint test test-unit test-docker test-suites up down status generate-client

fmt:
	$(GOFMT) -w .

lint:
	@out="$$($(GOFMT) -l .)"; \
	if [ -n "$$out" ]; then echo "gofmt needed:"; echo "$$out"; exit 1; fi
	go vet ./...
	go tool staticcheck ./...

# Unit tests only: no Docker, no containers, runs in under a second.
#
# Everything except ./suites/..., which needs a stack. Derived rather than listed,
# because a hand-written list silently stops covering a package the day someone adds
# one -- which is exactly what happened when fixture/, provider/ and stub/ appeared.
test-unit:
	go test $$(go list ./... | grep -v '/suites/') -count=1

test: lint test-unit

# Container tests for the infra layer. These create their own per-test containers and
# do not touch the shared stack.
test-docker:
	INFRA_DOCKER_TESTS=1 go test ./infra/... -count=1

# Bring the stack up, run the suites, and always take it down again.
#
# `trap ... EXIT` rather than a follow-up line, because a make recipe stops at the
# first failing command: without it a red run would leave the stack up and the next
# `up` would silently adopt it. The trap fires on Ctrl-C too, so an interrupted run
# still cleans up.
#
# The recipe's exit status is still `go test`'s, so a failure stays a failure.
test-suites: up
	@trap '$(MAKE) --no-print-directory down' EXIT; go test ./suites/... -count=1

up:
	go run ./cmd/inf up

down:
	go run ./cmd/inf down

status:
	go run ./cmd/inf status

# Generate the API client from a running Infisical. Bring one up first (`make up-dev`
# from the repo root). oapi-codegen reads the URL directly, so there is no spec
# snapshot to keep in sync.
# Must point at a NON-PRODUCTION instance: the full spec is gated on
# `NODE_ENV != "production"`, so the harness's own container serves the partial one
# and regenerating against it silently drops operations. The dev stack qualifies.
generate-client:
	go tool oapi-codegen -config clients/api/oapi-codegen.yaml $(INFISICAL_OPENAPI_URL)/api/docs/json

