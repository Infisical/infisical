package secretmanager

import (
	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/services/shared/secretmanager/secretfolder"
)

type SharedServicesDeps struct {
	DB pg.DB
}

type SharedServices struct {
	SecretFolder *secretfolder.SharedService
}

func NewSharedServices(deps SharedServicesDeps) *SharedServices {
	secretFolderDAL := secretfolder.NewDAL(deps.DB)

	return &SharedServices{
		SecretFolder: secretfolder.NewSharedService(secretFolderDAL),
	}
}
