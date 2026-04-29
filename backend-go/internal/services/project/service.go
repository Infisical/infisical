package project

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
)

type dal interface {
	FindBySlug(ctx context.Context, orgID uuid.UUID, slug string) (*Project, error)
	FindByID(ctx context.Context, projectID string) (*Project, error)
}

// Deps holds the dependencies for the project service.
type Deps struct {
	DAL dal
}

// Service provides project-related operations.
type Service struct {
	logger *slog.Logger
	dal    dal
}

// NewService creates a new project service.
func NewService(logger *slog.Logger, deps Deps) *Service {
	return &Service{
		logger: logger.With(slog.String("service", "project")),
		dal:    deps.DAL,
	}
}

// GetBySlug returns a project by its slug within an organization.
// Returns nil if not found.
func (s *Service) GetBySlug(ctx context.Context, orgID uuid.UUID, slug string) (*Project, error) {
	return s.dal.FindBySlug(ctx, orgID, slug)
}

// GetByID returns a project by its ID.
// Returns nil if not found.
func (s *Service) GetByID(ctx context.Context, projectID string) (*Project, error) {
	return s.dal.FindByID(ctx, projectID)
}
