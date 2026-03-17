package platform

import (
	"log/slog"

	genprojects "github.com/infisical/api/internal/server/gen/projects"
	"github.com/infisical/api/internal/services/shared"
	"github.com/infisical/api/internal/services/platform/projects"
)

type Registry struct {
	Projects genprojects.Service
}

func NewRegistry(logger *slog.Logger, sharedLibs *shared.Libs) *Registry {
	l := logger.With("product", "platform")
	return &Registry{
		Projects: projects.NewService(l, sharedLibs),
	}
}
