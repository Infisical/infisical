package apiauth

import (
	"testing"

	"github.com/infisical/api/internal/services/auth"
)

func TestClassifyToken_ServiceToken(t *testing.T) {
	mode := ClassifyToken("st.abc123.secretpart")
	if mode != auth.AuthModeServiceToken {
		t.Errorf("expected %q, got %q", auth.AuthModeServiceToken, mode)
	}
}

func TestClassifyToken_JWT(t *testing.T) {
	t.Run("valid JWT format returns AuthModeJWT", func(t *testing.T) {
		// Any 3-part dot-separated string is classified as JWT
		mode := ClassifyToken("header.payload.signature")
		if mode != auth.AuthModeJWT {
			t.Errorf("expected %q, got %q", auth.AuthModeJWT, mode)
		}
	})

	t.Run("real JWT structure", func(t *testing.T) {
		// Even with actual base64 content, it's just classified as JWT
		mode := ClassifyToken("eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0IjoxfQ.signature")
		if mode != auth.AuthModeJWT {
			t.Errorf("expected %q, got %q", auth.AuthModeJWT, mode)
		}
	})
}

func TestClassifyToken_Malformed(t *testing.T) {
	t.Run("empty token", func(t *testing.T) {
		mode := ClassifyToken("")
		if mode != "" {
			t.Errorf("expected empty, got %q", mode)
		}
	})

	t.Run("random string without dots", func(t *testing.T) {
		mode := ClassifyToken("some-random-string")
		if mode != "" {
			t.Errorf("expected empty, got %q", mode)
		}
	})

	t.Run("two parts", func(t *testing.T) {
		mode := ClassifyToken("part1.part2")
		if mode != "" {
			t.Errorf("expected empty, got %q", mode)
		}
	})

	t.Run("four parts", func(t *testing.T) {
		mode := ClassifyToken("a.b.c.d")
		if mode != "" {
			t.Errorf("expected empty, got %q", mode)
		}
	})

	t.Run("service token prefix but wrong format", func(t *testing.T) {
		// Has st. prefix so classified as service token even if malformed
		mode := ClassifyToken("st.only-one-part")
		if mode != auth.AuthModeServiceToken {
			t.Errorf("expected %q, got %q", auth.AuthModeServiceToken, mode)
		}
	})
}

func TestClassifyToken_VariousInputTypes(t *testing.T) {
	tests := []struct {
		name     string
		token    string
		expected auth.AuthMode
	}{
		{"service token", "st.abc.def", auth.AuthModeServiceToken},
		{"jwt format", "a.b.c", auth.AuthModeJWT},
		{"empty", "", ""},
		{"no dots", "nodots", ""},
		{"one dot", "one.dot", ""},
		{"three dots", "a.b.c.d", ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := ClassifyToken(tc.token)
			if got != tc.expected {
				t.Errorf("ClassifyToken(%q) = %q, want %q", tc.token, got, tc.expected)
			}
		})
	}
}
