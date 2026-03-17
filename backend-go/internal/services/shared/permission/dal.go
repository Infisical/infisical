package permission

type DAL struct{}

func NewDAL() *DAL {
	return &DAL{}
}

func (p *DAL) GetProjectPermission(projectId string) string {
	return projectId
}
