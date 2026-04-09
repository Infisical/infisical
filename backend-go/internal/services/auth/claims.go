package auth

import "github.com/golang-jwt/jwt/v5"

// UserJWTClaims represents the JWT payload for user browser sessions.
// Exact match of the Node.js AuthModeJwtTokenPayload.
type UserJWTClaims struct {
	jwt.RegisteredClaims
	AuthTokenType     AuthTokenType `json:"authTokenType"`
	AuthMethod        string `json:"authMethod,omitempty"`
	UserID            string `json:"userId"`
	TokenVersionID    string `json:"tokenVersionId"`
	AccessVersion     int    `json:"accessVersion"`
	OrganizationID    string `json:"organizationId,omitempty"`
	SubOrganizationID string `json:"subOrganizationId,omitempty"`
	IsMfaVerified     bool   `json:"isMfaVerified,omitempty"`
}

// IdentityJWTClaims represents the JWT payload for machine identity access tokens.
// Exact match of the Node.js TIdentityAccessTokenJwtPayload.
type IdentityJWTClaims struct {
	jwt.RegisteredClaims
	AuthTokenType         AuthTokenType `json:"authTokenType"`
	IdentityID            string        `json:"identityId"`
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
