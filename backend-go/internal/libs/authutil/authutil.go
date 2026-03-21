// Package authutil provides authentication types and context helpers
// for propagating identity information through request handling.
package authutil

import (
	"context"

	"github.com/infisical/api/internal/services/shared/permission"
)

// AuthMode identifies the authentication mechanism used by the caller.
type AuthMode string

const (
	AuthModeJWT                 AuthMode = "jwt"
	AuthModeIdentityAccessToken AuthMode = "identity_access_token"
	AuthModeServiceToken        AuthMode = "service_token"
)

// Identity holds the resolved actor information extracted from a request token.
// It is the Go equivalent of the Node.js backend's req.permission object.
type Identity struct {
	AuthMode   AuthMode
	Actor      permission.ActorType
	ActorID    string
	OrgID      string
	AuthMethod permission.ActorAuthMethod
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
