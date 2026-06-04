package middlewares

import (
	"net/http"
	"strconv"
	"strings"
)

// CORSConfig holds configuration for the CORS middleware.
type CORSConfig struct {
	// AllowedOrigins is a list of origins that are allowed.
	// Use "*" to allow all origins (not recommended for production with credentials).
	AllowedOrigins []string

	// AllowedMethods is a list of allowed HTTP methods.
	// Defaults to GET, POST, PUT, PATCH, DELETE, OPTIONS if empty.
	AllowedMethods []string

	// AllowedHeaders is a list of allowed request headers.
	// Defaults to common headers if empty.
	AllowedHeaders []string

	// AllowCredentials indicates whether credentials (cookies, auth headers) are allowed.
	AllowCredentials bool

	// MaxAge is the max age (in seconds) for preflight cache.
	// Defaults to 86400 (24 hours) if 0.
	MaxAge int
}

// CORS returns middleware that handles Cross-Origin Resource Sharing.
func CORS(cfg *CORSConfig) func(http.Handler) http.Handler {
	if len(cfg.AllowedMethods) == 0 {
		cfg.AllowedMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
	}
	if len(cfg.AllowedHeaders) == 0 {
		cfg.AllowedHeaders = []string{
			"Accept",
			"Authorization",
			"Content-Type",
			"X-Request-Id",
			"X-Requested-With",
		}
	}
	if cfg.MaxAge == 0 {
		cfg.MaxAge = 86400
	}

	methodsStr := strings.Join(cfg.AllowedMethods, ", ")
	headersStr := strings.Join(cfg.AllowedHeaders, ", ")
	maxAgeStr := strconv.Itoa(cfg.MaxAge)

	allowAll := len(cfg.AllowedOrigins) == 1 && cfg.AllowedOrigins[0] == "*"
	originsSet := make(map[string]struct{}, len(cfg.AllowedOrigins))
	for _, o := range cfg.AllowedOrigins {
		originsSet[o] = struct{}{}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			h := w.Header()

			// Check if origin is allowed
			if origin != "" {
				allowed := allowAll
				if !allowed {
					_, allowed = originsSet[origin]
				}

				if allowed {
					if allowAll && !cfg.AllowCredentials {
						h.Set("Access-Control-Allow-Origin", "*")
					} else {
						h.Set("Access-Control-Allow-Origin", origin)
						h.Add("Vary", "Origin")
					}

					if cfg.AllowCredentials {
						h.Set("Access-Control-Allow-Credentials", "true")
					}
				}
			}

			// Handle preflight
			if r.Method == http.MethodOptions {
				h.Set("Access-Control-Allow-Methods", methodsStr)
				h.Set("Access-Control-Allow-Headers", headersStr)
				h.Set("Access-Control-Max-Age", maxAgeStr)
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
