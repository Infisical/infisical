# pkg/api

Type-safe API framework with pointer-binding schemas. Single source of truth for validation AND OpenAPI generation. No runtime reflection.

## Quick Start

```go
type CreateUserRequest struct {
    Name  string `json:"name"`
    Email string `json:"email"`
    Age   int    `json:"age"`
}

func (r *CreateUserRequest) Schema() *api.ObjectSchema {
    return api.Object(map[string]api.Schema{
        "name":  api.String(&r.Name).Required().MinLength(1).MaxLength(100),
        "email": api.String(&r.Email).Required().Email(),
        "age":   api.Int(&r.Age).Optional().Min(0).Max(150),
    })
}

// Validate
errs := req.Schema().Validate()

// Generate OpenAPI
openapi := req.Schema().OpenAPI()
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
api.Any(&a).Required()
api.Raw(&r).Required()
```

### Composites

```go
// Object
api.Object(map[string]api.Schema{...}).Required()

// Array
api.Array(api.String(new(string))).Required().MinItems(1).MaxItems(10)

// Map (string keys)
api.Map(api.String(new(string))).Required()

// Reference
api.Ref("#/components/schemas/User")

// Const
api.Const("fixed-value")
```

## Union Types

### Flat Discriminated Union

```json
{"type": "dog", "breed": "Labrador"}
```

```go
// 1. Define interface + variants
type Animal interface {
    api.Union
    animalMarker()
}

type Dog struct {
    Type  string `json:"type"`
    Breed string `json:"breed"`
}
func (d *Dog) Schema() *api.ObjectSchema { return api.Object(map[string]api.Schema{...}) }
func (d *Dog) unionMarker() {}
func (d *Dog) animalMarker() {}

// 2. Define parser
var AnimalParser = api.UnionDef[Animal]{
    Discriminator: "type",
    Variants: map[string]func() Animal{
        "dog": func() Animal { return &Dog{} },
        "cat": func() Animal { return &Cat{} },
    },
}

// 3. Use in request (single-pass with json.RawMessage)
type Request struct {
    PetRaw json.RawMessage `json:"pet"`
    Pet    Animal          `json:"-"`
}

func (r *Request) UnmarshalJSON(data []byte) error {
    type Plain Request
    if err := json.Unmarshal(data, (*Plain)(r)); err != nil {
        return err
    }
    return api.ParseUnionField(r.PetRaw, &r.Pet, AnimalParser)
}

func (r *Request) Schema() *api.ObjectSchema {
    return api.Object(map[string]api.Schema{
        "pet": api.UnionField(&r.Pet, AnimalParser).Required(),
    })
}
```

### Nested Discriminated Union

```json
{"method": "password", "payload": {"username": "john", "password": "secret"}}
```

```go
var AuthParser = api.NestedUnionDef[AuthMethod]{
    Discriminator: "method",
    PayloadField:  "payload",
    Variants: map[string]func() AuthMethod{
        "password": func() AuthMethod { return &PasswordPayload{} },
        "oauth":    func() AuthMethod { return &OAuthPayload{} },
    },
}

// Parse from separate fields
api.ParseNestedUnionField(r.MethodRaw, r.PayloadRaw, &r.Auth, AuthParser)
```

### OneOf / AnyOf

```go
// OneOf - exactly one must be present
api.OneOfSchemas(
    api.String(&v.Plaintext),
    v.Reference.Schema(),
).Required()

// AnyOf - at least one must be present  
api.AnyOf(
    emailConfig.Schema(),
    slackConfig.Schema(),
).Required()

// AllOf - all must be valid (composition)
api.AllOf(
    auditFields.Schema(),
    deleteFields.Schema(),
)
```

## Authentication

```go
// 1. Define schemes (OpenAPI metadata)
var UserJWTScheme = api.HTTPBearerJWT().WithDescription("User JWT")
var APIKeyScheme = api.APIKeyHeader("X-API-Key").WithDescription("API Key")

// 2. Implement validators
type JWTValidator struct {
    db       pg.DB
    keyStore kms.KeyStore
}

func (v *JWTValidator) Validate(ctx context.Context, r *http.Request) (any, error) {
    token := extractBearer(r)
    claims, err := v.validateToken(token)
    if err != nil {
        return nil, api.ErrSkipToNextAuth // Try next auth method
    }
    return claims, nil
}

// 3. Register at startup
registry := api.NewSecurityRegistry()
registry.MustRegister("userJWT", UserJWTScheme, &JWTValidator{db: db})
registry.MustRegister("apiKey", APIKeyScheme, &APIKeyValidator{db: db})

// 4. Apply middleware
middleware := registry.Middleware([]api.Security{
    api.NewSecurity("userJWT"),  // OR
    api.NewSecurity("apiKey"),
}, errorHandler)

// 5. Get auth result in handler
auth := api.GetAuthResult(r.Context())
fmt.Printf("Authenticated via %s\n", auth.Scheme)
```

### Security Relationships

```go
// OR - any one succeeds
[]api.Security{
    api.NewSecurity("jwt"),
    api.NewSecurity("apiKey"),
}

// AND - both must pass
[]api.Security{
    api.NewSecurity("jwt").And("mfa"),
}

// No auth required
[]api.Security{{}}
```

## Router

```go
router := api.NewRouter()

// Top-level middleware
router.Use(loggingMiddleware)

// Route group with defaults
router.Route("/v1/secrets", func(r *api.Router) {
    r.WithSecurity(api.NewSecurity("bearerAuth"))
    r.WithTags("Secrets")
    
    r.Handle(api.Endpoint{
        Method:      http.MethodPost,
        Pattern:     "",
        Handler:     createSecretHandler,
        Request:     &CreateSecretRequest{},
        Response:    &SecretResponse{},
        Summary:     "Create secret",
        OperationID: "createSecret",
    })
})

// Generate OpenAPI
spec := api.NewOpenAPISpec(&api.OpenAPIConfig{
    Info: api.OpenAPIInfo{Title: "My API", Version: "1.0.0"},
    SecuritySchemes: registry.Schemes(),
})
spec.AddEndpoints(router.Endpoints())
jsonSpec, _ := spec.JSONIndent("", "  ")
```

## Validation Pattern

```go
func handler(w http.ResponseWriter, r *http.Request) {
    var req CreateSecretRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, err.Error(), 400)
        return
    }
    
    if errs := req.Schema().Validate(); len(errs) > 0 {
        w.WriteHeader(400)
        json.NewEncoder(w).Encode(map[string]any{"errors": errs})
        return
    }
    
    // Use req...
}
```

## IsPresent() for OneOf/AnyOf

Used internally by `OneOfSchemas` and `AnyOf` to detect which option is provided:

| Type | Present When |
|------|--------------|
| String | `ptr != nil && *ptr != ""` |
| Int/Float/Bool | `ptr != nil` |
| UUID | `ptr != nil && *ptr != uuid.Nil` |
| Time | `ptr != nil && !ptr.IsZero()` |
| Object | Any property is present |
| Array/Map | Custom `IsPresentFn()` |
| Union | `ptr != nil && *ptr != nil` |

## Available Security Schemes

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

## JsonNullable for Optional Fields

Distinguish between absent, null, and present values:

```go
type Request struct {
    Count api.JsonNullable[int] `json:"count"`
}

// After unmarshaling:
// - {"count": 5}  → Present=true, Null=false, Value=5
// - {"count": null} → Present=true, Null=true
// - {}            → Present=false, Null=false

// Use Ptr() for schema validation
schema := api.Int(req.Count.Ptr()).Required()
// Returns nil if absent/null, pointer to value if present
```

## Required Validation

For `Int`, `Float`, `Bool` — required checks `ptr == nil`, not zero value:

```go
// ptr == nil → required error
// ptr != nil && *ptr == 0 → valid (0 is a value, not missing)

// To detect missing vs zero, use pointer fields:
type Request struct {
    Count *int `json:"count"`  // nil when field absent
}
api.Int(r.Count).Required()  // fails if Count is nil
```

## AdditionalProperties

`AdditionalProperties(false)` is **OpenAPI metadata only** — it doesn't enforce validation. To reject unknown fields at parse time:

```go
decoder := json.NewDecoder(r.Body)
decoder.DisallowUnknownFields()
if err := decoder.Decode(&req); err != nil { ... }
```

## Common Chainable Methods

All schemas support:
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
```
