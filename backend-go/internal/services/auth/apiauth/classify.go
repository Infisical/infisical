package apiauth

import (
	"strings"

	"github.com/infisical/api/internal/services/auth"
)

// ClassifyToken determines the AuthMode from a raw token string using cheap checks only.
// Service tokens are identified by their "st." prefix.
// JWTs are identified by having exactly 3 dot-separated parts.
// This does NOT validate the token - only classifies it for routing.
func ClassifyToken(token string) auth.AuthMode {
	if strings.HasPrefix(token, "st.") {
		return auth.AuthModeServiceToken
	}

	// JWT format: header.payload.signature (exactly 3 parts)
	parts := strings.SplitN(token, ".", 4)
	if len(parts) != 3 {
		return ""
	}

	// It looks like a JWT - actual type (user vs identity) is determined after validation
	return auth.AuthModeJWT
}
