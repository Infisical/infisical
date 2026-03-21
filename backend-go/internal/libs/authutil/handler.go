package authutil

import (
	"context"

	"goa.design/goa/v3/security"

	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/services/shared/permission"
)

// AuthHandler implements the Goa-generated authorization interface (JWTAuth method).
// Embed this in service structs to satisfy the generated security contract.
type AuthHandler struct{}

// JWTAuth implements the authorization logic for all JWT-based security schemes.
// Goa calls this for each scheme in order (jwt → identity_access_token → service_token)
// with the scheme name in sc.Name. We classify the token cheaply and only accept
// when the token type matches the scheme being tried.
func (AuthHandler) JWTAuth(ctx context.Context, token string, sc *security.JWTScheme) (context.Context, error) {
	if token == "" {
		return ctx, errutil.Unauthorized("Token missing")
	}

	tokenMode := ClassifyToken(token)
	if tokenMode == "" {
		return ctx, errutil.Unauthorized("You are not allowed to access this resource")
	}

	// Map scheme name to the expected auth mode.
	var expectedMode AuthMode
	switch sc.Name {
	case "jwt":
		expectedMode = AuthModeJWT
	case "identity_access_token":
		expectedMode = AuthModeIdentityAccessToken
	case "service_token":
		expectedMode = AuthModeServiceToken
	default:
		return ctx, errutil.Unauthorized("You are not allowed to access this resource")
	}

	// Fast reject: token type doesn't match the scheme being tried.
	if tokenMode != expectedMode {
		return ctx, errutil.Unauthorized("You are not allowed to access this resource")
	}

	// TODO: Replace mock with real token validation (JWT verification, DB lookups, etc.)
	identity := buildMockIdentity(tokenMode)

	return WithIdentity(ctx, identity), nil
}

// buildMockIdentity creates a placeholder identity from the classified token mode.
// This will be replaced with real validation logic.
func buildMockIdentity(mode AuthMode) *Identity {
	switch mode {
	case AuthModeJWT:
		return &Identity{
			AuthMode: AuthModeJWT,
			Actor:    permission.ActorTypeUser,
			ActorID:  "mock-user-id",
			OrgID:    "mock-org-id",
		}
	case AuthModeIdentityAccessToken:
		return &Identity{
			AuthMode: AuthModeIdentityAccessToken,
			Actor:    permission.ActorTypeIdentity,
			ActorID:  "mock-identity-id",
			OrgID:    "mock-org-id",
		}
	case AuthModeServiceToken:
		return &Identity{
			AuthMode: AuthModeServiceToken,
			Actor:    permission.ActorTypeService,
			ActorID:  "mock-service-token-id",
			OrgID:    "mock-org-id",
		}
	default:
		return &Identity{
			AuthMode: mode,
			Actor:    permission.ActorTypeUser,
			ActorID:  "mock-unknown-id",
			OrgID:    "mock-org-id",
		}
	}
}
