package api

import (
	"context"

	"github.com/infisical/api/internal/services/secrets/environment"
	"github.com/infisical/api/internal/services/secrets/secret"
	"github.com/infisical/api/internal/services/secrets/secretfolder"
	"github.com/infisical/api/internal/services/secrets/secretimport"
)

// SecretsServices holds secrets services shared across handlers.
type SecretsServices struct {
	SecretFolder *secretfolder.Service
	SecretImport *secretimport.Service
	Environment  *environment.Service
	Secret       *secret.Service
}

func newSecretsServices(ctx context.Context, infra *Infra, platform *PlatformServices) *SecretsServices {
	secretFolderSvc := secretfolder.NewService(ctx, infra.Logger, &secretfolder.Deps{DB: infra.DB})
	secretImportSvc := secretimport.NewService(ctx, infra.Logger, &secretimport.Deps{DB: infra.DB})
	environmentSvc := environment.NewService(ctx, infra.Logger, &environment.Deps{DB: infra.DB})

	secretSvc := secret.NewService(ctx, infra.Logger, &secret.Deps{
		DB:                  infra.DB,
		SecretFolderService: secretFolderSvc,
		SecretImportService: secretImportSvc,
		KMSService:          platform.KMS,
	})

	svc := &SecretsServices{
		SecretFolder: secretFolderSvc,
		SecretImport: secretImportSvc,
		Environment:  environmentSvc,
		Secret:       secretSvc,
	}

	return svc
}
