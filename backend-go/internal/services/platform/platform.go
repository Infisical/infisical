package platform

import (
	"log/slog"

	genprojects "github.com/infisical/api/internal/server/gen/projects"
	"github.com/infisical/api/internal/services/platform/projects"
)

type Service struct {
	Projects genprojects.Service
}

func NewService(logger *slog.Logger) *Service {
	l := logger.With("product", "platform")
	return &Service{
		Projects: projects.NewService(l),
	}
}
