# The module pins go 1.27, which GOTOOLCHAIN=auto fetches. A bare `gofmt` on PATH is
# whatever Go is installed system-wide and will reject generic methods, so always use
# the toolchain's own.
GOFMT := $(shell go env GOROOT)/bin/gofmt

.PHONY: fmt lint test test-unit

fmt:
	$(GOFMT) -w .

lint:
	@out="$$($(GOFMT) -l .)"; \
	if [ -n "$$out" ]; then echo "gofmt needed:"; echo "$$out"; exit 1; fi
	go vet ./...

# Unit tests only: no Docker, no containers, runs in under a second.
test-unit:
	go test ./infra/... ./internal/... -count=1

test: lint test-unit

# Container tests. Needs Docker. `inf down` if a run is interrupted.
test-docker:
	INFRA_DOCKER_TESTS=1 go test ./infra/... -count=1

down:
	@docker rm -f $$(docker ps -aq --filter label=inf.scope) 2>/dev/null || true
	@docker network rm inf-net 2>/dev/null || true
