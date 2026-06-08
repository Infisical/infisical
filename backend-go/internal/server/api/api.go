package api

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/redis/go-redis/v9"

	"github.com/infisical/api/internal/config"
	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/ee/services/license"
	"github.com/infisical/api/internal/keystore"
	"github.com/infisical/api/internal/queue"
	"github.com/infisical/api/internal/services/kms"
)

// Infra holds the external infrastructure dependencies.
type Infra struct {
	Logger   *slog.Logger
	Config   *config.Config
	DB       pg.DB
	Redis    redis.UniversalClient
	HSM      kms.HsmService
	License  *license.Service
	KeyStore keystore.KeyStore
	Queue    *queue.Service
}

// Services holds all initialized services for the API.
type Services struct {
	Platform      *PlatformServices
	SecretManager *SecretManagerServices
}

// NewServices creates all services for the API.
// Returns a cleanup function that should be called during graceful shutdown.
func NewServices(ctx context.Context, infra *Infra) (*Services, func(), error) {
	platformSvc, err := newPlatformServices(ctx, infra)
	if err != nil {
		return nil, nil, fmt.Errorf("platform services: %w", err)
	}

	secretManagerSvc := newSecretManagerServices(ctx, infra, platformSvc)

	services := &Services{
		Platform:      platformSvc,
		SecretManager: secretManagerSvc,
	}

	cleanup := func() {
		platformSvc.KMS.Close()
		platformSvc.License.Close()
	}

	return services, cleanup, nil
}
