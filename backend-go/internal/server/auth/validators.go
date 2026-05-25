package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/auth/apiauth"
	"github.com/infisical/api/pkg/chita"
)

// JWTValidator validates user session JWT tokens.
type JWTValidator struct {
	authenticator apiauth.Authenticator
}

// NewJWTValidator creates a validator for user session JWTs.
func NewJWTValidator(authenticator apiauth.Authenticator) *JWTValidator {
	return &JWTValidator{authenticator: authenticator}
}

// Validate implements api.Validator for user JWT tokens.
func (v *JWTValidator) Validate(ctx context.Context, r *http.Request) (any, error) {
	token := extractBearerToken(r)
	if token == "" {
		return nil, chita.ErrSkipToNextAuth
	}

	tokenMode := apiauth.ClassifyToken(token)
	if tokenMode != auth.AuthModeJWT {
		return nil, chita.ErrSkipToNextAuth
	}

	identity, err := v.authenticator.ValidateJWT(ctx, token)
	if err != nil {
		return nil, err
	}

	populateHTTPInfo(ctx, identity)
	return identity, nil
}

// IdentityAccessTokenValidator validates machine identity access tokens.
type IdentityAccessTokenValidator struct {
	authenticator apiauth.Authenticator
}

// NewIdentityAccessTokenValidator creates a validator for machine identity tokens.
func NewIdentityAccessTokenValidator(authenticator apiauth.Authenticator) *IdentityAccessTokenValidator {
	return &IdentityAccessTokenValidator{authenticator: authenticator}
}

// Validate implements api.Validator for identity access tokens.
func (v *IdentityAccessTokenValidator) Validate(ctx context.Context, r *http.Request) (any, error) {
	token := extractBearerToken(r)
	if token == "" {
		return nil, chita.ErrSkipToNextAuth
	}

	tokenMode := apiauth.ClassifyToken(token)
	if tokenMode != auth.AuthModeIdentityAccessToken {
		return nil, chita.ErrSkipToNextAuth
	}

	ipAddress := ""
	if httpInfo := auth.HTTPInfoFromContext(ctx); httpInfo != nil {
		ipAddress = httpInfo.IPAddress
	}

	identity, err := v.authenticator.ValidateIdentityAccessToken(ctx, token, ipAddress)
	if err != nil {
		return nil, err
	}

	populateHTTPInfo(ctx, identity)
	return identity, nil
}

// ServiceTokenValidator validates service tokens.
type ServiceTokenValidator struct {
	authenticator apiauth.Authenticator
}

// NewServiceTokenValidator creates a validator for service tokens.
func NewServiceTokenValidator(authenticator apiauth.Authenticator) *ServiceTokenValidator {
	return &ServiceTokenValidator{authenticator: authenticator}
}

// Validate implements api.Validator for service tokens.
func (v *ServiceTokenValidator) Validate(ctx context.Context, r *http.Request) (any, error) {
	token := extractBearerToken(r)
	if token == "" {
		return nil, chita.ErrSkipToNextAuth
	}

	tokenMode := apiauth.ClassifyToken(token)
	if tokenMode != auth.AuthModeServiceToken {
		return nil, chita.ErrSkipToNextAuth
	}

	identity, err := v.authenticator.ValidateServiceToken(ctx, token)
	if err != nil {
		return nil, err
	}

	populateHTTPInfo(ctx, identity)
	return identity, nil
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

// populateHTTPInfo populates HTTP layer fields on the identity from context.
func populateHTTPInfo(ctx context.Context, identity *auth.Identity) {
	if httpInfo := auth.HTTPInfoFromContext(ctx); httpInfo != nil {
		identity.IPAddress = httpInfo.IPAddress
		identity.UserAgent = httpInfo.UserAgent
		identity.UserAgentType = httpInfo.UserAgentType
	}
}
