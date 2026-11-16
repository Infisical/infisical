package fn

import "testing"

func TestCanonicalSecretPath(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{name: "root path stays unchanged", input: "/", expected: "/"},
		{name: "empty string is the root", input: "", expected: "/"},
		{name: "path with trailing slash", input: "/itabus/", expected: "/itabus"},
		{name: "path without trailing slash", input: "/itabus", expected: "/itabus"},
		{name: "nested path with trailing slash", input: "/foo/bar/baz/", expected: "/foo/bar/baz"},
		{name: "missing leading slash", input: "prod", expected: "/prod"},
		{name: "repeated leading slashes", input: "//prod", expected: "/prod"},
		{name: "empty segments in the middle", input: "/foo//bar///baz", expected: "/foo/bar/baz"},
		{name: "repeated trailing slashes", input: "/prod//", expected: "/prod"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := CanonicalSecretPath(tt.input)
			if result != tt.expected {
				t.Errorf("CanonicalSecretPath(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}
