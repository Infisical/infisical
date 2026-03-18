# Backend-Go Architecture

## Folder Structure

```
backend-go/internal/
├── config/              # App config (koanf)
├── database/
│   ├── pg/              # Postgres connection (primary + replicas, returns *sql.DB)
│   └── ormify/          # Generic CRUD via go-jet + Go generics
├── libs/bootstrap/      # Startup health checks
├── server/
│   ├── design/          # Goa DSL (source of truth for API)
│   │   ├── platform/    # Platform API design
│   │   └── secretmanager/
│   └── gen/             # Goa-generated handlers (DO NOT EDIT)
└── services/
    ├── services.go      # Root registry — wires shared libs → product registries
    ├── shared/          # Cross-cutting libs (NOT api-facing)
    │   ├── libs.go      # Shared libs registry
    │   ├── permission/  # Permission checking (SharedService + DAL)
    │   └── secretmanager/secretfolder/  # Folder resolution (product-scoped shared lib)
    ├── platform/        # Product: platform
    │   ├── platform.go  # Product registry
    │   └── projects/    # API-facing service
    └── secretmanager/   # Product: secret manager
        ├── secretmanager.go
        └── secrets/     # API-facing service
```

## Key Rules

**Shared vs API-facing:**
- `services/shared/` holds reusable services (permission, secretfolder). These are NEVER api-facing — they don't implement Goa service interfaces.
- `services/<product>/<domain>/` holds API-facing services that implement Goa-generated interfaces (e.g. `genprojects.Service`, `gensecrets.Service`).
- Shared services must NOT be shared directly between API-facing services at the same level. They flow down: `shared.Libs` → product registry → domain service.

**Shared lib scoping:**
- Truly cross-product libs (e.g. permission) live in `shared/` and are instantiated once in `shared.NewLibs()`.
- Product-scoped shared libs (e.g. secretfolder) live under `shared/<product>/` but are instantiated inside the product registry (e.g. `secretmanager.NewRegistry()`), NOT in `shared.NewLibs()`.

**Interface pattern:**
- Each API-facing service defines its own small interface for each dependency (consumer-side interfaces).
- Interface names use `Svc` suffix: `permissionSvc`, `secretFolderSvc`.
- Shared service structs are named `SharedService` with constructor `NewSharedService()`.
- No compile-time interface satisfaction checks (`var _ iface = (*Type)(nil)`).

**DI wiring flow:**
```
main.go → services.NewRegistry()
  → shared.NewSharedServices()           # cross-product shared shared services
  → platform.NewRegistry()     # receives shared shared services, creates product services
  → secretmanager.NewRegistry() # receives shared shared services, creates product-scoped shared services + services
```

This avoids cyclic imports — shared services under `shared/` can be consumed by any product without products importing each other.

When adding a new shared lib: cross-product → `shared/` + `NewSharedServices()`. Product-scoped → `shared/<product>/` + instantiate in product registry.
