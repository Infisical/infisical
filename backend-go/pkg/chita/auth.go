package chita

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
)

// ErrSkipToNextAuth is returned by a validator to indicate that authentication
// should continue with the next security scheme. If all schemes return this error,
// the request is unauthorized.
var ErrSkipToNextAuth = errors.New("skip to next auth")

// authResultContextKey is the context key for AuthResult
type authResultContextKey struct{}

// AuthResult contains the result of successful authentication.
// Retrieved from context via GetAuthResult().
type AuthResult struct {
	// Schemes lists which security schemes passed (in order, for AND relationships)
	Schemes []string
	// Claims maps scheme name to its claims (for AND relationships, all are present)
	Claims map[string]any
}

// GetClaims returns claims for the first scheme that passed.
// Use GetClaimsByScheme for AND relationships where you need specific claims.
func (r *AuthResult) GetClaims() any {
	if r == nil || len(r.Schemes) == 0 {
		return nil
	}
	return r.Claims[r.Schemes[0]]
}

// GetClaimsByScheme returns claims for a specific scheme name.
func (r *AuthResult) GetClaimsByScheme(scheme string) any {
	if r == nil || r.Claims == nil {
		return nil
	}
	return r.Claims[scheme]
}

// GetAuthResult retrieves the AuthResult from the request context.
// Returns nil if no authentication was performed or failed.
func GetAuthResult(ctx context.Context) *AuthResult {
	if result, ok := ctx.Value(authResultContextKey{}).(*AuthResult); ok {
		return result
	}
	return nil
}

// setAuthResult stores the AuthResult in the context.
func setAuthResult(ctx context.Context, result *AuthResult) context.Context {
	return context.WithValue(ctx, authResultContextKey{}, result)
}

// Validator is the interface that auth validators must implement.
// Implement this interface with your dependencies (db, keystore, etc.)
// injected via the struct.
type Validator interface {
	// Validate authenticates the request and returns claims on success.
	// Return ErrSkipToNextAuth to try the next security scheme.
	// Return any other error to immediately reject the request.
	// Return (claims, nil) on successful authentication.
	Validate(ctx context.Context, r *http.Request) (claims any, err error)
}

// ValidatorFunc is an adapter to allow ordinary functions to be used as Validators.
type ValidatorFunc func(ctx context.Context, r *http.Request) (any, error)

// Validate calls the underlying function.
func (f ValidatorFunc) Validate(ctx context.Context, r *http.Request) (any, error) {
	return f(ctx, r)
}

// SecurityScheme defines an OpenAPI security scheme.
// This is purely metadata for OpenAPI generation - validators are registered separately.
type SecurityScheme struct {
	// Type is the security scheme type: "http", "apiKey", "oauth2", "openIdConnect"
	Type string

	// Scheme is the HTTP auth scheme (for type "http"): "bearer", "basic", "digest", etc.
	Scheme string

	// BearerFormat hints at the token format (for scheme "bearer"): "JWT", etc.
	BearerFormat string

	// In specifies where the API key is sent (for type "apiKey"): "header", "query", "cookie"
	In string

	// Name is the name of the header, query parameter, or cookie (for type "apiKey")
	Name string

	// Description describes the security scheme
	Description string

	// OpenIDConnectURL is the OpenID Connect discovery URL (for type "openIdConnect")
	OpenIDConnectURL string

	// Flows defines OAuth2 flows (for type "oauth2")
	Flows *OAuthFlows
}

// OAuthFlows defines OAuth2 flow configurations
type OAuthFlows struct {
	Implicit          *OAuthFlow
	Password          *OAuthFlow
	ClientCredentials *OAuthFlow
	AuthorizationCode *OAuthFlow
}

// OAuthFlow defines an OAuth2 flow
type OAuthFlow struct {
	AuthorizationURL string
	TokenURL         string
	RefreshURL       string
	Scopes           map[string]string
}

// --- SecurityScheme Builders (return pointer for chaining) ---

// HTTPBearer creates an HTTP bearer token security scheme
func HTTPBearer() *SecurityScheme {
	return &SecurityScheme{
		Type:   "http",
		Scheme: "bearer",
	}
}

// HTTPBearerJWT creates an HTTP bearer token security scheme with JWT format
func HTTPBearerJWT() *SecurityScheme {
	return &SecurityScheme{
		Type:         "http",
		Scheme:       "bearer",
		BearerFormat: "JWT",
	}
}

// HTTPBasic creates an HTTP basic auth security scheme
func HTTPBasic() *SecurityScheme {
	return &SecurityScheme{
		Type:   "http",
		Scheme: "basic",
	}
}

// APIKeyHeader creates an API key in header security scheme
func APIKeyHeader(name string) *SecurityScheme {
	return &SecurityScheme{
		Type: "apiKey",
		In:   "header",
		Name: name,
	}
}

// APIKeyQuery creates an API key in query parameter security scheme
func APIKeyQuery(name string) *SecurityScheme {
	return &SecurityScheme{
		Type: "apiKey",
		In:   "query",
		Name: name,
	}
}

// APIKeyCookie creates an API key in cookie security scheme
func APIKeyCookie(name string) *SecurityScheme {
	return &SecurityScheme{
		Type: "apiKey",
		In:   "cookie",
		Name: name,
	}
}

// OpenIDConnect creates an OpenID Connect security scheme
func OpenIDConnect(discoveryURL string) *SecurityScheme {
	return &SecurityScheme{
		Type:             "openIdConnect",
		OpenIDConnectURL: discoveryURL,
	}
}

// OAuth2Implicit creates an OAuth2 implicit flow security scheme
func OAuth2Implicit(authURL string, scopes map[string]string) *SecurityScheme {
	return &SecurityScheme{
		Type: "oauth2",
		Flows: &OAuthFlows{
			Implicit: &OAuthFlow{
				AuthorizationURL: authURL,
				Scopes:           scopes,
			},
		},
	}
}

// OAuth2Password creates an OAuth2 password flow security scheme
func OAuth2Password(tokenURL string, scopes map[string]string) *SecurityScheme {
	return &SecurityScheme{
		Type: "oauth2",
		Flows: &OAuthFlows{
			Password: &OAuthFlow{
				TokenURL: tokenURL,
				Scopes:   scopes,
			},
		},
	}
}

// OAuth2ClientCredentials creates an OAuth2 client credentials flow security scheme
func OAuth2ClientCredentials(tokenURL string, scopes map[string]string) *SecurityScheme {
	return &SecurityScheme{
		Type: "oauth2",
		Flows: &OAuthFlows{
			ClientCredentials: &OAuthFlow{
				TokenURL: tokenURL,
				Scopes:   scopes,
			},
		},
	}
}

// OAuth2AuthorizationCode creates an OAuth2 authorization code flow security scheme
func OAuth2AuthorizationCode(authURL, tokenURL string, scopes map[string]string) *SecurityScheme {
	return &SecurityScheme{
		Type: "oauth2",
		Flows: &OAuthFlows{
			AuthorizationCode: &OAuthFlow{
				AuthorizationURL: authURL,
				TokenURL:         tokenURL,
				Scopes:           scopes,
			},
		},
	}
}

// --- SecurityScheme Chainable Methods ---

// WithDescription sets the description for this security scheme.
func (s *SecurityScheme) WithDescription(desc string) *SecurityScheme {
	s.Description = desc
	return s
}

// WithBearerFormat sets the bearer format (e.g., "JWT") for HTTP bearer schemes.
func (s *SecurityScheme) WithBearerFormat(format string) *SecurityScheme {
	s.BearerFormat = format
	return s
}

// --- SecurityScheme OpenAPI Generation ---

// OpenAPI returns the OpenAPI representation of the security scheme.
func (s *SecurityScheme) OpenAPI() map[string]any {
	if s == nil {
		return nil
	}

	result := map[string]any{
		"type": s.Type,
	}

	if s.Description != "" {
		result["description"] = s.Description
	}

	switch s.Type {
	case "http":
		result["scheme"] = s.Scheme
		if s.BearerFormat != "" {
			result["bearerFormat"] = s.BearerFormat
		}

	case "apiKey":
		result["in"] = s.In
		result["name"] = s.Name

	case "openIdConnect":
		result["openIdConnectUrl"] = s.OpenIDConnectURL

	case "oauth2":
		if s.Flows != nil {
			result["flows"] = s.Flows.OpenAPI()
		}
	}

	return result
}

// OpenAPI returns the OpenAPI representation of OAuth flows
func (f *OAuthFlows) OpenAPI() map[string]any {
	flows := make(map[string]any)

	if f.Implicit != nil {
		flows["implicit"] = f.Implicit.OpenAPI()
	}
	if f.Password != nil {
		flows["password"] = f.Password.OpenAPI()
	}
	if f.ClientCredentials != nil {
		flows["clientCredentials"] = f.ClientCredentials.OpenAPI()
	}
	if f.AuthorizationCode != nil {
		flows["authorizationCode"] = f.AuthorizationCode.OpenAPI()
	}

	return flows
}

// OpenAPI returns the OpenAPI representation of an OAuth flow
func (f *OAuthFlow) OpenAPI() map[string]any {
	result := make(map[string]any)

	if f.AuthorizationURL != "" {
		result["authorizationUrl"] = f.AuthorizationURL
	}
	if f.TokenURL != "" {
		result["tokenUrl"] = f.TokenURL
	}
	if f.RefreshURL != "" {
		result["refreshUrl"] = f.RefreshURL
	}
	if f.Scopes != nil {
		result["scopes"] = f.Scopes
	} else {
		result["scopes"] = map[string]string{}
	}

	return result
}

// --- Security Requirement ---

// SecurityRequirement is a single scheme + scopes pair.
type SecurityRequirement struct {
	Scheme string
	Scopes []string
}

// Security represents a security requirement for an endpoint.
// Multiple schemes in one Security = AND (all required, validated in order)
// Multiple Security entries on endpoint = OR (any one suffices)
type Security struct {
	requirements []SecurityRequirement
}

// NewSecurity creates a security requirement for a scheme with optional scopes
func NewSecurity(scheme string, scopes ...string) Security {
	return Security{
		requirements: []SecurityRequirement{{Scheme: scheme, Scopes: scopes}},
	}
}

// And adds another scheme requirement (AND relationship - both must pass).
// Schemes are validated in the order they are added.
func (s Security) And(scheme string, scopes ...string) Security {
	s.requirements = append(s.requirements, SecurityRequirement{Scheme: scheme, Scopes: scopes})
	return s
}

// IsEmpty returns true if no schemes are required (allows unauthenticated access)
func (s Security) IsEmpty() bool {
	return len(s.requirements) == 0
}

// Requirements returns the ordered list of security requirements.
func (s Security) Requirements() []SecurityRequirement {
	return s.requirements
}

// ToMap converts to OpenAPI security requirement format (map of scheme to scopes).
func (s Security) ToMap() map[string][]string {
	result := make(map[string][]string, len(s.requirements))
	for _, req := range s.requirements {
		scopes := req.Scopes
		if scopes == nil {
			scopes = []string{} // OpenAPI requires array, not null
		}
		result[req.Scheme] = scopes
	}
	return result
}

// --- Security Registry ---

// registeredScheme pairs a security scheme with its validator
type registeredScheme struct {
	scheme    *SecurityScheme
	validator Validator
}

// SecurityRegistry holds registered security schemes and their validators.
// Thread-safe for reads after startup. Register all schemes during initialization
// before starting the server.
type SecurityRegistry struct {
	mu      sync.RWMutex
	schemes map[string]*registeredScheme
}

// NewSecurityRegistry creates a new security registry
func NewSecurityRegistry() *SecurityRegistry {
	return &SecurityRegistry{
		schemes: make(map[string]*registeredScheme),
	}
}

// MustRegister registers a security scheme with its validator.
// Panics if:
// - A scheme with the same name is already registered
// - The validator is nil
//
// Call this at startup to fail fast if auth is misconfigured.
// Note: All registration should happen before starting the server.
func (r *SecurityRegistry) MustRegister(name string, scheme *SecurityScheme, validator Validator) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.schemes[name]; exists {
		panic("api: security scheme already registered: " + name)
	}
	if validator == nil {
		panic("api: validator is nil for security scheme: " + name)
	}
	if scheme == nil {
		panic("api: scheme is nil for security scheme: " + name)
	}

	r.schemes[name] = &registeredScheme{
		scheme:    scheme,
		validator: validator,
	}
}

// Register is like MustRegister but returns an error instead of panicking.
// Note: All registration should happen before starting the server.
func (r *SecurityRegistry) Register(name string, scheme *SecurityScheme, validator Validator) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.schemes[name]; exists {
		return errors.New("api: security scheme already registered: " + name)
	}
	if validator == nil {
		return errors.New("api: validator is nil for security scheme: " + name)
	}
	if scheme == nil {
		return errors.New("api: scheme is nil for security scheme: " + name)
	}

	r.schemes[name] = &registeredScheme{
		scheme:    scheme,
		validator: validator,
	}
	return nil
}

// GetScheme returns the SecurityScheme for a given name, or nil if not found.
func (r *SecurityRegistry) GetScheme(name string) *SecurityScheme {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if reg, ok := r.schemes[name]; ok {
		return reg.scheme
	}
	return nil
}

// GetValidator returns the Validator for a given name, or nil if not found.
func (r *SecurityRegistry) GetValidator(name string) Validator {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if reg, ok := r.schemes[name]; ok {
		return reg.validator
	}
	return nil
}

// Schemes returns all registered security schemes (for OpenAPI generation).
func (r *SecurityRegistry) Schemes() map[string]*SecurityScheme {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make(map[string]*SecurityScheme, len(r.schemes))
	for name, reg := range r.schemes {
		result[name] = reg.scheme
	}
	return result
}

// ValidateSecurityRequirements checks that all schemes referenced in security
// requirements are registered. Returns an error listing any missing schemes.
// Call this at startup to fail fast.
func (r *SecurityRegistry) ValidateSecurityRequirements(security []Security) error {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var missing []string

	for _, sec := range security {
		for _, req := range sec.requirements {
			if _, ok := r.schemes[req.Scheme]; !ok {
				missing = append(missing, req.Scheme)
			}
		}
	}

	if len(missing) > 0 {
		return errors.New("api: unregistered security schemes: " + strings.Join(missing, ", "))
	}

	return nil
}

// --- Authentication Middleware ---

// AuthErrorHandler is called when authentication fails.
// Use this to customize error responses (JSON, headers, etc.)
type AuthErrorHandler func(w http.ResponseWriter, r *http.Request, err error)

// Middleware creates authentication middleware for the given security requirements.
//
// Security requirements use OR relationship - first successful auth wins.
// Within a Security entry, schemes use AND relationship - all must pass in order.
//
// Behavior:
// - If security is empty or contains only empty Security{}, allows unauthenticated access
// - Tries each Security entry until one succeeds
// - On success, stores AuthResult in context (retrieve via GetAuthResult)
// - On failure, calls errorHandler or returns 401 with WWW-Authenticate header
func (r *SecurityRegistry) Middleware(security []Security, errorHandler AuthErrorHandler) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			// No security requirements = allow through
			if len(security) == 0 {
				next.ServeHTTP(w, req)
				return
			}

			// Check for explicitly optional auth (empty Security{})
			for _, sec := range security {
				if sec.IsEmpty() {
					next.ServeHTTP(w, req)
					return
				}
			}

			// Try each Security entry (OR relationship)
			var lastErr error
			for _, sec := range security {
				result, err := r.trySecurityRequirement(req, sec)
				if err == nil {
					// Success - store result in context and continue
					ctx := setAuthResult(req.Context(), result)
					next.ServeHTTP(w, req.WithContext(ctx))
					return
				}

				lastErr = err

				// If not ErrSkipToNextAuth, stop trying other schemes
				if !errors.Is(err, ErrSkipToNextAuth) {
					break
				}
			}

			// All security requirements failed
			if errorHandler != nil {
				errorHandler(w, req, lastErr)
			} else {
				// RFC 7235: 401 responses SHOULD include WWW-Authenticate
				// (omit for apiKey-only routes where no standard challenge exists)
				if challenge := r.buildWWWAuthenticate(security); challenge != "" {
					w.Header().Set("WWW-Authenticate", challenge)
				}
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
			}
		})
	}
}

// trySecurityRequirement attempts to authenticate using a Security entry.
// All schemes in the entry must pass (AND relationship), in order.
// Claims from all schemes are accumulated in AuthResult.
func (r *SecurityRegistry) trySecurityRequirement(req *http.Request, sec Security) (*AuthResult, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	requirements := sec.Requirements()
	if len(requirements) == 0 {
		return nil, ErrSkipToNextAuth
	}

	result := &AuthResult{
		Schemes: make([]string, 0, len(requirements)),
		Claims:  make(map[string]any, len(requirements)),
	}

	for _, requirement := range requirements {
		registered, ok := r.schemes[requirement.Scheme]
		if !ok {
			return nil, errors.New("api: unregistered security scheme: " + requirement.Scheme)
		}

		claims, err := registered.validator.Validate(req.Context(), req)
		if err != nil {
			if errors.Is(err, ErrSkipToNextAuth) {
				// If a previous scheme in this AND already succeeded, we cannot
				// skip to the next OR option — that would bypass the second factor.
				// Return a hard 401 instead.
				if len(result.Schemes) > 0 {
					return nil, fmt.Errorf("missing required auth scheme %q after %v succeeded", requirement.Scheme, result.Schemes)
				}
				// No scheme has succeeded yet; safe to try the next OR option.
				return nil, ErrSkipToNextAuth
			}
			// Any other error (invalid token, expired, etc.) is a hard failure
			return nil, err
		}

		// Accumulate claims from each scheme
		result.Schemes = append(result.Schemes, requirement.Scheme)
		result.Claims[requirement.Scheme] = claims
	}

	return result, nil
}

// buildWWWAuthenticate constructs the WWW-Authenticate header value.
// Lists all unique auth schemes from the security requirements.
func (r *SecurityRegistry) buildWWWAuthenticate(security []Security) string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	seen := make(map[string]bool)
	var challenges []string

	for _, sec := range security {
		for _, req := range sec.Requirements() {
			if seen[req.Scheme] {
				continue
			}
			seen[req.Scheme] = true

			registered, ok := r.schemes[req.Scheme]
			if !ok {
				continue
			}

			challenge := r.formatChallenge(registered.scheme)
			if challenge != "" {
				challenges = append(challenges, challenge)
			}
		}
	}

	if len(challenges) == 0 {
		// No standard challenges (e.g., apiKey-only routes)
		// Return empty - caller should omit WWW-Authenticate header
		return ""
	}
	return strings.Join(challenges, ", ")
}

// formatChallenge formats a single WWW-Authenticate challenge for a scheme.
func (r *SecurityRegistry) formatChallenge(scheme *SecurityScheme) string {
	switch scheme.Type {
	case "http":
		switch scheme.Scheme {
		case "bearer":
			return "Bearer"
		case "basic":
			return "Basic"
		default:
			return scheme.Scheme
		}
	case "apiKey":
		return ""
	default:
		return ""
	}
}
