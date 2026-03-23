package permission

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestOpGlob(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		field      any
		constraint any
		expected   bool
	}{
		// Exact match
		{"exact match", "/secrets", "/secrets", true},
		{"exact match root", "/", "/", true},
		{"exact no match", "/secrets", "/other", false},

		// Single * wildcard (matches within one segment)
		{"star matches segment", "/prod/db", "/prod/*", true},
		{"star does not cross slash", "/prod/db/nested", "/prod/*", false},
		{"star at start", "anything", "*", true},
		{"star in middle", "/prod/db/secrets", "/prod/*/secrets", true},
		{"star in middle no match", "/prod/db/other", "/prod/*/secrets", false},

		// Double ** wildcard (matches across segments)
		{"doublestar matches deep", "/prod/db/nested/deep", "/prod/**", true},
		{"doublestar matches single level", "/prod/db", "/prod/**", true},
		{"doublestar matches root children", "/anything/here", "/**", true},
		{"doublestar in middle", "/a/b/c/d", "/a/**/d", true},
		{"doublestar in middle multi", "/a/x/y/z/d", "/a/**/d", true},

		// Empty/whitespace patterns must deny
		{"empty pattern", "/secrets", "", false},
		{"whitespace pattern", "/secrets", "   ", false},
		{"tab pattern", "/secrets", "\t", false},

		// Non-string inputs must deny
		{"nil field", nil, "/secrets", false},
		{"int field", 42, "/secrets", false},
		{"nil constraint", "/secrets", nil, false},
		{"int constraint", "/secrets", 123, false},
		{"both nil", nil, nil, false},
		{"bool field", true, "/secrets", false},
		{"slice field", []string{"/a"}, "/**", false},

		// Real-world secret path patterns
		{"service token root scope", "/", "/", true},
		{"service token recursive scope", "/prod/app/db", "/prod/**", true},
		{"service token specific env", "/staging/config", "/staging/*", true},
		{"service token no cross-env", "/prod/config", "/staging/*", false},

		// Question mark wildcard
		{"question mark matches single char", "/ab", "/a?", true},
		{"question mark no match empty", "/a", "/a?", false},

		// Character classes
		{"char class matches", "/a1", "/a[0-9]", true},
		{"char class no match", "/ab", "/a[0-9]", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			result := opGlob(tt.field, tt.constraint)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestPermissionFieldOps(t *testing.T) {
	t.Parallel()

	ops := PermissionFieldOps()

	// Must contain $glob
	globOp := ops["$glob"]
	assert.NotNil(t, globOp, "$glob operator must be registered")

	// Must still contain default operators
	for _, op := range []string{"$eq", "$ne", "$in"} {
		assert.NotNil(t, ops[op], "default operator %s must still be present", op)
	}
}
