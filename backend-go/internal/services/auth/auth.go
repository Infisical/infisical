// Package auth provides authentication types, token validation, and context helpers
// for propagating identity information through request handling.
package auth

import (
	"context"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/libs/errutil"
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
	IdentityAuthMethodUniversal  IdentityAuthMethod = "universal-auth"
	IdentityAuthMethodKubernetes IdentityAuthMethod = "kubernetes-auth"
	IdentityAuthMethodGCP        IdentityAuthMethod = "gcp-auth"
	IdentityAuthMethodAliCloud   IdentityAuthMethod = "alicloud-auth"
	IdentityAuthMethodAWS        IdentityAuthMethod = "aws-auth"
	IdentityAuthMethodAzure      IdentityAuthMethod = "azure-auth"
	IdentityAuthMethodToken      IdentityAuthMethod = "token-auth"
	IdentityAuthMethodTLSCert    IdentityAuthMethod = "tls-cert-auth"
	IdentityAuthMethodOCI        IdentityAuthMethod = "oci-auth"
	IdentityAuthMethodOIDC       IdentityAuthMethod = "oidc-auth"
	IdentityAuthMethodJWT        IdentityAuthMethod = "jwt-auth"
	IdentityAuthMethodLDAP       IdentityAuthMethod = "ldap-auth"
	IdentityAuthMethodSPIFFE     IdentityAuthMethod = "spiffe-auth"
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

	// TokenVersionID is the session/token version ID (for JWT user auth).
	// Used for assume privilege validation to ensure token is still valid.
	TokenVersionID uuid.UUID

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
	info, ok := ctx.Value(httpInfoKey{}).(*HTTPInfo)
	if !ok {
		return nil
	}
	return info
}

// WithIdentity stores the given identity in the context.
func WithIdentity(ctx context.Context, id *Identity) context.Context {
	return context.WithValue(ctx, ctxKey{}, id)
}

// IdentityFromContext returns the identity stored in ctx.
// Returns an error if identity is not present (authentication required).
func IdentityFromContext(ctx context.Context) (*Identity, error) {
	id, ok := ctx.Value(ctxKey{}).(*Identity)
	if !ok || id == nil {
		return nil, errutil.Unauthorized("Authentication required")
	}
	return id, nil
}

// AssumedPrivilegeDetails holds the decoded assume privilege token payload.
// This is stored in request context when a user is assuming another actor's privileges.
type AssumedPrivilegeDetails struct {
	TokenVersionID uuid.UUID
	ProjectID      string
	RequesterID    uuid.UUID
	ActorType      ActorType
	ActorID        uuid.UUID
}

type assumedPrivilegeKey struct{}

// WithAssumedPrivilege stores the assumed privilege details in the context.
func WithAssumedPrivilege(ctx context.Context, details *AssumedPrivilegeDetails) context.Context {
	return context.WithValue(ctx, assumedPrivilegeKey{}, details)
}

// AssumedPrivilegeFromContext returns the assumed privilege details stored in ctx, or nil if absent.
func AssumedPrivilegeFromContext(ctx context.Context) *AssumedPrivilegeDetails {
	details, ok := ctx.Value(assumedPrivilegeKey{}).(*AssumedPrivilegeDetails)
	if !ok {
		return nil
	}
	return details
}
