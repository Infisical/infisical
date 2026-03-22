# Run unit tests (no infra required)
lint:
	golangci-lint run --build-tags integration

lint-fix:
	go fix ./... && golangci-lint run --build-tags integration --fix

test:
	go test -v ./internal/... -count=1 -race -timeout 120s

# Run integration tests — testcontainers spins up isolated containers per package
test-integration:
	go test -v -tags integration ./internal/... -count=1 -race -timeout 300s

# Run all tests (unit + integration)
test-all:
	go test -v -tags integration ./internal/... -count=1 -race -timeout 300s

# Generate Goa code from design DSL
gen-goa:
	goa gen github.com/infisical/api/internal/server/design -o ./internal/server/

# Generate go-jet database types
gen-db:
	go run ./cmd/dev/pg_gen/main.go

# Start Go backend with hot-reload (uses root docker-compose.dev.yml)
dev:
	cd .. && docker compose -f docker-compose.dev.yml --profile go up --build backend-go

# Build the server binary
build:
	go build -o infisical ./cmd/infisical/...
