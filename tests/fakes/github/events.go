package github

// SecretDetail identifies a secret within an account. Scope is the store address,
// such as repos/acme/app or orgs/acme.
type SecretDetail struct {
	Scope      string `json:"scope"`
	SecretName string `json:"secretName"`
}

type SecretCreated struct{ SecretDetail }
type SecretUpdated struct{ SecretDetail }
type SecretDeleted struct{ SecretDetail }

func (SecretCreated) EventName() string { return "github.secret-created" }
func (SecretUpdated) EventName() string { return "github.secret-updated" }
func (SecretDeleted) EventName() string { return "github.secret-deleted" }
