package api

import (
	"log/slog"

	"github.com/infisical/api/internal/server/api/platform/projects"
	"github.com/infisical/api/pkg/chita"
)

// RegisterPlatformRoutes initializes platform handlers and registers their routes.
func RegisterPlatformRoutes(router *chita.Router, app *chita.App, logger *slog.Logger, svc *PlatformServices) {
	l := logger.With(slog.String("product", "platform"))

	projectsHandler := projects.NewHandler(&projects.Deps{
		Logger:     l,
		Permission: svc.Permission,
	})

	projects.RegisterRoutes(router, app, projectsHandler)
}
