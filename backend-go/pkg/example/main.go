//go:build ignore

package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/infisical/api/pkg/chita"
)

// =============================================================================
// Shared Schema Components (registered via .Ref() for OpenAPI $ref)
// =============================================================================

// ErrorResponse is a shared error schema registered as a component.
// Use chita.Ref("ErrorResponse") to reference it in other schemas.
type ErrorResponse struct {
	chita.StatusBadRequest
	StatusCode int    `json:"statusCode"`
	Message    string `json:"message"`
	Error      string `json:"error"`
}

func (r *ErrorResponse) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"statusCode": chita.Int(&r.StatusCode).Required(),
		"message":    chita.String(&r.Message).Required(),
		"error":      chita.String(&r.Error).Required(),
	}).Ref("ErrorResponse") // Registers in components/schemas
}

// User is a shared user schema for reuse across endpoints.
type User struct {
	ID    uuid.UUID `json:"id"`
	Email string    `json:"email"`
	Name  string    `json:"name"`
	Role  string    `json:"role"`
}

func (u *User) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"id":    chita.UUID(&u.ID).Required(),
		"email": chita.String(&u.Email).Required().Email(),
		"name":  chita.String(&u.Name).Required(),
		"role":  chita.String(&u.Role).Required().Enum("admin", "member", "viewer"),
	}).Ref("User") // Registers in components/schemas
}

// =============================================================================
// Union Types for Webhook Targets
// =============================================================================

// WebhookTarget is the union interface for delivery targets.
// All variants must embed chita.UnionBase and implement Schema().
type WebhookTarget interface {
	chita.Union
	Deliver(payload []byte) error
}

// HTTPTarget delivers webhooks via HTTP
type HTTPTarget struct {
	chita.UnionBase
	Type    string            `json:"type"`
	URL     string            `json:"url"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers,omitempty"`
}

func (h *HTTPTarget) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"type":    chita.Const("http"),
		"url":     chita.String(&h.URL).Required().URL(),
		"method":  chita.String(&h.Method).Required().Enum("POST", "PUT"),
		"headers": chita.Map(chita.String(nil)).Optional(),
	})
}

func (h *HTTPTarget) Deliver(payload []byte) error {
	log.Printf("HTTP %s to %s", h.Method, h.URL)
	return nil
}

// SlackTarget delivers webhooks to Slack
type SlackTarget struct {
	chita.UnionBase
	Type       string `json:"type"`
	WebhookURL string `json:"webhookUrl"`
	Channel    string `json:"channel,omitempty"`
}

func (s *SlackTarget) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"type":       chita.Const("slack"),
		"webhookUrl": chita.String(&s.WebhookURL).Required().URL(),
		"channel":    chita.String(&s.Channel).Optional().Pattern(`^#[a-z0-9_-]+$`),
	})
}

func (s *SlackTarget) Deliver(payload []byte) error {
	log.Printf("Slack to %s", s.Channel)
	return nil
}

// DiscordTarget delivers webhooks to Discord
type DiscordTarget struct {
	chita.UnionBase
	Type       string `json:"type"`
	WebhookURL string `json:"webhookUrl"`
}

func (d *DiscordTarget) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"type":       chita.Const("discord"),
		"webhookUrl": chita.String(&d.WebhookURL).Required().URL(),
	})
}

func (d *DiscordTarget) Deliver(payload []byte) error {
	log.Printf("Discord webhook")
	return nil
}

// WebhookTargetParser parses webhook target union
var WebhookTargetParser = chita.UnionDef[WebhookTarget]{
	Discriminator: "type",
	Variants: map[string]func() WebhookTarget{
		"http":    func() WebhookTarget { return &HTTPTarget{} },
		"slack":   func() WebhookTarget { return &SlackTarget{} },
		"discord": func() WebhookTarget { return &DiscordTarget{} },
	},
}

// =============================================================================
// Union Types for Auth Methods
// =============================================================================

type AuthMethod interface {
	chita.Union
	GetIdentifier() string
}

type PasswordAuth struct {
	chita.UnionBase
	Method   string `json:"method"`
	Username string `json:"username"`
	Password string `json:"password"`
}

func (p *PasswordAuth) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"method":   chita.Const("password"),
		"username": chita.String(&p.Username).Required().MinLength(1),
		"password": chita.String(&p.Password).Required().MinLength(8),
	})
}

func (p *PasswordAuth) GetIdentifier() string { return p.Username }

type SAMLAuth struct {
	chita.UnionBase
	Method       string `json:"method"`
	SAMLResponse string `json:"samlResponse"`
}

func (s *SAMLAuth) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"method":       chita.Const("saml"),
		"samlResponse": chita.String(&s.SAMLResponse).Required(),
	})
}

func (s *SAMLAuth) GetIdentifier() string { return "saml-user" }

type OIDCAuth struct {
	chita.UnionBase
	Method      string `json:"method"`
	Code        string `json:"code"`
	RedirectURI string `json:"redirectUri"`
}

func (o *OIDCAuth) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"method":      chita.Const("oidc"),
		"code":        chita.String(&o.Code).Required(),
		"redirectUri": chita.String(&o.RedirectURI).Required().URL(),
	})
}

func (o *OIDCAuth) GetIdentifier() string { return "oidc-user" }

var AuthMethodParser = chita.UnionDef[AuthMethod]{
	Discriminator: "method",
	Variants: map[string]func() AuthMethod{
		"password": func() AuthMethod { return &PasswordAuth{} },
		"saml":     func() AuthMethod { return &SAMLAuth{} },
		"oidc":     func() AuthMethod { return &OIDCAuth{} },
	},
}

// =============================================================================
// Request/Response Types
// =============================================================================

type ListUsersRequest struct {
	OrgID    uuid.UUID `json:"-"`
	Page     int       `json:"-"`
	PageSize int       `json:"-"`
	Role     string    `json:"-"`
}

func (r *ListUsersRequest) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"orgId":    chita.UUID(&r.OrgID).Required().From(chita.SourcePath),
		"page":     chita.Int(&r.Page).Optional().Min(1).Default(1).From(chita.SourceQuery),
		"pageSize": chita.Int(&r.PageSize).Optional().Min(1).Max(100).Default(20).From(chita.SourceQuery),
		"role":     chita.String(&r.Role).Optional().Enum("admin", "member", "viewer").From(chita.SourceQuery),
	})
}

type CreateUserRequest struct {
	OrgID uuid.UUID `json:"-"`
	Email string    `json:"email"`
	Name  string    `json:"name"`
	Role  string    `json:"role"`
}

func (r *CreateUserRequest) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"orgId": chita.UUID(&r.OrgID).Required().From(chita.SourcePath),
		"email": chita.String(&r.Email).Required().EmailStrict(),
		"name":  chita.String(&r.Name).Required().MinLength(1).MaxLength(100),
		"role":  chita.String(&r.Role).Required().Enum("admin", "member", "viewer"),
	})
}

// PATCH request with tri-state nullable fields
type UpdateUserRequest struct {
	OrgID  uuid.UUID                `json:"-"`
	UserID uuid.UUID                `json:"-"`
	Name   chita.JsonNullable[string] `json:"name"`
	Role   chita.JsonNullable[string] `json:"role"`
}

func (r *UpdateUserRequest) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"orgId":  chita.UUID(&r.OrgID).Required().From(chita.SourcePath),
		"userId": chita.UUID(&r.UserID).Required().From(chita.SourcePath),
		"name":   chita.Nullable(&r.Name, chita.String(&r.Name.Value).MinLength(1).MaxLength(100)).Optional(),
		"role":   chita.Nullable(&r.Role, chita.String(&r.Role.Value).Enum("admin", "member", "viewer")).Optional(),
	})
}

// Request with union type - connected experience
type CreateWebhookRequest struct {
	ProjectID uuid.UUID       `json:"-"`
	Name      string          `json:"name"`
	Events    []string        `json:"events"`
	TargetRaw json.RawMessage `json:"target"`
	Target    WebhookTarget   `json:"-"` // Parsed automatically by UnionFrom
	Enabled   bool            `json:"enabled"`
}

func (r *CreateWebhookRequest) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"projectId": chita.UUID(&r.ProjectID).Required().From(chita.SourcePath),
		"name":      chita.String(&r.Name).Required().MinLength(1).MaxLength(100),
		"events":    chita.Array(chita.String(nil).Enum("secret.created", "secret.updated", "secret.deleted")).Required(),
		// Connected union: parses TargetRaw → Target, validates variant, generates OpenAPI
		"target":  chita.UnionFrom(&r.TargetRaw, &r.Target, WebhookTargetParser).Required(),
		"enabled": chita.Bool(&r.Enabled).Optional().Default(true),
	})
}

type LoginRequest struct {
	OrgSlug       string          `json:"-"`
	AuthMethodRaw json.RawMessage `json:"authMethod"`
	Auth          AuthMethod      `json:"-"` // Parsed automatically by UnionFrom
}

func (r *LoginRequest) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"orgSlug": chita.String(&r.OrgSlug).Required().From(chita.SourcePath).Pattern(`^[a-z0-9-]+$`),
		// Connected union: parses AuthMethodRaw → Auth, validates variant, generates OpenAPI
		"authMethod": chita.UnionFrom(&r.AuthMethodRaw, &r.Auth, AuthMethodParser).Required(),
	})
}

// =============================================================================
// Auth Validators
// =============================================================================

type JWTValidator struct{}

func (v *JWTValidator) Validate(ctx context.Context, r *http.Request) (any, error) {
	auth := r.Header.Get("Authorization")
	if auth == "" || len(auth) < 7 || auth[:7] != "Bearer " {
		return nil, chita.ErrSkipToNextAuth
	}
	return map[string]any{"sub": "user-123"}, nil
}

type APIKeyValidator struct{}

func (v *APIKeyValidator) Validate(ctx context.Context, r *http.Request) (any, error) {
	if r.Header.Get("X-API-Key") == "" {
		return nil, chita.ErrSkipToNextAuth
	}
	return map[string]any{"keyId": "key-123"}, nil
}

// =============================================================================
// Response Types (typed responses with Status() and Schema())
// =============================================================================

// ListUsersResponse for paginated user list
type ListUsersResponse struct {
	chita.StatusOK       // embed mixin instead of writing Status()
	Users        []any `json:"users"`
	Page         int   `json:"page"`
	PageSize     int   `json:"pageSize"`
}

func (r *ListUsersResponse) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"users":    chita.Array((&User{}).Schema()).Required(), // Auto-registers User, returns $ref
		"page":     chita.Int(&r.Page).Required(),
		"pageSize": chita.Int(&r.PageSize).Required(),
	})
}

// UserResponse for created/updated user
type UserResponse struct {
	chita.StatusCreated           // 201
	ID                uuid.UUID `json:"id"`
	Email             string    `json:"email"`
	Name              string    `json:"name"`
	Role              string    `json:"role"`
}

func (r *UserResponse) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"id":    chita.UUID(&r.ID).Required(),
		"email": chita.String(&r.Email).Required(),
		"name":  chita.String(&r.Name).Required(),
		"role":  chita.String(&r.Role).Required(),
	})
}

// UpdateUserResponse for patch response
type UpdateUserResponse struct {
	chita.StatusOK
	Changes map[string]any `json:"changes"`
}

func (r *UpdateUserResponse) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"changes": chita.Map(chita.Object(nil)).Required(),
	})
}

// WebhookResponse for created webhook
type WebhookResponse struct {
	ID      uuid.UUID     `json:"id"`
	Name    string        `json:"name"`
	Target  WebhookTarget `json:"target"`
	Enabled bool          `json:"enabled"`
}

func (r *WebhookResponse) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"id":      chita.UUID(&r.ID).Required(),
		"name":    chita.String(&r.Name).Required(),
		"target":  chita.UnionField(&r.Target, WebhookTargetParser).Required(),
		"enabled": chita.Bool(&r.Enabled).Required(),
	})
}

func (*WebhookResponse) Status() int { return http.StatusCreated }

// LoginResponse for successful login
type LoginResponse struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
}

func (r *LoginResponse) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"token":     chita.String(&r.Token).Required(),
		"expiresAt": chita.String(nil).Required().Format("date-time"),
	})
}

func (*LoginResponse) Status() int { return http.StatusOK }

// =============================================================================
// Typed Handlers (return value types, not pointers)
// =============================================================================

func listUsers(_ context.Context, req *ListUsersRequest) (ListUsersResponse, error) {
	return ListUsersResponse{
		Users:    []any{},
		Page:     req.Page,
		PageSize: req.PageSize,
	}, nil
}

func createUser(_ context.Context, req *CreateUserRequest) (UserResponse, error) {
	// Example: check for conflict
	if req.Email == "existing@example.com" {
		return UserResponse{}, chita.Conflict("user %s already exists", req.Email)
	}

	return UserResponse{
		ID:    uuid.New(),
		Email: req.Email,
		Name:  req.Name,
		Role:  req.Role,
	}, nil
}

func updateUser(_ context.Context, req *UpdateUserRequest) (UpdateUserResponse, error) {
	// Tri-state PATCH handling
	changes := map[string]any{}
	if req.Name.IsSet() {
		changes["name"] = req.Name.Value
	} else if req.Name.Null {
		changes["name"] = nil // explicitly clear
	}
	// !req.Name.Present = don't touch

	if req.Role.IsSet() {
		changes["role"] = req.Role.Value
	}

	return UpdateUserResponse{Changes: changes}, nil
}

func createWebhook(_ context.Context, req *CreateWebhookRequest) (WebhookResponse, error) {
	// req.Target is already parsed and validated by UnionFrom!
	switch t := req.Target.(type) {
	case *HTTPTarget:
		log.Printf("Creating HTTP webhook: %s %s", t.Method, t.URL)
	case *SlackTarget:
		log.Printf("Creating Slack webhook: %s", t.Channel)
	case *DiscordTarget:
		log.Printf("Creating Discord webhook")
	}

	return WebhookResponse{
		ID:      uuid.New(),
		Name:    req.Name,
		Target:  req.Target,
		Enabled: req.Enabled,
	}, nil
}

func login(_ context.Context, req *LoginRequest) (LoginResponse, error) {
	// req.Auth is already parsed and validated by UnionFrom!
	switch auth := req.Auth.(type) {
	case *PasswordAuth:
		log.Printf("Password login: %s", auth.Username)
	case *SAMLAuth:
		log.Printf("SAML login")
	case *OIDCAuth:
		log.Printf("OIDC login: redirect=%s", auth.RedirectURI)
	}

	return LoginResponse{
		Token:     "jwt-token",
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}, nil
}

// =============================================================================
// Error Handler (centralized)
// =============================================================================

func newErrorHandler(logger *slog.Logger) chita.ErrorHandler {
	return func(ctx context.Context, err error) *chita.ErrorBody {
		// Check for chita.Error
		var apiErr *chita.Error
		if errors.As(err, &apiErr) {
			if apiErr.Status >= 500 {
				logger.ErrorContext(ctx, "server error",
					slog.String("name", apiErr.Name),
					slog.Int("status", apiErr.Status),
					slog.String("message", apiErr.Message),
					slog.Any("cause", apiErr.Err),
				)
				return &chita.ErrorBody{
					StatusCode: apiErr.Status,
					Message:    "Something went wrong",
					Error:      apiErr.Name,
				}
			}

			logger.WarnContext(ctx, "api error",
				slog.String("name", apiErr.Name),
				slog.Int("status", apiErr.Status),
				slog.String("message", apiErr.Message),
			)
			return &chita.ErrorBody{
				StatusCode: apiErr.Status,
				Message:    apiErr.Message,
				Error:      apiErr.Name,
				Details:    apiErr.Details,
			}
		}

		// Check for validation errors from ParseAndValidate
		var validationErrs chita.ValidationErrors
		if errors.As(err, &validationErrs) {
			logger.WarnContext(ctx, "validation error", slog.Int("count", len(validationErrs)))
			return &chita.ErrorBody{
				StatusCode: 400,
				Message:    "Validation failed",
				Error:      "ValidationError",
				Details:    validationErrs,
			}
		}

		// Unknown error
		logger.ErrorContext(ctx, "unhandled error", slog.Any("err", err))
		return &chita.ErrorBody{
			StatusCode: 500,
			Message:    "Something went wrong",
			Error:      "InternalServerError",
		}
	}
}

// =============================================================================
// Main
// =============================================================================

func main() {
	// Logger
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))

	// Security registry
	securityRegistry := chita.NewSecurityRegistry()
	securityRegistry.MustRegister("bearer", chita.HTTPBearerJWT(), &JWTValidator{})
	securityRegistry.MustRegister("apiKey", chita.APIKeyHeader("X-API-Key"), &APIKeyValidator{})

	// App with centralized error handler and security registry
	// SecurityRegistry enables WithSecurity to auto-install auth middleware
	app := chita.NewApp(chita.AppConfig{
		ErrorHandler:     newErrorHandler(logger),
		SecurityRegistry: securityRegistry,
	})

	// Create the main router with OpenAPI configuration
	r := chita.NewRouter(chita.RouterConfig{
		App: app,
		Spec: &chita.OpenAPIConfig{
			Info: chita.OpenAPIInfo{
				Title:       "Example API",
				Description: "Demonstrates unions, tri-state PATCH, typed handlers, and centralized error handling",
				Version:     "1.0.0",
			},
			Servers:         []chita.Server{{URL: "http://localhost:8080"}},
			SecuritySchemes: securityRegistry.Schemes(),
			Tags: []chita.OpenAPITag{
				{Name: "auth", Description: "Authentication (password, SAML, OIDC)"},
				{Name: "users", Description: "User management"},
				{Name: "webhooks", Description: "Webhooks (HTTP, Slack, Discord)"},
			},
		},
	})

	// Add chi middlewares
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// Auth routes (no auth required)
	r.Route("/auth/{orgSlug}", func(auth *chita.Router) {
		auth.WithTags("auth")

		auth.POST("/login", chita.Handler(app, login).
			Summary("Login (union: password|saml|oidc)").
			OperationID("login").
			Security(chita.Security{})) // No auth required (empty security)
	})

	// Protected routes - WithSecurity auto-installs middleware when registry is configured
	r.Route("/orgs/{orgId}", func(orgs *chita.Router) {
		orgs.WithSecurity(chita.NewSecurity("bearer"), chita.NewSecurity("apiKey"))
		orgs.WithTags("users")

		orgs.GET("/users", chita.Handler(app, listUsers).
			Summary("List users").
			OperationID("listUsers"))

		orgs.POST("/users", chita.Handler(app, createUser).
			Summary("Create user").
			OperationID("createUser"))

		orgs.PATCH("/users/{userId}", chita.Handler(app, updateUser).
			Summary("Update user (PATCH with tri-state)").
			OperationID("updateUser"))
	})

	// Webhooks routes
	r.Route("/projects/{projectId}", func(projects *chita.Router) {
		projects.WithSecurity(chita.NewSecurity("bearer"))
		projects.WithTags("webhooks")

		projects.POST("/webhooks", chita.Handler(app, createWebhook).
			Summary("Create webhook (union: http|slack|discord)").
			OperationID("createWebhook"))
	})

	// Serve OpenAPI spec
	r.ServeSpec("/openchita.json")

	log.Println("Server: http://localhost:8080")
	log.Println("OpenAPI: http://localhost:8080/openchita.json")
	log.Println("")
	log.Println("Examples:")
	log.Println(`  curl -X POST localhost:8080/auth/acme/login -H "Content-Type: application/json" \`)
	log.Println(`    -d '{"authMethod":{"method":"password","username":"alice","password":"secret123"}}'`)
	log.Println("")
	log.Println(`  curl -X POST localhost:8080/projects/$(uuidgen)/webhooks -H "Authorization: Bearer x" \`)
	log.Println(`    -H "Content-Type: application/json" \`)
	log.Println(`    -d '{"name":"Hook","events":["secret.created"],"target":{"type":"slack","webhookUrl":"https://hooks.slack.com/x","channel":"#alerts"}}'`)
	log.Println("")
	log.Println(`  curl -X PATCH localhost:8080/orgs/$(uuidgen)/users/$(uuidgen) -H "Authorization: Bearer x" \`)
	log.Println(`    -H "Content-Type: application/json" -d '{"name":"New Name","role":null}'`)
	log.Println("")
	log.Println(`  # Test conflict error:`)
	log.Println(`  curl -X POST localhost:8080/orgs/$(uuidgen)/users -H "Authorization: Bearer x" \`)
	log.Println(`    -H "Content-Type: application/json" -d '{"email":"existing@example.com","name":"Test","role":"member"}'`)

	log.Fatal(http.ListenAndServe(":8080", r))
}
