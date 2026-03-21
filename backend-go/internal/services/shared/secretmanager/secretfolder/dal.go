package secretfolder

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

type folderRow struct {
	ID       uuid.UUID           `alias:"secret_folders.id"`
	Name     string              `alias:"secret_folders.name"`
	ParentID sql.Null[uuid.UUID] `alias:"secret_folders.parent_id"`
	EnvID    uuid.UUID           `alias:"project_environments.id"`
	EnvSlug  string              `alias:"project_environments.slug"`
	EnvName  string              `alias:"project_environments.name"`
}

type DAL struct {
	db pg.DB
}

func NewDAL(db pg.DB) *DAL {
	return &DAL{db: db}
}

func (d *DAL) GetFoldersByProjectID(ctx context.Context, projectID string) ([]folderRow, error) {
	sf := table.SecretFolders
	pe := table.ProjectEnvironments

	stmt := postgres.SELECT(
		sf.ID,
		sf.Name,
		sf.ParentId,
		pe.ID,
		pe.Slug,
		pe.Name,
	).FROM(
		sf.INNER_JOIN(pe, sf.EnvId.EQ(pe.ID)),
	).WHERE(
		pe.ProjectId.EQ(postgres.String(projectID)),
	)

	var rows []folderRow
	err := stmt.QueryContext(ctx, d.db.Primary(), &rows)
	if err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return rows, nil
}
