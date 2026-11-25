package applications_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

const (
	notAMember  = "You are not a member of this certificate-application."
	cannotIssue = "You are not allowed to issue-cert on certificate-profiles"
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

// operatorIdentity is a new machine identity, a Product Member, that is an operator of
// the graph's application.
func operatorIdentity(t *testing.T, tn *harness.Tenant, g *pki.Graph) *harness.Principal {
	t.Helper()
	mi := tn.NewMachineIdentity(t)
	g.Project.Grant(t, mi)
	pki.AddMember(t, g.App, mi, "operator")
	return mi
}

// operatorGroupMember is a new user who is an operator of the graph's application only
// through a group, and the group's id.
func operatorGroupMember(t *testing.T, tn *harness.Tenant, g *pki.Graph) (*harness.Principal, uuid.UUID) {
	t.Helper()
	user := member(t, tn, g, "")
	group := fixture.NewGroup(t, tn)
	group.AddUser(t, user)
	fixture.ExistingProject(tn, g.Project.ID.String()).GrantGroup(t, group, "member")
	add, err := tn.Admin.API.AddPkiApplicationGroupMemberWithResponse(t.Context(), g.App.ID, group.ID, api.AddPkiApplicationGroupMemberJSONRequestBody{Role: "operator"})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, add.StatusCode(), "adding the group: %s", apierr.Body(add.Body))
	return user, group.ID
}

// requireIssueRefused requires the principal's request through the graph to be
// refused with the message and nothing to be issued.
func requireIssueRefused(t *testing.T, g *pki.Graph, as *harness.Principal, message string) {
	t.Helper()
	res := pki.Request(t, as, g.App, g.Profile, pki.ServerCertificate(id.Short()+".app.test"))
	require.Equalf(t, http.StatusForbidden, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
	require.Equal(t, message, apierr.Message(res.Body))
	require.Zero(t, pki.Requests(t, g.Project, g.Profile))
}
