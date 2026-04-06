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
	EnvID    uuid.UUID           `alias:"secret_folders.env_id"`
}

type DAL struct {
	db pg.DB
}

func NewDAL(db pg.DB) *DAL {
	return &DAL{db: db}
}

func (d *DAL) GetFoldersByProjectAndEnvIDs(ctx context.Context, projectID string, envIDs []uuid.UUID) ([]folderRow, error) {
	sf := table.SecretFolders
	pe := table.ProjectEnvironments

	envExpressions := make([]postgres.Expression, len(envIDs))
	for i, id := range envIDs {
		envExpressions[i] = postgres.UUID(id)
	}

	stmt := postgres.SELECT(
		sf.ID,
		sf.Name,
		sf.ParentId,
		sf.EnvId,
	).FROM(
		sf.INNER_JOIN(pe, sf.EnvId.EQ(pe.ID)),
	).WHERE(
		postgres.AND(
			pe.ProjectId.EQ(postgres.String(projectID)),
			sf.EnvId.IN(envExpressions...),
		),
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
