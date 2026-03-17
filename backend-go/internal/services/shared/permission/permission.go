package permission

type Lib struct {
	dal *DAL
}

func NewLib() *Lib {
	return &Lib{
		dal: NewDAL(),
	}
}

func (p *Lib) GetProjectPermission(projectId string) string {
	return p.dal.GetProjectPermission(projectId)
}
