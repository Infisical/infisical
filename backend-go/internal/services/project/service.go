package project

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/infisical/api/internal/database/pg"
)

// Project holds basic project details.
type Project struct {
	ID    string
	Name  string
	Slug  string
	OrgID uuid.UUID
	Type  string
}

// Deps holds the dependencies for the project service.
type Deps struct {
	DB pg.DB
}

// Service provides project-related operations.
type Service struct {
	logger *slog.Logger
	db     pg.DB
}

// NewService creates a new project service.
func NewService(logger *slog.Logger, deps Deps) *Service {
	return &Service{
		logger: logger.With(slog.String("service", "project")),
		db:     deps.DB,
	}
}

// GetBySlug returns a project by its slug within an organization.
// Returns nil if not found.
func (s *Service) GetBySlug(ctx context.Context, orgID uuid.UUID, slug string) (*Project, error) {
	return s.findBySlug(ctx, orgID, slug)
}

// GetByID returns a project by its ID.
// Returns nil if not found.
func (s *Service) GetByID(ctx context.Context, projectID string) (*Project, error) {
	return s.findByID(ctx, projectID)
}

// --- Row types ---

type projectRow struct {
	ID    string              `db:"id"`
	Name  string              `db:"name"`
	Slug  string              `db:"slug"`
	OrgID uuid.UUID           `db:"org_id"`
	Type  sql.Null[string]    `db:"type"`
}

// --- Query methods ---

// findBySlug returns a project by its slug within an organization.
func (s *Service) findBySlug(ctx context.Context, orgID uuid.UUID, slug string) (*Project, error) {
	query := `
		SELECT id, name, slug, org_id, type
		FROM projects
		WHERE slug = @slug AND org_id = @orgID
	`
	args := pgx.NamedArgs{"slug": slug, "orgID": orgID}

	row := s.db.Replica().QueryRow(ctx, query, args)
	var r projectRow
	err := row.Scan(&r.ID, &r.Name, &r.Slug, &r.OrgID, &r.Type)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	projectType := ""
	if r.Type.Valid {
		projectType = r.Type.V
	}

	return &Project{
		ID:    r.ID,
		Name:  r.Name,
		Slug:  r.Slug,
		OrgID: r.OrgID,
		Type:  projectType,
	}, nil
}

// findByID returns a project by its ID.
func (s *Service) findByID(ctx context.Context, projectID string) (*Project, error) {
	query := `
		SELECT id, name, slug, org_id, type
		FROM projects
		WHERE id = @projectID
	`
	args := pgx.NamedArgs{"projectID": projectID}

	row := s.db.Replica().QueryRow(ctx, query, args)
	var r projectRow
	err := row.Scan(&r.ID, &r.Name, &r.Slug, &r.OrgID, &r.Type)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	projectType := ""
	if r.Type.Valid {
		projectType = r.Type.V
	}

	return &Project{
		ID:    r.ID,
		Name:  r.Name,
		Slug:  r.Slug,
		OrgID: r.OrgID,
		Type:  projectType,
	}, nil
}
