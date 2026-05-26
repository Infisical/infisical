package middlewares

import (
	"context"
	"net/http"

	"github.com/infisical/api/internal/services/assumeprivilege"
	"github.com/infisical/api/internal/services/auth"
)

const assumePrivilegeCookieName = "infisical-project-assume-privileges"

// AssumePrivilegeVerifier is the interface for verifying assume privilege tokens.
type AssumePrivilegeVerifier interface {
	VerifyAssumePrivilegeToken(ctx context.Context, opts *assumeprivilege.VerifyTokenOpts) (*auth.AssumedPrivilegeDetails, error)
}

// AssumePrivilege creates middleware that extracts and verifies the assume privilege cookie.
// If valid, it stores the AssumedPrivilegeDetails in the request context.
// Port of inject-assume-privilege.ts.
func AssumePrivilege(verifier AssumePrivilegeVerifier) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(assumePrivilegeCookieName)
			if err != nil || cookie.Value == "" {
				next.ServeHTTP(w, r)
				return
			}

			identity, err := auth.IdentityFromContext(r.Context())
			if err != nil || identity.AuthMode != auth.AuthModeJWT {
				next.ServeHTTP(w, r)
				return
			}

			details, err := verifier.VerifyAssumePrivilegeToken(r.Context(), &assumeprivilege.VerifyTokenOpts{
				Token:          cookie.Value,
				TokenVersionID: identity.TokenVersionID,
				AuthMethod:     identity.AuthMethod,
				OrgID:          identity.OrgID,
			})
			if err != nil {
				// Clear invalid cookie
				http.SetCookie(w, &http.Cookie{
					Name:     assumePrivilegeCookieName,
					Value:    "",
					Path:     "/api",
					MaxAge:   -1,
					HttpOnly: true,
				})
				next.ServeHTTP(w, r)
				return
			}

			ctx := auth.WithAssumedPrivilege(r.Context(), details)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
