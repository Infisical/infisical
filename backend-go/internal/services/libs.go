package services

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/infisical/api/internal/config"
	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/keystore"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/internal/services/license"
	"github.com/infisical/api/internal/services/permission"
)

// ServicesDeps holds the external dependencies needed to construct shared services.
type ServicesDeps struct {
	Logger   *slog.Logger
	Config   *config.Config
	DB       pg.DB             // primary DB connection (writes)
	HSM      kms.HsmService    // nil when HSM is not configured
	KeyStore keystore.KeyStore // Redis-backed keystore for PG advisory locks
}

type Services struct {
	Config      *config.Config
	AuthHandler auth.AuthHandler
	Permission  *permission.Service
	KMS         *kms.Service
	License     *license.Service
}

func NewServices(ctx context.Context, deps ServicesDeps) (*Services, error) {
	permissionDAL := permission.NewDAL(deps.DB)
	kmsDAL := kms.NewDAL(deps.DB, deps.KeyStore)

	kmsSvc, err := kms.NewService(kms.Deps{
		DAL:    kmsDAL,
		HSM:    deps.HSM,
		Config: deps.Config,
	})
	if err != nil {
		return nil, fmt.Errorf("kms: %w", err)
	}

	licenseDAL := license.NewDAL(deps.DB)
	licenseSvc := license.NewService(ctx, deps.Logger, license.Deps{
		Config:   deps.Config,
		KeyStore: deps.KeyStore,
		DAL:      licenseDAL,
	})

	authDAL := auth.NewDAL(deps.DB)
	authHandler := auth.NewAuthHandler(authDAL, deps.Config.AuthSecret)

	return &Services{
		Config:      deps.Config,
		AuthHandler: authHandler,
		Permission:  permission.NewService(deps.Logger, permission.Deps{DAL: permissionDAL}),
		KMS:         kmsSvc,
		License:     licenseSvc,
	}, nil
}
