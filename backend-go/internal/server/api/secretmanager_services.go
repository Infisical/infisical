package api

import (
	"github.com/infisical/api/internal/services/secretmanager/environment"
	"github.com/infisical/api/internal/services/secretmanager/secret"
	"github.com/infisical/api/internal/services/secretmanager/secretfolder"
	"github.com/infisical/api/internal/services/secretmanager/secretimport"
)

type secretManagerServices struct {
	secretFolder *secretfolder.Service
	secretImport *secretimport.Service
	environment  *environment.Service
	secret       *secret.Service
}

func newSecretManagerServices(infra *Infra, platform *platformServices) *secretManagerServices {
	secretFolderSvc := secretfolder.NewService(&secretfolder.Deps{DB: infra.DB})
	secretImportSvc := secretimport.NewService(&secretimport.Deps{DB: infra.DB})
	environmentSvc := environment.NewService(&environment.Deps{DB: infra.DB})

	secretSvc := secret.NewService(infra.Logger, &secret.Deps{
		DB:                  infra.DB,
		SecretFolderService: secretFolderSvc,
		SecretImportService: secretImportSvc,
		KMSService:          platform.kms,
	})

	svc := &secretManagerServices{
		secretFolder: secretFolderSvc,
		secretImport: secretImportSvc,
		environment:  environmentSvc,
		secret:       secretSvc,
	}

	return svc
}
