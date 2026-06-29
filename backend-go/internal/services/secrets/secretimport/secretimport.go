package secretimport

import (
	"context"
	"database/sql"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/libs/errutil"
)

type importRow struct {
	ID            uuid.UUID
	ImportPath    string
	ImportEnvID   uuid.UUID
	Position      int32
	FolderID      uuid.UUID
	IsReplication sql.Null[bool]
	IsReserved    sql.Null[bool]
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
		logger: logger.With(slog.String("service", "secretimport")),
		db:     deps.DB,
	}
}

// LoadProjectImports fetches all secret imports for a project and builds an in-memory lookup.
func (s *Service) LoadProjectImports(ctx context.Context, projectID string) (*ImportLookup, error) {
	rows, err := s.getImportsByProjectID(ctx, projectID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to get imports for project").WithErrf("LoadProjectImports(projectId=%s): %w", projectID, err)
	}
	return newImportLookup(rows), nil
}

func (s *Service) getImportsByProjectID(ctx context.Context, projectID string) ([]importRow, error) {
	query := `
		SELECT imp.id, imp."importPath", imp."importEnv", imp.position, imp."folderId", imp."isReplication", imp."isReserved"
		FROM secret_imports imp
		INNER JOIN secret_folders folder ON imp."folderId" = folder.id
		INNER JOIN project_environments env ON folder."envId" = env.id
		WHERE env."projectId" = @projectID AND env."deleteAfter" IS NULL
		ORDER BY imp."folderId" ASC, imp.position ASC
	`
	args := pgx.NamedArgs{"projectID": projectID}

	rows, err := s.db.Replica().Query(ctx, query, args)
	if err != nil {
		return nil, err
	}

	imports, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (importRow, error) {
		var imp importRow
		err := row.Scan(&imp.ID, &imp.ImportPath, &imp.ImportEnvID, &imp.Position, &imp.FolderID, &imp.IsReplication, &imp.IsReserved)
		return imp, err
	})
	if err != nil {
		return nil, err
	}

	return imports, nil
}
