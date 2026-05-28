package projects

import (
	"context"
	"log/slog"

	genprojects "github.com/infisical/api/internal/server/gen/projects"
	"github.com/infisical/api/internal/services/auth/apiauth"
	"github.com/infisical/api/internal/services/permission"
)

type permissionGetter interface {
	GetProjectPermission(ctx context.Context, args *permission.GetProjectPermissionArgs) (*permission.GetProjectPermissionResult, error)
}

type service struct {
	apiauth.Authenticator
	logger     *slog.Logger
	permission permissionGetter
}

// Deps holds the dependencies for the projects service.
type Deps struct {
	Authenticator apiauth.Authenticator
	Permission    permissionGetter
}

func NewService(logger *slog.Logger, deps Deps) genprojects.Service {
	return &service{
		Authenticator: deps.Authenticator,
		logger:        logger.With(slog.String("service", "projects")),
		permission:    deps.Permission,
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
