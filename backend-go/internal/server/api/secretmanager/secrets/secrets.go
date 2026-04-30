package secrets

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/services"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/secretmanager"
)

// Handler implements the Goa secrets service interface.
type Handler struct {
	auth.AuthHandler
	logger           *slog.Logger
	sharedSvc        *services.Services
	secretManagerSvc *secretmanager.Services
}

// Deps holds the dependencies for the secrets handler.
type Deps struct {
	Logger           *slog.Logger
	SharedSvc        *services.Services
	SecretManagerSvc *secretmanager.Services
}

// NewHandler creates a new secrets handler.
func NewHandler(deps Deps) *Handler {
	return &Handler{
		AuthHandler:      deps.SharedSvc.AuthHandler,
		logger:           deps.Logger.With(slog.String("handler", "secrets")),
		sharedSvc:        deps.SharedSvc,
		secretManagerSvc: deps.SecretManagerSvc,
	}
}

// resolveProjectID resolves the project ID from either workspaceId or workspaceSlug.
func (h *Handler) resolveProjectID(ctx context.Context, workspaceID, workspaceSlug *string) (string, error) {
	// Prefer workspaceId if provided
	if workspaceID != nil && *workspaceID != "" {
		return *workspaceID, nil
	}

	// Fall back to workspaceSlug
	if workspaceSlug == nil || *workspaceSlug == "" {
		return "", errutil.BadRequest("Either workspaceId or workspaceSlug is required")
	}

	// Get identity to extract org ID
	identity := auth.IdentityFromContext(ctx)
	if identity == nil {
		return "", errutil.Unauthorized("Authentication required")
	}

	proj, err := h.sharedSvc.Project.GetBySlug(ctx, identity.OrgID, *workspaceSlug)
	if err != nil {
		return "", errutil.DatabaseErr("Failed to resolve project").WithErr(
			fmt.Errorf("project.GetBySlug(slug=%s): %w", *workspaceSlug, err),
		)
	}
	if proj == nil {
		return "", errutil.NotFound("Project not found").WithErr(
			fmt.Errorf("project with slug '%s' not found in org", *workspaceSlug),
		)
	}

	return proj.ID, nil
}

func ptrToString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
