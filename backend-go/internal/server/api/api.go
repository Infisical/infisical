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
	kmsSvc "github.com/infisical/api/internal/server/api/svc/kms"
	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/pkg/services/kms/db/store"
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
	// in-process modules
	Platform      *PlatformServices
	SecretManager *SecretManagerServices
	// services over gprc
	Kms *kmsSvc.Service
}

// NewServices creates all services for the API.
// Returns a cleanup function that should be called during graceful shutdown.
func NewServices(ctx context.Context, infra *Infra) (*Services, func(), error) {
	platformSvc, err := newPlatformServices(ctx, infra)
	if err != nil {
		return nil, nil, fmt.Errorf("platform services: %w", err)
	}

	secretManagerSvc := newSecretManagerServices(ctx, infra, platformSvc)

	// gRPC connection establishment and TLS verification are lazy until the first request.
	kmsSvc, err := kmsSvc.NewKMSService(infra.Config, kmsSvc.Options{
		Permission: platformSvc.Permission,
		KmsStore: store.NewKMSStore(infra.DB,
			&store.KmsStoreOptions{
				KmsMetaCache: store.NewKeyMetaCache(),
			}),
		License: infra.License,
	})

	if err != nil {
		return nil, nil, fmt.Errorf("KMS gRPC client: %w", err)
	}

	services := &Services{
		Platform:      platformSvc,
		SecretManager: secretManagerSvc,
		Kms:           kmsSvc,
	}

	cleanup := func() {
		kmsSvc.Close()
		platformSvc.KMS.Close()
		platformSvc.License.Close()
	}

	return services, cleanup, nil
}
