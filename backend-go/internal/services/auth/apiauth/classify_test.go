package apiauth

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/infisical/api/internal/services/auth"
)

func TestClassifyToken(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		token    string
		expected auth.AuthMode
	}{
		{
			name:     "service token prefix",
			token:    "st.abc.def",
			expected: auth.AuthModeServiceToken,
		},
		{
			name:     "service token with longer secret",
			token:    "st.abc123.secretpart",
			expected: auth.AuthModeServiceToken,
		},
		{
			name:     "service token prefix but malformed",
			token:    "st.only-one-part",
			expected: auth.AuthModeServiceToken,
		},
		{
			name:     "jwt three parts",
			token:    "header.payload.signature",
			expected: auth.AuthModeJWT,
		},
		{
			name:     "jwt with base64 content",
			token:    "eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0IjoxfQ.signature",
			expected: auth.AuthModeJWT,
		},
		{
			name:     "empty token",
			token:    "",
			expected: "",
		},
		{
			name:     "no dots",
			token:    "nodots",
			expected: "",
		},
		{
			name:     "one dot",
			token:    "one.dot",
			expected: "",
		},
		{
			name:     "four parts",
			token:    "a.b.c.d",
			expected: "",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := ClassifyToken(tc.token)
			assert.Equal(t, tc.expected, got)
		})
	}
}
