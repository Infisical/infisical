package api

import (
	"log/slog"

	"github.com/infisical/api/internal/server/api/secretmanager/secret"
	"github.com/infisical/api/pkg/chita"
)

// RegisterSecretManagerRoutes initializes secret manager handlers and registers their routes.
func RegisterSecretManagerRoutes(router *chita.Router, app *chita.App, logger *slog.Logger, platform *PlatformServices, svc *SecretManagerServices) {
	l := logger.With(slog.String("product", "secretmanager"))

	secretsHandler := secret.NewHandler(&secret.Deps{
		Logger:        l,
		Authenticator: platform.Authenticator,
		Permission:    platform.Permission,
		Project:       platform.Project,
		AuditLog:      platform.AuditLog,
		Secrets:       svc.Secret,
	})

	secret.RegisterRoutes(router, app, secretsHandler)
}
