package middlewares

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/services/assumeprivilege"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/auth/apiauth"
)

// AuthMode identifies which authentication mechanisms are allowed for a route.
type AuthMode int

const (
	JWTAuth AuthMode = iota
	IdentityAccessTokenAuth
	ServiceTokenAuth
)

// Authenticator defines the methods needed for token validation.
type Authenticator interface {
	// ValidateJWTToken validates any JWT (user or identity) and returns the identity and actual auth mode.
	ValidateJWTToken(ctx context.Context, token, ipAddress string) (*auth.Identity, auth.AuthMode, error)
	ValidateServiceToken(ctx context.Context, token string) (*auth.Identity, error)
	AssumePrivilege() apiauth.AssumePrivilegeVerifier
}

const assumePrivilegeCookieName = "infisical-project-assume-privileges"

// authConfig holds the configuration for RequireAuth middleware.
type authConfig struct {
	allowedModes    map[AuthMode]bool
	assumePrivilege bool
}

// AuthOption configures RequireAuth behavior.
type AuthOption func(*authConfig)

// WithAuthModes sets the allowed authentication modes.
func WithAuthModes(modes ...AuthMode) AuthOption {
	return func(c *authConfig) {
		for _, mode := range modes {
			c.allowedModes[mode] = true
		}
	}
}

// WithAssumePrivilege enables/disables assume privilege injection (default: true).
func WithAssumePrivilege(enabled bool) AuthOption {
	return func(c *authConfig) {
		c.assumePrivilege = enabled
	}
}

// RequireAuth creates a middleware that enforces authentication with fail-closed behavior.
// No bearer header → 401. Bearer present but mode not in allowedModes → 401.
// Validator error → 401. Only success path: bearer + allowed mode + valid token → identity in context.
// Also handles assume privilege cookie injection for JWT auth (enabled by default).
//
// Usage:
//
//	RequireAuth(authenticator,
//	    WithAuthModes(JWTAuth, IdentityAccessTokenAuth),
//	    WithAssumePrivilege(false),
//	)
func RequireAuth(authenticator Authenticator, opts ...AuthOption) func(http.Handler) http.Handler {
	cfg := &authConfig{
		allowedModes:    make(map[AuthMode]bool),
		assumePrivilege: true,
	}
	for _, opt := range opts {
		opt(cfg)
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := extractBearerToken(r)
			if token == "" {
				writeUnauthorized(w, "Missing authorization header")
				return
			}

			ctx := r.Context()
			var identity *auth.Identity
			var actualMode AuthMode
			var err error

			// Classify and validate token
			classifiedMode := apiauth.ClassifyToken(token)
			switch classifiedMode {
			case auth.AuthModeServiceToken:
				identity, err = authenticator.ValidateServiceToken(ctx, token)
				actualMode = ServiceTokenAuth

			case auth.AuthModeJWT:
				// JWT tokens are validated and typed in one call
				ipAddress := ""
				if httpInfo := auth.HTTPInfoFromContext(ctx); httpInfo != nil {
					ipAddress = httpInfo.IPAddress
				}
				var authMode auth.AuthMode
				identity, authMode, err = authenticator.ValidateJWTToken(ctx, token, ipAddress)
				// Map the actual auth mode from validation
				actualMode, _ = mapClassifiedMode(authMode)

			default:
				writeUnauthorized(w, "Unsupported authentication method")
				return
			}

			if err != nil {
				var httpErr *errutil.Error
				if errors.As(err, &httpErr) {
					writeUnauthorized(w, httpErr.Message)
				} else {
					writeUnauthorized(w, "Authentication failed")
				}
				return
			}

			if identity == nil {
				writeUnauthorized(w, "Authentication failed")
				return
			}

			// Check if the actual token type is allowed for this endpoint
			if !cfg.allowedModes[actualMode] {
				writeUnauthorized(w, "Authentication method not allowed for this endpoint")
				return
			}

			populateHTTPInfo(ctx, identity)
			ctx = auth.WithIdentity(ctx, identity)

			// Handle assume privilege for JWT auth
			if cfg.assumePrivilege && identity.AuthMode == auth.AuthModeJWT {
				if verifier := authenticator.AssumePrivilege(); verifier != nil {
					ctx = injectAssumePrivilege(ctx, w, r, identity, verifier)
				}
			}

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// injectAssumePrivilege checks for assume privilege cookie and injects details into context.
// Port of inject-assume-privilege.ts.
func injectAssumePrivilege(ctx context.Context, w http.ResponseWriter, r *http.Request, identity *auth.Identity, verifier apiauth.AssumePrivilegeVerifier) context.Context {
	cookie, err := r.Cookie(assumePrivilegeCookieName)
	if err != nil || cookie.Value == "" {
		return ctx
	}

	details, err := verifier.VerifyAssumePrivilegeToken(ctx, &assumeprivilege.VerifyTokenOpts{
		Token:          cookie.Value,
		TokenVersionID: identity.TokenVersionID,
		AuthMethod:     identity.AuthMethod,
		OrgID:          identity.OrgID,
	})
	if err != nil {
		clearAssumePrivilegeCookie(w)
		return ctx
	}

	return auth.WithAssumedPrivilege(ctx, details)
}

// clearAssumePrivilegeCookie clears an invalid assume privilege cookie.
func clearAssumePrivilegeCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     assumePrivilegeCookieName,
		Value:    "",
		Path:     "/api",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})
}

// extractBearerToken extracts the token from the Authorization header.
func extractBearerToken(r *http.Request) string {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return ""
	}

	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}

	return strings.TrimSpace(parts[1])
}

// mapClassifiedMode maps auth.AuthMode to middlewares.AuthMode.
func mapClassifiedMode(mode auth.AuthMode) (AuthMode, bool) {
	switch mode {
	case auth.AuthModeJWT:
		return JWTAuth, true
	case auth.AuthModeIdentityAccessToken:
		return IdentityAccessTokenAuth, true
	case auth.AuthModeServiceToken:
		return ServiceTokenAuth, true
	default:
		return 0, false
	}
}

// writeUnauthorized writes a 401 response with the error message.
func writeUnauthorized(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte(`{"code":"UnauthorizedError","message":"` + message + `"}`))
}

// populateHTTPInfo populates HTTP layer fields on the identity from context.
func populateHTTPInfo(ctx context.Context, identity *auth.Identity) {
	if httpInfo := auth.HTTPInfoFromContext(ctx); httpInfo != nil {
		identity.IPAddress = httpInfo.IPAddress
		identity.UserAgent = httpInfo.UserAgent
		identity.UserAgentType = httpInfo.UserAgentType
	}
}
