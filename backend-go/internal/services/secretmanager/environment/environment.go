package environment

import (
	"context"
	"errors"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/libs/errutil"
)

type Environment struct {
	ID        uuid.UUID
	Slug      string
	Name      string
	ProjectID string
	Position  int32
}

type Deps struct {
	DB pg.DB
}

type Service struct {
	logger *slog.Logger
	db     pg.DB
}

func NewService(_ context.Context, logger *slog.Logger, deps *Deps) *Service {
	return &Service{
		logger: logger.With(slog.String("service", "environment")),
		db:     deps.DB,
	}
}

func (s *Service) GetBySlug(ctx context.Context, projectID, slug string) (*Environment, error) {
	query := `
		SELECT id, slug, name, "projectId", position
		FROM project_environments
		WHERE "projectId" = @projectID AND slug = @slug AND "deleteAfter" IS NULL
		LIMIT 1
	`
	args := pgx.NamedArgs{"projectID": projectID, "slug": slug}

	row := s.db.Replica().QueryRow(ctx, query, args)

	var env Environment
	err := row.Scan(&env.ID, &env.Slug, &env.Name, &env.ProjectID, &env.Position)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errutil.NotFound("Environment with slug '%s' not found in project", slug)
	}
	if err != nil {
		return nil, err
	}

	return &env, nil
}

func (s *Service) GetByID(ctx context.Context, envID uuid.UUID) (*Environment, error) {
	query := `
		SELECT id, slug, name, "projectId", position
		FROM project_environments
		WHERE id = @envID AND "deleteAfter" IS NULL
		LIMIT 1
	`
	args := pgx.NamedArgs{"envID": envID}

	row := s.db.Replica().QueryRow(ctx, query, args)

	var env Environment
	err := row.Scan(&env.ID, &env.Slug, &env.Name, &env.ProjectID, &env.Position)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errutil.NotFound("Environment with ID '%s' not found", envID)
	}
	if err != nil {
		return nil, err
	}

	return &env, nil
}

func (s *Service) GetAllByProjectID(ctx context.Context, projectID string) ([]Environment, error) {
	query := `
		SELECT id, slug, name, "projectId", position
		FROM project_environments
		WHERE "projectId" = @projectID AND "deleteAfter" IS NULL
		ORDER BY position ASC
	`
	args := pgx.NamedArgs{"projectID": projectID}

	rows, err := s.db.Replica().Query(ctx, query, args)
	if err != nil {
		return nil, err
	}

	envs, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Environment, error) {
		var env Environment
		err := row.Scan(&env.ID, &env.Slug, &env.Name, &env.ProjectID, &env.Position)
		return env, err
	})
	if err != nil {
		return nil, err
	}

	return envs, nil
}
