package auth

import (
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// UserJWTClaims represents the JWT payload for user browser sessions.
// Exact match of the Node.js AuthModeJwtTokenPayload.
type UserJWTClaims struct {
	jwt.RegisteredClaims
	AuthTokenType     AuthTokenType `json:"authTokenType"`
	AuthMethod        string        `json:"authMethod,omitempty"`
	UserID            uuid.UUID     `json:"userId"`
	TokenVersionID    uuid.UUID     `json:"tokenVersionId"`
	AccessVersion     int           `json:"accessVersion"`
	OrganizationID    uuid.UUID     `json:"organizationId,omitempty"`
	SubOrganizationID uuid.UUID     `json:"subOrganizationId,omitempty"`
	IsMfaVerified     bool          `json:"isMfaVerified,omitempty"`
	MfaMethod         string        `json:"mfaMethod,omitempty"`
	MCP               bool          `json:"mcp,omitempty"`
}

// IdentityJWTClaims represents the JWT payload for machine identity access tokens.
// Exact match of the Node.js TIdentityAccessTokenJwtPayload.
type IdentityJWTClaims struct {
	jwt.RegisteredClaims
	AuthTokenType         AuthTokenType `json:"authTokenType"`
	IdentityID            uuid.UUID     `json:"identityId"`
	ClientSecretID        string        `json:"clientSecretId"`
	IdentityAccessTokenID string        `json:"identityAccessTokenId"`
	IdentityAuth          *IdentityAuth `json:"identityAuth,omitempty"`
}

// IdentityAuth holds auth-method-specific metadata from the identity JWT payload.
// Used to populate IdentityAuthInfo for audit logging.
type IdentityAuth struct {
	OIDC       *IdentityAuthOIDC       `json:"oidc,omitempty"`
	Kubernetes *IdentityAuthKubernetes `json:"kubernetes,omitempty"`
	AWS        *IdentityAuthAWS        `json:"aws,omitempty"`
}
