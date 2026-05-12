package api

import (
	"log/slog"

	"github.com/infisical/api/internal/server/api/secretmanager/secret"
)

func newSecretManagerHandlers(
	logger *slog.Logger,
	platform *platformServices,
	svc *secretManagerServices,
) *SecretManagerHandlers {
	l := logger.With(slog.String("product", "secretmanager"))

	secretsHandler := secret.NewHandler(&secret.Deps{
		Logger:        l,
		Authenticator: platform.authenticator,
		Permission:    platform.permission,
		Project:       platform.project,
		AuditLog:      platform.auditLog,
		Secrets:       svc.secret,
	})

	handlers := &SecretManagerHandlers{
		Secrets: secretsHandler,
	}

	return handlers
}
