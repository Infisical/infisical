package projects

import (
	"context"
	"log/slog"

	genprojects "github.com/infisical/api/internal/server/gen/projects"
)

type service struct {
	logger *slog.Logger
}

func NewService(logger *slog.Logger) genprojects.Service {
	return &service{
		logger: logger.With("service", "projects"),
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
