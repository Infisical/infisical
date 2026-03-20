package secretmanager

import (
	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/services/shared/secretmanager/secretfolder"
	"github.com/infisical/api/internal/services/shared/secretmanager/secretimport"
)

type SharedServicesDeps struct {
	DB pg.DB
}

type SharedServices struct {
	SecretFolder *secretfolder.SharedService
	SecretImport *secretimport.SharedService
}

func NewSharedServices(deps SharedServicesDeps) *SharedServices {
	secretFolderDAL := secretfolder.NewDAL(deps.DB)
	secretImportDAL := secretimport.NewDAL(deps.DB)

	return &SharedServices{
		SecretFolder: secretfolder.NewSharedService(secretFolderDAL),
		SecretImport: secretimport.NewSharedService(secretImportDAL),
	}
}
