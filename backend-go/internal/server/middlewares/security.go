package middlewares

import "net/http"

// SecurityHeaders returns middleware that sets security headers.
// Equivalent to @fastify/helmet with contentSecurityPolicy: false.
// See https://helmet.js.org/#reference for header descriptions.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()

		// Cross-Origin-Opener-Policy: same-origin
		h.Set("Cross-Origin-Opener-Policy", "same-origin")

		// Cross-Origin-Resource-Policy: same-origin
		h.Set("Cross-Origin-Resource-Policy", "same-origin")

		// Origin-Agent-Cluster: hints browser to isolate origin
		h.Set("Origin-Agent-Cluster", "?1")

		// Referrer-Policy: no-referrer
		h.Set("Referrer-Policy", "no-referrer")

		// Strict-Transport-Security: 1 year with subdomains
		h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")

		// X-Content-Type-Options: prevent MIME sniffing
		h.Set("X-Content-Type-Options", "nosniff")

		// X-DNS-Prefetch-Control: disable DNS prefetching
		h.Set("X-DNS-Prefetch-Control", "off")

		// X-Download-Options: prevent IE from executing downloads
		h.Set("X-Download-Options", "noopen")

		// X-Frame-Options: prevent clickjacking
		h.Set("X-Frame-Options", "SAMEORIGIN")

		// X-Permitted-Cross-Domain-Policies: restrict Adobe cross-domain
		h.Set("X-Permitted-Cross-Domain-Policies", "none")

		// X-XSS-Protection: disable to avoid XSS filter vulnerabilities
		h.Set("X-XSS-Protection", "0")

		// Remove X-Powered-By if present
		h.Del("X-Powered-By")

		next.ServeHTTP(w, r)
	})
}
