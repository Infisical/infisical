# Run integration tests — testcontainers handles docker lifecycle automatically
test:
	TESTCONTAINERS_DEBUG=true go test -v ./internal/... -count=1 -race -timeout 300s

# Run unit tests (no Docker needed)
test-unit:
	go test ./internal/... -count=1 -race

# Tear down shared test containers and remove state file.
# Use this if tests misbehave or to free up ports.
test-cleanup:
	rm -f .test-infra-state.json .test-infra.lock
	docker compose -f docker-compose.test.yml down -v --remove-orphans 2>/dev/null || true

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
