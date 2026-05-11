package secretmanager

import (
	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/services/secretmanager/environment"
	"github.com/infisical/api/internal/services/secretmanager/secretfolder"
	"github.com/infisical/api/internal/services/secretmanager/secretimport"
)

type ServicesDeps struct {
	DB pg.DB
}

type Services struct {
	DB           pg.DB
	SecretFolder *secretfolder.Service
	SecretImport *secretimport.Service
	Environment  *environment.Service
}

func NewServices(deps ServicesDeps) *Services {
	return &Services{
		DB:           deps.DB,
		SecretFolder: secretfolder.NewService(secretfolder.Deps{DB: deps.DB}),
		SecretImport: secretimport.NewService(secretimport.Deps{DB: deps.DB}),
		Environment:  environment.NewService(environment.Deps{DB: deps.DB}),
	}
}
