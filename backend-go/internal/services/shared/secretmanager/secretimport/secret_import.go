package secretimport

import (
	"context"
	"fmt"
)

type dal interface {
	GetImportsByProjectID(ctx context.Context, projectID string) ([]importRow, error)
}

type SharedService struct {
	dal dal
}

// Deps holds the dependencies for the secret import shared service.
type Deps struct {
	DAL dal
}

func NewSharedService(deps Deps) *SharedService {
	return &SharedService{dal: deps.DAL}
}

// LoadProjectImports fetches all secret imports for a project and builds an in-memory lookup.
func (s *SharedService) LoadProjectImports(ctx context.Context, projectID string) (*ImportLookup, error) {
	rows, err := s.dal.GetImportsByProjectID(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("get imports for project %s: %w", projectID, err)
	}
	return newImportLookup(rows), nil
}
