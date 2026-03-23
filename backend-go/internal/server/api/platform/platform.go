package platform

import (
	"log/slog"

	"github.com/infisical/api/internal/server/api/platform/projects"
	genprojects "github.com/infisical/api/internal/server/gen/projects"
	"github.com/infisical/api/internal/services"
)

type Registry struct {
	Projects genprojects.Service
}

func NewRegistry(logger *slog.Logger, sharedLibs *services.Services) *Registry {
	l := logger.With(slog.String("product", "platform"))
	return &Registry{
		Projects: projects.NewService(l, projects.Deps{
			AuthHandler: sharedLibs.AuthHandler,
			Permission:  sharedLibs.Permission,
		}),
	}
}
