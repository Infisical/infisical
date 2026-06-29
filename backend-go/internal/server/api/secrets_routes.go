package api

import (
	"log/slog"

	"github.com/infisical/api/internal/ee/services/ratelimit"
	"github.com/infisical/api/internal/server/api/secrets/secret"
	"github.com/infisical/api/internal/services/auth/apiauth"
)

func (r *Router) registerSecretsRoutes() {
	l := r.logger.With(slog.String("product", "secrets"))

	secretsHandler := secret.NewHandler(&secret.Deps{
		Logger:      l,
		Permission:  r.services.Permission,
		Project:     r.services.Platform().Project,
		AuditLog:    r.services.AuditLog,
		Secrets:     r.services.Secrets().Secret,
		KMS:         r.services.KMS,
		SecretCache: r.services.Secrets().SecretCache,
	})

	secret.RegisterRoutes(r.Router, secretsHandler,
		secret.WithMiddleware(r.auth.RequireAuth(
			apiauth.WithAuthModes(apiauth.JWTAuth, apiauth.IdentityAccessTokenAuth, apiauth.ServiceTokenAuth),
		)),
		secret.WithMiddleware(r.services.RateLimit.Middleware(ratelimit.PresetSecrets)),
		secret.WithErrorHandler(NewErrorHandler(l)),
	)
}
