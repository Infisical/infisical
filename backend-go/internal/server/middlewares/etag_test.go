package middlewares

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestETag_GeneratesETagForSuccessfulGET(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"message":"hello"}`))
	})

	wrapped := ETag(handler)
	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/test", http.NoBody)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	etag := rec.Header().Get("ETag")
	assert.NotEmpty(t, etag)
	assert.Equal(t, `"`, string(etag[0]))
	assert.Equal(t, `"`, string(etag[len(etag)-1]))
	assert.Equal(t, `{"message":"hello"}`, rec.Body.String())
}

func TestETag_Returns304WhenIfNoneMatchMatches(t *testing.T) {
	responseBody := `{"data":"test"}`
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(responseBody))
	})

	wrapped := ETag(handler)

	req1 := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/test", http.NoBody)
	rec1 := httptest.NewRecorder()
	wrapped.ServeHTTP(rec1, req1)
	require.Equal(t, http.StatusOK, rec1.Code)
	etag := rec1.Header().Get("ETag")
	require.NotEmpty(t, etag)

	req2 := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/test", http.NoBody)
	req2.Header.Set("If-None-Match", etag)
	rec2 := httptest.NewRecorder()
	wrapped.ServeHTTP(rec2, req2)

	assert.Equal(t, http.StatusNotModified, rec2.Code)
	assert.Empty(t, rec2.Body.String())
	assert.Equal(t, etag, rec2.Header().Get("ETag"))
}

func TestETag_Returns200WhenIfNoneMatchDiffers(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":"test"}`))
	})

	wrapped := ETag(handler)
	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/test", http.NoBody)
	req.Header.Set("If-None-Match", `"invalid-etag"`)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.NotEmpty(t, rec.Body.String())
}

func TestETag_SkipsNonGETMethods(t *testing.T) {
	methods := []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete}

	for _, method := range methods {
		t.Run(method, func(t *testing.T) {
			handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, _ = w.Write([]byte(`{"created":true}`))
			})

			wrapped := ETag(handler)
			req := httptest.NewRequestWithContext(t.Context(), method, "/test", http.NoBody)
			rec := httptest.NewRecorder()

			wrapped.ServeHTTP(rec, req)

			assert.Equal(t, http.StatusOK, rec.Code)
			assert.Empty(t, rec.Header().Get("ETag"))
		})
	}
}

func TestETag_PreservesHandlerSetETag(t *testing.T) {
	customEtag := `"custom-etag-123"`
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("ETag", customEtag)
		_, _ = w.Write([]byte(`{"data":"test"}`))
	})

	wrapped := ETag(handler)
	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/test", http.NoBody)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, customEtag, rec.Header().Get("ETag"))
}

func TestETag_SkipsNon2xxResponses(t *testing.T) {
	tests := []struct {
		name   string
		status int
	}{
		{"bad request", http.StatusBadRequest},
		{"not found", http.StatusNotFound},
		{"internal error", http.StatusInternalServerError},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(`{"error":"something went wrong"}`))
			})

			wrapped := ETag(handler)
			req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/test", http.NoBody)
			rec := httptest.NewRecorder()

			wrapped.ServeHTTP(rec, req)

			assert.Equal(t, tc.status, rec.Code)
			assert.Empty(t, rec.Header().Get("ETag"))
		})
	}
}

func TestETag_ConsistentHashForSameContent(t *testing.T) {
	content := `{"data":"consistent"}`
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(content))
	})

	wrapped := ETag(handler)

	req1 := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/path1", http.NoBody)
	rec1 := httptest.NewRecorder()
	wrapped.ServeHTTP(rec1, req1)

	req2 := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/path2", http.NoBody)
	rec2 := httptest.NewRecorder()
	wrapped.ServeHTTP(rec2, req2)

	assert.Equal(t, rec1.Header().Get("ETag"), rec2.Header().Get("ETag"))
}

func TestEtagMatches(t *testing.T) {
	tests := []struct {
		name        string
		etag        string
		ifNoneMatch string
		expected    bool
	}{
		{
			name:        "exact match",
			etag:        `"abc123"`,
			ifNoneMatch: `"abc123"`,
			expected:    true,
		},
		{
			name:        "no match",
			etag:        `"abc123"`,
			ifNoneMatch: `"xyz789"`,
			expected:    false,
		},
		{
			name:        "weak prefix in request",
			etag:        `"abc123"`,
			ifNoneMatch: `W/"abc123"`,
			expected:    true,
		},
		{
			name:        "weak prefix in both",
			etag:        `W/"abc123"`,
			ifNoneMatch: `W/"abc123"`,
			expected:    true,
		},
		{
			name:        "spaces trimmed",
			etag:        `"abc123"`,
			ifNoneMatch: `  "abc123"  `,
			expected:    true,
		},
		{
			name:        "empty if-none-match returns false",
			etag:        `"abc123"`,
			ifNoneMatch: "",
			expected:    false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := etagMatches(tc.etag, tc.ifNoneMatch)
			assert.Equal(t, tc.expected, result)
		})
	}
}
