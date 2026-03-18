package services

import (
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

func NewRegistry(logger *slog.Logger) *Registry {
	sharedLibs := shared.NewSharedServices()

	return &Registry{
		Libs:          sharedLibs,
		Platform:      platform.NewRegistry(logger, sharedLibs),
		SecretManager: secretmanager.NewRegistry(logger, sharedLibs),
	}
}
