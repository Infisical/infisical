package server

import (
	"net"
	"net/http"
	"strings"

	"github.com/infisical/api/internal/services/auditlog"
	"github.com/infisical/api/internal/services/auth"
)

// HTTPInfoMiddleware extracts HTTP request information and stores it in context.
// This must run before the auth handler so Identity can be populated with this info.
func HTTPInfoMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userAgent := r.Header.Get("User-Agent")
		info := &auth.HTTPInfo{
			IPAddress:     getRealIP(r),
			UserAgent:     userAgent,
			UserAgentType: auditlog.GetUserAgentType(userAgent),
		}
		ctx := auth.WithHTTPInfo(r.Context(), info)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// getRealIP extracts the real client IP address from the request.
// It checks X-Forwarded-For and X-Real-IP headers before falling back to RemoteAddr.
func getRealIP(r *http.Request) string {
	// Check X-Forwarded-For header (may contain multiple IPs)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// Take the first IP (original client)
		if before, _, ok := strings.Cut(xff, ","); ok {
			return strings.TrimSpace(before)
		}
		return strings.TrimSpace(xff)
	}

	// Check X-Real-IP header
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}

	// Fall back to RemoteAddr
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}
