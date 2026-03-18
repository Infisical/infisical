package shared

import (
	"github.com/infisical/api/internal/services/shared/permission"
)

type Libs struct {
	Permission *permission.Lib
}

func NewLibs() *Libs {
	permissionDAL := permission.NewDAL()

	return &Libs{
		Permission: permission.NewLib(permissionDAL),
	}
}
