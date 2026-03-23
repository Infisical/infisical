package secretimport

import (
	"context"

	"github.com/infisical/api/internal/libs/errutil"
)

type dal interface {
	GetImportsByProjectID(ctx context.Context, projectID string) ([]importRow, error)
}

type Service struct {
	dal dal
}

// Deps holds the dependencies for the secret import shared service.
type Deps struct {
	DAL dal
}

func NewService(deps Deps) *Service {
	return &Service{dal: deps.DAL}
}

// LoadProjectImports fetches all secret imports for a project and builds an in-memory lookup.
func (s *Service) LoadProjectImports(ctx context.Context, projectID string) (*ImportLookup, error) {
	rows, err := s.dal.GetImportsByProjectID(ctx, projectID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to get imports for project").WithErr(err)
	}
	return newImportLookup(rows), nil
}
