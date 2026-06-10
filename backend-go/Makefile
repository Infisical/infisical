.PHONY: lint lint-fix test test-unit test-integration dev build generate test-hsm-image test-hsm ensure-golangci-lint

# golangci-lint version - keep in sync with .github/workflows/run-backend-go-tests.yml
GOLANGCI_LINT_VERSION := v2.12.2

# Ensure correct golangci-lint version is installed
ensure-golangci-lint:
	@if ! command -v golangci-lint >/dev/null 2>&1 || ! golangci-lint version 2>/dev/null | grep -q "$(GOLANGCI_LINT_VERSION:v%=%)"; then \
		echo "Installing golangci-lint $(GOLANGCI_LINT_VERSION)..."; \
		curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/HEAD/install.sh | sh -s -- -b $$(go env GOPATH)/bin $(GOLANGCI_LINT_VERSION); \
	fi

# Run linters
lint: ensure-golangci-lint
	golangci-lint run --build-tags integration

lint-fix: ensure-golangci-lint
	go fix ./... && golangci-lint run --build-tags integration --fix

# Run unit tests only (no testcontainers)
test-unit:
	go test -v ./internal/... -count=1 -race -timeout 120s

# Run integration tests only — testcontainers spins up isolated containers per package
test-integration:
	go test -v -tags integration ./tests/... -count=1 -race -timeout 300s

# Run all tests (unit + integration)
test: test-unit test-integration

# Start Go backend with hot-reload (uses root docker-compose.dev.yml)
dev:
	cd .. && docker compose -f docker-compose.dev.yml --profile go up --build backend-go

# Build the server binary
build:
	go build -o infisical ./cmd/infisical/...

# Regenerate oapi-codegen-dd code from openapi.yml specs
generate:
	go generate ./...

# Build the HSM test container image (requires Docker)
test-hsm-image:
	docker build -t infisical/go-test-backend -f docker-test/Dockerfile docker-test/

# Run HSM integration tests (requires test-hsm-image to be built first)
test-hsm: test-hsm-image
	INFISICAL_RUN_HSM_CONTAINER_TEST=1 go test -v -tags integration ./tests/platform/hsm/... -count=1 -timeout 300s
