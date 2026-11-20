# The module pins go 1.27, which GOTOOLCHAIN=auto fetches. A bare `gofmt` on PATH is
# whatever Go is installed system-wide and will reject generic methods, so always use
# the toolchain's own.
GOFMT := $(shell go env GOROOT)/bin/gofmt

# Where `generate-client` reads the spec from. The instance must have
# OPENAPI_FULL_SPEC set, which docker-compose.dev.yml does; without it half the routes
# are missing and no test can reach them.
INFISICAL_OPENAPI_URL ?= http://localhost:8080

.PHONY: fmt lint test test-unit test-docker test-suites test-isolated test-harness test-all up down status generate-client

# The generated client (clients/api) is its own Go module, so ./... leaves it out of vet,
# staticcheck and test: regenerating fixes it, nothing in it is for a person to correct, and
# analysing its 400k lines was most of lint's run time. gofmt walks folders rather than
# modules, so it is given this module's package folders.
GO_DIRS = $$(go list -f '{{.Dir}}' ./...)

fmt:
	$(GOFMT) -w $(GO_DIRS)

lint:
	@out="$$($(GOFMT) -l $(GO_DIRS))"; \
	if [ -n "$$out" ]; then echo "gofmt needed:"; echo "$$out"; exit 1; fi
	go vet ./...
	go tool staticcheck ./...

# Unit tests only: no Docker, no containers, runs in under a second.
#
# Everything except the suites and the harness tests, which need a stack. Derived rather than listed,
# because a hand-written list silently stops covering a package the day someone adds
# one -- which is exactly what happened when fixture/, provider/ and stub/ appeared.
test-unit:
	go test $$(go list ./... | grep -vE '/(suites|suitesisolated|harnesstest)/') -count=1

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
# `up` runs inside the recipe rather than as a prerequisite, so the trap is already
# installed when it starts and a stack that fails halfway through booting is torn
# down too.
#
# The recipe's exit status is still that of whichever command failed.
# Separate targets so a red line says which thing broke. `test-suites` failing means
# Infisical is broken; `test-harness` failing means the harness is. One target running
# both would report them the same way.
test-suites:  PKGS = ./suites/...
test-harness: PKGS = ./harnesstest/shared/...

# Extra `go test` flags, such as `-run` or `-skip`.
TEST_FLAGS ?=

test-suites test-harness:
	@trap '$(MAKE) --no-print-directory down' EXIT; \
	go run ./cmd/inf up && go test $(PKGS) -count=1 $(TEST_FLAGS)

# Packages on harness.Isolated, which each boot their own Postgres, Redis and Infisical.
# `-p 1` runs one package at a time, and each removes its containers and volumes before
# the next starts, so at most one isolated stack exists. No `inf up`: these packages do
# not use the shared stack, and fakenet is started by the first package that needs it.
# A layout test in ./harness keeps every isolated package under these two roots.
test-isolated:
	@trap '$(MAKE) --no-print-directory down' EXIT; \
	go test -p 1 ./suitesisolated/... ./harnesstest/isolated/... -count=1 $(TEST_FLAGS)

# The shared suites and harness tests, then the isolated ones. The isolated run goes
# ahead when the shared one fails, so one red run does not hide the other.
test-all:
	@status=0; \
	$(MAKE) --no-print-directory test-suites || status=$$?; \
	$(MAKE) --no-print-directory test-harness || status=$$?; \
	$(MAKE) --no-print-directory test-isolated || status=$$?; \
	exit $$status

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

