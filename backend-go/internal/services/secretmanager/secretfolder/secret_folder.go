package secretfolder

import (
	"context"

	"github.com/google/uuid"
	"github.com/infisical/api/internal/libs/errutil"
)

type dal interface {
	GetFoldersByProjectAndEnvIDs(ctx context.Context, projectID string, envIDs []uuid.UUID) ([]folderRow, error)
}

type Service struct {
	dal dal
}

// Deps holds the dependencies for the secret folder shared service.
type Deps struct {
	DAL dal
}

func NewService(deps Deps) *Service {
	return &Service{dal: deps.DAL}
}

// LoadProjectFolders fetches folders for the given environments in a project and builds an in-memory lookup tree.
func (s *Service) LoadProjectFolders(ctx context.Context, projectID string, envIDs []uuid.UUID) (*FolderLookup, error) {
	rows, err := s.dal.GetFoldersByProjectAndEnvIDs(ctx, projectID, envIDs)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to get folders for project").WithErr(err)
	}
	return newFolderLookup(rows), nil
}
