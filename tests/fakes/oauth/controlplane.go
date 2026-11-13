package oauth

import (
	"testing"

	"github.com/Infisical/infisical/tests/fakes/github"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
)

// ControlPlane is a test's view of one authorization code, or one GCP service account.
type ControlPlane struct {
	*fakenet.Scope[Grant]
	Code string
}

// Open returns the scope for a key: an authorization code, or a GCP service account.
func Open(tt *testing.T, adminURL string, svc service, key string) *ControlPlane {
	tt.Helper()
	return &ControlPlane{Scope: fakenet.Open[Grant](tt, adminURL, svc.Host(), key), Code: key}
}

// NewCode returns an authorization code no other test holds. It carries the test
// binary's prefix so events published under it reach this binary's stream.
func NewCode() string { return id.Nonce() }

// LogIn is a person finishing Google's or GitLab's consent page: it returns the code
// the provider would put on the redirect back to Infisical.
func LogIn(tt *testing.T, adminURL string, svc service, p Profile) *ControlPlane {
	tt.Helper()
	code := NewCode()
	fakenet.Track(tt, adminURL, svc.Host(), code)
	cp := Open(tt, adminURL, svc, code)
	cp.Seed(tt, Grant{Profile: &p})
	return cp
}

// LogInGitHub is a person finishing GitHub's consent page. The profile and emails live
// in the github fake, under the code, because Infisical reads them from api.github.com
// with the code as the access token.
func LogInGitHub(tt *testing.T, adminURL string, user GitHubUser) *ControlPlane {
	tt.Helper()
	code := NewCode()
	fakenet.Track(tt, adminURL, GitHub.Host(), code)
	cp := Open(tt, adminURL, GitHub, code)
	cp.Seed(tt, Grant{})
	github.Open(tt, adminURL, code).Seed(tt, map[string]any{
		"login": user.Login, "id": user.ID, "name": user.Name, "emails": user.Emails,
	})
	return cp
}

// GitHubUser is the account a GitHub login reads from api.github.com.
type GitHubUser struct {
	Login  string
	ID     int64
	Name   string
	Emails []github.Email
}
