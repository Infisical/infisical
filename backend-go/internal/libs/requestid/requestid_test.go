package requestid

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestOriginPrefix_Deployments(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name             string
		isInfisicalCloud bool
		internalRegion   string
		want             string
	}{
		{name: "us cloud", isInfisicalCloud: true, internalRegion: "us", want: "req-us-"},
		{name: "eu cloud", isInfisicalCloud: true, internalRegion: "eu", want: "req-eu-"},
		{name: "cloud without region defaults to us", isInfisicalCloud: true, internalRegion: "", want: "req-us-"},
		{name: "self-hosted", isInfisicalCloud: false, internalRegion: "", want: "req-"},
		{name: "self-hosted ignores region", isInfisicalCloud: false, internalRegion: "eu", want: "req-"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, tt.want, OriginPrefix(tt.isInfisicalCloud, tt.internalRegion))
		})
	}
}

func TestMiddleware_GeneratesPrefixedID(t *testing.T) {
	t.Parallel()

	var ctxID string
	handler := Middleware("req-eu-")(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		ctxID = FromContext(r.Context())
	}))

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", http.NoBody))

	headerID := rec.Header().Get(Header)
	assert.Equal(t, ctxID, headerID)
	assert.Regexp(t, "^req-eu-[a-z0-9]{14}$", headerID)
}

func TestMiddleware_HonorsInboundHeader(t *testing.T) {
	t.Parallel()

	handler := Middleware("req-")(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {}))

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", http.NoBody)
	req.Header.Set(Header, "req-us-abc123def45678")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	assert.Equal(t, "req-us-abc123def45678", rec.Header().Get(Header))
}
