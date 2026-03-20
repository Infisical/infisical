package secretimport

import (
	"context"
	"database/sql"

	"github.com/go-jet/jet/v2/postgres"
	"github.com/go-jet/jet/v2/qrm"
	"github.com/google/uuid"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/database/pg/gen/table"
)

type importRow struct {
	ID            uuid.UUID      `alias:"secret_imports.id"`
	ImportPath    string         `alias:"secret_imports.importPath"`
	ImportEnvID   uuid.UUID      `alias:"secret_imports.importEnv"`
	Position      int32          `alias:"secret_imports.position"`
	FolderID      uuid.UUID      `alias:"secret_imports.folderId"`
	IsReplication sql.Null[bool] `alias:"secret_imports.isReplication"`
	IsReserved    sql.Null[bool] `alias:"secret_imports.isReserved"`
}

type DAL struct {
	db pg.DB
}

func NewDAL(db pg.DB) *DAL {
	return &DAL{db: db}
}

func (d *DAL) GetImportsByProjectID(ctx context.Context, projectID string) ([]importRow, error) {
	si := table.SecretImports
	sf := table.SecretFolders
	pe := table.ProjectEnvironments

	stmt := postgres.SELECT(
		si.ID,
		si.ImportPath,
		si.ImportEnv,
		si.Position,
		si.FolderId,
		si.IsReplication,
		si.IsReserved,
	).FROM(
		si.INNER_JOIN(sf, si.FolderId.EQ(sf.ID)).
			INNER_JOIN(pe, sf.EnvId.EQ(pe.ID)),
	).WHERE(
		pe.ProjectId.EQ(postgres.String(projectID)),
	).ORDER_BY(
		si.FolderId.ASC(), si.Position.ASC(),
	)

	var rows []importRow
	err := stmt.QueryContext(ctx, d.db.Primary(), &rows)
	if err != nil {
		if err == qrm.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return rows, nil
}
