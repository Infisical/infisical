package projects

import (
	"context"
	"log/slog"

	genprojects "github.com/infisical/api/internal/server/gen/projects"
	"github.com/infisical/api/internal/services/shared/permission"
)

type permissionGetter interface {
	GetProjectPermission(ctx context.Context, args *permission.GetProjectPermissionArgs) (*permission.GetProjectPermissionResult, error)
}

type service struct {
	logger     *slog.Logger
	permission permissionGetter
}

// Deps holds the dependencies for the projects service.
type Deps struct {
	Permission permissionGetter
}

func NewService(logger *slog.Logger, deps Deps) genprojects.Service {
	return &service{
		logger:     logger.With(slog.String("service", "projects")),
		permission: deps.Permission,
	}
}

func (s *service) GetHealth(ctx context.Context) (string, error) {
	s.logger.InfoContext(ctx, "health check")
	return "projects service is healthy", nil
}

func (s *service) CreateProject(ctx context.Context, p *genprojects.CreateProjectPayload) (*genprojects.ProjectResult, error) {
	s.logger.InfoContext(ctx, "creating project", slog.String("name", p.Name))
	return &genprojects.ProjectResult{
		ID:    "generated-id",
		Name:  p.Name,
		OrgID: p.OrgID,
	}, nil
}
