//go:generate go tool oapi-codegen -config cfg.yaml openapi.yml

package projects

import (
	"context"
	"log/slog"

	"github.com/infisical/api/internal/services/permission"
)

// Compile-time check that Handler implements ServiceInterface.
var _ ServiceInterface = (*Handler)(nil)

// PermissionService provides project permission checks.
type PermissionService interface {
	GetProjectPermission(ctx context.Context, args *permission.GetProjectPermissionArgs) (*permission.GetProjectPermissionResult, error)
}

// Handler provides HTTP handlers for projects endpoints.
type Handler struct {
	logger     *slog.Logger
	permission PermissionService
}

// Deps holds the dependencies for the projects handler.
type Deps struct {
	Logger     *slog.Logger
	Permission PermissionService
}

// NewHandler creates a new projects handler.
func NewHandler(deps *Deps) *Handler {
	return &Handler{
		logger:     deps.Logger.With(slog.String("handler", "projects")),
		permission: deps.Permission,
	}
}

// GetProjectsHealth handles the health check endpoint.
func (h *Handler) GetProjectsHealth(ctx context.Context) (*GetProjectsHealthResponseData, error) {
	h.logger.InfoContext(ctx, "health check")
	return NewGetProjectsHealthResponseData(&GetHealthResponse{
		Message: "projects service is healthy",
	}), nil
}

// CreateProject handles the create project endpoint.
func (h *Handler) CreateProject(ctx context.Context, opts *CreateProjectServiceRequestOptions) (*CreateProjectResponseData, error) {
	h.logger.InfoContext(ctx, "creating project", slog.String("name", opts.Body.Name))
	return NewCreateProjectResponseData(&CreateProjectResponse{
		ID:    "generated-id",
		Name:  opts.Body.Name,
		OrgID: opts.Body.OrgID,
	}), nil
}
