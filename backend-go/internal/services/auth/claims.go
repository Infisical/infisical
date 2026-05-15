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
// New-format tokens carry all claims needed for stateless validation; legacy tokens
// only have minimal claims and require DB lookup.
type IdentityJWTClaims struct {
	jwt.RegisteredClaims
	AuthTokenType         AuthTokenType `json:"authTokenType"`
	IdentityID            uuid.UUID     `json:"identityId"`
	ClientSecretID        string        `json:"clientSecretId"`
	IdentityAccessTokenID string        `json:"identityAccessTokenId"`
	IdentityAuth          *IdentityAuth `json:"identityAuth,omitempty"`

	// New-format claims for stateless validation (optional for legacy tokens)
	IdentityName      string    `json:"identityName,omitempty"`
	AuthMethod        string    `json:"authMethod,omitempty"`
	OrgID             uuid.UUID `json:"orgId,omitempty"`
	RootOrgID         uuid.UUID `json:"rootOrgId,omitempty"`
	ParentOrgID       uuid.UUID `json:"parentOrgId,omitempty"`
	AccessTokenTTL    int64     `json:"accessTokenTTL,omitempty"`
	AccessTokenMaxTTL int64     `json:"accessTokenMaxTTL,omitempty"`
	AccessTokenPeriod int64     `json:"accessTokenPeriod,omitempty"`
	CreationEpoch     int64     `json:"creationEpoch,omitempty"`
	NumUsesLimit      int64     `json:"numUsesLimit,omitempty"`
}

// HasFullRenewClaims returns true if the token has all claims needed for stateless
// validation (new-format tokens). Legacy tokens return false and require DB lookup.
func (c *IdentityJWTClaims) HasFullRenewClaims() bool {
	return c.ID != "" && // jti
		c.OrgID != uuid.Nil &&
		c.RootOrgID != uuid.Nil &&
		c.ParentOrgID != uuid.Nil &&
		c.AuthMethod != "" &&
		(c.AccessTokenTTL > 0 || c.AccessTokenMaxTTL > 0 || c.AccessTokenPeriod > 0)
}

// IdentityAuth holds auth-method-specific metadata from the identity JWT payload.
// Used to populate IdentityAuthInfo for audit logging.
type IdentityAuth struct {
	OIDC       *IdentityAuthOIDC       `json:"oidc,omitempty"`
	Kubernetes *IdentityAuthKubernetes `json:"kubernetes,omitempty"`
	AWS        *IdentityAuthAWS        `json:"aws,omitempty"`
}
