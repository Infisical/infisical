package services

import (
	"context"

	"github.com/infisical/api/internal/services/secrets/environment"
	"github.com/infisical/api/internal/services/secrets/secret"
	"github.com/infisical/api/internal/services/secrets/secretcache"
	"github.com/infisical/api/internal/services/secrets/secretfolder"
	"github.com/infisical/api/internal/services/secrets/secretimport"
)

// SecretsGroup holds secrets-related services.
type SecretsGroup struct {
	Secret       *secret.Service
	SecretFolder *secretfolder.Service
	SecretImport *secretimport.Service
	SecretCache  *secretcache.Service
	Environment  *environment.Service
}

func (s *Services) initSecrets(ctx context.Context) {
	secretFolderSvc := secretfolder.NewService(ctx, s.infra.Logger, &secretfolder.Deps{DB: s.infra.DB})
	secretImportSvc := secretimport.NewService(ctx, s.infra.Logger, &secretimport.Deps{DB: s.infra.DB})
	environmentSvc := environment.NewService(ctx, s.infra.Logger, &environment.Deps{DB: s.infra.DB})
	secretCacheSvc := secretcache.NewService(ctx, s.infra.Logger, &secretcache.Deps{KeyStore: s.infra.KeyStore})

	secretSvc := secret.NewService(ctx, s.infra.Logger, &secret.Deps{
		DB:                  s.infra.DB,
		SecretFolderService: secretFolderSvc,
		SecretImportService: secretImportSvc,
		KMSService:          s.KMS,
	})

	s.secrets = &SecretsGroup{
		Secret:       secretSvc,
		SecretFolder: secretFolderSvc,
		SecretImport: secretImportSvc,
		SecretCache:  secretCacheSvc,
		Environment:  environmentSvc,
	}
}
