package secretfolder

import (
	"context"

	"github.com/infisical/api/internal/libs/errutil"
)

type dal interface {
	GetFoldersByProjectID(ctx context.Context, projectID string) ([]folderRow, error)
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

// LoadProjectFolders fetches all folders for a project and builds an in-memory lookup tree.
func (s *Service) LoadProjectFolders(ctx context.Context, projectID string) (*FolderLookup, error) {
	rows, err := s.dal.GetFoldersByProjectID(ctx, projectID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to get folders for project").WithErr(err)
	}
	return newFolderLookup(rows), nil
}
