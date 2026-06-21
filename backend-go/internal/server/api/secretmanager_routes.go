package api

import (
	"log/slog"

	"github.com/go-chi/chi/v5"

	"github.com/infisical/api/internal/ee/services/ratelimit"
	"github.com/infisical/api/internal/server/api/secretmanager/secret"
	"github.com/infisical/api/internal/server/api/shared"
	"github.com/infisical/api/internal/services/auth/apiauth"
)

// RegisterSecretManagerRoutes initializes secret manager handlers and registers their routes.
func RegisterSecretManagerRoutes(router chi.Router, logger *slog.Logger, infra *Infra, platform *PlatformServices, svc *SecretManagerServices) {
	l := logger.With(slog.String("product", "secretmanager"))

	secretsHandler := secret.NewHandler(&secret.Deps{
		Logger:     l,
		Permission: platform.Permission,
		Project:    platform.Project,
		AuditLog:   platform.AuditLog,
		Secrets:    svc.Secret,
		KMS:        platform.KMS,
		KeyStore:   infra.KeyStore,
	})

	secret.RegisterRoutes(router, secretsHandler,
		secret.WithMiddleware(platform.ApiAuthenticator.RequireAuth(
			apiauth.WithAuthModes(apiauth.JWTAuth, apiauth.IdentityAccessTokenAuth, apiauth.ServiceTokenAuth),
		)),
		secret.WithMiddleware(platform.RateLimit.Middleware(ratelimit.PresetSecrets)),
		secret.WithErrorHandler(shared.NewErrorHandler(l)),
	)
}
