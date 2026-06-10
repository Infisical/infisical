package apiauth

import (
	"fmt"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/infisical/api/internal/services/auth"
)

// UnifiedJWTClaims is a union of all JWT claim fields from both user and identity tokens.
// Only the fields relevant to the AuthTokenType will be populated.
type UnifiedJWTClaims struct {
	jwt.RegisteredClaims
	AuthTokenType auth.AuthTokenType `json:"authTokenType"`

	// User JWT fields
	AuthMethod        string    `json:"authMethod,omitempty"`
	UserID            uuid.UUID `json:"userId,omitempty"`
	TokenVersionID    uuid.UUID `json:"tokenVersionId,omitempty"`
	AccessVersion     int       `json:"accessVersion,omitempty"`
	OrganizationID    uuid.UUID `json:"organizationId,omitempty"`
	SubOrganizationID uuid.UUID `json:"subOrganizationId,omitempty"`
	IsMfaVerified     bool      `json:"isMfaVerified,omitempty"`
	MfaMethod         string    `json:"mfaMethod,omitempty"`
	MCP               bool      `json:"mcp,omitempty"`

	// Identity JWT fields
	IdentityID            uuid.UUID     `json:"identityId,omitempty"`
	ClientSecretID        string        `json:"clientSecretId,omitempty"`
	IdentityAccessTokenID string        `json:"identityAccessTokenId,omitempty"`
	IdentityAuth          *IdentityAuth `json:"identityAuth,omitempty"`
	IdentityName          string        `json:"identityName,omitempty"`
	OrgID                 uuid.UUID     `json:"orgId,omitempty"`
	RootOrgID             uuid.UUID     `json:"rootOrgId,omitempty"`
	ParentOrgID           uuid.UUID     `json:"parentOrgId,omitempty"`
	AccessTokenTTL        int64         `json:"accessTokenTTL,omitempty"`
	AccessTokenMaxTTL     int64         `json:"accessTokenMaxTTL,omitempty"`
	AccessTokenPeriod     int64         `json:"accessTokenPeriod,omitempty"`
	CreationEpoch         int64         `json:"creationEpoch,omitempty"`
	NumUsesLimit          int64         `json:"numUsesLimit,omitempty"`
}

// ToUserClaims converts to UserJWTClaims for user token validation.
func (c *UnifiedJWTClaims) ToUserClaims() *UserJWTClaims {
	return &UserJWTClaims{
		RegisteredClaims:  c.RegisteredClaims,
		AuthTokenType:     c.AuthTokenType,
		AuthMethod:        c.AuthMethod,
		UserID:            c.UserID,
		TokenVersionID:    c.TokenVersionID,
		AccessVersion:     c.AccessVersion,
		OrganizationID:    c.OrganizationID,
		SubOrganizationID: c.SubOrganizationID,
		IsMfaVerified:     c.IsMfaVerified,
		MfaMethod:         c.MfaMethod,
		MCP:               c.MCP,
	}
}

// ToIdentityClaims converts to IdentityJWTClaims for identity token validation.
func (c *UnifiedJWTClaims) ToIdentityClaims() *IdentityJWTClaims {
	return &IdentityJWTClaims{
		RegisteredClaims:      c.RegisteredClaims,
		AuthTokenType:         c.AuthTokenType,
		IdentityID:            c.IdentityID,
		ClientSecretID:        c.ClientSecretID,
		IdentityAccessTokenID: c.IdentityAccessTokenID,
		IdentityAuth:          c.IdentityAuth,
		IdentityName:          c.IdentityName,
		AuthMethod:            c.AuthMethod,
		OrgID:                 c.OrgID,
		RootOrgID:             c.RootOrgID,
		ParentOrgID:           c.ParentOrgID,
		AccessTokenTTL:        c.AccessTokenTTL,
		AccessTokenMaxTTL:     c.AccessTokenMaxTTL,
		AccessTokenPeriod:     c.AccessTokenPeriod,
		CreationEpoch:         c.CreationEpoch,
		NumUsesLimit:          c.NumUsesLimit,
	}
}

// parseJWT parses and validates a JWT with signature verification.
// Returns the unified claims which can be converted to specific types based on AuthTokenType.
func parseJWT(token string, secret []byte) (*UnifiedJWTClaims, error) {
	claims := &UnifiedJWTClaims{}
	_, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (any, error) {
		if t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return secret, nil
	})
	if err != nil {
		return nil, fmt.Errorf("invalid JWT: %w", err)
	}
	return claims, nil
}

// UserJWTClaims represents the JWT payload for user browser sessions.
// Exact match of the Node.js AuthModeJwtTokenPayload.
type UserJWTClaims struct {
	jwt.RegisteredClaims
	AuthTokenType     auth.AuthTokenType `json:"authTokenType"`
	AuthMethod        string             `json:"authMethod,omitempty"`
	UserID            uuid.UUID          `json:"userId"`
	TokenVersionID    uuid.UUID          `json:"tokenVersionId"`
	AccessVersion     int                `json:"accessVersion"`
	OrganizationID    uuid.UUID          `json:"organizationId,omitempty"`
	SubOrganizationID uuid.UUID          `json:"subOrganizationId,omitempty"`
	IsMfaVerified     bool               `json:"isMfaVerified,omitempty"`
	MfaMethod         string             `json:"mfaMethod,omitempty"`
	MCP               bool               `json:"mcp,omitempty"`
}

// IdentityJWTClaims represents the JWT payload for machine identity access tokens.
// Exact match of the Node.js TIdentityAccessTokenJwtPayload.
// New-format tokens carry all claims needed for stateless validation; legacy tokens
// only have minimal claims and require DB lookup.
type IdentityJWTClaims struct {
	jwt.RegisteredClaims
	AuthTokenType         auth.AuthTokenType `json:"authTokenType"`
	IdentityID            uuid.UUID          `json:"identityId"`
	ClientSecretID        string             `json:"clientSecretId"`
	IdentityAccessTokenID string             `json:"identityAccessTokenId"`
	IdentityAuth          *IdentityAuth      `json:"identityAuth,omitempty"`

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
// Used to populate AuthInfo for audit logging.
type IdentityAuth struct {
	OIDC       *auth.AuthOIDC       `json:"oidc,omitempty"`
	Kubernetes *auth.AuthKubernetes `json:"kubernetes,omitempty"`
	AWS        *auth.AuthAWS        `json:"aws,omitempty"`
}
