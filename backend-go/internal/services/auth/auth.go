// Package auth provides authentication types, token validation, and context helpers
// for propagating identity information through request handling.
package auth

import (
	"context"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/services/actor"
)

// AuthMode identifies the authentication mechanism used by the caller.
type AuthMode string

const (
	AuthModeJWT                 AuthMode = "jwt"
	AuthModeIdentityAccessToken AuthMode = "identity_access_token"
	AuthModeServiceToken        AuthMode = "service_token"
)

// AuthTokenType represents the token type claim embedded in JWTs.
// Values match the Node.js AuthTokenType enum in auth-type.ts.
type AuthTokenType string

const (
	AuthTokenTypeAccessToken         AuthTokenType = "accessToken"
	AuthTokenTypeRefreshToken        AuthTokenType = "refreshToken"
	AuthTokenTypeSignupToken         AuthTokenType = "signupToken"
	AuthTokenTypeMfaToken            AuthTokenType = "mfaToken"
	AuthTokenTypeProviderToken       AuthTokenType = "providerToken"
	AuthTokenTypeAPIKey              AuthTokenType = "apiKey"
	AuthTokenTypeServiceAccessToken  AuthTokenType = "serviceAccessToken"
	AuthTokenTypeServiceRefreshToken AuthTokenType = "serviceRefreshToken"
	AuthTokenTypeIdentityAccessToken AuthTokenType = "identityAccessToken"
	AuthTokenTypeSCIMToken           AuthTokenType = "scimToken"
)

// UserAuthInfo holds the minimal user info stored in request context for audit logging.
// Port of Node.js requestContext.userAuthInfo.
type UserAuthInfo struct {
	UserID uuid.UUID
	Email  string
}

// IdentityAuthInfo is an alias for actor.AuthInfo for backward compatibility.
// Port of Node.js requestContext.identityAuthInfo.
type IdentityAuthInfo = actor.AuthInfo

// IdentityAuthOIDC is an alias for actor.AuthOIDC for backward compatibility.
type IdentityAuthOIDC = actor.AuthOIDC

// IdentityAuthKubernetes is an alias for actor.AuthKubernetes for backward compatibility.
type IdentityAuthKubernetes = actor.AuthKubernetes

// IdentityAuthAWS is an alias for actor.AuthAWS for backward compatibility.
type IdentityAuthAWS = actor.AuthAWS

// Identity holds the resolved actor information extracted from a request token.
// It is the Go equivalent of the Node.js backend's req.auth / req.permission object.
type Identity struct {
	AuthMode     AuthMode
	Actor        actor.Type
	ActorID      uuid.UUID
	OrgID        uuid.UUID
	RootOrgID    uuid.UUID
	ParentOrgID  uuid.UUID
	OrgName      string
	AuthMethod   actor.AuthMethod
	IsSuperAdmin bool

	// MFA fields (for JWT user auth).
	IsMfaVerified bool
	MfaMethod     string

	// UserAuthInfo is set for JWT (user) auth. Used for audit logging.
	UserAuthInfo *UserAuthInfo
	// IdentityAuthInfo is set for identity access token auth. Used for audit logging.
	IdentityAuthInfo *IdentityAuthInfo

	// HTTP layer fields (populated by middleware, used for audit logging).
	IPAddress     string
	UserAgent     string
	UserAgentType string
	// Actor display fields (populated during auth, used for audit logging).
	Name     string // For identity/service actors
	Email    string // For user actors
	Username string // For user actors
}

type ctxKey struct{}
type httpInfoKey struct{}

// HTTPInfo holds HTTP request information for audit logging.
type HTTPInfo struct {
	IPAddress     string
	UserAgent     string
	UserAgentType string
}

// WithHTTPInfo stores HTTP info in the context.
func WithHTTPInfo(ctx context.Context, info *HTTPInfo) context.Context {
	return context.WithValue(ctx, httpInfoKey{}, info)
}

// HTTPInfoFromContext returns the HTTPInfo stored in ctx, or nil if absent.
func HTTPInfoFromContext(ctx context.Context) *HTTPInfo {
	info, _ := ctx.Value(httpInfoKey{}).(*HTTPInfo)
	return info
}

// WithIdentity stores the given identity in the context.
func WithIdentity(ctx context.Context, id *Identity) context.Context {
	return context.WithValue(ctx, ctxKey{}, id)
}

// IdentityFromContext returns the identity stored in ctx, or nil if absent.
func IdentityFromContext(ctx context.Context) *Identity {
	id, _ := ctx.Value(ctxKey{}).(*Identity)
	return id
}
