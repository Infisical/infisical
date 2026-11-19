package applications_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/id"
)

// member is a new Product Member with a role on the graph's application, or on none
// when role is empty.
func member(t *testing.T, tn *harness.Tenant, g *pki.Graph, role string) *harness.Principal {
	t.Helper()
	u := tn.NewUser(t, harness.WithName(role+"-"+id.Short()))
	g.Project.Grant(t, u)
	if role != "" {
		pki.AddMember(t, g.App, u, role)
	}
	return u
}
