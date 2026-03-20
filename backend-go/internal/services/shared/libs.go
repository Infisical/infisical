package shared

import (
	"fmt"

	"github.com/infisical/api/internal/config"
	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/keystore"
	"github.com/infisical/api/internal/services/shared/kms"
	"github.com/infisical/api/internal/services/shared/permission"
)

// SharedServicesDeps holds the external dependencies needed to construct shared services.
type SharedServicesDeps struct {
	Config   *config.Config
	DB       pg.DB             // primary DB connection (writes)
	HSM      kms.HsmService    // nil when HSM is not configured
	KeyStore keystore.KeyStore // Redis-backed keystore for PG advisory locks
}

type SharedServices struct {
	Config     *config.Config
	Permission *permission.SharedService
	KMS        *kms.SharedService
}

func NewSharedServices(deps SharedServicesDeps) (*SharedServices, error) {
	permissionDAL := permission.NewDAL()
	kmsDAL := kms.NewDAL(deps.DB, deps.KeyStore)

	kmsSvc, err := kms.NewSharedService(kmsDAL, deps.HSM, deps.Config)
	if err != nil {
		return nil, fmt.Errorf("kms: %w", err)
	}

	return &SharedServices{
		Config:     deps.Config,
		Permission: permission.NewSharedService(permissionDAL),
		KMS:        kmsSvc,
	}, nil
}
