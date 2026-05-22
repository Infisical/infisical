// Package requestid provides HTTP middleware for request ID propagation.
//
// It extracts the X-Request-Id header from incoming requests (or generates one)
// and stores the value in the request context. The same ID is echoed back in
// the response header so clients can correlate requests.
package requestid

import (
	"context"
	"crypto/rand"
	"encoding/base32"
	"net/http"
	"strings"
)

// Header is the canonical HTTP header used to propagate request IDs.
const Header = "X-Request-Id"

type ctxKey struct{}

// FromContext returns the request ID stored in ctx, or "" if none.
func FromContext(ctx context.Context) string {
	v, _ := ctx.Value(ctxKey{}).(string)
	return v
}

// Middleware extracts the X-Request-Id header from the incoming request.
// If the header is missing or empty a new ID is generated. The ID is stored
// in the request context (retrievable via FromContext) and echoed back in
// the response X-Request-Id header.
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get(Header)
		if id == "" {
			id = generate()
		}

		w.Header().Set(Header, id)
		ctx := context.WithValue(r.Context(), ctxKey{}, id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// generate returns a request ID in the format "req-<14 alphanumeric chars>"
// matching the Node.js backend convention.
func generate() string {
	var buf [9]byte // 9 bytes → 14+ base32 chars (no padding)
	_, _ = rand.Read(buf[:])
	encoded := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(buf[:])
	return "req-" + strings.ToLower(encoded[:14])
}
