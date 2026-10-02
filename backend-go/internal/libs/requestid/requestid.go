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
	v, ok := ctx.Value(ctxKey{}).(string)
	if !ok {
		return ""
	}
	return v
}

// OriginPrefix returns the request ID prefix for this deployment. Infisical
// Cloud IDs carry a region segment (req-us-, req-eu-) so an ID's origin is
// identifiable at a glance; self-hosted and dedicated stay bare req-. Matches
// the Node.js backend convention.
func OriginPrefix(isInfisicalCloud bool, internalRegion string) string {
	if !isInfisicalCloud {
		return "req-"
	}
	if internalRegion == "eu" {
		return "req-eu-"
	}
	return "req-us-"
}

// Middleware returns middleware that extracts the X-Request-Id header from the
// incoming request. If the header is missing or empty a new ID is generated
// with the given prefix. The ID is stored in the request context (retrievable
// via FromContext) and echoed back in the response X-Request-Id header.
func Middleware(prefix string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id := r.Header.Get(Header)
			if id == "" {
				id = generate(prefix)
			}

			w.Header().Set(Header, id)
			ctx := context.WithValue(r.Context(), ctxKey{}, id)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// generate returns a request ID: the prefix followed by 14 alphanumeric chars,
// matching the Node.js backend convention.
func generate(prefix string) string {
	var buf [9]byte // 9 bytes → 14+ base32 chars (no padding)
	_, _ = rand.Read(buf[:])
	encoded := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(buf[:])
	return prefix + strings.ToLower(encoded[:14])
}
