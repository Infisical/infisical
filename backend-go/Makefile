.PHONY: lint lint-fix test test-integration test-all dev build generate

# Run linters
lint:
	golangci-lint run --build-tags integration

lint-fix:
	go fix ./... && golangci-lint run --build-tags integration --fix

test-unit:
	go test -v ./internal/... -count=1 -race -timeout 120s

# Run integration tests — testcontainers spins up isolated containers per package
test:
	go test -v -tags integration ./internal/... -count=1 -race -timeout 300s

# Start Go backend with hot-reload (uses root docker-compose.dev.yml)
dev:
	cd .. && docker compose -f docker-compose.dev.yml --profile go up --build backend-go

# Build the server binary
build:
	go build -o infisical ./cmd/infisical/...

# Regenerate oapi-codegen-dd code from openapi.yml specs
generate:
	go generate ./...
