package cmek

import (
	"github.com/infisical/api/internal/services/permission/project"
	"github.com/infisical/gocasl"
)

type CmekAccessChecker struct {
	ability *gocasl.Ability
}

// NewCmekAccessChecker creates an CmekAccessChecker from a CASL ability.
func NewCmekAccessChecker(ability *gocasl.Ability) *CmekAccessChecker {
	return &CmekAccessChecker{ability: ability}
}
func (c *CmekAccessChecker) CanRead() bool {
	return gocasl.Can(c.ability, project.CmekActionRead, project.CmekSubject{})
}

func (c *CmekAccessChecker) CanCreate() bool {
	return gocasl.Can(c.ability, project.CmekActionCreate, project.CmekSubject{})
}

func (c *CmekAccessChecker) CanEdit() bool {
	return gocasl.Can(c.ability, project.CmekActionEdit, project.CmekSubject{})
}

func (c *CmekAccessChecker) CanDelete() bool {
	return gocasl.Can(c.ability, project.CmekActionDelete, project.CmekSubject{})
}

func (c *CmekAccessChecker) CanEncrypt() bool {
	return gocasl.Can(c.ability, project.CmekActionEncrypt, project.CmekSubject{})
}

func (c *CmekAccessChecker) CanDecrypt() bool {
	return gocasl.Can(c.ability, project.CmekActionDecrypt, project.CmekSubject{})
}

func (c *CmekAccessChecker) CanSign() bool {
	return gocasl.Can(c.ability, project.CmekActionSign, project.CmekSubject{})
}

func (c *CmekAccessChecker) CanVerify() bool {
	return gocasl.Can(c.ability, project.CmekActionVerify, project.CmekSubject{})
}
