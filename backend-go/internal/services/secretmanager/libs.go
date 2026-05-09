package secretmanager

import (
	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/services/secretmanager/environment"
	"github.com/infisical/api/internal/services/secretmanager/secret"
	"github.com/infisical/api/internal/services/secretmanager/secretfolder"
	"github.com/infisical/api/internal/services/secretmanager/secretimport"
)

type ServicesDeps struct {
	DB pg.DB
}

type Services struct {
	SecretFolder *secretfolder.Service
	SecretImport *secretimport.Service
	SecretDAL    *secret.DAL
	Environment  *environment.Service
}

func NewServices(deps ServicesDeps) *Services {
	secretFolderDAL := secretfolder.NewDAL(deps.DB)
	secretImportDAL := secretimport.NewDAL(deps.DB)
	secretDAL := secret.NewDAL(deps.DB)

	return &Services{
		SecretFolder: secretfolder.NewService(secretfolder.Deps{DAL: secretFolderDAL}),
		SecretImport: secretimport.NewService(secretimport.Deps{DAL: secretImportDAL}),
		SecretDAL:    secretDAL,
		Environment:  environment.NewService(environment.Deps{DB: deps.DB}),
	}
}
