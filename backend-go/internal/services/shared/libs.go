package shared

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/infisical/api/internal/config"
	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/keystore"
	"github.com/infisical/api/internal/services/shared/kms"
	"github.com/infisical/api/internal/services/shared/license"
	"github.com/infisical/api/internal/services/shared/permission"
)

// SharedServicesDeps holds the external dependencies needed to construct shared services.
type SharedServicesDeps struct {
	Logger   *slog.Logger
	Config   *config.Config
	DB       pg.DB             // primary DB connection (writes)
	HSM      kms.HsmService    // nil when HSM is not configured
	KeyStore keystore.KeyStore // Redis-backed keystore for PG advisory locks
}

type SharedServices struct {
	Config     *config.Config
	Permission *permission.SharedService
	KMS        *kms.SharedService
	License    *license.SharedService
}

func NewSharedServices(ctx context.Context, deps SharedServicesDeps) (*SharedServices, error) {
	permissionDAL := permission.NewDAL()
	kmsDAL := kms.NewDAL(deps.DB, deps.KeyStore)

	kmsSvc, err := kms.NewSharedService(kmsDAL, deps.HSM, deps.Config)
	if err != nil {
		return nil, fmt.Errorf("kms: %w", err)
	}

	licenseDAL := license.NewDAL(deps.DB)
	licenseSvc := license.NewSharedService(ctx, deps.Logger, deps.Config, deps.KeyStore, licenseDAL)

	return &SharedServices{
		Config:     deps.Config,
		Permission: permission.NewSharedService(permissionDAL),
		KMS:        kmsSvc,
		License:    licenseSvc,
	}, nil
}
