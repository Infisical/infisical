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
	parts := strings.SplitN(token, ".", 4)
	if len(parts) < 3 {
		return peekClaims{}
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return peekClaims{}
	}

	var claims peekClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return peekClaims{}
	}

	return claims
}
