package services

import (
	"fmt"
	"log/slog"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/services/platform"
	"github.com/infisical/api/internal/services/secretmanager"
	"github.com/infisical/api/internal/services/shared"
)

type Registry struct {
	Platform      *platform.Registry
	SecretManager *secretmanager.Registry
	Libs          *shared.SharedServices
}

func NewRegistry(logger *slog.Logger, db pg.DB, sharedDeps shared.SharedServicesDeps) (*Registry, error) {
	sharedLibs, err := shared.NewSharedServices(sharedDeps)
	if err != nil {
		return nil, fmt.Errorf("shared services: %w", err)
	}

	return &Registry{
		Libs:          sharedLibs,
		Platform:      platform.NewRegistry(logger, sharedLibs),
		SecretManager: secretmanager.NewRegistry(logger, db, sharedLibs),
	}, nil
}
