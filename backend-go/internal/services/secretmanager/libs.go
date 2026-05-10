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
	Secret       *secret.Service
	Environment  *environment.Service
}

func NewServices(deps ServicesDeps) *Services {
	return &Services{
		SecretFolder: secretfolder.NewService(secretfolder.Deps{DB: deps.DB}),
		SecretImport: secretimport.NewService(secretimport.Deps{DB: deps.DB}),
		Secret:       secret.NewService(secret.Deps{DB: deps.DB}),
		Environment:  environment.NewService(environment.Deps{DB: deps.DB}),
	}
}
