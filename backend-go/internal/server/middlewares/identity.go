package middlewares

import (
	"net/http"

	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/pkg/chita"
)

// IdentityMiddleware extracts the identity from the AuthResult (set by SecurityRegistry
// middleware) and stores it in the context using auth.WithIdentity. This bridges the
// chita auth system with the existing auth.IdentityFromContext pattern used by handlers.
func IdentityMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		result := chita.GetAuthResult(r.Context())
		if result != nil {
			if identity, ok := result.GetClaims().(*auth.Identity); ok {
				r = r.WithContext(auth.WithIdentity(r.Context(), identity))
			}
		}
		next.ServeHTTP(w, r)
	})
}
