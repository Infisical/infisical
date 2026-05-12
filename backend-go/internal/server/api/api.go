package api

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/infisical/api/internal/config"
	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/keystore"
	"github.com/infisical/api/internal/queue"
	genprojects "github.com/infisical/api/internal/server/gen/projects"
	gensecrets "github.com/infisical/api/internal/server/gen/secrets"
	"github.com/infisical/api/internal/services/kms"
)

// Infra holds the external infrastructure dependencies.
type Infra struct {
	Logger   *slog.Logger
	Config   *config.Config
	DB       pg.DB
	HSM      kms.HsmService
	KeyStore keystore.KeyStore
	Queue    *queue.Service
}

// Registry holds all HTTP handlers for the API.
type Registry struct {
	Platform      *PlatformHandlers
	SecretManager *SecretManagerHandlers
}

// PlatformHandlers holds handlers for platform endpoints.
type PlatformHandlers struct {
	Projects genprojects.Service
}

// SecretManagerHandlers holds handlers for secret manager endpoints.
type SecretManagerHandlers struct {
	Secrets gensecrets.Service
}

// NewRegistry creates a new API registry with all services and handlers initialized.
func NewRegistry(ctx context.Context, infra *Infra) (*Registry, error) {
	platformSvc, err := newPlatformServices(ctx, infra)
	if err != nil {
		return nil, fmt.Errorf("platform services: %w", err)
	}

	secretManagerSvc := newSecretManagerServices(infra, platformSvc)

	platformHandlers := newPlatformHandlers(infra.Logger, platformSvc)
	secretManagerHandlers := newSecretManagerHandlers(infra.Logger, platformSvc, secretManagerSvc)

	registry := &Registry{
		Platform:      platformHandlers,
		SecretManager: secretManagerHandlers,
	}

	return registry, nil
}
