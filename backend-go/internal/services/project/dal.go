package project

import (
	"context"
	"database/sql"
	"errors"

	"github.com/go-jet/jet/v2/postgres"
	"github.com/go-jet/jet/v2/qrm"
	"github.com/google/uuid"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/database/pg/gen/table"
)

// Project holds basic project details.
type Project struct {
	ID    string
	Name  string
	Slug  string
	OrgID uuid.UUID
	Type  string
}

// DAL provides data access for projects.
type DAL struct {
	db pg.DB
}

// NewDAL creates a new project DAL.
func NewDAL(db pg.DB) *DAL {
	return &DAL{db: db}
}

// FindBySlug returns a project by its slug within an organization.
// Returns nil if not found.
func (d *DAL) FindBySlug(ctx context.Context, orgID uuid.UUID, slug string) (*Project, error) {
	projects := table.Projects

	var result struct {
		ID    string    `alias:"projects.id"`
		Name  string    `alias:"projects.name"`
		Slug  string    `alias:"projects.slug"`
		OrgID uuid.UUID `alias:"projects.org_id"`
		Type  string    `alias:"projects.type"`
	}

	err := projects.SELECT(
		projects.ID, projects.Name, projects.Slug, projects.OrgId, projects.Type,
	).WHERE(
		postgres.AND(
			projects.Slug.EQ(postgres.String(slug)),
			projects.OrgId.EQ(postgres.UUID(orgID)),
		),
	).QueryContext(ctx, d.db.Replica(), &result)
	if err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &Project{
		ID:    result.ID,
		Name:  result.Name,
		Slug:  result.Slug,
		OrgID: result.OrgID,
		Type:  result.Type,
	}, nil
}

// FindByID returns a project by its ID.
// Returns nil if not found.
func (d *DAL) FindByID(ctx context.Context, projectID string) (*Project, error) {
	projects := table.Projects

	var result struct {
		ID    string           `alias:"projects.id"`
		Name  string           `alias:"projects.name"`
		Slug  string           `alias:"projects.slug"`
		OrgID uuid.UUID        `alias:"projects.org_id"`
		Type  sql.Null[string] `alias:"projects.type"`
	}

	err := projects.SELECT(
		projects.ID, projects.Name, projects.Slug, projects.OrgId, projects.Type,
	).WHERE(
		projects.ID.EQ(postgres.String(projectID)),
	).QueryContext(ctx, d.db.Replica(), &result)
	if err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	projectType := ""
	if result.Type.Valid {
		projectType = result.Type.V
	}

	return &Project{
		ID:    result.ID,
		Name:  result.Name,
		Slug:  result.Slug,
		OrgID: result.OrgID,
		Type:  projectType,
	}, nil
}
