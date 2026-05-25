package auth

import (
	"github.com/infisical/api/internal/services/auth/apiauth"
	"github.com/infisical/api/pkg/chita"
)

// NewSecurityRegistry creates a SecurityRegistry with all authentication schemes
// registered and their validators configured.
func NewSecurityRegistry(authenticator apiauth.Authenticator) *chita.SecurityRegistry {
	registry := chita.NewSecurityRegistry()

	registry.MustRegister(
		"jwt",
		chita.HTTPBearerJWT().WithDescription("User session JWT token"),
		NewJWTValidator(authenticator),
	)

	registry.MustRegister(
		"identity_access_token",
		chita.HTTPBearerJWT().WithDescription("Machine identity access token"),
		NewIdentityAccessTokenValidator(authenticator),
	)

	registry.MustRegister(
		"service_token",
		chita.HTTPBearer().WithDescription("Service token (format: st.<id>.<secret>)"),
		NewServiceTokenValidator(authenticator),
	)

	return registry
}
