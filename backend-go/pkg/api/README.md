# pkg/api

Type-safe API framework with pointer-binding schemas. Single source of truth for validation AND OpenAPI generation. No runtime reflection.

## Quick Start

```go
// Request type (pointer receiver for Schema)
type CreateUserRequest struct {
    Name  string `json:"name"`
    Email string `json:"email"`
}

func (r *CreateUserRequest) Schema() *api.ObjectSchema {
    return api.Object(map[string]api.Schema{
        "name":  api.String(&r.Name).Required().MinLength(1).MaxLength(100),
        "email": api.String(&r.Email).Required().Email(),
    })
}

// Response type (pointer receiver for Schema AND Status)
type UserResponse struct {
    ID    string `json:"id"`
    Name  string `json:"name"`
    Email string `json:"email"`
}

func (r *UserResponse) Schema() *api.ObjectSchema {
    return api.Object(map[string]api.Schema{
        "id":    api.String(&r.ID).Required(),
        "name":  api.String(&r.Name).Required(),
        "email": api.String(&r.Email).Required(),
    })
}

func (*UserResponse) Status() int { return http.StatusCreated }

// Handler returns VALUE type (not pointer)
func createUser(ctx context.Context, req *CreateUserRequest) (UserResponse, error) {
    return UserResponse{ID: "123", Name: req.Name, Email: req.Email}, nil
}

// Registration with builder
r.POST("/users", api.Handler(app, createUser).
    Summary("Create user").
    OperationID("createUser"))
```

## Typed Responses

Handlers return **value types**, response types use **pointer receiver methods**.

```go
// Response type — embed status mixin to avoid writing Status()
type UserResponse struct {
    api.StatusOK  // embeds Status() int { return 200 }
    ID   string `json:"id"`
}

func (r *UserResponse) Schema() *api.ObjectSchema {
    return api.Object(map[string]api.Schema{
        "id": api.String(&r.ID).Required(),
    })
}

// Handler returns VALUE (not pointer)
func getUser(ctx context.Context, req *GetUserRequest) (UserResponse, error) {
    return UserResponse{ID: "123"}, nil
}

// No-content response (204)
type Deleted struct{ api.StatusNoContent }

func (*Deleted) Schema() *api.ObjectSchema { return nil }

func deleteUser(ctx context.Context, req *DeleteRequest) (Deleted, error) {
    return Deleted{}, nil
}
```

### Status Mixins

Embed these instead of writing `Status()` manually:

```go
api.StatusOK                  // 200
api.StatusCreated             // 201
api.StatusAccepted            // 202
api.StatusNoContent           // 204
api.StatusBadRequest          // 400
api.StatusUnauthorized        // 401
api.StatusForbidden           // 403
api.StatusNotFound            // 404
api.StatusConflict            // 409
api.StatusUnprocessableEntity // 422
api.StatusInternalServerError // 500
```

### Multi-Status Responses (InterfaceHandler)

For handlers returning different response types at runtime:

```go
// Marker interface
type CreateOrFetchResult interface {
    api.TypedResponse
    marker()
}

// Variant 1 — 201 Created
type CreatedUser struct { ID string }
func (r *CreatedUser) Schema() *api.ObjectSchema { ... }
func (*CreatedUser) Status() int { return 201 }
func (*CreatedUser) marker() {}

// Variant 2 — 200 OK
type ExistingUser struct { ID string }
func (r *ExistingUser) Schema() *api.ObjectSchema { ... }
func (*ExistingUser) Status() int { return 200 }
func (*ExistingUser) marker() {}

// Handler returns interface
func createOrFetch(ctx context.Context, req *Request) (CreateOrFetchResult, error) {
    if existed {
        return &ExistingUser{ID: id}, nil
    }
    return &CreatedUser{ID: id}, nil
}

// Use InterfaceHandler + declare all variants
r.POST("/users", api.InterfaceHandler(app, createOrFetch).
    Responses(&CreatedUser{}, &ExistingUser{}))
```

## Handler Builder

```go
r.GET("/users/{id}", api.Handler(app, getUser).
    Summary("Get user").
    Description("Retrieves a user by ID").
    OperationID("getUser").
    Tags("Users").
    Security(api.NewSecurity("jwt")).
    Deprecated())

// Additional responses (e.g., error types for OpenAPI)
r.POST("/users", api.Handler(app, createUser).
    Responses(&ConflictError{}).      // Add 409 to OpenAPI
    WithoutDefault(401, 403))          // Remove inherited defaults
```

## Router

```go
// 1. Create security registry with validators
registry := api.NewSecurityRegistry()
registry.MustRegister("bearer", api.HTTPBearerJWT(), &JWTValidator{})
registry.MustRegister("apiKey", api.APIKeyHeader("X-API-Key"), &APIKeyValidator{})

// 2. Create app with registry — enables unified WithSecurity
app := api.NewApp(api.AppConfig{
    ErrorHandler:     errorHandler,
    DefaultResponses: []api.TypedResponse{&ValidationError{}, &InternalError{}},
    SecurityRegistry: registry,  // enables WithSecurity to auto-install middleware
})

router := api.NewRouter(api.RouterConfig{App: app})
router.Use(loggingMiddleware)

router.Route("/v1/orgs/{orgId}", func(r *api.Router) {
    // WithSecurity now does BOTH: OpenAPI doc + middleware (one call!)
    r.WithSecurity(api.NewSecurity("bearer"), api.NewSecurity("apiKey"))
    r.WithTags("Organizations")
    r.WithDefaultResponses(&Unauthorized{}, &Forbidden{})
    
    r.GET("/users", api.Handler(app, listUsers).Summary("List users"))
    r.POST("/users", api.Handler(app, createUser).Summary("Create user"))
})

// Generate OpenAPI
spec := router.Spec()
jsonSpec := spec.Generate()
```

## Schema Types

### Primitives

```go
api.String(&s).Required().MinLength(1).MaxLength(100).Pattern(`^\w+$`).Enum("a","b").Email().UUID()
api.Int(&i).Required().Min(0).Max(100)
api.Float(&f).Required().Min(0.0).Max(1.0)
api.Bool(&b).Required()
api.UUID(&u).Required()
api.Time(&t).Required()
api.Bytes(&b).Required().MinLength(1)
```

### Composites

```go
api.Object(map[string]api.Schema{...}).Required()
api.Array(api.String(nil)).Required().MinItems(1).MaxItems(10)
api.Map(api.String(nil)).Required()
api.Const("fixed-value")
```

### Component Refs ($ref)

Define reusable schemas that appear in `components/schemas`:

```go
// Shared schema — .Ref() registers it and makes OpenAPI() return $ref
type User struct {
    ID   uuid.UUID `json:"id"`
    Name string    `json:"name"`
}

func (u *User) Schema() *api.ObjectSchema {
    return api.Object(map[string]api.Schema{
        "id":   api.UUID(&u.ID).Required(),
        "name": api.String(&u.Name).Required(),
    }).Ref("User")  // Registers in components/schemas
}

// Use it — calling Schema() triggers registration and returns $ref
type ListResponse struct {
    Users []User `json:"users"`
}

func (r *ListResponse) Schema() *api.ObjectSchema {
    return api.Object(map[string]api.Schema{
        "users": api.Array((&User{}).Schema()).Required(),  // → {"$ref": "#/components/schemas/User"}
    })
}
```

### Parameter Sources

```go
api.String(&r.ID).From(api.SourcePath).Required().UUID()
api.Int(&r.Page).From(api.SourceQuery).Optional().Default(1)
api.String(&r.Token).From(api.SourceHeader).Required()
api.String(&r.SessionID).From(api.SourceCookie).Required()
```

## Union Types

### Flat Discriminated Union

```go
type Animal interface {
    api.Union
    animalMarker()
}

type Dog struct {
    api.UnionBase
    Type  string `json:"type"`
    Breed string `json:"breed"`
}
func (d *Dog) Schema() *api.ObjectSchema { ... }
func (d *Dog) animalMarker() {}

var AnimalParser = api.UnionDef[Animal]{
    Discriminator: "type",
    Variants: map[string]func() Animal{
        "dog": func() Animal { return &Dog{} },
        "cat": func() Animal { return &Cat{} },
    },
}

// In request schema
"pet": api.UnionField(&r.Pet, AnimalParser).Required()

// Parse in UnmarshalJSON
api.ParseUnions(data, api.U("pet", &r.Pet, AnimalParser))
```

### OneOf / AnyOf

```go
api.OneOfSchemas(api.String(&v.A), api.String(&v.B)).Required()
api.AnyOf(schemaA, schemaB).Required()
api.AllOf(schemaA, schemaB)
```

## Authentication

```go
// 1. Define schemes + validators, pass to App
registry := api.NewSecurityRegistry()
registry.MustRegister("jwt", api.HTTPBearerJWT(), &JWTValidator{})
registry.MustRegister("apiKey", api.APIKeyHeader("X-API-Key"), &APIKeyValidator{})

app := api.NewApp(api.AppConfig{
    SecurityRegistry: registry,  // enables unified WithSecurity
})

// 2. WithSecurity handles BOTH OpenAPI + middleware
r.Route("/protected", func(r *api.Router) {
    r.WithSecurity(api.NewSecurity("jwt"), api.NewSecurity("apiKey"))
    // ... endpoints automatically protected
})

// 3. Get result in handler
auth := api.GetAuthResult(ctx)
claims := auth.GetClaims()
```

### Security Relationships

```go
// OR - any one succeeds
[]api.Security{api.NewSecurity("jwt"), api.NewSecurity("apiKey")}

// AND - all must pass (MFA example)
[]api.Security{api.NewSecurity("jwt").And("mfa")}

// No auth required
[]api.Security{{}}
```

**AND Security Note:** If the first scheme passes but the second returns `ErrSkipToNextAuth`, the request is rejected (401) — it does NOT fall through to an OR fallback. This prevents MFA bypass.

### Available Schemes

```go
api.HTTPBearer()
api.HTTPBearerJWT()
api.HTTPBasic()
api.APIKeyHeader(name)
api.APIKeyQuery(name)
api.APIKeyCookie(name)
api.OpenIDConnect(discoveryURL)
api.OAuth2Implicit(authURL, scopes)
api.OAuth2Password(tokenURL, scopes)
api.OAuth2ClientCredentials(tokenURL, scopes)
api.OAuth2AuthorizationCode(authURL, tokenURL, scopes)
```

## JsonNullable (Tri-State PATCH)

```go
type UpdateRequest struct {
    Name api.JsonNullable[string] `json:"name"`
}

// {"name": "Bob"}  → Present=true, Null=false, Value="Bob"
// {"name": null}   → Present=true, Null=true (explicitly clear)
// {}               → Present=false (don't touch)

func (r *UpdateRequest) Schema() *api.ObjectSchema {
    return api.Object(map[string]api.Schema{
        "name": api.Nullable(&r.Name, api.String(&r.Name.Value)).Optional(),
    })
}
```

## Error Handling

```go
// In handlers, return typed errors
return UserResponse{}, api.NotFound("user %s not found", id)
return UserResponse{}, api.Conflict("email already exists")
return UserResponse{}, api.BadRequest("invalid input")
return UserResponse{}, api.Forbidden("access denied")

// Custom error handler
app := api.NewApp(api.AppConfig{
    ErrorHandler: func(ctx context.Context, err error) *api.ErrorBody {
        if apiErr, ok := api.AsError(err); ok {
            return &api.ErrorBody{
                StatusCode: apiErr.Status,
                Message:    apiErr.Message,
                Error:      apiErr.Name,
            }
        }
        return &api.ErrorBody{StatusCode: 500, Message: "Internal error"}
    },
})
```

## Common Chainable Methods

```go
.Required()
.Optional()
.Title(string)
.Description(string)
.Example(any)
.Deprecated()
.Nullable()
.ReadOnly()
.WriteOnly()
.Default(value)
.From(source)  // SourcePath, SourceQuery, SourceHeader, SourceCookie
```
