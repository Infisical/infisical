package vercel

// EnvDetail identifies an environment variable record within an account.
type EnvDetail struct {
	ProjectID string `json:"projectId"`
	EnvID     string `json:"envId"`
	Key       string `json:"key"`
}

type EnvCreated struct{ EnvDetail }
type EnvUpdated struct{ EnvDetail }
type EnvDeleted struct{ EnvDetail }

func (EnvCreated) EventName() string { return "vercel.env-created" }
func (EnvUpdated) EventName() string { return "vercel.env-updated" }
func (EnvDeleted) EventName() string { return "vercel.env-deleted" }
