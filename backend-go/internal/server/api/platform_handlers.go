package api

import (
	"log/slog"

	"github.com/infisical/api/internal/server/api/platform/projects"
)

func newPlatformHandlers(logger *slog.Logger, svc *platformServices) *PlatformHandlers {
	l := logger.With(slog.String("product", "platform"))

	projectsHandler := projects.NewService(l, projects.Deps{
		Authenticator: svc.authenticator,
		Permission:    svc.permission,
	})

	handlers := &PlatformHandlers{
		Projects: projectsHandler,
	}

	return handlers
}
