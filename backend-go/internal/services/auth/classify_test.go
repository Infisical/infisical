package auth

import (
	"encoding/base64"
	"encoding/json"
	"testing"
)

// makeJWT builds a minimal unsigned JWT with the given payload claims for testing.
func makeJWT(claims map[string]any) string {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payload, _ := json.Marshal(claims)
	payloadEnc := base64.RawURLEncoding.EncodeToString(payload)
	return header + "." + payloadEnc + ".fakesignature"
}

func TestClassifyToken(t *testing.T) {
	t.Run("service token", func(t *testing.T) {
		mode := ClassifyToken("st.abc123.secretpart")
		if mode != AuthModeServiceToken {
			t.Errorf("expected %q, got %q", AuthModeServiceToken, mode)
		}
	})

	t.Run("JWT access token", func(t *testing.T) {
		token := makeJWT(map[string]any{"authTokenType": string(AuthTokenTypeAccessToken), "userId": "u1"})
		mode := ClassifyToken(token)
		if mode != AuthModeJWT {
			t.Errorf("expected %q, got %q", AuthModeJWT, mode)
		}
	})

	t.Run("identity access token", func(t *testing.T) {
		token := makeJWT(map[string]any{"authTokenType": string(AuthTokenTypeIdentityAccessToken), "identityId": "id1"})
		mode := ClassifyToken(token)
		if mode != AuthModeIdentityAccessToken {
			t.Errorf("expected %q, got %q", AuthModeIdentityAccessToken, mode)
		}
	})

	t.Run("empty token returns empty", func(t *testing.T) {
		mode := ClassifyToken("")
		if mode != "" {
			t.Errorf("expected empty, got %q", mode)
		}
	})

	t.Run("random string returns empty", func(t *testing.T) {
		mode := ClassifyToken("some-random-string")
		if mode != "" {
			t.Errorf("expected empty, got %q", mode)
		}
	})

	t.Run("JWT with unknown authTokenType returns empty", func(t *testing.T) {
		token := makeJWT(map[string]any{"authTokenType": "SomethingElse"})
		mode := ClassifyToken(token)
		if mode != "" {
			t.Errorf("expected empty, got %q", mode)
		}
	})

	t.Run("malformed JWT with two parts returns empty", func(t *testing.T) {
		mode := ClassifyToken("part1.part2")
		if mode != "" {
			t.Errorf("expected empty, got %q", mode)
		}
	})

	t.Run("JWT with invalid base64 payload returns empty", func(t *testing.T) {
		mode := ClassifyToken("header.!!!invalid!!!.signature")
		if mode != "" {
			t.Errorf("expected empty, got %q", mode)
		}
	})
}
