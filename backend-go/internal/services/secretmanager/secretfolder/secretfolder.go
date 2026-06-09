package secretfolder

import (
	"context"
	"database/sql"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/database/pg/qb"
	"github.com/infisical/api/internal/libs/errutil"
)

type folderRow struct {
	ID       uuid.UUID
	Name     string
	ParentID sql.Null[uuid.UUID]
	EnvID    uuid.UUID
	EnvSlug  string
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
		logger: logger.With(slog.String("service", "secretfolder")),
		db:     deps.DB,
	}
}

// LoadFolders loads folders for a project.
// If envIDs is nil or empty, loads ALL folders for the project.
// If envIDs is provided, loads only folders for those environments.
func (s *Service) LoadFolders(ctx context.Context, projectID string, envIDs []uuid.UUID) (*FolderLookup, error) {
	rows, err := s.getFolders(ctx, projectID, envIDs)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to get folders").WithErrf("LoadFolders(projectId=%s): %w", projectID, err)
	}
	return newFolderLookup(rows), nil
}

func (s *Service) getFolders(ctx context.Context, projectID string, envIDs []uuid.UUID) ([]folderRow, error) {
	args := pgx.NamedArgs{"projectID": projectID}

	where := qb.NewWhere().
		Add(`env."projectId" = @projectID`).
		Add(`env."deleteAfter" IS NULL`).
		AddIf(len(envIDs) > 0, `folder."envId" = ANY(@envIDs)`)

	if len(envIDs) > 0 {
		args["envIDs"] = envIDs
	}

	query := `
		SELECT folder.id, folder.name, folder."parentId", folder."envId", env.slug
		FROM secret_folders folder
		INNER JOIN project_environments env ON folder."envId" = env.id
		WHERE ` + where.String()

	rows, err := s.db.Replica().Query(ctx, query, args)
	if err != nil {
		return nil, err
	}

	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (folderRow, error) {
		var f folderRow
		err := row.Scan(&f.ID, &f.Name, &f.ParentID, &f.EnvID, &f.EnvSlug)
		return f, err
	})
}
