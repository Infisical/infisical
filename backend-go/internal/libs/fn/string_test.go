package fn

import "testing"

func TestRemoveTrailingSlash(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "root path stays unchanged",
			input:    "/",
			expected: "/",
		},
		{
			name:     "path with trailing slash",
			input:    "/itabus/",
			expected: "/itabus",
		},
		{
			name:     "path without trailing slash",
			input:    "/itabus",
			expected: "/itabus",
		},
		{
			name:     "nested path with trailing slash",
			input:    "/foo/bar/baz/",
			expected: "/foo/bar/baz",
		},
		{
			name:     "empty string",
			input:    "",
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := RemoveTrailingSlash(tt.input)
			if result != tt.expected {
				t.Errorf("RemoveTrailingSlash(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}
