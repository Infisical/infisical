//go:build integration

package nodejs

import (
	"testing"

	"github.com/go-resty/resty/v2"
)

// API is a per-test facade over the seed helpers, grouped by domain. Obtain it
// with svc.For(t); the bound *testing.T is used for t.Helper and fatal-on-error.
type API struct {
	Projects      ProjectsAPI
	Identities    IdentitiesAPI
	Users         UsersAPI
	Groups        GroupsAPI
	Roles         RolesAPI
	Secrets       SecretsAPI
	Folders       FoldersAPI
	Imports       ImportsAPI
	Environments  EnvironmentsAPI
	Tags          TagsAPI
	ServiceTokens ServiceTokensAPI
	AccessTokens  AccessTokensAPI
}

// For binds the service to a test and returns the domain facade.
func (s *Service) For(t *testing.T) *API {
	t.Helper()
	b := apiBase{svc: s, t: t}
	return &API{
		Projects:      ProjectsAPI{b},
		Identities:    IdentitiesAPI{b},
		Users:         UsersAPI{b},
		Groups:        GroupsAPI{b},
		Roles:         RolesAPI{b},
		Secrets:       SecretsAPI{b},
		Folders:       FoldersAPI{b},
		Imports:       ImportsAPI{b},
		Environments:  EnvironmentsAPI{b},
		Tags:          TagsAPI{b},
		ServiceTokens: ServiceTokensAPI{b},
		AccessTokens:  AccessTokensAPI{b},
	}
}

// apiBase carries the service handle and bound test for every domain API.
type apiBase struct {
	svc *Service
	t   *testing.T
}

// check aborts the test with a consistent message when a request fails or
// returns a non-2xx status.
func (b apiBase) check(op string, r *resty.Response, err error) {
	b.t.Helper()
	if err != nil {
		b.t.Fatalf("nodejs.%s: request failed: %v", op, err)
	}
	if r.IsError() {
		b.t.Fatalf("nodejs.%s: returned %d: %s", op, r.StatusCode(), r.String())
	}
}
