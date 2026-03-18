# Backend-Go Project Structure

## Overview

This is a Go rewrite/PoC of the Infisical backend — a secret management platform. It follows a clean, layered architecture with explicit dependency injection, type-safe SQL via go-jet, and API code generation via Goa.

## Directory Layout

```
backend-go/
├── cmd/
│   ├── infisical/
│   │   └── main.go                    # Main server entry point
│   └── dev/
│       └── pg_gen/                    # DB code generation tool
├── internal/
│   ├── config/
│   │   └── config.go                  # Configuration (koanf: .env + env vars)
│   ├── database/
│   │   ├── pg/
│   │   │   ├── pg.go                  # PostgreSQL connection pool (primary + read replicas)
│   │   │   └── gen/                   # Go-Jet generated files (235+ tables/models)
│   │   │       ├── table/             # Table metadata definitions
│   │   │       └── model/             # Model structs
│   │   └── ormify/
│   │       └── ormify.go              # Generic CRUD wrapper using Go generics
│   ├── libs/
│   │   └── bootstrap/
│   │       └── bootstrap.go           # DB health checks on startup
│   ├── server/
│   │   ├── server.go                  # HTTP server, mux, middleware, graceful shutdown
│   │   ├── platform.go                # Mounts platform service routes
│   │   ├── secretmanager.go           # Mounts secret manager service routes
│   │   ├── design/                    # Goa DSL API definitions (source of truth)
│   │   │   ├── design.go             # Root API definition
│   │   │   ├── platform/
│   │   │   │   └── projects.go       # Projects service DSL
│   │   │   └── secretmanager/
│   │   │       └── secrets.go        # Secrets service DSL
│   │   └── gen/                       # Goa-generated HTTP handlers, clients, endpoints
│   │       ├── http/                  # HTTP server/client implementations
│   │       ├── projects/              # Projects service interfaces & types
│   │       └── secrets/               # Secrets service interfaces & types
│   └── services/
│       ├── services.go                # Top-level service registry (DI wiring)
│       ├── platform/
│       │   ├── platform.go            # Platform product-line registry
│       │   └── projects/
│       │       └── projects.go        # Projects business logic
│       ├── secretmanager/
│       │   ├── secretmanager.go       # Secret manager product-line registry
│       │   └── secrets/
│       │       └── secrets.go         # Secrets business logic
│       └── shared/
│           ├── libs.go                # Shared libraries registry
│           └── permission/
│               ├── permission.go      # Permission checking
│               └── dal.go             # Permission data access
├── llm/                               # LLM context files
├── go.mod
└── go.sum
```

## Architecture Layers

```
HTTP Layer (Goa-generated handlers, encoding, routing)
    ↓
Service Layer (business logic in internal/services/)
    ↓
Shared Libs (cross-cutting: permissions)
    ↓
ORM Layer (ormify — generic CRUD with Go generics)
    ↓
Database Layer (go-jet generated types + pgxpool)
    ↓
PostgreSQL (primary + read replicas)
```

## Key Dependencies

| Library | Purpose |
|---------|---------|
| `goa.design/goa/v3` | API design DSL + HTTP code generation |
| `github.com/go-jet/jet/v2` | Type-safe SQL query builder |
| `github.com/jackc/pgx/v5` | PostgreSQL driver with connection pooling |
| `github.com/knadh/koanf/v2` | Configuration management (dotenv + env vars) |
| `github.com/google/uuid` | UUID generation |

## Core Patterns

### 1. Manual Dependency Injection

No IoC container. Factory functions with explicit dependencies, wired top-down:

- `main.go` → creates config, DB, service registry, server
- `services.Registry` holds `Platform`, `SecretManager`, and `Libs`
- Each product-line registry (e.g., `platform.Registry`) holds domain services
- Domain services receive shared libs via constructor

### 2. Two-Tier Product Organization

Services are grouped into product lines that map to URL prefixes:

- **Platform** (`/api/v1/platform/...`) — Projects management
- **SecretManager** (`/api/v1/secret-manager/...`) — Secrets CRUD

### 3. Goa Code Generation

API definitions live in `internal/server/design/` as Goa DSL. Generated code provides:
- Service interfaces (which domain services implement)
- HTTP server handlers, encoders/decoders, routing
- HTTP client stubs

Regenerate with:
```bash
goa gen github.com/infisical/api/internal/server/design -o ./internal/server/
```

### 4. Generic ORM (Ormify)

Type-safe CRUD via Go generics wrapping go-jet:

```go
dal := ormify.New[model.Projects](primary, replica, tableDef)
project, err := dal.FindByID(ctx, id)
results, err := dal.Find(ctx, condition, ormify.WithLimit(10), ormify.WithOffset(0))
```

Methods: `FindByID`, `FindOne`, `Find`, `FindAll`, `Create`, `InsertMany`, `UpdateByID`, `Update`, `DeleteByID`, `Delete`, `Count`, `WithTx`.

### 5. Database Code Generation

Introspects PostgreSQL and generates go-jet table/model files (skips partition tables):

```bash
DB_CONNECTION_URI=... go run ./cmd/dev/pg_gen/main.go
```

### 6. Primary + Read Replica Architecture

- One primary pool for writes
- Zero or more read replicas (randomly selected for reads, falls back to primary)
- Per-replica TLS configuration with primary cert fallback
- Connection pooling via pgxpool (min 0, max 10)

## Startup Flow

1. Initialize JSON structured logger (`slog`)
2. Load and validate config (`.env` + environment variables)
3. Create DB connections (primary + replicas with TLS)
4. Run bootstrap health checks (ping all DB connections)
5. Wire service registry (shared libs → domain services → product registries)
6. Create HTTP server with Goa mux, middleware, and mounted services
7. Listen with signal handling (SIGINT/SIGTERM) and 30s graceful shutdown

## Configuration

Managed via `koanf` in `internal/config/config.go`. 150+ fields covering:

- Server: host, port, environment
- Database: connection URI, read replicas (JSON), TLS/SSL
- Redis: standalone, Sentinel, Cluster modes
- Auth: JWT, identity tokens, SCIM, MCP
- Integrations: Google, GitHub, GitLab, and other SSO providers
- Infrastructure: SMTP, ClickHouse, OpenTelemetry, Datadog
- Feature flags: CORS, HSM, secret scanning, etc.

Required fields are validated at startup with descriptive error messages.
