package actor

import (
	"context"

	"github.com/google/uuid"
)

// Type identifies the kind of entity performing an action.
type Type string

const (
	TypeUser     Type = "user"
	TypeIdentity Type = "identity"
	TypeService  Type = "service"
)

// AuthMethod represents the authentication method used by the actor (e.g. "jwt", "api-key").
// An empty string means no specific method (e.g. platform-level actions).
type AuthMethod string

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

type authInfoKey struct{}

// WithAuthInfo stores the actor auth info in the context.
func WithAuthInfo(ctx context.Context, info *AuthInfo) context.Context {
	return context.WithValue(ctx, authInfoKey{}, info)
}

// AuthInfoFromContext returns the actor auth info stored in ctx, or nil if absent.
func AuthInfoFromContext(ctx context.Context) *AuthInfo {
	info, _ := ctx.Value(authInfoKey{}).(*AuthInfo)
	return info
}
