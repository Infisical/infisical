// Package auth provides authentication types, token validation, and context helpers
// for propagating identity information through request handling.
package auth

import (
	"context"

	"github.com/infisical/api/internal/services/permission"
)

// AuthMode identifies the authentication mechanism used by the caller.
type AuthMode string

const (
	AuthModeJWT                 AuthMode = "jwt"
	AuthModeIdentityAccessToken AuthMode = "identity_access_token"
	AuthModeServiceToken        AuthMode = "service_token"
)

// UserAuthInfo holds the minimal user info stored in request context for audit logging.
// Port of Node.js requestContext.userAuthInfo.
type UserAuthInfo struct {
	UserID string
	Email  string
}

// IdentityAuthInfo holds the minimal identity info stored in request context for audit logging.
// Port of Node.js requestContext.identityAuthInfo.
type IdentityAuthInfo struct {
	IdentityID   string
	IdentityName string
	AuthMethod   string
	OIDC         *IdentityAuthOIDC
	Kubernetes   *IdentityAuthKubernetes
	AWS          *IdentityAuthAWS
}

// IdentityAuthOIDC holds OIDC-specific claims from the identity JWT payload.
type IdentityAuthOIDC struct {
	Claims map[string]string `json:"claims"`
}

// IdentityAuthKubernetes holds Kubernetes-specific metadata from the identity JWT payload.
type IdentityAuthKubernetes struct {
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
}

// IdentityAuthAWS holds AWS-specific principal details from the identity JWT payload.
type IdentityAuthAWS struct {
	AccountID    string `json:"accountId"`
	ARN          string `json:"arn"`
	UserID       string `json:"userId"`
	Partition    string `json:"partition"`
	Service      string `json:"service"`
	ResourceType string `json:"resourceType"`
	ResourceName string `json:"resourceName"`
}

// Identity holds the resolved actor information extracted from a request token.
// It is the Go equivalent of the Node.js backend's req.auth / req.permission object.
type Identity struct {
	AuthMode     AuthMode
	Actor        permission.ActorType
	ActorID      string
	OrgID        string
	RootOrgID    string
	ParentOrgID  string
	AuthMethod   permission.ActorAuthMethod
	IsSuperAdmin bool

	// UserAuthInfo is set for JWT (user) auth. Used for audit logging.
	UserAuthInfo *UserAuthInfo
	// IdentityAuthInfo is set for identity access token auth. Used for audit logging.
	IdentityAuthInfo *IdentityAuthInfo
}

type ctxKey struct{}

// WithIdentity stores the given identity in the context.
func WithIdentity(ctx context.Context, id *Identity) context.Context {
	return context.WithValue(ctx, ctxKey{}, id)
}

// IdentityFromContext returns the identity stored in ctx, or nil if absent.
func IdentityFromContext(ctx context.Context) *Identity {
	id, _ := ctx.Value(ctxKey{}).(*Identity)
	return id
}
