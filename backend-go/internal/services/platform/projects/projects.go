package projects

import (
	"context"
	"log/slog"

	genprojects "github.com/infisical/api/internal/server/gen/projects"
	"github.com/infisical/api/internal/services/shared/permission"
)

type permissionGetter interface {
	GetProjectPermission(ctx context.Context, args permission.GetProjectPermissionArgs) (*permission.GetProjectPermissionResult, error)
}

type service struct {
	logger     *slog.Logger
	permission permissionGetter
}

func NewService(logger *slog.Logger, permission permissionGetter) genprojects.Service {
	return &service{
		logger:     logger.With("service", "projects"),
		permission: permission,
	}
}

func (s *service) GetHealth(ctx context.Context) (string, error) {
	s.logger.InfoContext(ctx, "health check")
	return "projects service is healthy", nil
}

func (s *service) CreateProject(ctx context.Context, p *genprojects.CreateProjectPayload) (*genprojects.ProjectResult, error) {
	s.logger.InfoContext(ctx, "creating project", "name", p.Name)
	return &genprojects.ProjectResult{
		ID:    "generated-id",
		Name:  p.Name,
		OrgID: p.OrgID,
	}, nil
}
