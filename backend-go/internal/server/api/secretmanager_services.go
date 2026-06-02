package api

import (
	"context"

	"github.com/infisical/api/internal/services/secretmanager/environment"
	"github.com/infisical/api/internal/services/secretmanager/secret"
	"github.com/infisical/api/internal/services/secretmanager/secretfolder"
	"github.com/infisical/api/internal/services/secretmanager/secretimport"
)

// SecretManagerServices holds secret manager services shared across handlers.
type SecretManagerServices struct {
	SecretFolder *secretfolder.Service
	SecretImport *secretimport.Service
	Environment  *environment.Service
	Secret       *secret.Service
}

func newSecretManagerServices(ctx context.Context, infra *Infra, platform *PlatformServices) *SecretManagerServices {
	secretFolderSvc := secretfolder.NewService(ctx, infra.Logger, &secretfolder.Deps{DB: infra.DB})
	secretImportSvc := secretimport.NewService(ctx, infra.Logger, &secretimport.Deps{DB: infra.DB})
	environmentSvc := environment.NewService(ctx, infra.Logger, &environment.Deps{DB: infra.DB})

	secretSvc := secret.NewService(ctx, infra.Logger, &secret.Deps{
		DB:                  infra.DB,
		SecretFolderService: secretFolderSvc,
		SecretImportService: secretImportSvc,
		KMSService:          platform.KMS,
	})

	svc := &SecretManagerServices{
		SecretFolder: secretFolderSvc,
		SecretImport: secretImportSvc,
		Environment:  environmentSvc,
		Secret:       secretSvc,
	}

	return svc
}
