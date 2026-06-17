package apiauth

import (
	"context"
	"net"
	"net/http"
	"strings"

	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/services/assumeprivilege"
	"github.com/infisical/api/internal/services/auditlog"
	"github.com/infisical/api/internal/services/auth"
)

// AuthMode identifies which authentication mechanisms are allowed for a route.
type AuthMode int

const (
	JWTAuth AuthMode = iota
	IdentityAccessTokenAuth
	ServiceTokenAuth
)

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
//	authenticator.RequireAuth(
//	    apiauth.WithAuthModes(apiauth.JWTAuth, apiauth.IdentityAccessTokenAuth),
//	    apiauth.WithAssumePrivilege(false),
//	)
func (a *ApiAuthenticator) RequireAuth(opts ...AuthOption) func(http.Handler) http.Handler {
	cfg := &authConfig{
		allowedModes:    make(map[AuthMode]bool),
		assumePrivilege: true,
	}
	for _, opt := range opts {
		opt(cfg)
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Extract HTTP info (IP, user-agent) first
			userAgent := r.Header.Get("User-Agent")
			httpInfo := &auth.HTTPInfo{
				IPAddress:     getRealIP(r),
				UserAgent:     userAgent,
				UserAgentType: auditlog.GetUserAgentType(userAgent),
			}
			ctx := auth.WithHTTPInfo(r.Context(), httpInfo)

			token := extractBearerToken(r)
			if token == "" {
				a.errorHandler.HandleError(w, r, http.StatusUnauthorized, errutil.Unauthorized("Missing authorization header"))
				return
			}

			var identity *auth.Identity
			var actualMode AuthMode
			var err error

			// Classify and validate token
			classifiedMode := ClassifyToken(token)
			switch classifiedMode {
			case auth.AuthModeServiceToken:
				if !cfg.allowedModes[ServiceTokenAuth] {
					a.errorHandler.HandleError(w, r, http.StatusUnauthorized, errutil.Unauthorized("Authentication method not allowed for this endpoint"))
					return
				}
				identity, err = a.ValidateServiceToken(ctx, token)
				actualMode = ServiceTokenAuth

			case auth.AuthModeJWT:
				if !cfg.allowedModes[JWTAuth] && !cfg.allowedModes[IdentityAccessTokenAuth] {
					a.errorHandler.HandleError(w, r, http.StatusUnauthorized, errutil.Unauthorized("Authentication method not allowed for this endpoint"))
					return
				}
				var authMode auth.AuthMode
				identity, authMode, err = a.ValidateJWTToken(ctx, token, httpInfo.IPAddress)
				actualMode, _ = mapClassifiedMode(authMode)

			default:
				a.errorHandler.HandleError(w, r, http.StatusUnauthorized, errutil.Unauthorized("Unsupported authentication method"))
				return
			}

			if err != nil {
				a.errorHandler.HandleError(w, r, http.StatusUnauthorized, err)
				return
			}

			if identity == nil {
				a.errorHandler.HandleError(w, r, http.StatusUnauthorized, errutil.Unauthorized("Authentication failed"))
				return
			}

			if !cfg.allowedModes[actualMode] {
				a.errorHandler.HandleError(w, r, http.StatusUnauthorized, errutil.Unauthorized("Authentication method not allowed for this endpoint"))
				return
			}

			// Populate HTTP info on identity
			identity.IPAddress = httpInfo.IPAddress
			identity.UserAgent = httpInfo.UserAgent
			identity.UserAgentType = httpInfo.UserAgentType

			ctx = auth.WithIdentity(ctx, identity)

			// Handle assume privilege for JWT auth
			if cfg.assumePrivilege && identity.AuthMode == auth.AuthModeJWT {
				if a.assumePrivilege != nil {
					ctx = injectAssumePrivilege(ctx, w, r, identity, a.assumePrivilege)
				}
			}

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// getRealIP extracts the real client IP address from the request.
// TODO: When Go becomes standalone, implement proper trusted proxy validation
// similar to Node.js backend/src/server/plugins/ip.ts. For now, trust X-Real-IP
// set by the Node.js proxy after its validation.
func getRealIP(r *http.Request) string {
	// X-Real-IP is set by Node.js proxy with the validated client IP
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}

	// Check X-Forwarded-For header (may contain multiple IPs)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// Take the first IP (original client)
		if before, _, ok := strings.Cut(xff, ","); ok {
			return strings.TrimSpace(before)
		}
		return strings.TrimSpace(xff)
	}

	// Fall back to RemoteAddr
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

// injectAssumePrivilege checks for assume privilege cookie and injects details into context.
func injectAssumePrivilege(ctx context.Context, w http.ResponseWriter, r *http.Request, identity *auth.Identity, verifier AssumePrivilegeVerifier) context.Context {
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

// mapClassifiedMode maps auth.AuthMode to apiauth.AuthMode.
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
