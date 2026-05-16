// Package auth provides authentication types, token validation, and context helpers
// for propagating identity information through request handling.
package auth

import (
	"context"

	"github.com/google/uuid"
)

// ActorType identifies the kind of entity performing an action.
type ActorType string

const (
	ActorTypeUser     ActorType = "user"
	ActorTypeIdentity ActorType = "identity"
	ActorTypeService  ActorType = "service"
)

// ActorAuthMethod represents the authentication method used by the actor (e.g. "jwt", "api-key").
// An empty string means no specific method (e.g. platform-level actions).
type ActorAuthMethod string

// IdentityAuthMethod represents the authentication method used by machine identities.
type IdentityAuthMethod string

const (
	IdentityAuthMethodUniversal  IdentityAuthMethod = "universal_auth"
	IdentityAuthMethodKubernetes IdentityAuthMethod = "kubernetes_auth"
	IdentityAuthMethodGCP        IdentityAuthMethod = "gcp_auth"
	IdentityAuthMethodAliCloud   IdentityAuthMethod = "alicloud_auth"
	IdentityAuthMethodAWS        IdentityAuthMethod = "aws_auth"
	IdentityAuthMethodAzure      IdentityAuthMethod = "azure_auth"
	IdentityAuthMethodToken      IdentityAuthMethod = "token_auth"
	IdentityAuthMethodTLSCert    IdentityAuthMethod = "tls_cert_auth"
	IdentityAuthMethodOCI        IdentityAuthMethod = "oci_auth"
	IdentityAuthMethodOIDC       IdentityAuthMethod = "oidc_auth"
	IdentityAuthMethodJWT        IdentityAuthMethod = "jwt_auth"
	IdentityAuthMethodLDAP       IdentityAuthMethod = "ldap_auth"
	IdentityAuthMethodSPIFFE     IdentityAuthMethod = "spiffe_auth"
)

// AuthOIDC holds OIDC-specific claims from the identity JWT payload.
// Used for permission template interpolation (e.g., {{identity.auth.oidc.sub}}).
type AuthOIDC struct {
	Claims map[string]string
}

// AuthKubernetes holds Kubernetes-specific metadata from the identity JWT payload.
// Used for permission template interpolation (e.g., {{identity.auth.kubernetes.namespace}}).
type AuthKubernetes struct {
	Namespace string
	Name      string
}

// AuthAWS holds AWS-specific principal details from the identity JWT payload.
// Used for permission template interpolation (e.g., {{identity.auth.aws.accountId}}).
type AuthAWS struct {
	AccountID    string
	ARN          string
	UserID       string
	Partition    string
	Service      string
	ResourceType string
	ResourceName string
}

// AuthInfo holds auth-method-specific claims for permission template interpolation.
// Set by the auth layer, read by the permission service.
type AuthInfo struct {
	IdentityID   uuid.UUID
	IdentityName string
	AuthMethod   IdentityAuthMethod
	OIDC         *AuthOIDC
	Kubernetes   *AuthKubernetes
	AWS          *AuthAWS
}

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

// Identity holds the resolved actor information extracted from a request token.
// It is the Go equivalent of the Node.js backend's req.auth / req.permission object.
type Identity struct {
	AuthMode     AuthMode
	Actor        ActorType
	ActorID      uuid.UUID
	OrgID        uuid.UUID
	RootOrgID    uuid.UUID
	ParentOrgID  uuid.UUID
	OrgName      string
	AuthMethod   ActorAuthMethod
	IsSuperAdmin bool

	// MFA fields (for JWT user auth).
	IsMfaVerified bool
	MfaMethod     string

	// UserAuthInfo is set for JWT (user) auth. Used for audit logging.
	UserAuthInfo *UserAuthInfo
	// IdentityAuthInfo is set for identity access token auth. Used for audit logging.
	IdentityAuthInfo *AuthInfo

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
type authInfoKey struct{}

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

// WithAuthInfo stores the actor auth info in the context.
func WithAuthInfo(ctx context.Context, info *AuthInfo) context.Context {
	return context.WithValue(ctx, authInfoKey{}, info)
}

// AuthInfoFromContext returns the actor auth info stored in ctx, or nil if absent.
func AuthInfoFromContext(ctx context.Context) *AuthInfo {
	info, _ := ctx.Value(authInfoKey{}).(*AuthInfo)
	return info
}
