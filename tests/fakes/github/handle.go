package github

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Handle is a test's view of one GitHub account inside fakenet.
//
// Everything generic comes from the embedded Scope: State, Seed, Fail, Calls,
// Received, and cleanup. Only the naming below is specific to GitHub.
type Handle struct {
	*fakenet.Scope[Account]
}

// Open returns the account a credential addresses.
//
// The caller passes the credential rather than the fixture, so this package stays
// independent of how a connection was created.
func Open(tt *testing.T, adminURL, credential string) *Handle {
	tt.Helper()
	return &Handle{fakenet.Open[Account](tt, adminURL, Service.Host(), credential)}
}

// Repo is a repository's secrets. Nil when the sync has never touched it, which is
// itself the assertion in a test about a sync that should not have run.
func (h *Handle) Repo(tt *testing.T, full string) *Store {
	tt.Helper()
	return h.State(tt).Stores["repos/"+full]
}

// OrgSecrets is an organization's secrets.
func (h *Handle) OrgSecrets(tt *testing.T, org string) *Store {
	tt.Helper()
	return h.State(tt).Stores["orgs/"+org]
}

// Env is a repository environment's secrets.
func (h *Handle) Env(tt *testing.T, full, env string) *Store {
	tt.Helper()
	return h.State(tt).Stores["repos/"+full+"/envs/"+env]
}

// RepoSecret seeds a secret that is already at the destination before Infisical
// touches it. The case a stub cannot express: a prune has to leave it alone.
func RepoSecret(repo, name, value string) any {
	return Account{Stores: map[string]*Store{
		"repos/" + repo: {Secrets: map[string]Secret{name: {Value: value}}},
	}}
}

// Login sets what GET /user reports.
func Login(login string) any { return Account{Login: login} }
