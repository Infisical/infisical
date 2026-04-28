package environment

import (
	"context"
	"errors"
	"fmt"

	"github.com/go-jet/jet/v2/postgres"
	"github.com/go-jet/jet/v2/qrm"
	"github.com/google/uuid"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/database/pg/gen/table"
)

type Environment struct {
	ID        uuid.UUID `sql:"primary_key" alias:"project_environments.id"`
	Slug      string    `alias:"project_environments.slug"`
	Name      string    `alias:"project_environments.name"`
	ProjectID string    `alias:"project_environments.project_id"`
	Position  int32     `alias:"project_environments.position"`
}

type DAL struct {
	db pg.DB
}

func NewDAL(db pg.DB) *DAL {
	return &DAL{db: db}
}

func (d *DAL) GetBySlug(ctx context.Context, projectID, slug string) (*Environment, error) {
	pe := table.ProjectEnvironments

	stmt := postgres.SELECT(
		pe.ID,
		pe.Slug,
		pe.Name,
		pe.ProjectId,
		pe.Position,
	).FROM(pe).WHERE(
		postgres.AND(
			pe.ProjectId.EQ(postgres.String(projectID)),
			pe.Slug.EQ(postgres.String(slug)),
		),
	).LIMIT(1)

	var env Environment
	err := stmt.QueryContext(ctx, d.db.Replica(), &env)
	if err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, fmt.Errorf("environment with slug '%s' not found in project", slug)
		}
		return nil, err
	}

	return &env, nil
}

func (d *DAL) GetByID(ctx context.Context, envID uuid.UUID) (*Environment, error) {
	pe := table.ProjectEnvironments

	stmt := postgres.SELECT(
		pe.ID,
		pe.Slug,
		pe.Name,
		pe.ProjectId,
		pe.Position,
	).FROM(pe).WHERE(
		pe.ID.EQ(postgres.UUID(envID)),
	).LIMIT(1)

	var env Environment
	err := stmt.QueryContext(ctx, d.db.Replica(), &env)
	if err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, fmt.Errorf("environment with ID '%s' not found", envID)
		}
		return nil, err
	}

	return &env, nil
}

func (d *DAL) GetAllByProjectID(ctx context.Context, projectID string) ([]Environment, error) {
	pe := table.ProjectEnvironments

	stmt := postgres.SELECT(
		pe.ID,
		pe.Slug,
		pe.Name,
		pe.ProjectId,
		pe.Position,
	).FROM(pe).WHERE(
		pe.ProjectId.EQ(postgres.String(projectID)),
	).ORDER_BY(pe.Position.ASC())

	var envs []Environment
	err := stmt.QueryContext(ctx, d.db.Replica(), &envs)
	if err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return []Environment{}, nil
		}
		return nil, err
	}

	return envs, nil
}
