package middlewares

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/infisical/api/internal/libs/errutil"
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
	ValidateJWT(ctx context.Context, token string) (*auth.Identity, error)
	ValidateIdentityAccessToken(ctx context.Context, token, ipAddress string) (*auth.Identity, error)
	ValidateServiceToken(ctx context.Context, token string) (*auth.Identity, error)
}

// RequireAuth creates a middleware that enforces authentication with fail-closed behavior.
// No bearer header → 401. Bearer present but mode not in allowedModes → 401.
// Validator error → 401. Only success path: bearer + allowed mode + valid token → identity in context.
func RequireAuth(authenticator Authenticator, allowedModes ...AuthMode) func(http.Handler) http.Handler {
	allowedSet := make(map[AuthMode]bool, len(allowedModes))
	for _, mode := range allowedModes {
		allowedSet[mode] = true
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := extractBearerToken(r)
			if token == "" {
				writeUnauthorized(w, "Missing authorization header")
				return
			}

			classifiedMode := apiauth.ClassifyToken(token)
			authMode, ok := mapClassifiedMode(classifiedMode)
			if !ok {
				writeUnauthorized(w, "Unsupported authentication method")
				return
			}

			if !allowedSet[authMode] {
				writeUnauthorized(w, "Authentication method not allowed for this endpoint")
				return
			}

			ctx := r.Context()
			var identity *auth.Identity
			var err error

			switch authMode {
			case JWTAuth:
				identity, err = authenticator.ValidateJWT(ctx, token)
			case IdentityAccessTokenAuth:
				ipAddress := ""
				if httpInfo := auth.HTTPInfoFromContext(ctx); httpInfo != nil {
					ipAddress = httpInfo.IPAddress
				}
				identity, err = authenticator.ValidateIdentityAccessToken(ctx, token, ipAddress)
			case ServiceTokenAuth:
				identity, err = authenticator.ValidateServiceToken(ctx, token)
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

			populateHTTPInfo(ctx, identity)
			ctx = auth.WithIdentity(ctx, identity)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
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
