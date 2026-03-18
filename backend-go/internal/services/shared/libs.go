package shared

import (
	"github.com/infisical/api/internal/services/shared/permission"
)

type SharedServices struct {
	Permission *permission.SharedService
}

func NewSharedServices() *SharedServices {
	permissionDAL := permission.NewDAL()

	return &SharedServices{
		Permission: permission.NewSharedService(permissionDAL),
	}
}
