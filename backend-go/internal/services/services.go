package services

import (
	"fmt"
	"log/slog"

	"github.com/infisical/api/internal/services/platform"
	"github.com/infisical/api/internal/services/secretmanager"
	"github.com/infisical/api/internal/services/shared"
)

type Registry struct {
	Platform      *platform.Registry
	SecretManager *secretmanager.Registry
	Libs          *shared.SharedServices
}

func NewRegistry(logger *slog.Logger, sharedDeps shared.SharedServicesDeps) (*Registry, error) {
	sharedLibs, err := shared.NewSharedServices(sharedDeps)
	if err != nil {
		return nil, fmt.Errorf("shared services: %w", err)
	}

	return &Registry{
		Libs:          sharedLibs,
		Platform:      platform.NewRegistry(logger, sharedLibs),
		SecretManager: secretmanager.NewRegistry(logger, sharedLibs),
	}, nil
}
