package api

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/server/api/platform"
	"github.com/infisical/api/internal/server/api/secretmanager"
	"github.com/infisical/api/internal/services"
)

type Registry struct {
	Platform      *platform.Registry
	SecretManager *secretmanager.Registry
	Libs          *services.Services
}

func NewRegistry(ctx context.Context, logger *slog.Logger, db pg.DB, sharedDeps services.ServicesDeps) (*Registry, error) {
	sharedLibs, err := services.NewServices(ctx, sharedDeps)
	if err != nil {
		return nil, fmt.Errorf("shared services: %w", err)
	}

	return &Registry{
		Libs:          sharedLibs,
		Platform:      platform.NewRegistry(logger, sharedLibs),
		SecretManager: secretmanager.NewRegistry(logger, db, sharedLibs),
	}, nil
}
