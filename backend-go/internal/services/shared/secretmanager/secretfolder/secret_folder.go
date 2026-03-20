package secretfolder

import (
	"context"
	"fmt"
)

type dal interface {
	GetFoldersByProjectID(ctx context.Context, projectID string) ([]folderRow, error)
}

type SharedService struct {
	dal dal
}

func NewSharedService(dal dal) *SharedService {
	return &SharedService{dal: dal}
}

// LoadProjectFolders fetches all folders for a project and builds an in-memory lookup tree.
func (s *SharedService) LoadProjectFolders(ctx context.Context, projectID string) (*FolderLookup, error) {
	rows, err := s.dal.GetFoldersByProjectID(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("get folders for project %s: %w", projectID, err)
	}
	return newFolderLookup(rows), nil
}
