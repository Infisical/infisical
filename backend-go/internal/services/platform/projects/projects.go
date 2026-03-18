package projects

import (
	"context"
	"log/slog"

	genprojects "github.com/infisical/api/internal/server/gen/projects"
	"github.com/infisical/api/internal/services/shared/permission"
)

// piccolo: package internal/services/shared/permission
// piccolo: struct Lib
// piccolo: method GetProjectPermission
type permissionLib interface {
	// piccolo:start
	GetProjectPermission(projectId string) string
	// piccolo:end
}

type service struct {
	logger     *slog.Logger
	permission permissionLib
}

func NewService(logger *slog.Logger, permission permissionLib) genprojects.Service {
	return &service{
		logger:     logger.With("service", "projects"),
		permission: permission,
	}
}

// Ensure permission.Lib satisfies the interface at compile time.
var _ permissionLib = (*permission.Lib)(nil)

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
