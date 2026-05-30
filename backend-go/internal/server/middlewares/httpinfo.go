package middlewares

import (
	"net"
	"net/http"
	"strings"

	"github.com/infisical/api/internal/services/auditlog"
	"github.com/infisical/api/internal/services/auth"
)

// HTTPInfoMiddleware extracts HTTP request information and stores it in context.
// This must run before the auth handler so Identity can be populated with this info.
//
// trustedCIDRs controls how the client IP is resolved:
//   - When non-empty, X-Forwarded-For / X-Real-IP headers are only trusted if the
//     request's direct source (RemoteAddr) falls within one of the listed CIDRs.
//   - When empty, headers are trusted unconditionally (legacy behavior, preserved
//     for backwards compatibility with existing self-hosted deployments).
func HTTPInfoMiddleware(trustedCIDRs []net.IPNet) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userAgent := r.Header.Get("User-Agent")
			info := &auth.HTTPInfo{
				IPAddress:     getRealIP(r, trustedCIDRs),
				UserAgent:     userAgent,
				UserAgentType: auditlog.GetUserAgentType(userAgent),
			}
			ctx := auth.WithHTTPInfo(r.Context(), info)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// getRealIP extracts the real client IP address from the request.
//
// When trustedCIDRs is non-empty (strict mode), forwarded headers are only
// used if RemoteAddr belongs to a trusted proxy. Otherwise, RemoteAddr is
// returned directly — preventing clients from spoofing their IP via headers.
//
// When trustedCIDRs is empty (legacy mode), headers are trusted
// unconditionally for backwards compatibility.
func getRealIP(r *http.Request, trustedCIDRs []net.IPNet) string {
	remoteIP := extractIP(r.RemoteAddr)

	// Strict mode: only trust headers from known proxies.
	if len(trustedCIDRs) > 0 {
		if !isIPTrusted(remoteIP, trustedCIDRs) {
			return remoteIP
		}
	}

	// Trust forwarded headers (either legacy mode or request is from a trusted proxy).
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if before, _, ok := strings.Cut(xff, ","); ok {
			return strings.TrimSpace(before)
		}
		return strings.TrimSpace(xff)
	}

	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}

	return remoteIP
}

// extractIP extracts the IP address from an address string, stripping the port
// if present (e.g. "1.2.3.4:8080" → "1.2.3.4").
func extractIP(addr string) string {
	ip, _, err := net.SplitHostPort(addr)
	if err != nil {
		return addr
	}
	return ip
}

// isIPTrusted checks whether the given IP string falls within any of the
// trusted CIDR ranges.
func isIPTrusted(ipStr string, trustedCIDRs []net.IPNet) bool {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}
	for i := range trustedCIDRs {
		if trustedCIDRs[i].Contains(ip) {
			return true
		}
	}
	return false
}
