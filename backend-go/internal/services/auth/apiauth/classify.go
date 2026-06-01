package apiauth

import (
	"encoding/base64"
	"encoding/json"
	"strings"

	"github.com/infisical/api/internal/services/auth"
)

// peekClaims is a minimal struct for peeking at the token type
// without performing signature verification.
type peekClaims struct {
	AuthTokenType auth.AuthTokenType `json:"authTokenType"`
}

// ClassifyToken determines the AuthMode from a raw token string
// using cheap checks only (string prefix, base64 decode) — no crypto.
func ClassifyToken(token string) auth.AuthMode {
	if strings.HasPrefix(token, "st.") {
		return auth.AuthModeServiceToken
	}

	claims := peekJWTClaims(token)
	switch claims.AuthTokenType {
	case auth.AuthTokenTypeAccessToken:
		return auth.AuthModeJWT
	case auth.AuthTokenTypeIdentityAccessToken:
		return auth.AuthModeIdentityAccessToken
	case auth.AuthTokenTypeRefreshToken,
		auth.AuthTokenTypeSignupToken,
		auth.AuthTokenTypeMfaToken,
		auth.AuthTokenTypeProviderToken,
		auth.AuthTokenTypeAPIKey,
		auth.AuthTokenTypeServiceAccessToken,
		auth.AuthTokenTypeServiceRefreshToken,
		auth.AuthTokenTypeSCIMToken:
		return ""
	}

	return ""
}

// peekJWTClaims decodes the JWT payload segment (no signature verification)
// to inspect the authTokenType claim.
func peekJWTClaims(token string) peekClaims {
	// A valid JWT has exactly three dot-separated segments (header.payload.signature).
	// SplitN(..., 4) used to collapse 4+ segments into a single trailing element,
	// which let tokens like "a.b.c.d" through with a usable parts[1]. Use unlimited
	// Split + an exact-3 check so anything else is rejected up front.
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return peekClaims{}
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return peekClaims{}
	}

	var claims peekClaims
	_ = json.Unmarshal(payload, &claims)

	return claims
}
