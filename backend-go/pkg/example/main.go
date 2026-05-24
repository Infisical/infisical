//go:build ignore

package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/infisical/api/pkg/api"
)

// =============================================================================
// Union Types for Webhook Targets
// =============================================================================

// WebhookTarget is the union interface for delivery targets.
// All variants must embed api.UnionBase and implement Schema().
type WebhookTarget interface {
	api.Union
	Deliver(payload []byte) error
}

// HTTPTarget delivers webhooks via HTTP
type HTTPTarget struct {
	api.UnionBase
	Type    string            `json:"type"`
	URL     string            `json:"url"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers,omitempty"`
}

func (h *HTTPTarget) Schema() *api.ObjectSchema {
	return api.Object(map[string]api.Schema{
		"type":    api.Const("http"),
		"url":     api.String(&h.URL).Required().URL(),
		"method":  api.String(&h.Method).Required().Enum("POST", "PUT"),
		"headers": api.Map(api.String(nil)).Optional(),
	})
}

func (h *HTTPTarget) Deliver(payload []byte) error {
	log.Printf("HTTP %s to %s", h.Method, h.URL)
	return nil
}

// SlackTarget delivers webhooks to Slack
type SlackTarget struct {
	api.UnionBase
	Type       string `json:"type"`
	WebhookURL string `json:"webhookUrl"`
	Channel    string `json:"channel,omitempty"`
}

func (s *SlackTarget) Schema() *api.ObjectSchema {
	return api.Object(map[string]api.Schema{
		"type":       api.Const("slack"),
		"webhookUrl": api.String(&s.WebhookURL).Required().URL(),
		"channel":    api.String(&s.Channel).Optional().Pattern(`^#[a-z0-9_-]+$`),
	})
}

func (s *SlackTarget) Deliver(payload []byte) error {
	log.Printf("Slack to %s", s.Channel)
	return nil
}

// DiscordTarget delivers webhooks to Discord
type DiscordTarget struct {
	api.UnionBase
	Type       string `json:"type"`
	WebhookURL string `json:"webhookUrl"`
}

func (d *DiscordTarget) Schema() *api.ObjectSchema {
	return api.Object(map[string]api.Schema{
		"type":       api.Const("discord"),
		"webhookUrl": api.String(&d.WebhookURL).Required().URL(),
	})
}

func (d *DiscordTarget) Deliver(payload []byte) error {
	log.Printf("Discord webhook")
	return nil
}

// WebhookTargetParser parses webhook target union
var WebhookTargetParser = api.UnionDef[WebhookTarget]{
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
	api.Union
	GetIdentifier() string
}

type PasswordAuth struct {
	api.UnionBase
	Method   string `json:"method"`
	Username string `json:"username"`
	Password string `json:"password"`
}

func (p *PasswordAuth) Schema() *api.ObjectSchema {
	return api.Object(map[string]api.Schema{
		"method":   api.Const("password"),
		"username": api.String(&p.Username).Required().MinLength(1),
		"password": api.String(&p.Password).Required().MinLength(8),
	})
}

func (p *PasswordAuth) GetIdentifier() string { return p.Username }

type SAMLAuth struct {
	api.UnionBase
	Method       string `json:"method"`
	SAMLResponse string `json:"samlResponse"`
}

func (s *SAMLAuth) Schema() *api.ObjectSchema {
	return api.Object(map[string]api.Schema{
		"method":       api.Const("saml"),
		"samlResponse": api.String(&s.SAMLResponse).Required(),
	})
}

func (s *SAMLAuth) GetIdentifier() string { return "saml-user" }

type OIDCAuth struct {
	api.UnionBase
	Method      string `json:"method"`
	Code        string `json:"code"`
	RedirectURI string `json:"redirectUri"`
}

func (o *OIDCAuth) Schema() *api.ObjectSchema {
	return api.Object(map[string]api.Schema{
		"method":      api.Const("oidc"),
		"code":        api.String(&o.Code).Required(),
		"redirectUri": api.String(&o.RedirectURI).Required().URL(),
	})
}

func (o *OIDCAuth) GetIdentifier() string { return "oidc-user" }

var AuthMethodParser = api.UnionDef[AuthMethod]{
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

func (r *ListUsersRequest) Schema() *api.ObjectSchema {
	return api.Object(map[string]api.Schema{
		"orgId":    api.UUID(&r.OrgID).Required().From(api.SourcePath),
		"page":     api.Int(&r.Page).Optional().Min(1).Default(1).From(api.SourceQuery),
		"pageSize": api.Int(&r.PageSize).Optional().Min(1).Max(100).Default(20).From(api.SourceQuery),
		"role":     api.String(&r.Role).Optional().Enum("admin", "member", "viewer").From(api.SourceQuery),
	})
}

type CreateUserRequest struct {
	OrgID uuid.UUID `json:"-"`
	Email string    `json:"email"`
	Name  string    `json:"name"`
	Role  string    `json:"role"`
}

func (r *CreateUserRequest) Schema() *api.ObjectSchema {
	return api.Object(map[string]api.Schema{
		"orgId": api.UUID(&r.OrgID).Required().From(api.SourcePath),
		"email": api.String(&r.Email).Required().EmailStrict(),
		"name":  api.String(&r.Name).Required().MinLength(1).MaxLength(100),
		"role":  api.String(&r.Role).Required().Enum("admin", "member", "viewer"),
	})
}

// PATCH request with tri-state nullable fields
type UpdateUserRequest struct {
	OrgID  uuid.UUID                `json:"-"`
	UserID uuid.UUID                `json:"-"`
	Name   api.JsonNullable[string] `json:"name"`
	Role   api.JsonNullable[string] `json:"role"`
}

func (r *UpdateUserRequest) Schema() *api.ObjectSchema {
	return api.Object(map[string]api.Schema{
		"orgId":  api.UUID(&r.OrgID).Required().From(api.SourcePath),
		"userId": api.UUID(&r.UserID).Required().From(api.SourcePath),
		"name":   api.Nullable(&r.Name, api.String(&r.Name.Value).MinLength(1).MaxLength(100)).Optional(),
		"role":   api.Nullable(&r.Role, api.String(&r.Role.Value).Enum("admin", "member", "viewer")).Optional(),
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

func (r *CreateWebhookRequest) Schema() *api.ObjectSchema {
	return api.Object(map[string]api.Schema{
		"projectId": api.UUID(&r.ProjectID).Required().From(api.SourcePath),
		"name":      api.String(&r.Name).Required().MinLength(1).MaxLength(100),
		"events":    api.Array(api.String(nil).Enum("secret.created", "secret.updated", "secret.deleted")).Required(),
		// Connected union: parses TargetRaw → Target, validates variant, generates OpenAPI
		"target":  api.UnionFrom(&r.TargetRaw, &r.Target, WebhookTargetParser).Required(),
		"enabled": api.Bool(&r.Enabled).Optional().Default(true),
	})
}

type LoginRequest struct {
	OrgSlug       string          `json:"-"`
	AuthMethodRaw json.RawMessage `json:"authMethod"`
	Auth          AuthMethod      `json:"-"` // Parsed automatically by UnionFrom
}

func (r *LoginRequest) Schema() *api.ObjectSchema {
	return api.Object(map[string]api.Schema{
		"orgSlug": api.String(&r.OrgSlug).Required().From(api.SourcePath).Pattern(`^[a-z0-9-]+$`),
		// Connected union: parses AuthMethodRaw → Auth, validates variant, generates OpenAPI
		"authMethod": api.UnionFrom(&r.AuthMethodRaw, &r.Auth, AuthMethodParser).Required(),
	})
}

type ErrorResponse struct {
	Error string `json:"error"`
	Code  string `json:"code"`
}

func (r *ErrorResponse) Schema() *api.ObjectSchema {
	return api.Object(map[string]api.Schema{
		"error": api.String(&r.Error).Required(),
		"code":  api.String(&r.Code).Required(),
	})
}

// =============================================================================
// Auth Validators
// =============================================================================

type JWTValidator struct{}

func (v *JWTValidator) Validate(ctx context.Context, r *http.Request) (any, error) {
	auth := r.Header.Get("Authorization")
	if auth == "" || len(auth) < 7 || auth[:7] != "Bearer " {
		return nil, api.ErrSkipToNextAuth
	}
	return map[string]any{"sub": "user-123"}, nil
}

type APIKeyValidator struct{}

func (v *APIKeyValidator) Validate(ctx context.Context, r *http.Request) (any, error) {
	if r.Header.Get("X-API-Key") == "" {
		return nil, api.ErrSkipToNextAuth
	}
	return map[string]any{"keyId": "key-123"}, nil
}

// =============================================================================
// Handlers
// =============================================================================

func listUsersHandler(w http.ResponseWriter, r *http.Request) {
	var req ListUsersRequest
	if err := api.ParseAndValidate(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"users":    []any{},
		"page":     req.Page,
		"pageSize": req.PageSize,
	})
}

func createUserHandler(w http.ResponseWriter, r *http.Request) {
	var req CreateUserRequest
	if err := api.ParseAndValidate(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"id":    uuid.New(),
		"email": req.Email,
		"name":  req.Name,
		"role":  req.Role,
	})
}

func updateUserHandler(w http.ResponseWriter, r *http.Request) {
	var req UpdateUserRequest
	if err := api.ParseAndValidate(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
		return
	}

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

	writeJSON(w, http.StatusOK, map[string]any{"changes": changes})
}

func createWebhookHandler(w http.ResponseWriter, r *http.Request) {
	var req CreateWebhookRequest
	if err := api.ParseAndValidate(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
		return
	}

	// req.Target is already parsed and validated by UnionFrom!
	switch t := req.Target.(type) {
	case *HTTPTarget:
		log.Printf("Creating HTTP webhook: %s %s", t.Method, t.URL)
	case *SlackTarget:
		log.Printf("Creating Slack webhook: %s", t.Channel)
	case *DiscordTarget:
		log.Printf("Creating Discord webhook")
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":      uuid.New(),
		"name":    req.Name,
		"target":  req.Target,
		"enabled": req.Enabled,
	})
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := api.ParseAndValidate(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
		return
	}

	// req.Auth is already parsed and validated by UnionFrom!
	switch auth := req.Auth.(type) {
	case *PasswordAuth:
		log.Printf("Password login: %s", auth.Username)
	case *SAMLAuth:
		log.Printf("SAML login")
	case *OIDCAuth:
		log.Printf("OIDC login: redirect=%s", auth.RedirectURI)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"token":     "jwt-token",
		"expiresAt": time.Now().Add(24 * time.Hour),
	})
}

func openAPIHandler(spec *api.OpenAPISpec) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(spec.Generate())
	}
}

// =============================================================================
// Helpers
// =============================================================================

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, ErrorResponse{Error: msg, Code: code})
}

// =============================================================================
// Main
// =============================================================================

func main() {
	// Security
	security := api.NewSecurityRegistry()
	security.MustRegister("bearer", api.HTTPBearerJWT(), &JWTValidator{})
	security.MustRegister("apiKey", api.APIKeyHeader("X-API-Key"), &APIKeyValidator{})

	// Users router
	users := api.NewRouter()
	users.WithSecurity(api.NewSecurity("bearer"), api.NewSecurity("apiKey"))
	users.WithTags("users")

	users.Handle(api.Endpoint{
		Method:      http.MethodGet,
		Pattern:     "/users",
		Handler:     listUsersHandler,
		Summary:     "List users",
		OperationID: "listUsers",
		Request:     &ListUsersRequest{},
	})
	users.Handle(api.Endpoint{
		Method:      http.MethodPost,
		Pattern:     "/users",
		Handler:     createUserHandler,
		Summary:     "Create user",
		OperationID: "createUser",
		Request:     &CreateUserRequest{},
	})
	users.Handle(api.Endpoint{
		Method:      http.MethodPatch,
		Pattern:     "/users/{userId}",
		Handler:     updateUserHandler,
		Summary:     "Update user (PATCH with tri-state)",
		OperationID: "updateUser",
		Request:     &UpdateUserRequest{},
	})

	// Webhooks router
	webhooks := api.NewRouter()
	webhooks.WithSecurity(api.NewSecurity("bearer"))
	webhooks.WithTags("webhooks")

	webhooks.Handle(api.Endpoint{
		Method:      http.MethodPost,
		Pattern:     "/webhooks",
		Handler:     createWebhookHandler,
		Summary:     "Create webhook (union: http|slack|discord)",
		OperationID: "createWebhook",
		Request:     &CreateWebhookRequest{},
	})

	// Auth router (no auth required)
	auth := api.NewRouter()
	auth.WithTags("auth")

	auth.Handle(api.Endpoint{
		Method:      http.MethodPost,
		Pattern:     "/login",
		Handler:     loginHandler,
		Summary:     "Login (union: password|saml|oidc)",
		OperationID: "login",
		Request:     &LoginRequest{},
		Security:    []api.Security{}, // No auth
	})

	// Main router
	root := api.NewRouter()
	root.Mount("/orgs/{orgId}", users)
	root.Mount("/projects/{projectId}", webhooks)
	root.Mount("/auth/{orgSlug}", auth)

	// OpenAPI spec
	spec := api.NewOpenAPISpec(&api.OpenAPIConfig{
		Info: api.OpenAPIInfo{
			Title:       "Example API",
			Description: "Demonstrates unions, tri-state PATCH, validation, and OpenAPI generation",
			Version:     "1.0.0",
		},
		Servers:         []api.Server{{URL: "http://localhost:8080"}},
		SecuritySchemes: security.Schemes(),
		Tags: []api.OpenAPITag{
			{Name: "auth", Description: "Authentication (password, SAML, OIDC)"},
			{Name: "users", Description: "User management"},
			{Name: "webhooks", Description: "Webhooks (HTTP, Slack, Discord)"},
		},
	})
	spec.AddEndpoints(root.Endpoints())

	// Chi router
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/openapi.json", openAPIHandler(spec))
	r.Post("/auth/{orgSlug}/login", loginHandler)

	r.Group(func(r chi.Router) {
		r.Use(security.Middleware(
			[]api.Security{api.NewSecurity("bearer"), api.NewSecurity("apiKey")},
			nil,
		))
		for _, ep := range root.Endpoints() {
			if len(ep.Security) > 0 {
				r.Method(ep.Method, ep.Pattern, ep.Handler)
			}
		}
	})

	log.Println("Server: http://localhost:8080")
	log.Println("OpenAPI: http://localhost:8080/openapi.json")
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

	log.Fatal(http.ListenAndServe(":8080", r))
}
