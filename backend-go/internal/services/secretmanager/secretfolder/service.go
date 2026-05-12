package secretfolder

import (
	"context"
	"database/sql"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/infisical/api/internal/database/pg"
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
	db pg.DB
}

func NewService(deps *Deps) *Service {
	return &Service{db: deps.DB}
}

// LoadProjectFolders fetches folders for the given environments in a project and builds an in-memory lookup tree.
func (s *Service) LoadProjectFolders(ctx context.Context, projectID string, envIDs []uuid.UUID) (*FolderLookup, error) {
	rows, err := s.getFoldersByProjectAndEnvIDs(ctx, projectID, envIDs)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to get folders for project").WithErrf("LoadProjectFolders(projectId=%s): %w", projectID, err)
	}
	return newFolderLookup(rows), nil
}

func (s *Service) getFoldersByProjectAndEnvIDs(ctx context.Context, projectID string, envIDs []uuid.UUID) ([]folderRow, error) {
	query := `
		SELECT folder.id, folder.name, folder."parentId", folder."envId", env.slug
		FROM secret_folders folder
		INNER JOIN project_environments env ON folder."envId" = env.id
		WHERE env."projectId" = @projectID AND folder."envId" = ANY(@envIDs)
	`
	args := pgx.NamedArgs{
		"projectID": projectID,
		"envIDs":    envIDs,
	}

	rows, err := s.db.Replica().Query(ctx, query, args)
	if err != nil {
		return nil, err
	}

	folders, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (folderRow, error) {
		var f folderRow
		err := row.Scan(&f.ID, &f.Name, &f.ParentID, &f.EnvID, &f.EnvSlug)
		return f, err
	})
	if err != nil {
		return nil, err
	}

	return folders, nil
}
