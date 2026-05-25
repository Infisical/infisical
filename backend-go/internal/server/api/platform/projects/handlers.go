package projects

import (
	"context"
	"log/slog"

	"github.com/infisical/api/internal/services/permission"
)

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

// GetHealth handles the health check endpoint.
func (h *Handler) GetHealth(ctx context.Context, _ *GetHealthRequest) (GetHealthResponse, error) {
	h.logger.InfoContext(ctx, "health check")
	return GetHealthResponse{
		Message: "projects service is healthy",
	}, nil
}

// CreateProject handles the create project endpoint.
func (h *Handler) CreateProject(ctx context.Context, req *CreateProjectRequest) (CreateProjectResponse, error) {
	h.logger.InfoContext(ctx, "creating project", slog.String("name", req.Name))
	return CreateProjectResponse{
		ID:    "generated-id",
		Name:  req.Name,
		OrgID: req.OrgID,
	}, nil
}
