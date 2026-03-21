package authutil

import (
	"encoding/base64"
	"encoding/json"
	"strings"
)

// jwtClaims is a minimal struct for peeking at the token type
// without performing signature verification.
type jwtClaims struct {
	AuthTokenType string `json:"authTokenType"`
}

// ClassifyToken determines the AuthMode from a raw token string
// using cheap checks only (string prefix, base64 decode) — no crypto.
func ClassifyToken(token string) AuthMode {
	if strings.HasPrefix(token, "st.") {
		return AuthModeServiceToken
	}

	claims := peekJWTClaims(token)
	switch claims.AuthTokenType {
	case "AccessToken":
		return AuthModeJWT
	case "IdentityAccessToken":
		return AuthModeIdentityAccessToken
	}

	return ""
}

// peekJWTClaims decodes the JWT payload segment (no signature verification)
// to inspect the authTokenType claim.
func peekJWTClaims(token string) jwtClaims {
	parts := strings.SplitN(token, ".", 4)
	if len(parts) < 3 {
		return jwtClaims{}
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return jwtClaims{}
	}

	var claims jwtClaims
	_ = json.Unmarshal(payload, &claims)

	return claims
}
