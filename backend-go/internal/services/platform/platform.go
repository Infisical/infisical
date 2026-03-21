package platform

import (
	"log/slog"

	genprojects "github.com/infisical/api/internal/server/gen/projects"
	"github.com/infisical/api/internal/services/platform/projects"
	"github.com/infisical/api/internal/services/shared"
)

type Registry struct {
	Projects genprojects.Service
}

func NewRegistry(logger *slog.Logger, sharedLibs *shared.SharedServices) *Registry {
	l := logger.With(slog.String("product", "platform"))
	return &Registry{
		Projects: projects.NewService(l, projects.Deps{
			Permission: sharedLibs.Permission,
		}),
	}
}
