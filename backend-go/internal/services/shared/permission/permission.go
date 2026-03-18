package permission

// piccolo: package internal/services/shared/permission
// piccolo: struct DAL
// piccolo: method GetProjectPermission
type permissionDAL interface {
	// piccolo:start
	GetProjectPermission(projectId string) string
	// piccolo:end
}

type Lib struct {
	dal permissionDAL
}

func NewLib(dal permissionDAL) *Lib {
	return &Lib{
		dal: dal,
	}
}

func (p *Lib) GetProjectPermission(projectId string) string {
	return p.dal.GetProjectPermission(projectId)
}
