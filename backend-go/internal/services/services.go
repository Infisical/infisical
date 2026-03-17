package services

import (
	"log/slog"

	"github.com/infisical/api/internal/services/shared"
	"github.com/infisical/api/internal/services/platform"
	"github.com/infisical/api/internal/services/secretmanager"
)

type Registry struct {
	Platform      *platform.Registry
	SecretManager *secretmanager.Registry
	Libs          *shared.Libs
}

func NewRegistry(logger *slog.Logger) *Registry {
	sharedLibs := shared.NewLibs()

	return &Registry{
		Libs:          sharedLibs,
		Platform:      platform.NewRegistry(logger, sharedLibs),
		SecretManager: secretmanager.NewRegistry(logger, sharedLibs),
	}
}
